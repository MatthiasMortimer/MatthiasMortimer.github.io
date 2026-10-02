// Tiny in-memory sliding-window rate limiter.
// Lives in the server process, so limits reset on restart — that's fine at this scale.
// Not shared across multiple instances; if the site ever runs more than one
// process, move this to a real store.

const buckets = new Map(); // key -> array of hit timestamps (ascending)

/**
 * @param {string} key      Bucket key, e.g. `inquiry:1.2.3.4`
 * @param {object} [opts]
 * @param {number} [opts.limit]    Max hits allowed inside the window
 * @param {number} [opts.windowMs] Window size in milliseconds
 * @returns {{ ok: boolean, retryAfter?: number }} retryAfter is in seconds
 */
export function rateLimit(key, { limit = 5, windowMs = 10 * 60 * 1000 } = {}) {
	const now = Date.now();
	const cutoff = now - windowMs;

	let hits = buckets.get(key);
	if (!hits) {
		hits = [];
		buckets.set(key, hits);
	}

	while (hits.length && hits[0] <= cutoff) hits.shift();

	if (hits.length >= limit) {
		return { ok: false, retryAfter: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
	}

	hits.push(now);

	// Occasional sweep so one-off keys don't accumulate forever.
	if (buckets.size > 1000) {
		for (const [bucketKey, bucketHits] of buckets) {
			if (!bucketHits.length || bucketHits[bucketHits.length - 1] <= cutoff) {
				buckets.delete(bucketKey);
			}
		}
	}

	return { ok: true };
}
