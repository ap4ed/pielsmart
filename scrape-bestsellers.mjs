/**
 * Scrapes Amazon best seller pages for 3 beauty categories,
 * then runs the full product scraper on each ASIN.
 * Delivery set to Miami 33166.
 */
import { chromium } from 'playwright';

const categories = [
  { slug: 'perfumes-hombre', url: 'https://www.amazon.com/Best-Sellers-Beauty-Mens-Cologne/zgbs/beauty/11058281' },
  { slug: 'acido-hialuronico', url: 'https://www.amazon.com/Best-Sellers-Beauty-Hyaluronic-Acid-Serums/zgbs/beauty/17876212011' },
  { slug: 'maquillaje-base', url: 'https://www.amazon.com/Best-Sellers-Beauty-Face-Makeup/zgbs/beauty/11060451' },
];

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  locale: 'en-US',
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

// Set delivery to Miami 33166
await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
let locationSet = false;
for (let attempt = 0; attempt < 3 && !locationSet; attempt++) {
  const deliverTo = page.locator('#nav-global-location-popover-link, #glow-ingress-line2');
  if (await deliverTo.count() > 0) {
    await deliverTo.first().click();
    await page.waitForTimeout(1500);
    const zipInput = page.locator('#GLUXZipUpdateInput');
    if (await zipInput.count() > 0) {
      await zipInput.first().fill('33166');
      await page.waitForTimeout(500);
      const applyBtn = page.locator('[data-action="GLUXZipUpdate"] input[type=submit], #GLUXZipUpdate input[type=submit]');
      if (await applyBtn.count() > 0) { await applyBtn.first().click(); await page.waitForTimeout(3000); }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }
  const loc = await page.locator('#glow-ingress-line2').textContent().catch(() => '');
  if (loc.includes('33166') || loc.includes('Miami')) locationSet = true;
  else { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000); }
}
const finalLoc = await page.locator('#glow-ingress-line2').textContent().catch(() => 'unknown');
console.log(`📍 Location: ${finalLoc.trim()}\n`);

async function scrapeProduct(asin) {
  await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const salePriceRaw = document.querySelector('.apexPriceToPay .a-offscreen, .a-price .a-offscreen')?.textContent?.trim() ?? null;
    const listPriceRaw = document.querySelector('.a-price.a-text-price .a-offscreen')?.textContent?.trim() ?? null;
    const discountRaw = text('.savingsPercentage');
    const imgEl = document.querySelector('#landingImage, #imgBlkFront');
    let imageUrl = null;
    if (imgEl) {
      imageUrl = imgEl.getAttribute('data-old-hires') || imgEl.getAttribute('src');
      const dynamicData = imgEl.getAttribute('data-a-dynamic-image');
      if (dynamicData) { try { const urls = Object.keys(JSON.parse(dynamicData)); imageUrl = urls[urls.length - 1] ?? imageUrl; } catch(e) {} }
    }
    const ratingRaw = document.querySelector('#acrPopover')?.getAttribute('title') ?? text('.a-icon-star .a-icon-alt') ?? null;
    const reviewCountRaw = text('#acrCustomerReviewText');
    const title = text('#productTitle');
    const availability = text('#availability span') ?? text('#outOfStock');
    const hasPrime = !!document.querySelector('.a-icon-prime');
    const coupon = text('.couponBadge, #couponBadgeRegularVpc');
    return { title, imageUrl, rating: ratingRaw, reviewCount: reviewCountRaw, salePrice: salePriceRaw, listPrice: listPriceRaw, discount: discountRaw, availability, prime: hasPrime, coupon };
  });
}

for (const cat of categories) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`CATEGORY: ${cat.slug}`);
  console.log('═'.repeat(60));

  await page.goto(cat.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(1500);

  const html = await page.content();
  const asinMatches = [...html.matchAll(/\/dp\/([A-Z0-9]{10})\//g)];
  const asins = [...new Set(asinMatches.map(m => m[1]))].slice(0, 8);
  console.log(`Found ${asins.length} ASINs: ${asins.join(', ')}\n`);

  for (const asin of asins) {
    const data = await scrapeProduct(asin);
    const isDeal = !!(data.discount) || !!(data.coupon) || !!(data.listPrice && data.listPrice !== data.salePrice);
    const dealFlag = isDeal ? '🔥 DEAL' : '      ';
    console.log(`${dealFlag} | ASIN: ${asin}`);
    console.log(`         Title: ${data.title?.slice(0, 80) ?? 'n/a'}`);
    console.log(`         Price: ${data.salePrice ?? 'n/a'} (was ${data.listPrice ?? 'n/a'}, ${data.discount ?? 'no discount'})`);
    console.log(`         Rating: ${data.rating ?? 'n/a'} ${data.reviewCount ?? ''}`);
    console.log(`         Coupon: ${data.coupon ?? 'none'}`);
    console.log(`         Image: ${data.imageUrl ?? 'n/a'}`);
    console.log(`         Link: https://www.amazon.com/dp/${asin}?tag=pielsmart-20`);
    console.log('');
  }
}

await browser.close();
console.log('\n✅ Done.');
