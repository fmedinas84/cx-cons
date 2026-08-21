# CX Cons — Sticker Quest

Tienda ficticia para aprender el flujo de un pago con Mercado Pago Checkout Pro.

## Configuración local

1. Instala Node.js 18 o superior.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env.local`.
4. Pega tu Access Token de prueba en `.env.local`:

   ```env
   MERCADOPAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN_DE_PRUEBA
   ```

5. Ejecuta `npm run dev`.
6. Abre la URL local que muestre Vercel y prueba el botón **Pagar**.

`.env.local` está ignorado por Git y nunca debe subirse al repositorio. En un despliegue de Vercel, agrega `MERCADOPAGO_ACCESS_TOKEN` en **Settings → Environment Variables**.

## Pruebas

Ejecuta `npm test` para comprobar la validación de cantidades y que el precio unitario se define en el backend.
