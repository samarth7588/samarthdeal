import assert from "node:assert/strict";
import test from "node:test";

import {
  identifyProductOrderUrl,
  productPlatformLink,
  productRetailerLinks,
  productOrderLinksInDescription,
} from "../app/_lib/product-links.ts";

test("does not identify Amazon links as product platforms", () => {
  const first = identifyProductOrderUrl(
    "https://www.amazon.in/dp/B0F53TTJF5?utm_source=whatsapp&th=1",
  );

  assert.equal(first, null);
});

test("does not match different product identifiers on similar product URLs", () => {
  const first = identifyProductOrderUrl("https://www.flipkart.com/product-name/p/itm12345");
  const second = identifyProductOrderUrl("https://www.flipkart.com/product-name/p/itm12346");

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

test("shows a known platform name when only the saved platform is available", () => {
  assert.deepEqual(productPlatformLink("Product details", "Flipkart"), {
    url: "",
    platform: "Flipkart",
    identity: "flipkart",
  });
});

test("shows Flipkart from the product caption when no platform column is available", () => {
  const link = productPlatformLink("Platform: Flipkart\nProduct details");
  assert.equal(link?.platform, "Flipkart");
  assert.equal(link?.url, "");
});

test("infers one shopping platform from a caption URL when no saved badge exists", () => {
  const link = productPlatformLink("https://www.flipkart.com/brand/item-name");
  assert.equal(link?.platform, "Flipkart");
});

test("does not guess between multiple shopping platforms", () => {
  assert.equal(
    productPlatformLink(
      "https://www.flipkart.com/brand/item-name\nhttps://www.myntra.com/product-name",
    ),
    null,
  );
});

test("selects only the explicitly labeled product link from multiple retailer URLs", () => {
  const links = productRetailerLinks(
    "Amazon https://www.amazon.in/dp/B0F53TTJF5\n" +
      "Product Link: https://dl.flipkart.com/dl/product-name?affid=example\n" +
      "Meesho https://www.meesho.com/product-name/p/12345\n" +
      "Blinkit https://blinkit.com/prn/product-name",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Flipkart"]);
  assert.equal(links[0].url, "https://dl.flipkart.com/dl/product-name");
});

test("does not show an Amazon label or fire link when the caption only has Amazon", () => {
  assert.deepEqual(
    productRetailerLinks("https://www.amazon.in/dp/B0F53TTJF5"),
    [],
  );
});

test("does not infer a platform from caption text or choose among multiple product links", () => {
  assert.deepEqual(
    productRetailerLinks(
      "Platform: Flipkart\n" +
        "https://www.flipkart.com/first-product/p/itm12345\n" +
        "https://www.nykaa.com/second-product/p/12345",
    ),
    [],
  );
  assert.deepEqual(
    productRetailerLinks(
      "Amazon deal\nhttps://www.amazon.in/dp/B0F53TTJF5\n" +
        "https://www.flipkart.com/unlabeled-promotion/p/itm12345",
    ),
    [],
  );
});

test("uses a product link explicitly associated with the caption and ignores other products", () => {
  const links = productRetailerLinks(
    "Product Link: https://www.nykaa.com/current-product/p/12345\n" +
      "Also see: https://www.flipkart.com/another-product/p/itm12345",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Nykaa"]);
});

test("prefers an explicitly labeled product URL over a generic order link", () => {
  const links = productRetailerLinks(
    "Product Link: https://www.nykaa.com/current-product/p/12345\n" +
      "Order Link: https://www.flipkart.com/another-product/p/itm12345",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Nykaa"]);
});

test("finds the product label when the same URL appears earlier without a label", () => {
  const links = productRetailerLinks(
    "Promo: https://www.flipkart.com/current-product/p/itm12345\n" +
      "Product Link: https://www.flipkart.com/current-product/p/itm12345",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Flipkart"]);
});

test("ignores Amazon named in the caption and selects the explicitly labeled non-Amazon link", () => {
  const links = productRetailerLinks(
    "Platform: Amazon\n" +
      "Product Link: https://www.flipkart.com/current-product/p/itm12345",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Flipkart"]);
});

test("excludes order form and retailer order links while retaining product links", () => {
  const links = productRetailerLinks(
    "Product: https://blinkit.com/prn/product-name\n" +
      "Order form: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM123\n" +
      "Flipkart order: https://www.flipkart.com/order/item123",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Blinkit"]);
});

test("does not show retailer category or informational pages as product platforms", () => {
  assert.deepEqual(
    productRetailerLinks(
      "https://www.meesho.com/women-ethnic-wear\nhttps://www.nykaa.com/about-us",
    ),
    [],
  );
});

test("recognizes Nykaa product links for the platform badge", () => {
  const links = productRetailerLinks(
    "https://www.nykaa.com/product-name/p/12345",
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].platform, "Nykaa");
});

test("recognizes Zepto and BigBasket product URLs independently", () => {
  assert.equal(productRetailerLinks("https://www.zeptonow.com/pn/zepto-product-123")[0]?.platform, "Zepto");
  assert.equal(productRetailerLinks("https://www.bigbasket.com/pd/10001234/product-name/")[0]?.platform, "BigBasket");
});

test("recognizes Tata Cliq product links", () => {
  const links = productRetailerLinks(
    "https://www.tatacliq.com/product-name/p-mp000000012345678",
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].platform, "Tata Cliq");
});

test("recognizes Flipkart short product links", () => {
  const links = productRetailerLinks("https://dl.flipkart.com/s/abc123");

  assert.equal(links.length, 1);
  assert.equal(links[0].platform, "Flipkart");
});

test("shows recognized retailer platforms for nonstandard product URL paths", () => {
  const links = productRetailerLinks(
    "Product Link: https://www.flipkart.com/brand/item-name\n" +
      "Promo: https://www.nykaa.com/brand/product-name\n" +
      "More offers: https://www.myntra.com/product-name",
  );

  assert.deepEqual(links.map(({ platform }) => platform), ["Flipkart"]);
});

test("does not show retailer platform badges for common store navigation and checkout links", () => {
  assert.deepEqual(
    productRetailerLinks(
      "https://www.flipkart.com/search?q=shoes\n" +
        "https://www.nykaa.com/cart\n" +
        "https://www.myntra.com/order/123",
    ),
    [],
  );
});

test("deduplicates repeated retailer URLs in a caption", () => {
  assert.equal(
    productRetailerLinks(
      "https://flipkart.com/product-name/p/itm12345\nhttps://www.flipkart.com/product-name/p/itm12345?utm_source=whatsapp",
    ).length,
    1,
  );
});

test("recognizes a known product short-link without guessing its platform", () => {
  const link = identifyProductOrderUrl("https://bitli.in/QyeGq8Q");

  assert.ok(link);
  assert.equal(link.platform, "");
  assert.equal(link.identity, "bitli.in:short-link:qyegq8q");
});

test("extracts only actual product or order links from a caption", () => {
  const links = productOrderLinksInDescription(
    "Group: https://chat.whatsapp.com/example\n" +
      "Order Form: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1\n" +
      "Product Link: https://www.flipkart.com/product-name/p/itm12345",
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].platform, "Flipkart");
});
