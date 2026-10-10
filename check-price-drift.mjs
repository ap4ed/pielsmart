/**
 * Compares live scraped prices against article ProductCard values.
 * Usage: node check-price-drift.mjs scrape-output.json
 * Or pipe: cat scrape-output.json | node check-price-drift.mjs
 *
 * Reads all .mdx articles, extracts ProductCard props, then compares
 * against the JSON array output from scrape-amazon.mjs --json
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ARTICLES_DIR = './src/content/articles';

// ── Parse ProductCard props from MDX source ───────────────────────────────────
function parseCards(mdx) {
  const cards = [];
  const cardRegex = /<ProductCard\s([^>]*?)\/>/gs;
  let match;
  while ((match = cardRegex.exec(mdx)) !== null) {
    const block = match[1];
    const prop = (name) => {
      const m = block.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : null;
    };
    const asin = prop('asin');
    if (!asin) continue;
    cards.push({
      asin,
      name: prop('name'),
      price: prop('price'),
      listPrice: prop('listPrice'),
      discount: prop('discount'),
      rating: prop('rating'),
      reviews: prop('reviews'),
      image: prop('image'),
    });
  }
  return cards;
}

// ── Load all articles ─────────────────────────────────────────────────────────
const articleMap = {}; // asin → { file, ...cardProps }
for (const f of readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.mdx'))) {
  const src = readFileSync(join(ARTICLES_DIR, f), 'utf8');
  for (const card of parseCards(src)) {
    articleMap[card.asin] = { file: f, ...card };
  }
}

// ── Load scraped JSON ─────────────────────────────────────────────────────────
const jsonArg = process.argv[2];
let scraped;
try {
  const raw = jsonArg ? readFileSync(jsonArg, 'utf8') : readFileSync('/dev/stdin', 'utf8');
  // The --json output has a "── JSON output ──" header — strip everything before the [
  const jsonStart = raw.indexOf('[');
  scraped = JSON.parse(raw.slice(jsonStart));
} catch (e) {
  console.error('Could not parse JSON input:', e.message);
  process.exit(1);
}

// ── Compare ───────────────────────────────────────────────────────────────────
const issues = [];
const ok = [];
const blocked = [];

for (const live of scraped) {
  if (live.error) {
    blocked.push(live.asin);
    continue;
  }
  const art = articleMap[live.asin];
  if (!art) continue; // not in any article

  const diffs = [];

  // Price
  const artPrice = art.price ? parseFloat(art.price.replace(/[^0-9.]/g, '')) : null;
  const livePrice = live.salePrice ? parseFloat(live.salePrice.replace(/[^0-9.]/g, '')) : null;
  if (artPrice && livePrice && Math.abs(artPrice - livePrice) > 0.50) {
    diffs.push(`price: $${artPrice} → $${livePrice}`);
  }

  // Discount — flag if article has one but live doesn't, or vice versa
  const artDiscount = art.discount ?? null;
  const liveDiscount = live.discount ?? null;
  if (artDiscount !== liveDiscount) {
    diffs.push(`discount: "${artDiscount ?? 'none'}" → "${liveDiscount ?? 'none'}"`);
  }

  // Rating
  const artRating = art.rating ? parseFloat(art.rating) : null;
  const liveRating = live.rating ? parseFloat(live.rating) : null;
  if (artRating && liveRating && Math.abs(artRating - liveRating) >= 0.2) {
    diffs.push(`rating: ${artRating} → ${liveRating}`);
  }

  // Image
  if (art.image && live.imageUrl && art.image !== live.imageUrl) {
    diffs.push(`image changed`);
  }

  if (diffs.length) {
    issues.push({ file: art.file, asin: live.asin, name: art.name, diffs, live });
  } else {
    ok.push(live.asin);
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(64)}`);
console.log(`PRICE DRIFT REPORT — ${new Date().toLocaleDateString('es-419')}`);
console.log(`${'═'.repeat(64)}`);
console.log(`✅ Up to date: ${ok.length}  |  ⚠️  Needs update: ${issues.length}  |  ❌ Blocked: ${blocked.length}\n`);

if (issues.length === 0) {
  console.log('All scraped prices match articles. Nothing to update.');
} else {
  // Group by file
  const byFile = {};
  for (const issue of issues) {
    (byFile[issue.file] ??= []).push(issue);
  }
  for (const [file, items] of Object.entries(byFile)) {
    console.log(`📄 ${file}`);
    for (const item of items) {
      console.log(`   [${item.asin}] ${item.name?.slice(0, 50) ?? 'unknown'}`);
      for (const d of item.diffs) console.log(`      • ${d}`);
      // Show new ProductCard props
      const l = item.live;
      const props = [];
      if (l.salePrice)   props.push(`price="${l.salePrice}"`);
      if (l.listPrice)   props.push(`listPrice="${l.listPrice}"`);
      if (l.discount)    props.push(`discount="${l.discount}"`);
      if (l.rating)      props.push(`rating="${l.rating}"`);
      if (l.reviewCount) props.push(`reviews="${l.reviewCount}"`);
      if (l.imageUrl && l.imageValid) props.push(`image="${l.imageUrl}"`);
      console.log(`      → ${props.join('  ')}`);
    }
    console.log();
  }
}

if (blocked.length) {
  console.log(`❌ Could not scrape (${blocked.length}): ${blocked.join(', ')}`);
}
