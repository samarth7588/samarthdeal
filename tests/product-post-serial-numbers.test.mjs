import assert from "node:assert/strict";
import test from "node:test";

import { assignProductSerialNumbers } from "../app/_lib/product-post-serial-numbers.ts";

test("assigns numbers to products without changing stored serial numbers", () => {
  const serialNumbers = assignProductSerialNumbers([
    { id: "stored", serial_number: 8 },
    { id: "missing-one", serial_number: null },
    { id: "missing-two", serial_number: null },
    { id: "stored-two", serial_number: 2 },
  ]);

  assert.deepEqual([...serialNumbers], [
    ["stored", 8],
    ["missing-one", 1],
    ["missing-two", 3],
    ["stored-two", 2],
  ]);
});

test("assigns a number when all products lack stored serial numbers", () => {
  const serialNumbers = assignProductSerialNumbers([
    { id: "first", serial_number: null },
    { id: "second", serial_number: null },
  ]);

  assert.deepEqual([...serialNumbers], [
    ["first", 1],
    ["second", 2],
  ]);
});
