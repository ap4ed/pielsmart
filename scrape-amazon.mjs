/**
 * Amazon product scraper for PielSmart
 * Usage: node scrape-amazon.mjs ASIN1 ASIN2 ...
 * Always sets delivery to Miami 33166 (freight forwarder zip)
 */

import { chromium } from 'playwright';

const asins = process.argv.slice(2);
if (!asins.length) {
  console.error('Usage: node scrape-amazon.mjs ASIN1 ASIN2 ...');
  process.exit(1);
}

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

// Try setting zip up to 3 times until confirmed
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
      if (await applyBtn.count() > 0) {
        await applyBtn.first().click();
        await page.waitForTimeout(3000);
      }
      // Close popover if still open
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  }
  // Verify zip was applied
  const locationText = await page.locator('#glow-ingress-line2').textContent().catch(() => '');
  if (locationText.includes('33166') || locationText.includes('Miami')) {
    locationSet = true;
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
}
const finalLocation = await page.locator('#glow-ingress-line2').textContent().catch(() => 'unknown');
console.log(`📍 Location: ${finalLocation.trim()}`);

console.log('📍 Delivery set to Miami 33166\n');

const results = [];

for (const asin of asins) {
  await page.goto(`https://www.amazon.com/dp/${asin}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const attr = (sel, a) => document.querySelector(sel)?.getAttribute(a) ?? null;

    // Prices
    const salePriceRaw = document.querySelector('.apexPriceToPay .a-offscreen, .a-price .a-offscreen')?.textContent?.trim() ?? null;
    const listPriceRaw = document.querySelector('.a-price.a-text-price .a-offscreen')?.textContent?.trim() ?? null;
    const discountRaw = text('.savingsPercentage');

    // Image — get the highest-res src available
    const imgEl = document.querySelector('#landingImage, #imgBlkFront');
    let imageUrl = null;
    if (imgEl) {
      // Try data-old-hires first (full res), fall back to src
      imageUrl = imgEl.getAttribute('data-old-hires') || imgEl.getAttribute('src');
      // Try to parse dynamic image data for higher res
      const dynamicData = imgEl.getAttribute('data-a-dynamic-image');
      if (dynamicData) {
        const urls = Object.keys(JSON.parse(dynamicData));
        // Pick largest (last tends to be highest res)
        imageUrl = urls[urls.length - 1] ?? imageUrl;
      }
    }

    // Rating
    const ratingRaw = document.querySelector('#acrPopover')?.getAttribute('title')
      ?? text('.a-icon-star .a-icon-alt')
      ?? null;
    const reviewCountRaw = text('#acrCustomerReviewText');

    // Title
    const title = text('#productTitle');

    // Availability
    const availability = text('#availability span') ?? text('#outOfStock');

    // Prime
    const hasPrime = !!document.querySelector('.a-icon-prime');

    // Coupon
    const coupon = text('.couponBadge, #couponBadgeRegularVpc');

    return {
      title,
      imageUrl,
      rating: ratingRaw,
      reviewCount: reviewCountRaw,
      salePrice: salePriceRaw,
      listPrice: listPriceRaw,
      discount: discountRaw,
      availability,
      prime: hasPrime,
      coupon,
    };
  });

  data.asin = asin;
  data.url = `https://www.amazon.com/dp/${asin}?tag=pielsmart-20`;
  results.push(data);

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`ASIN:        ${asin}`);
  console.log(`Title:       ${data.title ?? 'n/a'}`);
  console.log(`Image:       ${data.imageUrl ?? 'n/a'}`);
  console.log(`Rating:      ${data.rating ?? 'n/a'}`);
  console.log(`Reviews:     ${data.reviewCount ?? 'n/a'}`);
  console.log(`Sale price:  ${data.salePrice ?? 'n/a'}`);
  console.log(`List price:  ${data.listPrice ?? 'n/a'} (strikethrough)`);
  console.log(`Discount:    ${data.discount ?? 'n/a'}`);
  console.log(`Prime:       ${data.prime ? 'Yes' : 'No'}`);
  console.log(`Coupon:      ${data.coupon ?? 'none'}`);
  console.log(`Availability:${data.availability ?? 'n/a'}`);
  console.log(`Link:        ${data.url}`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Done.');

await browser.close();
