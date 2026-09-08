/**
 * Amazon product scraper for PielSmart
 *
 * Usage:
 *   node scrape-amazon.mjs ASIN1 ASIN2 ...
 *   node scrape-amazon.mjs --json ASIN1 ASIN2 ...   (outputs JSON array at the end)
 *
 * - Always sets delivery to Miami 33166 (freight forwarder zip)
 * - Waits for #productTitle to confirm page loaded (not a bot/CAPTCHA page)
 * - Screenshots CAPTCHA/failure pages to debug-{ASIN}.png
 * - Validates image URLs with HTTP HEAD before reporting them
 * - Extracts: title, image, rating, reviews, salePrice, listPrice, discount, coupon, prime
 * - Flags 🔥 DEAL when listPrice > salePrice OR discount% present OR coupon present
 */

import { chromium } from 'playwright';
import https from 'https';
import http from 'http';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const asins = args.filter(a => a !== '--json');

if (!asins.length) {
  console.error('Usage: node scrape-amazon.mjs [--json] ASIN1 ASIN2 ...');
  process.exit(1);
}

// ── HTTP HEAD helper to validate a URL returns an image ──────────────────────
function headRequest(url) {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
        resolve({ status: res.statusCode, contentType: res.headers['content-type'] ?? '' });
      });
      req.on('error', () => resolve({ status: 0, contentType: '' }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, contentType: '' }); });
      req.end();
    } catch {
      resolve({ status: 0, contentType: '' });
    }
  });
}

async function validateImageUrl(url) {
  if (!url) return { valid: false, reason: 'no URL' };
  const { status, contentType } = await headRequest(url);
  if (status === 200 && contentType.startsWith('image/')) {
    return { valid: true, status, contentType };
  }
  return { valid: false, status, contentType, reason: `HTTP ${status}, type: ${contentType}` };
}

// ── Convert extracted Amazon URL to a clean m.media-amazon.com URL ───────────
function cleanImageUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    // Strip query params that add resize/crop instructions — get the clean image
    if (u.hostname.includes('amazon') || u.hostname.includes('ssl-images')) {
      // Remove ._SX... ._SY... etc. size suffixes from path
      const cleaned = rawUrl.replace(/\._[A-Z]{2}[\w,]+_\./g, '.');
      return cleaned;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

// ── Browser setup ─────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale: 'en-US',
  viewport: { width: 1366, height: 768 },
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  },
});
const page = await context.newPage();

// ── Set delivery to Miami 33166 ───────────────────────────────────────────────
console.log('🌐 Opening Amazon...');
await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

let locationSet = false;
for (let attempt = 0; attempt < 3 && !locationSet; attempt++) {
  const deliverTo = page.locator('#nav-global-location-popover-link, #glow-ingress-line2');
  if (await deliverTo.count() > 0) {
    await deliverTo.first().click();
    await page.waitForTimeout(1800);
    const zipInput = page.locator('#GLUXZipUpdateInput');
    if (await zipInput.count() > 0) {
      await zipInput.first().fill('33166');
      await page.waitForTimeout(600);
      const applyBtn = page.locator('[data-action="GLUXZipUpdate"] input[type=submit], #GLUXZipUpdate input[type=submit]');
      if (await applyBtn.count() > 0) {
        await applyBtn.first().click();
        await page.waitForTimeout(3500);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }
  const loc = await page.locator('#glow-ingress-line2').textContent().catch(() => '');
  if (loc.includes('33166') || loc.includes('Miami')) {
    locationSet = true;
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }
}

const finalLocation = await page.locator('#glow-ingress-line2').textContent().catch(() => 'unknown');
console.log(`📍 Location: ${finalLocation.trim()}\n`);

// ── Scrape a single ASIN ──────────────────────────────────────────────────────
async function scrapeProduct(asin) {
  await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait up to 12s for the product title — if it never appears, this is a bot/CAPTCHA page
  const titleEl = await page.waitForSelector('#productTitle', { timeout: 12000 }).catch(() => null);

  if (!titleEl) {
    // Check for CAPTCHA or robot page
    const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 400) ?? '');
    const isCaptcha = pageText.toLowerCase().includes('captcha') || pageText.toLowerCase().includes('robot') || pageText.toLowerCase().includes('verify');
    await page.screenshot({ path: `debug-${asin}.png` });
    return {
      asin,
      error: isCaptcha ? 'CAPTCHA/bot detection — see debug-' + asin + '.png' : 'Product title not found — page may not have loaded',
      screenshotSaved: `debug-${asin}.png`,
    };
  }

  // Scroll down a little to trigger lazy-load elements (ratings, image zoom)
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(800);

  const data = await page.evaluate(() => {
    const text = (sel) => {
      for (const s of sel.split(',')) {
        const el = document.querySelector(s.trim());
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return null;
    };

    // ── Prices ────────────────────────────────────────────────────────────────
    // Sale price: multiple selectors covering different page layouts
    const salePriceEl =
      document.querySelector('.apexPriceToPay .a-offscreen') ||
      document.querySelector('#corePrice_feature_div .a-offscreen') ||
      document.querySelector('.priceToPay .a-offscreen') ||
      document.querySelector('#price_inside_buybox') ||
      document.querySelector('#priceblock_ourprice');
    const salePrice = salePriceEl?.textContent?.trim() ?? null;

    // List price (struck-through): .basisPrice or .a-text-price
    const listPriceEl =
      document.querySelector('.basisPrice .a-offscreen') ||
      document.querySelector('#listPrice') ||
      document.querySelector('.a-price.a-text-price[data-a-strike="true"] .a-offscreen') ||
      document.querySelector('.a-price.a-text-price .a-offscreen');
    const rawListPrice = listPriceEl?.textContent?.trim() ?? null;
    // Only return listPrice if it's different from salePrice
    const listPrice = rawListPrice && rawListPrice !== salePrice ? rawListPrice : null;

    // Discount % (e.g. "-23%")
    const discountEl =
      document.querySelector('.savingsPercentage') ||
      document.querySelector('#savingsPercentage') ||
      document.querySelector('.reinventPriceSavingsPercentageMargin');
    const discount = discountEl?.textContent?.trim() ?? null;

    // You save (absolute, e.g. "$10.00")
    const youSaveEl = document.querySelector('#savingsSavingsSummary, .savingsAmount');
    const youSave = youSaveEl?.textContent?.trim() ?? null;

    // Coupon
    const couponEl =
      document.querySelector('.couponBadge') ||
      document.querySelector('#couponBadgeRegularVpc') ||
      document.querySelector('[id*="coupon"] .a-color-success');
    const coupon = couponEl?.textContent?.trim() ?? null;

    // ── Image ─────────────────────────────────────────────────────────────────
    const imgEl = document.querySelector('#landingImage, #imgBlkFront, #main-image');
    let imageUrl = null;
    if (imgEl) {
      // Prefer data-old-hires (full resolution, not cropped)
      imageUrl = imgEl.getAttribute('data-old-hires') || null;
      if (!imageUrl) {
        // Parse data-a-dynamic-image (map of URL → [w,h]) and pick largest
        const dynamic = imgEl.getAttribute('data-a-dynamic-image');
        if (dynamic) {
          try {
            const map = JSON.parse(dynamic);
            const entries = Object.entries(map);
            // Sort by area (w*h) descending, take largest
            entries.sort((a, b) => (b[1][0] * b[1][1]) - (a[1][0] * a[1][1]));
            imageUrl = entries[0]?.[0] ?? null;
          } catch { /* ignore */ }
        }
      }
      if (!imageUrl) imageUrl = imgEl.getAttribute('src') || null;
    }

    // ── Rating & reviews ──────────────────────────────────────────────────────
    const ratingAttr = document.querySelector('#acrPopover')?.getAttribute('title') ?? null;
    // ratingAttr is like "4.7 out of 5 stars" — extract just the number
    const ratingMatch = ratingAttr?.match(/[\d.]+/);
    const rating = ratingMatch ? ratingMatch[0] : null;
    const reviewCount = text('#acrCustomerReviewText') ?? null;

    // ── Other ─────────────────────────────────────────────────────────────────
    const title = text('#productTitle');
    const availability = text('#availability span, #outOfStock');
    const hasPrime = !!document.querySelector('.a-icon-prime');

    return {
      title, imageUrl, rating, reviewCount,
      salePrice, listPrice, discount, youSave, coupon,
      availability, prime: hasPrime,
    };
  });

  // ── Clean image URL ───────────────────────────────────────────────────────
  data.imageUrl = cleanImageUrl(data.imageUrl);

  // ── Validate image URL ────────────────────────────────────────────────────
  let imageValidation = { valid: false, reason: 'no URL extracted' };
  if (data.imageUrl) {
    imageValidation = await validateImageUrl(data.imageUrl);
  }
  data.imageValid = imageValidation.valid;
  data.imageValidation = imageValidation;

  // ── Deal flag ─────────────────────────────────────────────────────────────
  data.isDeal = !!(data.listPrice) || !!(data.discount) || !!(data.coupon);

  data.asin = asin;
  data.link = `https://www.amazon.com/dp/${asin}?tag=pielsmart-20`;

  return data;
}

// ── Run scraper on all ASINs ──────────────────────────────────────────────────
const results = [];

for (const asin of asins) {
  console.log(`⏳ Scraping ASIN: ${asin}...`);
  const data = await scrapeProduct(asin);
  results.push(data);

  // Add 2-4 second random delay between products to appear more human
  if (asins.indexOf(asin) < asins.length - 1) {
    const delay = 2000 + Math.floor(Math.random() * 2000);
    await page.waitForTimeout(delay);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (data.error) {
    console.log(`❌ ERROR — ASIN: ${asin}`);
    console.log(`   ${data.error}`);
    if (data.screenshotSaved) console.log(`   📸 Screenshot: ${data.screenshotSaved}`);
    continue;
  }

  const dealBadge = data.isDeal ? '🔥 DEAL' : '      ';
  const imgBadge = data.imageValid ? '✅' : '❌';

  console.log(`${dealBadge} | ASIN: ${asin}`);
  console.log(`  Title:       ${data.title?.slice(0, 80) ?? 'n/a'}`);
  console.log(`  Sale price:  ${data.salePrice ?? '—'}`);
  console.log(`  List price:  ${data.listPrice ?? '—  (no strikethrough)'}`);
  console.log(`  Discount:    ${data.discount ?? '—'}${data.youSave ? '  (saves ' + data.youSave + ')' : ''}`);
  console.log(`  Coupon:      ${data.coupon ?? '—'}`);
  console.log(`  Rating:      ${data.rating ?? '—'}  ${data.reviewCount ?? ''}`);
  console.log(`  Prime:       ${data.prime ? 'Yes ✈️' : 'No'}`);
  console.log(`  Availability:${data.availability ?? '—'}`);
  console.log(`  Image ${imgBadge}:  ${data.imageUrl ?? '—'}`);
  if (!data.imageValid) console.log(`  Image issue: ${data.imageValidation?.reason}`);
  console.log(`  Link:        ${data.link}`);

  // ProductCard copy block
  console.log(`\n  ── ProductCard props ──`);
  console.log(`  asin="${asin}"`);
  if (data.salePrice)   console.log(`  price="${data.salePrice}"`);
  if (data.listPrice)   console.log(`  listPrice="${data.listPrice}"`);
  if (data.discount)    console.log(`  discount="${data.discount}"`);
  if (data.coupon)      console.log(`  coupon="${data.coupon}"`);
  if (data.rating)      console.log(`  rating="${data.rating}"`);
  if (data.reviewCount) console.log(`  reviews="${data.reviewCount}"`);
  if (data.imageValid)  console.log(`  image="${data.imageUrl}"`);
  console.log(`  link="${data.link}"`);
}

console.log(`\n${'━'.repeat(60)}`);
console.log(`✅ Done. Scraped ${results.filter(r => !r.error).length}/${results.length} products successfully.`);

const failedImages = results.filter(r => !r.error && !r.imageValid);
if (failedImages.length) {
  console.log(`\n⚠️  Image validation failed for ${failedImages.length} product(s):`);
  failedImages.forEach(r => console.log(`   - ${r.asin}: ${r.imageValidation?.reason}`));
  console.log(`   → Use the m.media-amazon.com URL from right-clicking the product image on Amazon.`);
}

const captchas = results.filter(r => r.error);
if (captchas.length) {
  console.log(`\n❌ ${captchas.length} product(s) blocked (CAPTCHA/bot detection):`);
  captchas.forEach(r => console.log(`   - ${r.asin}: ${r.error}`));
  console.log(`   → Open the debug-*.png screenshots to see what Amazon is showing.`);
  console.log(`   → Try running again — Amazon blocking is intermittent.`);
}

if (jsonMode) {
  console.log('\n── JSON output ──');
  console.log(JSON.stringify(results, null, 2));
}

await browser.close();
