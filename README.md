# CX Cons — Sticker Quest

Tienda ficticia para aprender el flujo de un pago con Mercado Pago Checkout Bricks.

El formulario de pago se muestra dentro de la tienda mediante el Payment Brick. El navegador utiliza la Public Key para tokenizar la tarjeta y el backend usa el Access Token para crear el pago. El endpoint anterior de Checkout Pro se conserva en `api/checkout.js` únicamente como referencia y no forma parte del flujo activo.

## Configuración local

1. Instala Node.js 18 o superior.
2. Ejecuta `npm install`.
3. Copia `.env.example` como `.env.local`.
4. Agrega tus credenciales de prueba:

   ```env
   MERCADOPAGO_ACCESS_TOKEN=
   MERCADOPAGO_PUBLIC_KEY=
   ```

5. Ejecuta `npm run dev`.
6. Abre la URL local que muestre Vercel.

`.env.local` y los demás archivos `.env.*` están ignorados por Git. En Vercel debes crear ambas variables en **Settings → Environment Variables**. El Access Token es exclusivamente backend; la Public Key puede entregarse al navegador y el endpoint `GET /api/config` devuelve solamente esa clave pública.

## Probar Checkout Bricks

1. Usa las credenciales de prueba de la aplicación correspondiente a Chile.
2. Selecciona entre 1 y 4 productos.
3. Completa el Payment Brick con una tarjeta de prueba de Mercado Pago.
4. Para simular aprobación, utiliza `APRO` como nombre del titular y documento tipo `Otro` con `123456789`.
5. Usa un correo distinto al correo de la cuenta vendedora. En Checkout Bricks no uses el correo `TESTUSER...` de Checkout Pro.
6. Al enviar, la página mostrará `payment_id`, `status` y `status_detail` sin redirigirte fuera de la tienda.

Tarjetas vigentes y escenarios de prueba: https://www.mercadopago.cl/developers/es/docs/checkout-bricks/integration-test/test-cards

## Seguridad e idempotencia

- El backend acepta la cantidad, pero calcula nuevamente el monto usando $100 CLP por unidad.
- Los datos completos de tarjeta no pasan por el backend; MercadoPago.js crea un token temporal.
- Cada intento usa `X-Idempotency-Key`. Si una solicitud queda con resultado incierto por un error de red o servidor, el siguiente intento reutiliza la misma clave para evitar un cobro duplicado.
- No hay webhook, Supabase ni persistencia de órdenes en esta etapa.

## Pruebas automatizadas

Ejecuta `npm test` para comprobar cantidades, cálculo del monto, validación de idempotencia y separación entre Public Key y Access Token.
