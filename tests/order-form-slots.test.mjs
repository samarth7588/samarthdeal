import assert from "node:assert/strict";
import test from "node:test";

import { getJayShakthiOrderFormUrl, getOrderFormPostStatus, parseJayShakthiOrderFormSlots } from "../app/_lib/order-form-slots.ts";

test("finds a Jay Shakthi order form in a WhatsApp-style Markdown message", () => {
  const description = "📝 *Order Form:* [**Open**](https://deal.jayshakthimarketing.com/orderform?product_code=Unigen_WiFiDongle5g_Az\\&deal_type_id=7079\\&mediator_name=Samarth)";

  assert.equal(
    getJayShakthiOrderFormUrl(description),
    "https://deal.jayshakthimarketing.com/orderform?product_code=Unigen_WiFiDongle5g_Az&deal_type_id=7079&mediator_name=Samarth",
  );
});

test("rejects non-Jay-Shakthi URLs so a description cannot choose the server fetch target", () => {
  assert.equal(getJayShakthiOrderFormUrl("https://example.com/orderform?deal_type_id=7079"), null);
});

test("does not select an unlabelled order form from the caption", () => {
  assert.equal(
    getJayShakthiOrderFormUrl(
      "Product: example\nhttps://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
    ),
    null,
  );
});

test("selects only the order form whose product code matches the current product", () => {
  const description =
    "Product Code: ITEM2\n" +
    "Order Form: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1\n" +
    "Other form: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM2";

  assert.equal(
    getJayShakthiOrderFormUrl(description),
    "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM2",
  );
});

test("uses a unique explicitly labeled order form and ignores unrelated forms", () => {
  const description =
    "Refund form: https://deal.jayshakthimarketing.com/refundform\n" +
    "Order Form: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1\n" +
    "Promotional form: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM2";

  assert.equal(
    getJayShakthiOrderFormUrl(description),
    "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
  );
});

test("recognizes an Order Form Link label", () => {
  assert.equal(
    getJayShakthiOrderFormUrl(
      "Order Form Link: https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
    ),
    "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
  );
});

test("returns no order form when multiple candidates are ambiguous", () => {
  assert.equal(
    getJayShakthiOrderFormUrl(
      "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1\n" +
        "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM2",
    ),
    null,
  );
});

test("reads deal types and counts from the order-form availability message", () => {
  assert.deepEqual(
    parseJayShakthiOrderFormSlots("<p><strong>Deal found!</strong> Available Slots: <b>Review</b>: 1 &nbsp; Rating: 0</p>"),
    [
      { dealType: "Review", availableSlots: 1 },
      { dealType: "Rating", availableSlots: 0 },
    ],
  );
});

test("reads the live slot data embedded in a Jay Shakthi order form", () => {
  const html = '<option value="Unigen_WiFiDongle5g_Az" data-available-deals=\'[{&quot;type_name&quot;:&quot;Review&quot;,&quot;remaining&quot;:1},{&quot;type_name&quot;:&quot;Rating&quot;,&quot;remaining&quot;:0}]\'>';

  assert.deepEqual(
    parseJayShakthiOrderFormSlots(html, "Unigen_WiFiDongle5g_Az"),
    [
      { dealType: "Review", availableSlots: 1 },
      { dealType: "Rating", availableSlots: 0 },
    ],
  );
});

test("does not use another product's slot data when the requested product code is missing", () => {
  const html =
    '<option value="ITEM1" data-available-deals=\'[{&quot;type_name&quot;:&quot;Review&quot;,&quot;remaining&quot;:0}]\'>' +
    "<p>Available Slots: Rating: 5</p>";

  assert.deepEqual(parseJayShakthiOrderFormSlots(html, "ITEM2"), []);
});

test("chooses LIVE if any deal type still has slots", () => {
  assert.equal(
    getOrderFormPostStatus({
      formUrl: "https://deal.jayshakthimarketing.com/orderform",
      slots: [
        { dealType: "Review", availableSlots: 0 },
        { dealType: "Rating", availableSlots: 2 },
      ],
    }),
    "live",
  );
});

test("keeps Jayshakti products LIVE with five or one available slot", () => {
  for (const availableSlots of [5, 1]) {
    assert.equal(
      getOrderFormPostStatus({
        formUrl: "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
        slots: [{ dealType: "Review", availableSlots }],
      }),
      "live",
    );
  }
});

test("marks a Jayshakti product OVER when its actual available slot count is zero", () => {
  assert.equal(
    getOrderFormPostStatus({
      formUrl: "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
      slots: [{ dealType: "Review", availableSlots: 0 }],
    }),
    "over",
  );
});

test("chooses OVER only when every deal type is sold out", () => {
  assert.equal(
    getOrderFormPostStatus({
      formUrl: "https://deal.jayshakthimarketing.com/orderform",
      slots: [
        { dealType: "Review", availableSlots: 0 },
        { dealType: "Rating", availableSlots: 0 },
      ],
    }),
    "over",
  );
  assert.equal(getOrderFormPostStatus(null), null);
  assert.equal(
    getOrderFormPostStatus({
      formUrl: "https://deal.jayshakthimarketing.com/orderform",
      slots: [],
    }),
    null,
  );
});

test("does not auto-count Google Forms or treat an unavailable slot response as OVER", () => {
  const googleForm = "https://docs.google.com/forms/d/e/example/viewform";
  assert.equal(getJayShakthiOrderFormUrl(`Order Form: ${googleForm}`), null);
  assert.equal(getOrderFormPostStatus(null), null);
  assert.equal(
    getOrderFormPostStatus({
      formUrl: "https://deal.jayshakthimarketing.com/orderform?product_code=ITEM1",
      slots: [],
    }),
    null,
  );
});
