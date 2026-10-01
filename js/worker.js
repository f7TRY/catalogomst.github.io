/* API segura de ModaShop Tarragona (Cloudflare Worker).
   Secretos (solo aquí): GITHUB_TOKEN, OAUTH_CLIENT_SECRET, SESSION_SECRET. */
const enc = new TextEncoder();
const CATS = ['Camisetas', 'Sudaderas', 'Pantalones', 'Chaquetas', 'Vestidos', 'Accesorios'];
const GENDERS = ['Mujer', 'Hombre', 'Unisex'], BADGES = ['', 'NUEVO', 'DESTACADO', 'OFERTA', 'AGOTADO'];

class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = m => { throw new HttpErr(400, m); };
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'producto';
const br = env => env.GITHUB_BRANCH || 'main';

/* --- sesión firmada (HMAC) --- */
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(env, d) {
  const k = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(d)));
}
const mint = async (env, o) => { const p = b64u(enc.encode(JSON.stringify(o))); return p + '.' + await sign(env, p); };
async function unmint(env, t) {
  const [p, s] = String(t || '').split('.');
  if (!p || !s) return null;
  const e = await sign(env, p);
  let d = e.length ^ s.length;
  for (let i = 0; i < e.length; i++) d |= e.charCodeAt(i) ^ (s.charCodeAt(i) || 0);
  if (d) return null;
  try { const o = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))); return o.exp > Date.now() ? o : null; } catch { return null; }
}
const allowed = (env, login, id) => {
  const l = String(env.ALLOWED_GITHUB_USERS || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  return l.includes(String(login).toLowerCase()) || l.includes(String(id));
};

/* --- GitHub Contents API --- */
const gh = (env, path, init = {}) => fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
  ...init, headers: {Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'modashop-worker', 'Content-Type': 'application/json'}
});
async function getJson(env) {
  const r = await gh(env, 'data/products.json?ref=' + br(env));
  if (r.status === 404) return {list: [], sha: undefined};
  if (!r.ok) throw new HttpErr(502, 'GitHub no responde');
  const j = await r.json(), bin = atob(j.content.replace(/\n/g, ''));
  return {list: JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))), sha: j.sha};
}
async function put(env, path, b64, message, sha) {
  const r = await gh(env, path, {method: 'PUT', body: JSON.stringify({message, content: b64, branch: br(env), sha})});
  if (!r.ok) { const e = new HttpErr(502, 'GitHub rechazó el cambio'); e.up = r.status; throw e; }
}
async function mutate(env, fn, message) {
  for (let i = 0; i < 3; i++) {
    const {list, sha} = await getJson(env), next = fn(list);
    let s = ''; enc.encode(JSON.stringify(next, null, 2) + '\n').forEach(c => s += String.fromCharCode(c));
    try { await put(env, 'data/products.json', btoa(s), message, sha); return next; }
    catch (e) { if (e.up !== 409 && e.up !== 422) throw e; }
  }
  throw new HttpErr(409, 'Conflicto al guardar. Inténtalo de nuevo.');
}

/* --- validación --- */
function image(s) {
  if (typeof s !== 'string' || s.length < 40 || s.length > 2.2e6 || !/^[A-Za-z0-9+/]+=*$/.test(s)) bad('Imagen no válida');
  const h = atob(s.slice(0, 16)), hex = [...h].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const ext = h.startsWith('RIFF') && h.slice(8, 12) === 'WEBP' ? 'webp' : hex.startsWith('ffd8ff') ? 'jpg' : hex.startsWith('89504e47') ? 'png' : '';
  if (!ext) bad('Formato de imagen no permitido (JPG, PNG o WEBP)');
  return {b64: s, ext};
}
function parse(b) {
  const name = clean(b.name, 80), price = Math.round(+b.price * 100) / 100, sku = clean(b.sku, 30);
  const list = (a, n) => (Array.isArray(a) ? a : []).map(x => clean(x, 20)).filter(Boolean).slice(0, n);
  if (name.length < 2) bad('Nombre no válido');
  if (!(price >= 0 && price <= 1e5)) bad('Precio no válido');
  if (!CATS.includes(b.category)) bad('Categoría no válida');
  if (!GENDERS.includes(b.gender)) bad('Sección no válida');
  if (!BADGES.includes(b.badge || '')) bad('Etiqueta no válida');
  if (!/^[\w.-]{1,30}$/.test(sku)) bad('SKU no válido');
  if (!Array.isArray(b.images) || b.images.length < 1 || b.images.length > 6) bad('Sube entre 1 y 6 imágenes');
  return {name, price, sku, category: b.category, gender: b.gender, badge: b.badge || '',
    description: String(b.description ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, ' ').trim().slice(0, 2000),
    sizes: list(b.sizes, 12), colors: list(b.colors, 12), imgs: b.images.map(image)};
}

async function addProduct(req, env) {
  const raw = await req.text();
  if (raw.length > 14e6) throw new HttpErr(413, 'Petición demasiado grande');
  let b; try { b = JSON.parse(raw); } catch { bad('JSON no válido'); }
  const {imgs, ...p} = parse(b);
  const dup = l => l.some(x => String(x.sku).toLowerCase() === p.sku.toLowerCase()) && (() => { throw new HttpErr(409, 'Ya existe un producto con ese SKU'); })();
  dup((await getJson(env)).list);
  const id = 'producto-' + crypto.randomUUID().slice(0, 8), slug = slugify(p.name) + '-' + crypto.randomUUID().slice(0, 5), images = [];
  for (const [i, x] of imgs.entries()) {
    const path = `public/products/${slug}-${i + 1}.${x.ext}`;
    await put(env, path, x.b64, 'Añadir imagen ' + slug);
    images.push(path);
  }
  const prod = {id, slug, ...p, images, createdAt: new Date().toISOString()};
  await mutate(env, l => { dup(l); return [prod, ...l]; }, 'Añadir producto ' + slug);
  return prod;
}
async function deleteProduct(env, id) {
  let gone;
  await mutate(env, l => { gone = l.find(x => x.id === id); if (!gone) throw new HttpErr(404, 'Producto no encontrado'); return l.filter(x => x.id !== id); }, 'Eliminar producto ' + id);
  for (const path of gone.images || []) {
    if (!/^public\/products\/[\w.-]+$/.test(path)) continue;
    const r = await gh(env, path + '?ref=' + br(env)); if (!r.ok) continue;
    await gh(env, path, {method: 'DELETE', body: JSON.stringify({message: 'Eliminar imagen de ' + id, sha: (await r.json()).sha, branch: br(env)})});
  }
  return {ok: true};
}

/* --- HTTP --- */
const cors = env => ({'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', Vary: 'Origin'});
const out = (env, o, status = 200) => new Response(JSON.stringify(o), {status, headers: {...cors(env), 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
const go = url => new Response(null, {status: 302, headers: {Location: url, 'Cache-Control': 'no-store'}});

async function handle(req, env) {
  const u = new URL(req.url), p = u.pathname, m = req.method;
  if (m === 'OPTIONS') return new Response(null, {status: 204, headers: cors(env)});
  if (p === '/auth/login') {
    const state = await mint(env, {k: 'st', exp: Date.now() + 6e5});
    return go(`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.OAUTH_CLIENT_ID)}&state=${state}`);
  }
  if (p === '/auth/callback') {
    const st = await unmint(env, u.searchParams.get('state'));
    if (st?.k !== 'st' || !u.searchParams.get('code')) return go(env.ADMIN_URL + '#error=auth');
    const t = await (await fetch('https://github.com/login/oauth/access_token', {method: 'POST', headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: JSON.stringify({client_id: env.OAUTH_CLIENT_ID, client_secret: env.OAUTH_CLIENT_SECRET, code: u.searchParams.get('code')})})).json();
    if (!t.access_token) return go(env.ADMIN_URL + '#error=auth');
    const me = await (await fetch('https://api.github.com/user', {headers: {Authorization: 'Bearer ' + t.access_token, 'User-Agent': 'modashop-worker'}})).json();
    if (!me.login || !allowed(env, me.login, me.id)) return go(env.ADMIN_URL + '#error=denied');
    return go(env.ADMIN_URL + '#token=' + await mint(env, {k: 's', u: me.login, i: me.id, exp: Date.now() + 288e5}));
  }
  /* todo lo demás exige sesión válida y usuario aún autorizado */
  const s = await unmint(env, (req.headers.get('Authorization') || '').replace(/^Bearer /, ''));
  if (!s || s.k !== 's' || !allowed(env, s.u, s.i)) throw new HttpErr(401, 'No autorizado');
  if (p === '/api/products' && m === 'GET') return out(env, (await getJson(env)).list);
  if (p === '/api/products' && m === 'POST') return out(env, await addProduct(req, env), 201);
  const d = p.match(/^\/api\/products\/([\w-]+)$/);
  if (d && m === 'DELETE') return out(env, await deleteProduct(env, d[1]));
  throw new HttpErr(404, 'No encontrado');
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return e instanceof HttpErr ? out(env, {error: e.message}, e.status) : out(env, {error: 'Error interno'}, 500); }
  }
};
