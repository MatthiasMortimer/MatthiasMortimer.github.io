// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
	site: 'https://github.io',
    base: '/',   // Explicitly set base to '/' so all assets resolve to the root domain root
	integrations: [mdx()]
});
