import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
});

const page = await context.newPage();
await page.goto('https://www.nytimes.com/wirecutter/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

// Dismiss overlays
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const closeBtn = page.locator('button[aria-label*="close" i], button[aria-label*="dismiss" i]');
if (await closeBtn.count() > 0) await closeBtn.first().click().catch(() => {});
await page.waitForTimeout(500);

// Take shots at multiple scroll positions
const shots = [
  { y: 0,    name: 'wc-home-1-top.png' },
  { y: 900,  name: 'wc-home-2.png' },
  { y: 1800, name: 'wc-home-3.png' },
  { y: 2700, name: 'wc-home-4.png' },
  { y: 3600, name: 'wc-home-5.png' },
  { y: 4500, name: 'wc-home-6.png' },
];

for (const shot of shots) {
  await page.evaluate((y) => window.scrollTo(0, y), shot.y);
  await page.waitForTimeout(700);
  await page.screenshot({ path: shot.name, clip: { x: 0, y: 0, width: 1280, height: 900 } });
  console.log(`Saved: ${shot.name}`);
}

await browser.close();
