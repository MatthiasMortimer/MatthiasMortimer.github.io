// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
// https://astro.build/config
export default defineConfig({
  site: 'https://ritesdev.dev',
  base: '/',   // Explicitly set base to '/' so all assets resolve to the root domain root
  integrations: [mdx()],
  
  // Keep output as 'server' to handle your dynamic routing layers natively
  output: 'server', 
  adapter: node({
    mode: 'standalone',
  }),

  vite: {
    server: {
      allowedHosts: ['ritesdev.dev', '.ritesdev.dev']
    }
  }
,
  // Vite block to allow incoming tunnel connections
  vite: {
    server: {
      allowedHosts: ['ritesdev.dev', '.ritesdev.dev']
    }
  }
});
