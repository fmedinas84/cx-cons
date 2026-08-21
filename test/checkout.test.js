import assert from "node:assert/strict";
import test from "node:test";

import checkoutHandler, {
  buildPreferenceBody,
  validateQuantity,
} from "../api/checkout.js";

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("acepta solamente cantidades enteras entre 1 y 4", () => {
  assert.equal(validateQuantity(1), true);
  assert.equal(validateQuantity(4), true);
  assert.equal(validateQuantity(0), false);
  assert.equal(validateQuantity(5), false);
  assert.equal(validateQuantity("2"), false);
  assert.equal(validateQuantity(2.5), false);
});

test("el backend fija el producto y el precio unitario", () => {
  const body = buildPreferenceBody(3);
  const [item] = body.items;

  assert.equal(item.title, "Stickers de personajes de videojuegos");
  assert.equal(item.quantity, 3);
  assert.equal(item.unit_price, 100);
  assert.equal(item.currency_id, "CLP");
});

test("el endpoint rechaza métodos y cantidades inválidas", async () => {
  const methodResponse = createResponse();
  await checkoutHandler({ method: "GET" }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.Allow, "POST");

  const quantityResponse = createResponse();
  await checkoutHandler({ method: "POST", body: { quantity: 8 } }, quantityResponse);
  assert.equal(quantityResponse.statusCode, 400);
});
