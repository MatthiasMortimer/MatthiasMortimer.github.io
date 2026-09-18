// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
	site: 'https://ritesdev.dev',
    base: '/',   // Explicitly set base to '/' so all assets resolve to the root domain root
	integrations: [mdx()],
	// Change "static" to "server"
  output: 'server', 
  
  adapter: cloudflare({
    imageService: 'cloudflare',
    // Ensure your platformProxy matches the bindings in your logs
    platformProxy: {
      enabled: true,
    },
  }),
});
