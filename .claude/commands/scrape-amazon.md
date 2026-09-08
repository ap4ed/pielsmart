Scrape Amazon product data for PielSmart affiliate articles.

The user will provide one or more ASINs (e.g. `/scrape-amazon B00YWYL4FU B09152QDHX`).

Run the following command using the Bash tool:
```
cd "/Users/alfrepreci/Documents/Beauty Affiliate/pielsmart" && node scrape-amazon.mjs $ARGUMENTS
```

The scraper will:
1. Open a real browser (visible window will appear briefly)
2. Set delivery location to Miami zip 33166 (freight forwarder)
3. Visit each Amazon product page and extract:
   - Product title
   - Main image URL (m.media-amazon.com)
   - Star rating + review count
   - Sale price (current price)
   - List price (strikethrough/was price)
   - Discount percentage
   - Prime eligibility
   - Coupon badge
   - Availability

After the scraper finishes, present the results in a clean table and ask the user which products and data they want added to the article.

If the scraper fails or returns "not found" for a field, note it and offer to retry or ask the user to check the product page manually.
