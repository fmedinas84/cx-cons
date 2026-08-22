import { MercadoPagoConfig, Payment } from "mercadopago";

const PRODUCT_TITLE = "Stickers de personajes de videojuegos";
const UNIT_PRICE_CLP = 100;
const MAX_DIAGNOSTIC_TEXT_LENGTH = 300;

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

function sanitizeDiagnosticText(value) {
  if (typeof value !== "string") return undefined;

  return value
    .replace(/(?:TEST-|APP_USR-)[a-zA-Z0-9_-]+/g, "[credential redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[card data redacted]")
    .slice(0, MAX_DIAGNOSTIC_TEXT_LENGTH);
}

function sanitizeCause(cause) {
  if (!cause || typeof cause !== "object") return undefined;

  const code = sanitizeDiagnosticText(cause.code);
  const description = sanitizeDiagnosticText(cause.description);
  if (!code && !description) return undefined;

  return {
    ...(code ? { code } : {}),
    ...(description ? { description } : {}),
  };
}

export function extractMercadoPagoError(error) {
  const httpStatus = Number(error?.status);
  const causes = Array.isArray(error?.causes)
    ? error.causes.map(sanitizeCause).filter(Boolean)
    : [];

  return {
    http_status: Number.isInteger(httpStatus) && httpStatus > 0 ? httpStatus : undefined,
    status: sanitizeDiagnosticText(error?.payment_status),
    status_detail: sanitizeDiagnosticText(error?.status_detail),
    error_code: sanitizeDiagnosticText(error?.error),
    message: sanitizeDiagnosticText(error?.message) || "Mercado Pago no entregó un mensaje.",
    cause: causes,
  };
}

export function shouldReturnDiagnostics(environment = process.env) {
  return environment.NODE_ENV === "development" || environment.VERCEL_ENV === "preview";
}

function summarizePaymentBody(body, quantity) {
  return {
    quantity,
    transaction_amount: body.transaction_amount,
    payment_method_id: body.payment_method_id,
    issuer_id: body.issuer_id,
    installments: body.installments,
    token_present: Boolean(body.token),
    payer_email_present: Boolean(body.payer?.email),
    payer_identification_type: body.payer?.identification?.type,
    payer_identification_present: Boolean(body.payer?.identification?.number),
  };
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

    console.info("Solicitud segura enviada a Mercado Pago:", summarizePaymentBody(body, request.body.quantity));

    const result = await payment.create({
      body,
      requestOptions: { idempotencyKey },
    });

    console.info("Respuesta de pago de Mercado Pago:", {
      http_status: 200,
      payment_id: result.id,
      status: result.status,
      status_detail: result.status_detail,
    });

    return response.status(200).json({
      payment_id: result.id,
      status: result.status,
      status_detail: result.status_detail,
    });
  } catch (error) {
    const diagnostic = extractMercadoPagoError(error);
    console.error("Error seguro devuelto por Mercado Pago:", diagnostic);

    const mercadoPagoStatus = diagnostic.http_status;
    const responseStatus = mercadoPagoStatus >= 400 && mercadoPagoStatus < 500 ? 400 : 502;
    const payload = {
      error: "No pudimos procesar el pago. Intenta nuevamente.",
    };

    if (shouldReturnDiagnostics()) {
      payload.diagnostic = diagnostic;
    }

    return response.status(responseStatus).json(payload);
  }
}
