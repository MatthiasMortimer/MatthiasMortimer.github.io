export function createThemeAutosave({ save, onState, onSaved, onError, delay = 400, timers = globalThis }) {
	let timer = null;
	let pending = null;
	let running = false;
	let revision = 0;
	let generation = 0;

	async function run() {
		timer = null;
		if (running || !pending) return;
		const document = pending;
		const savedRevision = revision;
		const savedGeneration = generation;
		pending = null;
		running = true;
		onState("saving");
		try {
			const result = await save(document);
			if (savedGeneration === generation && savedRevision === revision) onSaved(result);
		} catch (error) {
			if (savedGeneration === generation) onError(error);
		} finally {
			running = false;
			onState(pending ? "pending" : "idle");
			if (pending && !timer) timer = timers.setTimeout(run, delay);
		}
	}

	return {
		schedule(document) {
			revision++;
			pending = document;
			timers.clearTimeout(timer);
			timer = null;
			if (document) {
				onState("pending");
				timer = timers.setTimeout(run, delay);
			}
		},
		flush(document) {
			this.schedule(document);
			timers.clearTimeout(timer);
			timer = null;
			return run();
		},
		cancel() {
			generation++;
			revision++;
			pending = null;
			timers.clearTimeout(timer);
			timer = null;
		},
	};
}
