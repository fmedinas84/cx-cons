import assert from "node:assert/strict";
import test from "node:test";

import configHandler, { classifyCredentialMode } from "../api/config.js";
import paymentHandler, {
  buildPaymentBody,
  calculateTransactionAmount,
  extractMercadoPagoError,
  shouldReturnDiagnostics,
  validateIdempotencyKey,
  validateQuantity,
} from "../api/payment.js";

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

const validFormData = {
  quantity: 3,
  token: "temporary-card-token",
  issuer_id: "123",
  payment_method_id: "visa",
  installments: 1,
  payer: {
    email: "comprador@example.com",
    identification: { type: "Otro", number: "123456789" },
  },
};

test("acepta solamente cantidades enteras entre 1 y 4", () => {
  assert.equal(validateQuantity(1), true);
  assert.equal(validateQuantity(4), true);
  assert.equal(validateQuantity(0), false);
  assert.equal(validateQuantity(5), false);
  assert.equal(validateQuantity("2"), false);
});

test("calcula el monto exclusivamente en el backend", () => {
  assert.equal(calculateTransactionAmount(1), 100);
  assert.equal(calculateTransactionAmount(4), 400);
  assert.throws(() => calculateTransactionAmount(5), RangeError);

  const body = buildPaymentBody({
    ...validFormData,
    transaction_amount: 1,
  });

  assert.equal(body.transaction_amount, 300);
  assert.equal(body.description, "Stickers de personajes de videojuegos");
  assert.equal(body.payment_method_id, "visa");
  assert.equal(body.issuer_id, 123);
  assert.equal(typeof body.transaction_amount, "number");
  assert.equal(typeof body.installments, "number");
  assert.equal(typeof body.issuer_id, "number");
  assert.equal(typeof body.payer.email, "string");
  assert.equal(typeof body.payer.identification.type, "string");
  assert.equal(typeof body.payer.identification.number, "string");
});

test("extrae diagnóstico de Mercado Pago sin incluir campos sensibles", () => {
  const diagnostic = extractMercadoPagoError({
    status: 401,
    error: "unauthorized",
    message: "Unauthorized use of live credentials APP_USR-secret-value",
    causes: [
      {
        code: "credential_error",
        description: "Revisa la credencial",
        data: "token-completo-que-no-debe-aparecer",
      },
    ],
  });

  assert.deepEqual(diagnostic, {
    http_status: 401,
    status: undefined,
    status_detail: undefined,
    error_code: "unauthorized",
    message: "Unauthorized use of live credentials [credential redacted]",
    cause: [{ code: "credential_error", description: "Revisa la credencial" }],
  });
  assert.equal(JSON.stringify(diagnostic).includes("token-completo"), false);
  assert.equal(JSON.stringify(diagnostic).includes("APP_USR-secret-value"), false);
});

test("devuelve diagnóstico solamente en desarrollo o preview", () => {
  assert.equal(shouldReturnDiagnostics({ NODE_ENV: "development" }), true);
  assert.equal(shouldReturnDiagnostics({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
  assert.equal(shouldReturnDiagnostics({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
});

test("acepta una clave idempotente segura y rechaza valores inválidos", () => {
  assert.equal(validateIdempotencyKey("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(validateIdempotencyKey("corta"), false);
  assert.equal(validateIdempotencyKey("clave con espacios no permitidos"), false);
});

test("el endpoint exige método POST, credencial e idempotencia", async () => {
  const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  try {
    const methodResponse = createResponse();
    await paymentHandler({ method: "GET" }, methodResponse);
    assert.equal(methodResponse.statusCode, 405);
    assert.equal(methodResponse.headers.Allow, "POST");

    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const credentialsResponse = createResponse();
    await paymentHandler({ method: "POST", headers: {}, body: validFormData }, credentialsResponse);
    assert.equal(credentialsResponse.statusCode, 500);

    process.env.MERCADOPAGO_ACCESS_TOKEN = "local-test-placeholder";
    const idempotencyResponse = createResponse();
    await paymentHandler({ method: "POST", headers: {}, body: validFormData }, idempotencyResponse);
    assert.equal(idempotencyResponse.statusCode, 400);

    const quantityResponse = createResponse();
    await paymentHandler(
      {
        method: "POST",
        headers: { "x-idempotency-key": "550e8400-e29b-41d4-a716-446655440000" },
        body: { ...validFormData, quantity: 9 },
      },
      quantityResponse,
    );
    assert.equal(quantityResponse.statusCode, 400);
  } finally {
    if (originalToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken;
  }
});

test("el endpoint público de configuración nunca devuelve el Access Token", () => {
  const originalPublicKey = process.env.MERCADOPAGO_PUBLIC_KEY;
  const originalAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  try {
    process.env.MERCADOPAGO_PUBLIC_KEY = "public-key-placeholder";
    process.env.MERCADOPAGO_ACCESS_TOKEN = "secret-token-placeholder";
    const response = createResponse();

    configHandler({ method: "GET" }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.payload, {
      mercadoPagoPublicKey: "public-key-placeholder",
      credential_mode: "unknown",
    });
    assert.equal(JSON.stringify(response.payload).includes("secret-token-placeholder"), false);
  } finally {
    if (originalPublicKey === undefined) delete process.env.MERCADOPAGO_PUBLIC_KEY;
    else process.env.MERCADOPAGO_PUBLIC_KEY = originalPublicKey;
    if (originalAccessToken === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN = originalAccessToken;
  }
});

test("clasifica el entorno de las credenciales sin devolver sus valores", () => {
  assert.equal(classifyCredentialMode("TEST-public-key-placeholder"), "test");
  assert.equal(classifyCredentialMode("APP_USR-access-token-placeholder"), "production");
  assert.equal(classifyCredentialMode("otro-formato"), "unknown");
  assert.equal(classifyCredentialMode(undefined), "missing");
});
