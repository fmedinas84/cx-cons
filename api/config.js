export default function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método no permitido." });
  }

  const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;

  if (!publicKey) {
    console.error("Falta la variable MERCADOPAGO_PUBLIC_KEY.");
    return response.status(500).json({
      error: "El formulario de pago no está configurado.",
    });
  }

  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json({ mercadoPagoPublicKey: publicKey });
}
