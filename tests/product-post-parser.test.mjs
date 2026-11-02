import assert from "node:assert/strict";
import test from "node:test";

import { cleanProductTitle, deriveProductCodeTitle, deriveProductNameFromUrl, extractProductPrices, inferProductNameFromMessage, isValidProductName, nullablePrice, parseProductPostMessage, platformFromUrl } from "../app/_lib/product-post-parser.ts";
import { resolveProductPostMetadata } from "../app/_lib/product-post-metadata.ts";

const example = `https://www.amazon.in/dp/B0F53TTJF5?th=1&psc=1
Ratings deal
Less - 119
Code - AE-19-Maroon
Any size`;

test("parses the example without using the deal label as the product name", () => {
  const metadata = parseProductPostMessage(example);

  assert.equal(metadata.productName, "");
  assert.equal(metadata.brand, "");
  assert.equal(metadata.platform, "");
  assert.equal(metadata.orderPrice, "");
  assert.equal(metadata.lessPrice, "119");
});

test("recognizes platform names from common retailer URLs", () => {
  assert.equal(platformFromUrl("https://www.blinkit.com/prn/product"), "Blinkit");
  assert.equal(platformFromUrl("https://www.zeptonow.com/pn/product"), "Zepto");
  assert.equal(platformFromUrl("https://www.amazon.in/dp/example"), "");
  assert.equal(parseProductPostMessage("https://blinkit.com/prn/product").platform, "");
});

test("prefers the retailer from the product link over a conflicting platform label", async () => {
  const metadata = await resolveProductPostMetadata(
    "Product: Example product\nPlatform: Amazon\nhttps://blinkit.com/prn/example-product",
  );

  assert.equal(metadata.platform, "Blinkit");
});

test("keeps missing prices null while preserving a real zero price", () => {
  assert.equal(nullablePrice(""), null);
  assert.equal(nullablePrice("0"), 0);
  assert.equal(nullablePrice("249"), 249);
});

test("extracts a numeric less amount while leaving missing order price absent", () => {
  const metadata = parseProductPostMessage("Less - 300\nRatings deal");

  assert.equal(metadata.lessPrice, "300");
  assert.equal(metadata.orderPrice, "");
  assert.equal(nullablePrice(metadata.orderPrice), null);
  assert.equal(nullablePrice(metadata.lessPrice), 300);
});

test("detects less prices before and after the keyword with common punctuation", () => {
  const examples = [
    ["56 less", "56"],
    ["less 56", "56"],
    ["Less: 56", "56"],
    ["Less:- 56", "56"],
    ["Less :- 56", "56"],
    ["Less; 56", "56"],
    ["Less ;:- 56", "56"],
    ["Less = 56", "56"],
    ["56/- less", "56"],
    ["Less ₹56", "56"],
    ["₹56 less", "56"],
    ["Less Rs. 56", "56"],
    ["56 less discount", "56"],
  ];

  for (const [caption, expected] of examples) {
    assert.equal(extractProductPrices(caption).lessPrice, expected, caption);
  }
});

test("detects order prices independently from less prices", () => {
  const examples = [
    ["Order Price: 499", "499"],
    ["Order:- ₹499", "499"],
    ["Order Price ₹499", "499"],
    ["₹499 Order", "499"],
    ["499/- Order Price", "499"],
    ["Product Price: Rs. 499", "499"],
    ["Final Price = 499", "499"],
    ["Deal Price :- ₹499", "499"],
  ];

  for (const [caption, expected] of examples) {
    assert.equal(extractProductPrices(caption).orderPrice, expected, caption);
  }

  assert.deepEqual(extractProductPrices("Order Price: ₹499\n56 less"), {
    orderPrice: "499",
    lessPrice: "56",
  });
});

test("does not treat rating, slots, dates, percentages, or IDs as prices", () => {
  assert.deepEqual(
    extractProductPrices("Rating 4.5\nAvailable slots: 10\nDate: 25/10/2026\n50% off\nProduct code: 499\nRating 4.5 less\nAvailable slots 5 less\nDate 25/10/2026 less"),
    { orderPrice: "", lessPrice: "" },
  );
  assert.deepEqual(extractProductPrices("Order in 20 minutes\nLess 5 slots"), {
    orderPrice: "",
    lessPrice: "",
  });
});

test("treats less phrases as the final purchase price", () => {
  assert.equal(parseProductPostMessage("320 less").lessPrice, "320");
  assert.equal(parseProductPostMessage("₹320 less").lessPrice, "320");
  assert.equal(parseProductPostMessage("Less 320").lessPrice, "320");
  assert.equal(parseProductPostMessage("Less Price: ₹3,699.00 Only").lessPrice, "3699.00");
  assert.equal(parseProductPostMessage("💵 *Less Price:* ₹3,699.00 Only").lessPrice, "3699.00");
});

test("removes an Amazon website and category suffix without changing the product title", () => {
  assert.equal(
    cleanProductTitle("20000mAh Power Bank: Amazon.in: Electronics"),
    "20000mAh Power Bank",
  );
  assert.equal(
    cleanProductTitle("USB-C Power Bank 22.5W"),
    "USB-C Power Bank 22.5W",
  );
  assert.equal(
    cleanProductTitle("Portronics Power Plate 10K 10000mAh Power Bank | 22.5W Fast Charging | Type C Input | Amazon.in"),
    "Portronics Power Plate 10K 10000mAh Power Bank",
  );
});

test("parses the saved FirstCry message price formatting", () => {
  const metadata = parseProductPostMessage(
    "Product code: BAYBEE_Bedside_Crib_fc\nBrand Name: Dom\nPlatform: FirstCry\nOrder Link: https://bitli.in/QyeGq8Q\nOrder Price: ₹11,999/-\nLess Price: ₹3,699.00 Only",
  );

  assert.equal(metadata.productName, "");
  assert.equal(metadata.brand, "Dom");
  assert.equal(metadata.platform, "FirstCry");
  assert.equal(metadata.orderPrice, "11999");
  assert.equal(metadata.lessPrice, "3699.00");
});

test("derives a clearly non-verified title clue from the FirstCry product code", () => {
  assert.equal(
    deriveProductCodeTitle("Product code: BAYBEE_Bedside_Crib_fc"),
    "Baybee Bedside Crib",
  );
});

test("derives a short product title from an order-link search term or product path", () => {
  assert.equal(
    deriveProductNameFromUrl("https://www.amazon.in/s?k=Winter+Jacket+for+man&rh=p_78%3AB0CGHYDJFD%2Cssx%3Arelevance"),
    "Winter Jacket for Man",
  );
  assert.equal(
    deriveProductNameFromUrl("https://www.amazon.in/UNIGEN-Bluetooth-Wireless-Compatible-Receiver/dp/B0GZ46LDQW/ref=sr_1_7?sr=8-7"),
    "UNIGEN Bluetooth Wireless Compatible Receiver",
  );
  assert.equal(
    deriveProductNameFromUrl("https://www.amazon.in/dp/B0F53TTJF5?th=1&psc=1"),
    "",
  );
  assert.equal(deriveProductNameFromUrl("https://bitli.in/QyeGq8Q"), "");
  assert.equal(isValidProductName("B0F53TTJF5"), false);
  assert.equal(isValidProductName("QyeGq8Q"), false);
  assert.equal(deriveProductNameFromUrl("https://deal.jayshakthimarketing.com/orderform?product_code=BG_Jellyra_fk"), "");
});

test("never treats an instruction, deal label, or product code as a product name", () => {
  const description = "Deal Type: Review\nMediator Name: Samarth\nProduct Code: Unigen_WiFiDongle5g_Az";

  assert.equal(isValidProductName("Deal Type: Review"), false);
  assert.equal(isValidProductName("Mediator Name: Samarth"), false);
  assert.equal(isValidProductName("� Mediator Name: Samarth"), false);
  assert.equal(isValidProductName("orderform"), false);
  assert.equal(isValidProductName("Order Link:"), false);
  assert.equal(isValidProductName("Refund Form:"), false);
  assert.equal(isValidProductName("Note:"), false);
  assert.equal(isValidProductName("Product Rules/Remarks:"), false);
  assert.equal(isValidProductName("🔗 :"), false);
  assert.equal(isValidProductName("🔗 Order Link:"), false);
  assert.equal(isValidProductName("Order in next 10 Minutes, Else slot"), false);
  assert.equal(isValidProductName("Fill order form"), false);
  assert.equal(isValidProductName("General form"), false);
  assert.equal(isValidProductName("Ratings deal"), false);
  for (const instruction of [
    "No form - No refund",
    "No form–No refund",
    "No form / No refund",
    "No form, No refund",
    "No form no refund",
  ]) {
    assert.equal(isValidProductName(instruction), false);
  }
  assert.equal(isValidProductName("No Form No Refund Storage Pouch"), true);
  assert.equal(inferProductNameFromMessage("No form - No refund"), "");
  assert.equal(inferProductNameFromMessage(description), "");
  assert.equal(parseProductPostMessage(description).productName, "");
  assert.equal(parseProductPostMessage(`${description}\nhttps://bitli.in/QyeGq8Q`).productName, "");
  assert.equal(deriveProductCodeTitle(description), "Unigen WiFi Dongle 5G Az");
});

test("rejects error and rating-price lines as product names", () => {
  const invalidTitles = [
    "Delete/Error : 50% refund with unverified",
    "Delete/Error : 30% refund with unverified",
    "Ratting 39 less",
    "Rating 39 less",
  ];

  for (const title of invalidTitles) {
    assert.equal(isValidProductName(title), false, title);
    assert.equal(inferProductNameFromMessage(title), "", title);
    assert.equal(parseProductPostMessage(`Product Name: ${title}`).productName, "", title);
  }

  assert.equal(isValidProductName("Winter Jacket"), true);
  assert.equal(isValidProductName("No Form No Refund Storage Pouch"), true);
});

test("rejects promotional headings as product names", () => {
  const title = "PAYMENT UPDATES 🎉 & REGULAR RATTING 🥳 Deals";

  assert.equal(isValidProductName(title), false);
  assert.equal(inferProductNameFromMessage(title), "");
  assert.equal(
    parseProductPostMessage(`${title}\nBrand Name: Milton`).productName,
    "",
  );
  assert.equal(
    parseProductPostMessage(`${title}\nBrand Name: Milton`).brand,
    "Milton",
  );
  assert.equal(isValidProductName("Milton"), true);
});

test("classifies instruction-only product-name candidates generically", () => {
  for (const instruction of [
    "Refund Form:",
    "Order Form:",
    "Order Link:",
    "No form - No refund",
    "No form–No refund",
    "No form / No refund",
    "No form, No refund",
    "No form no refund",
    "Order in next 10 Minutes, Else slot",
    "Join WhatsApp",
    "Track Order",
  ]) {
    assert.equal(isValidProductName(instruction), false, instruction);
    assert.equal(inferProductNameFromMessage(instruction), "", instruction);
  }

  for (const productName of [
    "Winter Jacket for Man",
    "BAYBEE Bedside Crib",
    "No Form No Refund Storage Pouch",
  ]) {
    assert.equal(isValidProductName(productName), true, productName);
  }
});

test("rejects operational instruction fragments from real deal descriptions", () => {
  const instructionFragment = "within 10 Min of order (Else slot will";
  const description = `🚨 *Order in next 10 Minutes, Else slot will be passed* 🚨
*Deal Type:* Image Review
🔗 *Order Link:*
💰 *Order Price:* ₹1,169/-
💵 *Less Price:* ₹129.00 Only
👉 Fill order form
${instructionFragment}`;

  assert.equal(isValidProductName(instructionFragment), false);
  assert.equal(inferProductNameFromMessage(description), "");
  assert.equal(parseProductPostMessage(description).productName, "");
});

test("does not promote Myntra message headings or instructions to product names", () => {
  const description = `🚨 *Order in next 10 Minutes, Else slot will be passed* 🚨
*Deal Type:* Image Review
*Product Code:* AL_PureCottonKhadiSareePink_Myntra
*Brand Name:* ALMAARI
*Platform:* Myntra
🔗 *Order Link:*
https://myntr.it/xcw23AS
💵 *Less Price:* ₹129.00 Only
📝 *Order Form:*
https://example.com/orderform
👉 Fill order form within 10 Min of order (Else slot will be passed)
👉 No form - No refund
💸 *Refund Form:*
https://example.com/refundform
👉 Refund form needs to be filled in 20 days
⚠️ *Note:*
- If filling refund form after 40 days no refund amount will be issued
- Order Fast
📌 *Product Rules/Remarks:*
review with pic
Dont use any AI for the reviews (Chatgpt,Gemini AI, etc)
🙏 Thank You`;

  const parsed = parseProductPostMessage(description);
  assert.equal(parsed.productName, "");
  assert.equal(inferProductNameFromMessage(description), "");
});

test("normalizes real emoji and Markdown deal lines before parsing", () => {
  const message = `🚨 *Order in next 10 Minutes, Else slot will be passed* 🚨
🔗 *Order Link:*
💰 *Order Price:* ₹1,169/-
💵 *Less Price:* ₹129.00 Only`;
  const metadata = parseProductPostMessage(message);

  assert.equal(metadata.productName, "");
  assert.equal(metadata.orderPrice, "1169");
  assert.equal(metadata.lessPrice, "129.00");
  assert.equal(inferProductNameFromMessage(message), "");
});

test("skips message instructions and review requirements before finding a product name", () => {
  const description = "Don't Change Link\n4/5 star review\nMeal pod Black";

  assert.equal(isValidProductName("Don't Change Link"), false);
  assert.equal(isValidProductName("4/5 star review"), false);
  assert.equal(inferProductNameFromMessage(description), "Meal pod Black");
});

test("infers product name and platform from ordinary deal-message lines", () => {
  const message = "Winter Jacket Del/err 50 extra\nAmazon link: https://www.amazon.in/dp/example\n320 less";
  const metadata = parseProductPostMessage(message);

  assert.equal(metadata.productName, "Winter Jacket");
  assert.equal(metadata.platform, "");
  assert.equal(inferProductNameFromMessage(message), "Winter Jacket");
});

test("accepts explicit product names and rejects generic deal labels", () => {
  assert.equal(parseProductPostMessage("Product: Nike Running Shoes\nReview\n320 less").productName, "Nike Running Shoes");
  assert.equal(parseProductPostMessage("Product Name: Samsung Galaxy S24").productName, "Samsung Galaxy S24");
  assert.equal(parseProductPostMessage("Item: Portable Smart Lamp").productName, "Portable Smart Lamp");
  assert.equal(parseProductPostMessage("Review\nOrder links:\nhttps://www.amazon.in/dp/example").productName, "");
  assert.equal(parseProductPostMessage("Rating 69\nhttps://www.amazon.in/dp/example").productName, "");
  assert.equal(parseProductPostMessage("Order link:\nhttps://www.amazon.in/s?k=Winter+Jacket+for+man&rh=p_78%3AB0CGHYDJFD%2Cssx%3Arelevance\nReview").productName, "");
});

test("cleans store and marketing suffixes into short product names", () => {
  assert.equal(cleanProductTitle("Amazon.in: Nike Men's Running Shoes Online in India"), "Nike Men's Running Shoes");
  assert.equal(cleanProductTitle("BAYBEE Bedside Crib for Baby with Rocking Mode | Bassinet"), "BAYBEE Bedside Crib for Baby with Rocking Mode");
  assert.equal(cleanProductTitle("Sydney Portable Smart Lamp Buy Online - FirstCry"), "Sydney Portable Smart Lamp");
  assert.equal(cleanProductTitle("Winter Jacket Del/err 50 extra"), "Winter Jacket");
  assert.equal(inferProductNameFromMessage("Winter Jacket Del/err 50 extra\n320 less"), "Winter Jacket");
});

test("resolves FirstCry and Amazon examples without exposing instructions or codes as product names", async () => {
  const originalFetch = global.fetch;
  const exampleMessage = "Product Code: BAYBEE_Bedside_Crib_fc\nBrand Name: Dom\nPlatform: FirstCry\nOrder Price: ₹11,999/-\n💵 *Less Price:* ₹3,699.00 Only\n🔗 *Order Link:* https://bitli.in/QyeGq8Q\nReview";

  global.fetch = async (input) => {
    const url = String(input);

    if (url.includes("amazon")) {
      return new Response(
        '<html><head><meta property="og:title" content="Winter Jacket for Man" /><title>Winter Jacket for Man</title></head><body>Amazon</body></html>',
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }

    return new Response(
      '<html><head><meta property="og:title" content="BAYBEE Bedside Crib | Bassinet" /><title>BAYBEE Bedside Crib - Bassinet</title></head><body>FirstCry</body></html>',
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  try {
    const firstCry = await resolveProductPostMetadata(exampleMessage);
    assert.equal(firstCry.productName, "BAYBEE Bedside Crib");
    assert.equal(firstCry.brand, "Dom");
    assert.equal(firstCry.platform, null);
    assert.equal(firstCry.orderPrice, 11999);
    assert.equal(firstCry.lessPrice, 3699);

    const amazon = await resolveProductPostMetadata(
      "🔗 *Order Link:*\nhttps://www.amazon.in/s?k=Winter+Jacket+for+man&rh=p_78%3AB0CGHYDJFD%2Cssx%3Arelevance\nReview",
    );
    assert.equal(amazon.productName, "");
  } finally {
    global.fetch = originalFetch;
  }
});

test("does not treat a Myntra redirect storefront title as the product name", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      '<html><head><meta property="og:title" content="Myntra New" /></head></html>',
      { status: 200, headers: { "content-type": "text/html" } },
    );

  try {
    const resolved = await resolveProductPostMetadata(
      "⚠️ *Note:*\n🔗 *Order Link:* https://myntr.it/xcw23AS",
    );
    assert.equal(resolved.productName, "");
  } finally {
    global.fetch = originalFetch;
  }
});
