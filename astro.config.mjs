// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://pielsmart.com',
  integrations: [mdx(), sitemap({
    serialize(item) {
      return { ...item, lastmod: new Date().toISOString().split('T')[0] };
    },
  })],
  output: 'static',
  trailingSlash: 'always',
});
