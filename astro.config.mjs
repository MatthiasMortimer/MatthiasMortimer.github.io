// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
// https://astro.build/config
export default defineConfig({
  site: 'https://ritesdev.dev',
  base: '/',   // Explicitly set base to '/' so all assets resolve to the root domain root
  integrations: [mdx(), sitemap()],
  
  // Prerender pages and blog posts; routes with prerender=false stay server-rendered.
  output: 'static',
  adapter: node({
    mode: 'standalone',
  }),

  vite: {
    server: {
      allowedHosts: ['ritesdev.dev', '.ritesdev.dev'],
      fs: {
        deny: ['**/dev/**'],
      },
    }
  }
});
