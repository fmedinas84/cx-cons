import { MercadoPagoConfig, Preference } from "mercadopago";

const PRODUCT_TITLE = "Stickers de personajes de videojuegos";
const UNIT_PRICE_CLP = 100;

export function validateQuantity(value) {
  return Number.isInteger(value) && value >= 1 && value <= 4;
}

export function buildPreferenceBody(quantity) {
  return {
    items: [
      {
        id: "video-game-stickers",
        title: PRODUCT_TITLE,
        currency_id: "CLP",
        quantity,
        unit_price: UNIT_PRICE_CLP,
      },
    ],
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  const quantity = request.body?.quantity;

  if (!validateQuantity(quantity)) {
    return response.status(400).json({
      error: "La cantidad debe ser un número entero entre 1 y 4.",
    });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    console.error("Falta la variable MERCADOPAGO_ACCESS_TOKEN.");
    return response.status(500).json({
      error: "El pago no está configurado. Intenta nuevamente más tarde.",
    });
  }

  try {
    const client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 5000 },
    });
    const preference = new Preference(client);
    const result = await preference.create({
      body: buildPreferenceBody(quantity),
    });

    if (!result.init_point) {
      throw new Error("Mercado Pago no devolvió init_point.");
    }

    return response.status(200).json({ init_point: result.init_point });
  } catch (error) {
    console.error("Error al crear la preferencia de Mercado Pago:", error);
    return response.status(502).json({
      error: "No pudimos iniciar el pago. Intenta nuevamente.",
    });
  }
}
