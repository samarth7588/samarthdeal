import assert from "node:assert/strict";
import test from "node:test";

import {
  identifyProductOrderUrl,
  productOrderLinksInDescription,
} from "../app/_lib/product-links.ts";

test("normalizes tracking parameters and identifies the same Amazon product", () => {
  const first = identifyProductOrderUrl(
    "https://www.amazon.in/dp/B0F53TTJF5?utm_source=whatsapp&th=1",
  );
  const second = identifyProductOrderUrl(
    "https://amazon.in/dp/B0F53TTJF5/?psc=1&ref_=share",
  );

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.identity, second.identity);
  assert.equal(first.platform, "Amazon");
});

test("does not match different product identifiers on similar product URLs", () => {
  const first = identifyProductOrderUrl("https://www.amazon.in/dp/B0F53TTJF5");
  const second = identifyProductOrderUrl("https://www.amazon.in/dp/B0F53TTJF6");

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.identity, second.identity);
});

test("matches Jayshakthi order links by product code regardless of tracking fields", () => {
  const first = identifyProductOrderUrl(
    "https://deal.jayshakthimarketing.com/orderform?product_code=BON_Dave_22.5W&deal_type_id=9487&mediator_name=Samarth",
  );
  const second = identifyProductOrderUrl(
    "https://deal.jayshakthimarketing.com/orderform/?mediator_name=Other&product_code=BON_Dave_22.5W&deal_type_id=9999",
  );

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.identity, second.identity);
});

test("ignores social links, generic homepages, and unrelated URLs", () => {
  for (const url of [
    "https://chat.whatsapp.com/example",
    "https://www.instagram.com/samarthdeals/",
    "https://amazon.in/",
    "https://example.com/about",
    "https://example.com/?utm_source=whatsapp",
  ]) {
    assert.equal(identifyProductOrderUrl(url), null, url);
  }
});

test("recognizes structured product paths on external stores", () => {
  const link = identifyProductOrderUrl("https://shop.example.com/products/copper-bottle");

  assert.ok(link);
  assert.equal(link.platform, "");
  assert.equal(link.identity, "shop.example.com:path:copper-bottle");
});

test("recognizes Flipkart and Blinkit product links for platform badges", () => {
  const flipkart = identifyProductOrderUrl(
    "https://www.flipkart.com/product-name/p/itm12345",
  );
  const blinkit = identifyProductOrderUrl(
    "https://blinkit.com/prn/product-name",
  );

  assert.ok(flipkart);
  assert.equal(flipkart.platform, "Flipkart");
  assert.ok(blinkit);
  assert.equal(blinkit.platform, "Blinkit");
});

test("recognizes a known product short-link without guessing its platform", () => {
  const link = identifyProductOrderUrl("https://bitli.in/QyeGq8Q");

  assert.ok(link);
  assert.equal(link.platform, "");
  assert.equal(link.identity, "bitli.in:short-link:qyegq8q");
});

test("extracts only actual product or order links from a caption", () => {
  const links = productOrderLinksInDescription(
    "Group: https://chat.whatsapp.com/example\nStore: https://example.com/\nProduct: https://www.amazon.in/dp/B0F53TTJF5",
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].platform, "Amazon");
});
