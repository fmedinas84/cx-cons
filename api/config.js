export function classifyCredentialMode(value) {
  if (typeof value !== "string") return "missing";
  if (value.startsWith("TEST-")) return "test";
  if (value.startsWith("APP_USR-")) return "production";
  return "unknown";
}

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

  const publicKeyMode = classifyCredentialMode(publicKey);
  const accessTokenMode = classifyCredentialMode(process.env.MERCADOPAGO_ACCESS_TOKEN);
  console.info("Modos seguros de credenciales de Mercado Pago:", {
    public_key_mode: publicKeyMode,
    access_token_mode: accessTokenMode,
    modes_match: publicKeyMode === accessTokenMode,
  });

  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json({
    mercadoPagoPublicKey: publicKey,
    credential_mode: publicKeyMode,
  });
}
