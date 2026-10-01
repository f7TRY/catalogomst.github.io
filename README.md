# ModaShop Tarragona (catálogo + admin)
1. Sube esta carpeta a un repo de GitHub y activa **Pages** (rama main, carpeta raíz).
2. GitHub → Settings → Developer settings → **OAuth App**. Callback: `https://modashop-api.TU-SUBDOMINIO.workers.dev/auth/callback`.
3. Crea un **fine-grained token** solo para este repo con permiso *Contents: Read and write*.
4. En `worker/`: edita `wrangler.toml` y ejecuta `npx wrangler secret put GITHUB_TOKEN`, `OAUTH_CLIENT_SECRET`, `SESSION_SECRET` (cadena aleatoria larga) y `npx wrangler deploy`.
5. Pon la URL del Worker en `js/config.js` (`api`) y tus datos de tienda. Entra en `/admin/`.
Los productos cambian en `data/products.json` y `public/products/`; Pages tarda ~1 min en publicar cada cambio.
