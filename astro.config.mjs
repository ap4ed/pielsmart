// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import fs from 'node:fs';
import path from 'node:path';

// Real lastmod per article URL (dateModified, falling back to datePublished).
// Stamping every URL with the build date teaches Google to ignore lastmod.
const articlesDir = path.resolve('./src/content/articles');
const lastmodByPath = {};
let newestArticleDate = '2026-01-01';
for (const file of fs.readdirSync(articlesDir)) {
  if (!/\.mdx?$/.test(file)) continue;
  const src = fs.readFileSync(path.join(articlesDir, file), 'utf8');
  const fm = src.split('---')[1] || '';
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*"?([^"\\n]+)"?`, 'm')) || [])[1];
  const pillar = get('pillar');
  const date = get('dateModified') || get('datePublished');
  if (!pillar || !date) continue;
  lastmodByPath[`/${pillar}/${file.replace(/\.mdx?$/, '')}/`] = date;
  if (date > newestArticleDate) newestArticleDate = date;
}

export default defineConfig({
  site: 'https://pielsmart.com',
  integrations: [mdx(), sitemap({
    serialize(item) {
      const p = new URL(item.url).pathname;
      // Articles get their own date; hub pages (home, pillars) change when the newest article does.
      return { ...item, lastmod: lastmodByPath[p] || newestArticleDate };
    },
  })],
  output: 'static',
  trailingSlash: 'always',
});
