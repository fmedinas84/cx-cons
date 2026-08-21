import { MercadoPagoConfig, Payment } from "mercadopago";

const PRODUCT_TITLE = "Stickers de personajes de videojuegos";
const UNIT_PRICE_CLP = 100;

export function validateQuantity(value) {
  return Number.isInteger(value) && value >= 1 && value <= 4;
}

export function calculateTransactionAmount(quantity) {
  if (!validateQuantity(quantity)) {
    throw new RangeError("La cantidad debe ser un entero entre 1 y 4.");
  }

  return UNIT_PRICE_CLP * quantity;
}

export function validateIdempotencyKey(value) {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function getHeader(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isNonEmptyString(value, maxLength = 255) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function buildPayer(payer) {
  const safePayer = { email: payer.email.trim() };
  const identification = payer.identification;

  if (
    identification &&
    isNonEmptyString(identification.type, 20) &&
    isNonEmptyString(identification.number, 30)
  ) {
    safePayer.identification = {
      type: identification.type.trim(),
      number: identification.number.trim(),
    };
  }

  return safePayer;
}

export function buildPaymentBody(payload) {
  const quantity = payload.quantity;
  const installments = Number(payload.installments);

  if (!validateQuantity(quantity)) {
    throw new RangeError("La cantidad debe ser un entero entre 1 y 4.");
  }

  if (!isNonEmptyString(payload.token, 256)) {
    throw new TypeError("Falta el token de la tarjeta.");
  }

  if (!isNonEmptyString(payload.payment_method_id, 50)) {
    throw new TypeError("Falta el medio de pago.");
  }

  if (!Number.isInteger(installments) || installments < 1 || installments > 48) {
    throw new RangeError("La cantidad de cuotas no es válida.");
  }

  if (!payload.payer || !isNonEmptyString(payload.payer.email, 254)) {
    throw new TypeError("Falta el correo del pagador.");
  }

  const body = {
    transaction_amount: calculateTransactionAmount(quantity),
    token: payload.token,
    description: PRODUCT_TITLE,
    installments,
    payment_method_id: payload.payment_method_id,
    payer: buildPayer(payload.payer),
  };

  const issuerId = Number(payload.issuer_id);
  if (Number.isFinite(issuerId) && issuerId > 0) {
    body.issuer_id = issuerId;
  }

  return body;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("Falta la variable MERCADOPAGO_ACCESS_TOKEN.");
    return response.status(500).json({
      error: "El pago no está configurado. Intenta nuevamente más tarde.",
    });
  }

  const idempotencyKey = getHeader(request, "x-idempotency-key");
  if (!validateIdempotencyKey(idempotencyKey)) {
    return response.status(400).json({
      error: "La solicitud de pago no tiene una clave de idempotencia válida.",
    });
  }

  let body;
  try {
    body = buildPaymentBody(request.body ?? {});
  } catch (error) {
    return response.status(400).json({
      error: error.message || "Los datos del pago no son válidos.",
    });
  }

  try {
    const client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 10000 },
    });
    const payment = new Payment(client);
    const result = await payment.create({
      body,
      requestOptions: { idempotencyKey },
    });

    return response.status(200).json({
      payment_id: result.id,
      status: result.status,
      status_detail: result.status_detail,
    });
  } catch (error) {
    console.error("Error al procesar el pago con Mercado Pago:", {
      status: error?.status,
      message: error?.message,
    });
    const mercadoPagoStatus = Number(error?.status);
    const responseStatus = mercadoPagoStatus >= 400 && mercadoPagoStatus < 500 ? 400 : 502;
    return response.status(responseStatus).json({
      error: "No pudimos procesar el pago. Intenta nuevamente.",
    });
  }
}
