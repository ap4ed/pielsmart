/**
 * Applies live scraped prices to all article MDX files.
 * Usage: node apply-price-updates.mjs /tmp/scrape-results.json
 *
 * For each ProductCard, replaces price/listPrice/discount/rating/reviews/image
 * with live values. Only touches props that actually changed (>$0.50 for price,
 * >=0.2 for rating, or different discount/image).
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ARTICLES_DIR = './src/content/articles';

// ── Load scraped JSON ─────────────────────────────────────────────────────────
const jsonArg = process.argv[2];
if (!jsonArg) { console.error('Usage: node apply-price-updates.mjs <scrape.json>'); process.exit(1); }
const raw = readFileSync(jsonArg, 'utf8');
const jsonStart = raw.indexOf('[');
const scraped = JSON.parse(raw.slice(jsonStart));

// Build lookup: asin → live data
const liveMap = {};
for (const s of scraped) {
  if (!s.error) liveMap[s.asin] = s;
}

// ── Replace a single prop in a ProductCard block ──────────────────────────────
function setProp(block, name, value) {
  // Use a function replacement to avoid $ being treated as a regex backreference
  const re = new RegExp(`(\\s+)${name}="[^"]*"`);
  if (re.test(block)) {
    return block.replace(new RegExp(`(\\s+)${name}="[^"]*"`, 'g'), (_, ws) => `${ws}${name}="${value}"`);
  }
  // Prop doesn't exist — insert before the closing />
  return block.replace(/(\s*\/>)$/, `\n  ${name}="${value}"$1`);
}

function removeProp(block, name) {
  return block.replace(new RegExp(`\\s+${name}="[^"]*"`, 'g'), '');
}

function getProp(block, name) {
  const m = block.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

// ── Process all MDX files ─────────────────────────────────────────────────────
let totalFiles = 0, totalChanges = 0;

for (const f of readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.mdx'))) {
  const path = join(ARTICLES_DIR, f);
  let src = readFileSync(path, 'utf8');
  let fileChanged = false;
  const fileLog = [];

  // Find and replace each ProductCard block
  src = src.replace(/<ProductCard\s([\s\S]*?)\/>/g, (match, props) => {
    const asin = getProp(props, 'asin');
    if (!asin) return match;
    const live = liveMap[asin];
    if (!live) return match;

    let block = match;
    const changes = [];

    // ── Price ─────────────────────────────────────────────────────────────────
    const artPrice = getProp(props, 'price');
    const artPriceNum = artPrice ? parseFloat(artPrice.replace(/[^0-9.]/g, '')) : null;
    const livePriceNum = live.salePrice ? parseFloat(live.salePrice.replace(/[^0-9.]/g, '')) : null;

    if (livePriceNum && artPriceNum && Math.abs(livePriceNum - artPriceNum) > 0.50) {
      block = setProp(block, 'price', live.salePrice);
      changes.push(`price ${artPrice}→${live.salePrice}`);
    }

    // ── listPrice ─────────────────────────────────────────────────────────────
    const artListPrice = getProp(props, 'listPrice');
    const hasLiveListPrice = live.listPrice && live.listPrice !== 'null' && live.listPrice !== live.salePrice;
    if (hasLiveListPrice) {
      block = setProp(block, 'listPrice', live.listPrice);
      if (live.listPrice !== artListPrice) changes.push(`listPrice →${live.listPrice}`);
    } else if (artListPrice && artListPrice !== 'null' && !hasLiveListPrice) {
      block = removeProp(block, 'listPrice');
      changes.push(`listPrice removed`);
    }

    // ── Discount ──────────────────────────────────────────────────────────────
    const artDiscount = getProp(props, 'discount');
    if (live.discount && live.discount !== artDiscount) {
      block = setProp(block, 'discount', live.discount);
      changes.push(`discount ${artDiscount ?? 'none'}→${live.discount}`);
    } else if (artDiscount && !live.discount) {
      block = removeProp(block, 'discount');
      changes.push(`discount removed`);
    }

    // ── Rating ────────────────────────────────────────────────────────────────
    const artRating = getProp(props, 'rating');
    const artRatingNum = artRating ? parseFloat(artRating) : null;
    const liveRatingNum = live.rating ? parseFloat(live.rating) : null;
    if (liveRatingNum && artRatingNum && Math.abs(liveRatingNum - artRatingNum) >= 0.2) {
      block = setProp(block, 'rating', live.rating);
      changes.push(`rating ${artRating}→${live.rating}`);
    }

    // ── Reviews ───────────────────────────────────────────────────────────────
    if (live.reviewCount) {
      // reviewCount from Amazon may already have parens; normalise to "(N)"
      const raw = live.reviewCount.replace(/^\(|\)$/g, '').trim();
      const liveReviews = `(${raw})`;
      const artReviews = getProp(props, 'reviews');
      if (artReviews !== liveReviews) {
        block = setProp(block, 'reviews', liveReviews);
        // Don't log review count updates (too noisy) — just apply silently
      }
    }

    // ── Image ─────────────────────────────────────────────────────────────────
    const artImage = getProp(props, 'image');
    if (live.imageUrl && live.imageValid && artImage && live.imageUrl !== artImage) {
      // Only update if new URL is m.media-amazon.com (don't replace with something worse)
      if (live.imageUrl.includes('m.media-amazon.com')) {
        block = setProp(block, 'image', live.imageUrl);
        changes.push(`image updated`);
      }
    }

    if (changes.length) {
      fileLog.push(`  [${asin}] ${changes.join(', ')}`);
      fileChanged = true;
    }

    return block;
  });

  if (fileChanged) {
    writeFileSync(path, src);
    totalFiles++;
    totalChanges += fileLog.length;
    console.log(`\n📄 ${f}`);
    fileLog.forEach(l => console.log(l));
  }
}

console.log(`\n✅ Updated ${totalChanges} products across ${totalFiles} files.`);
