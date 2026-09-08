/**
 * verify-articles.mjs
 *
 * Scans all MDX articles and validates:
 *   1. Hero image URL loads (HTTP HEAD, Content-Type: image/*)
 *   2. Every ProductCard `image` prop URL loads
 *   3. Every ProductCard `link` prop redirects to Amazon (not 404)
 *   4. Every ProductCard has required fields: price, image, link
 *   5. Prices pass sanity check (contain $ or "Desde")
 *
 * Usage: node verify-articles.mjs
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import https from 'https';
import http from 'http';

const ARTICLES_DIR = './src/content/articles';

// ── HTTP HEAD helper ──────────────────────────────────────────────────────────
function headRequest(url, maxRedirects = 4) {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
          // Follow redirect
          headRequest(res.headers.location, maxRedirects - 1).then(resolve);
          return;
        }
        resolve({
          status: res.statusCode,
          contentType: res.headers['content-type'] ?? '',
          finalUrl: url,
        });
      });
      req.on('error', () => resolve({ status: 0, contentType: '', finalUrl: url, error: 'network error' }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, contentType: '', finalUrl: url, error: 'timeout' }); });
      req.end();
    } catch (e) {
      resolve({ status: 0, contentType: '', finalUrl: url, error: e.message });
    }
  });
}

async function checkImage(url) {
  if (!url) return { ok: false, reason: 'missing URL' };
  const r = await headRequest(url);
  if (r.status === 200 && r.contentType.startsWith('image/')) return { ok: true, status: r.status };
  return { ok: false, reason: `HTTP ${r.status}, Content-Type: ${r.contentType || '(none)'}${r.error ? ', error: ' + r.error : ''}` };
}

async function checkLink(url) {
  if (!url) return { ok: false, reason: 'missing URL' };
  const r = await headRequest(url);
  // Amazon returns 405 on HEAD but that's fine — just not 404
  if ([200, 405, 403].includes(r.status)) return { ok: true, status: r.status };
  if (r.status === 0) return { ok: false, reason: r.error ?? 'no response' };
  return { ok: false, reason: `HTTP ${r.status}` };
}

// ── Parse ProductCard props from MDX source ───────────────────────────────────
function parseProductCards(src) {
  const cards = [];
  // Match <ProductCard ... /> blocks (possibly multiline)
  const cardRegex = /<ProductCard\s([\s\S]*?)\/>/g;
  let match;
  while ((match = cardRegex.exec(src)) !== null) {
    const block = match[1];
    const prop = (name) => {
      const r = new RegExp(`${name}=["'\`]([^"'\`]*)["'\`]`);
      return block.match(r)?.[1] ?? null;
    };
    cards.push({
      name: prop('name'),
      price: prop('price'),
      link: prop('link'),
      image: prop('image'),
      asin: prop('asin'),
      listPrice: prop('listPrice'),
      discount: prop('discount'),
      rating: prop('rating'),
      reviews: prop('reviews'),
    });
  }
  return cards;
}

// ── Parse frontmatter image from MDX ─────────────────────────────────────────
function parseHeroImage(src) {
  const match = src.match(/^image:\s*["']?([^\n"']+)["']?/m);
  return match?.[1]?.trim() ?? null;
}

// ── Validate price string ─────────────────────────────────────────────────────
function isValidPrice(p) {
  if (!p) return false;
  return /\$[\d,]+/.test(p) || p.toLowerCase().startsWith('desde');
}

// ── Main ──────────────────────────────────────────────────────────────────────
const files = (await readdir(ARTICLES_DIR)).filter(f => f.endsWith('.mdx') || f.endsWith('.md'));

if (!files.length) {
  console.log('No articles found in', ARTICLES_DIR);
  process.exit(0);
}

let totalIssues = 0;

for (const file of files) {
  const src = await readFile(join(ARTICLES_DIR, file), 'utf8');
  const cards = parseProductCards(src);
  const heroImage = parseHeroImage(src);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📄 ${file}  (${cards.length} product card${cards.length !== 1 ? 's' : ''})`);
  console.log('═'.repeat(60));

  // ── Hero image ──────────────────────────────────────────────────────────────
  if (heroImage) {
    const r = await checkImage(heroImage);
    const icon = r.ok ? '✅' : '❌';
    console.log(`  Hero image ${icon}  ${heroImage.slice(0, 80)}`);
    if (!r.ok) { console.log(`             ↳ ${r.reason}`); totalIssues++; }
  } else {
    console.log(`  Hero image ⚠️   (no hero image set)`);
  }

  if (!cards.length) {
    console.log('  (no ProductCards found)');
    continue;
  }

  // ── Product cards ───────────────────────────────────────────────────────────
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const label = c.name ? `"${c.name.slice(0, 45)}"` : `Card #${i + 1}`;
    console.log(`\n  [${i + 1}] ${label}`);

    const issues = [];

    // Price check
    if (!c.price) {
      issues.push('❌ price: missing');
    } else if (!isValidPrice(c.price)) {
      issues.push(`⚠️  price: "${c.price}" — format unclear (expected $XX.XX or "Desde $X")`);
    } else {
      console.log(`      price     ✅  ${c.price}${c.listPrice ? '  →  was ' + c.listPrice : ''}${c.discount ? '  (' + c.discount + ')' : ''}`);
    }

    // Image check
    const imageSource = c.image || (c.asin ? `asin:${c.asin} (widget URL — needs Associates approval)` : null);
    if (!c.image && !c.asin) {
      issues.push('❌ image: missing (no image= or asin= prop)');
    } else if (!c.image && c.asin) {
      issues.push(`⚠️  image: using ws-na widget URL via asin="${c.asin}" — requires active Associates account`);
    } else if (c.image) {
      const r = await checkImage(c.image);
      if (r.ok) {
        console.log(`      image     ✅  ${c.image.slice(0, 70)}`);
      } else {
        issues.push(`❌ image: ${r.reason}  →  ${c.image.slice(0, 70)}`);
      }
    }

    // Link check
    if (!c.link) {
      issues.push('❌ link: missing');
    } else {
      const r = await checkLink(c.link);
      if (r.ok) {
        console.log(`      link      ✅  ${c.link.slice(0, 70)}`);
      } else {
        issues.push(`❌ link: ${r.reason}  →  ${c.link.slice(0, 70)}`);
      }
    }

    // Rating/reviews (optional but flag if partial)
    if (c.rating && !c.reviews) console.log(`      reviews   ⚠️   rating set but no reviews count`);
    if (!c.rating) console.log(`      rating    —   (not set — run scrape-amazon to get)`);

    // listPrice/discount (optional but flag as improvement opportunity)
    if (!c.listPrice && !c.discount) {
      console.log(`      deals     —   (no listPrice/discount — run scrape-amazon to check for deals)`);
    }

    // Print issues
    for (const issue of issues) {
      console.log(`      ${issue}`);
      totalIssues++;
    }
  }
}

console.log(`\n${'═'.repeat(60)}`);
if (totalIssues === 0) {
  console.log('✅ All checks passed — no issues found.');
} else {
  console.log(`⚠️  ${totalIssues} issue(s) found across all articles.`);
  console.log('\nTo fix:');
  console.log('  • Missing images: right-click product photo on Amazon → "Copy image address"');
  console.log('    Use only m.media-amazon.com URLs (not ws-na.amazon-adsystem.com)');
  console.log('  • Missing prices/deals: run  node scrape-amazon.mjs ASIN1 ASIN2 ...');
  console.log('  • Broken links: verify ASIN is correct at amazon.com/dp/ASIN');
}
console.log('═'.repeat(60));
