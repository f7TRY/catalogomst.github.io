(() => {
'use strict';
const C = window.MODASHOP, $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const eur = n => new Intl.NumberFormat('es-ES', {style:'currency', currency:'EUR'}).format(n);
const dec = s => { try { return decodeURIComponent(s); } catch { return s; } };
const wa = t => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(t)}`;
document.documentElement.style.setProperty('--red', C.accent);

/* ---------- Catálogo: data/products.json (lo escribe el panel /admin mediante la API segura) ---------- */
let cache = null, at = 0;
async function load() {
  if (cache && Date.now() - at < 3e4) return cache;
  const r = await fetch('data/products.json', {cache: 'no-cache'});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error('JSON');
  cache = j.map(toProduct); at = Date.now();
  return cache;
}
const toProduct = n => ({
  h: n.slug, t: n.name, d: n.description || '', cat: n.category || '', badge: n.badge || '',
  tags: [...(n.gender === 'Unisex' ? ['mujer', 'hombre'] : [norm(n.gender)]), norm(n.badge)].filter(Boolean),
  date: n.createdAt, price: +n.price, old: 0, ok: n.badge !== 'AGOTADO',
  img: (n.images || []).map(u => ({url: u, altText: ''})), skus: n.sku ? [n.sku] : [],
  sizes: n.sizes || [], colors: n.colors || [], v: [], comp: '', care: ''
});

/* ---------- helpers de producto ---------- */
const isNew = p => p.tags.includes('nuevo') || Date.now() - Date.parse(p.date) < 2592e6;
const label = p => !p.ok ? ['AGOTADO','k'] : p.badge === 'OFERTA' ? ['OFERTA',''] : isNew(p) ? ['NUEVO',''] : p.tags.includes('destacado') ? ['DESTACADO','k'] : null;
const tagHtml = p => { const l = label(p); return l ? `<span class="tag ${l[1]}">${l[0]}</span>` : ''; };
const img = (i, alt, w = 600) => i ? `<img src="${esc(i.url)}" alt="${esc(i.altText || alt)}" loading="lazy" onerror="this.remove()">` : '';
const price = p => p.old ? `<s>${eur(p.old)}</s><b>${eur(p.price)}</b>` : eur(p.price);
const card = p => `<a class="card" href="#/producto/${esc(p.h)}"><div class="ph">${img(p.img[0], p.t)}${tagHtml(p)}</div>
<h3>${esc(p.t)}</h3><p class="pr">${price(p)}</p>
<p class="mt">${esc(p.cat)}${p.sizes.length ? '<br>Tallas: ' + esc(p.sizes.join(' ')) : ''}${p.colors.length ? '<br>Colores: ' + esc(p.colors.join(', ')) : ''}</p>
<span class="lk">VER PRODUCTO</span></a>`;
const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'es'));

const CATS = [
  ['Mujer','mujer',p => p.tags.includes('mujer')],
  ['Hombre','hombre',p => p.tags.includes('hombre')],
  ['Novedades','novedades',isNew],
  ...['Camisetas','Sudaderas','Pantalones','Chaquetas','Vestidos','Accesorios'].map(n => [n, 'categoria/' + norm(n), p => norm(p.cat) === norm(n)])
];
const VIEWS = {
  coleccion: ['Colección', () => true],
  ofertas: ['Ofertas', p => p.badge === 'OFERTA'],
  mujer: [CATS[0][0], CATS[0][2]], hombre: [CATS[1][0], CATS[1][2]], novedades: [CATS[2][0], CATS[2][2]]
};

/* ---------- SEO ---------- */
function meta(title, desc, path) {
  document.title = title;
  const set = (s, v) => { const e = $(s); if (e) e.setAttribute('content', v); };
  set('meta[name=description]', desc); set('meta[property="og:title"]', title); set('meta[property="og:description"]', desc);
  $('#canon').href = C.siteUrl.replace(/\/$/, '') + '/' + (path ? '#/' + path : '');
}
function ld(id, data) {
  let s = document.getElementById(id);
  if (!data) { if (s) s.remove(); return; }
  if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = id; document.head.appendChild(s); }
  s.textContent = JSON.stringify(data);
}
ld('ld-store', {
  '@context':'https://schema.org', '@type':'ClothingStore', name:C.name, url:C.siteUrl,
  telephone:C.phone, email:C.email, address:{'@type':'PostalAddress', streetAddress:C.address, addressCountry:'ES'},
  sameAs:[C.instagram]
});

/* ---------- vistas ---------- */
const msg = (t, b, href) => { app.innerHTML = `<section class="wrap sec msg"><h1>${esc(t)}</h1><a class="btn p" href="${href}">${b}</a></section>`; };

function home(ps) {
  const nw = ps.filter(isNew).slice(0, 8), list = nw.length ? nw : ps.slice(0, 8);
  const catImg = c => { const p = ps.find(c[2]); return p ? img(p.img[0], c[0], 600) : ''; };
  app.innerHTML = `
<section class="hero wrap"><div class="ht"><h1>${C.heroTitle.map(esc).join('<br>')}</h1><p>${esc(C.heroText)}</p>
<div class="bt"><a class="btn p" href="#/coleccion">VER COLECCIÓN</a><a class="btn" href="#/novedades">NOVEDADES</a></div></div>
<div class="hi" role="img" aria-label="Moda actual en ModaShop Tarragona"${C.heroImage ? ` style="background-image:url('${esc(C.heroImage)}')"` : ''}></div></section>
<section class="wrap sec"><div class="more"><h2>NUEVA COLECCIÓN</h2><a href="#/novedades">VER TODO</a></div>
<div class="gr">${list.length ? list.map(card).join('') : '<p class="empty">Próximamente, nuevos productos.</p>'}</div></section>
<section class="wrap sec"><h2>CATEGORÍAS</h2><div class="cats">${CATS.map(c => `<a class="cat" href="#/${c[1]}">${catImg(c)}<span>${c[0].toUpperCase()}</span></a>`).join('')}</div></section>
<section class="ig"><div class="wrap sec"><h2>${esc(C.instagramHandle)}</h2><p class="mut">Síguenos para ver novedades y looks de la tienda.</p>
<a class="btn p" style="margin-top:24px" href="${esc(C.instagram)}" target="_blank" rel="noopener">SEGUIR EN INSTAGRAM</a></div></section>
<section class="wrap sec"><h2>VISÍTANOS</h2><p class="mut">${esc(C.address)}</p><a class="btn" style="margin-top:24px" href="#/contacto">VISITAR TIENDA</a></section>`;
}

function catalog(title, base) {
  app.innerHTML = `<section class="wrap sec"><h1>${esc(title)}</h1>
<form class="fl" id="fl" aria-label="Filtros">
<label>Categoría<select name="cat"><option value="">Todas</option>${uniq(base.map(p => p.cat).filter(Boolean)).map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
<label>Precio<select name="pr"><option value="">Todos</option><option value="0-25">Hasta 25 €</option><option value="25-50">25 – 50 €</option><option value="50-100">50 – 100 €</option><option value="100-99999">Más de 100 €</option></select></label>
<label>Talla<select name="size"><option value="">Todas</option>${uniq(base.flatMap(p => p.sizes)).map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
<label>Color<select name="color"><option value="">Todos</option>${uniq(base.flatMap(p => p.colors)).map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
<label class="ck"><input type="checkbox" name="nw"> Novedades</label>
<label class="ck"><input type="checkbox" name="of"> Ofertas</label>
<label>Ordenar por<select name="sort"><option value="rel">Relevancia</option><option value="new">Más recientes</option><option value="asc">Precio menor</option><option value="desc">Precio mayor</option></select></label>
<span class="cnt" id="cnt" aria-live="polite"></span></form><div class="gr" id="gr"></div></section>`;
  const f = $('#fl').elements;
  const draw = () => {
    const [lo, hi] = f.pr.value ? f.pr.value.split('-').map(Number) : [0, Infinity];
    let r = base.filter(p => (!f.cat.value || p.cat === f.cat.value) && p.price >= lo && p.price <= hi
      && (!f.size.value || p.sizes.includes(f.size.value)) && (!f.color.value || p.colors.includes(f.color.value))
      && (!f.nw.checked || isNew(p)) && (!f.of.checked || p.badge === 'OFERTA'));
    const s = f.sort.value;
    r = r.slice().sort((a, b) => s === 'asc' ? a.price - b.price : s === 'desc' ? b.price - a.price
      : s === 'new' ? Date.parse(b.date) - Date.parse(a.date)
      : (b.tags.includes('destacado') - a.tags.includes('destacado')) || (b.ok - a.ok) || Date.parse(b.date) - Date.parse(a.date));
    $('#gr').innerHTML = r.length ? r.map(card).join('') : '<p class="empty">No hemos encontrado productos que coincidan con tu búsqueda.</p>';
    $('#cnt').textContent = r.length + (r.length === 1 ? ' producto' : ' productos');
  };
  $('#fl').addEventListener('input', draw);
  $('#fl').addEventListener('submit', e => e.preventDefault());
  draw();
}

function product(ps, h) {
  const p = ps.find(x => x.h === h);
  if (!p) { meta('Producto no disponible | ModaShop Tarragona', 'Este producto ya no está disponible.'); ld('ld-p'); return msg('Este producto ya no está disponible.', 'VER COLECCIÓN', '#/coleccion'); }
  const off = () => !p.ok;
  const chips = (a, list) => a.map(x => `<span class="chip${off(list, x) ? ' off' : ''}">${esc(x)}</span>`).join('');
  const sku = p.skus[0] || '';
  const ask = `Hola, estoy interesado/a en el producto ${p.t} de ModaShop Tarragona.`;
  const mail = `mailto:${esc(C.email)}?subject=${encodeURIComponent('Consulta: ' + p.t)}&body=${encodeURIComponent(ask)}`;
  const cat = CATS.find(c => norm(c[0]) === norm(p.cat));
  app.innerHTML = `<section class="wrap sec pd"><div class="gal"><div class="ph" id="mn">${img(p.img[0], p.t, 1000)}${tagHtml(p)}</div>
${p.img.length > 1 ? `<div class="th">${p.img.map((i, k) => `<button type="button" data-k="${k}" aria-label="Ver foto ${k + 1}"${k ? '' : ' class="on"'}>${img(i, p.t, 160)}</button>`).join('')}</div>` : ''}</div>
<div class="inf"><p class="crumb"><a href="#/">INICIO</a> / ${cat ? `<a href="#/${cat[1]}">${esc(p.cat.toUpperCase())}</a>` : '<a href="#/coleccion">COLECCIÓN</a>'}</p>
<h1>${esc(p.t)}</h1><p class="pr">${price(p)}</p>
${p.d ? `<h3>DESCRIPCIÓN</h3>${p.d.split(/\n+/).map(x => `<p>${esc(x)}</p>`).join('')}` : ''}
${p.sizes.length ? `<h3>TALLAS</h3><div class="chips">${chips(p.sizes, ['talla','size'])}</div>` : ''}
${p.colors.length ? `<h3>COLORES</h3><div class="chips">${chips(p.colors, ['color','colour'])}</div>` : ''}
${p.comp ? `<h3>COMPOSICIÓN</h3><p>${esc(p.comp)}</p>` : ''}${p.care ? `<h3>CUIDADOS</h3><p>${esc(p.care)}</p>` : ''}
<p class="ok">${p.ok ? 'Disponible en ModaShop Tarragona' : 'Producto agotado'}</p>${sku ? `<p class="sku">Referencia: ${esc(sku)}</p>` : ''}
<div class="bt"><a class="btn p" href="${mail}">CONSULTAR PRODUCTO</a><a class="btn" href="${wa(ask)}" target="_blank" rel="noopener">CONSULTAR POR WHATSAPP</a></div></div></section>`;
  document.querySelectorAll('.th button').forEach(b => b.onclick = () => {
    $('#mn').innerHTML = img(p.img[+b.dataset.k], p.t, 1000) + tagHtml(p);
    document.querySelectorAll('.th button').forEach(x => x.classList.toggle('on', x === b));
  });
  meta(`${p.t} | ModaShop Tarragona`, (p.d || `${p.t} en ModaShop Tarragona.`).slice(0, 155), 'producto/' + p.h);
  ld('ld-p', {
    '@context':'https://schema.org', '@type':'Product', name:p.t, description:p.d, sku:sku || undefined,
    image:p.img.map(i => new URL(i.url, location.href).href), category:p.cat,
    offers:{'@type':'Offer', price:p.price.toFixed(2), priceCurrency:'EUR', url:C.siteUrl + '/#/producto/' + p.h,
      availability:'https://schema.org/' + (p.ok ? 'InStock' : 'OutOfStock')}
  });
}

function contact() {
  const ok = consent().maps && C.mapEmbed;
  app.innerHTML = `<section class="wrap sec"><h1>VISÍTANOS</h1><div class="ct"><dl><dt>MODASHOP TARRAGONA</dt><dd>${esc(C.address)}</dd>
<dt>TELÉFONO</dt><dd><a href="tel:${esc(C.phone.replace(/\s/g, ''))}">${esc(C.phone)}</a></dd>
<dt>WHATSAPP</dt><dd><a href="${wa('Hola, quería información sobre ModaShop Tarragona.')}" target="_blank" rel="noopener">CONSULTAR POR WHATSAPP</a></dd>
<dt>INSTAGRAM</dt><dd><a href="${esc(C.instagram)}" target="_blank" rel="noopener">${esc(C.instagramHandle)}</a></dd>
<dt>EMAIL</dt><dd><a href="mailto:${esc(C.email)}">${esc(C.email)}</a></dd>
<dt>HORARIO</dt><dd>${C.hours.map(esc).join('<br>')}</dd></dl>
<div class="map" id="map">${C.mapEmbed ? (ok ? mapFrame() : '<button class="btn" type="button" id="lm">CARGAR MAPA DE GOOGLE</button>') : '<p class="mut">Mapa no configurado.</p>'}</div></div></section>`;
  const b = $('#lm'); if (b) b.onclick = () => { $('#map').innerHTML = mapFrame(); };
  meta('Contacto | ModaShop Tarragona', 'Visita ModaShop Tarragona: dirección, horario y contacto.', 'contacto');
}
const mapFrame = () => `<iframe src="${esc(C.mapEmbed)}" title="Mapa de ModaShop Tarragona" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;

const LEGAL = {
  privacidad: ['Política de privacidad', ['Responsable', `${C.titular}. Contacto: ${C.email}.`], ['Datos que tratamos', 'Esta web es un catálogo y no recoge datos personales por sí misma. Si nos escribes por email, WhatsApp o Instagram, usaremos tus datos solo para responder a tu consulta.'], ['Tus derechos', `Puedes ejercer tus derechos de acceso, rectificación, supresión y oposición escribiendo a ${C.email}.`]],
  cookies: ['Política de cookies', ['Cookies técnicas', 'Guardamos en tu navegador únicamente tu elección sobre cookies.'], ['Terceros', 'El mapa de Google Maps de la página de contacto solo se carga si lo aceptas.'], ['Cambiar tu elección', 'Borra los datos del sitio en tu navegador para que volvamos a preguntarte.']],
  'aviso-legal': ['Aviso legal', ['Titular', C.titular], ['Objeto', 'Esta web muestra el catálogo de ModaShop Tarragona con carácter informativo. No permite la compra online; los precios y la disponibilidad pueden variar y se confirman en tienda.'], ['Propiedad intelectual', 'Los contenidos de esta web son propiedad de su titular o se usan con autorización.']]
};
function legal(k) {
  const [t, ...s] = LEGAL[k];
  app.innerHTML = `<section class="wrap sec legal"><h1>${esc(t)}</h1>${s.map(x => `<h2>${esc(x[0])}</h2><p>${esc(x[1])}</p>`).join('')}</section>`;
  meta(`${t} | ModaShop Tarragona`, t, k);
}

/* ---------- router ---------- */
let tk = 0;
async function route() {
  const my = ++tk, raw = location.hash.replace(/^#\/?/, ''), [a, ...r] = raw.split('/'), b = dec(r.join('/'));
  document.querySelectorAll('#nav a').forEach(x => (x.getAttribute('href') === '#/' + a) ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current'));
  $('#nav').classList.remove('open'); $('#mbtn').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
  if (a !== 'producto') ld('ld-p');
  if (a === 'contacto') return contact();
  if (LEGAL[a]) return legal(a);
  const known = a === '' || a === 'buscar' || VIEWS[a] || (a === 'categoria' && CATS.some(c => c[1] === raw)) || (a === 'producto' && b);
  if (!known) { meta('Página no encontrada | ModaShop Tarragona', 'Esta página no existe.'); return msg('Esta página no existe.', 'VOLVER AL INICIO', '#/'); }
  let ps;
  try { ps = await load(); } catch (e) {
    console.warn('Catálogo:', e.message);
    if (my !== tk) return;
    app.innerHTML = '<section class="wrap sec msg"><h1>No podemos cargar el catálogo en este momento. Inténtalo de nuevo.</h1><button class="btn p" type="button" id="rt">REINTENTAR</button></section>';
    $('#rt').onclick = () => { cache = null; route(); };
    return;
  }
  if (my !== tk) return;
  if (a === '') { meta('ModaShop Tarragona | Moda Actual', 'ModaShop Tarragona - descubre nuestra colección de moda actual para mujer y hombre.', ''); return home(ps); }
  if (a === 'producto') return product(ps, b);
  if (a === 'buscar') {
    const terms = norm(b).split(/\s+/).filter(Boolean);
    const hit = ps.filter(p => { const hay = norm([p.t, p.cat, p.skus.join(' '), p.tags.join(' ')].join(' ')); return terms.every(t => hay.includes(t)); });
    meta(`Resultados para "${b}" | ModaShop Tarragona`, 'Resultados de búsqueda.', raw);
    return catalog(`Resultados para “${b}”`, hit);
  }
  const v = VIEWS[a] || (() => { const c = CATS.find(c => c[1] === raw); return [c[0], c[2]]; })();
  meta(`${v[0]} | ModaShop Tarragona`, `${v[0]} en ModaShop Tarragona. Moda actual para mujer y hombre.`, raw);
  catalog(v[0], ps.filter(v[1]));
}

/* ---------- header, footer, cookies ---------- */
const sform = $('#sform'), q = $('#q'), sbtn = $('#sbtn'), mbtn = $('#mbtn');
sbtn.onclick = () => { sform.hidden = !sform.hidden; sbtn.setAttribute('aria-expanded', String(!sform.hidden)); if (!sform.hidden) q.focus(); };
mbtn.onclick = () => { const o = $('#nav').classList.toggle('open'); mbtn.setAttribute('aria-expanded', String(o)); };
q.oninput = () => { const v = q.value.trim(); history.replaceState(null, '', v ? '#/buscar/' + encodeURIComponent(v) : '#/'); route(); };
sform.onsubmit = e => e.preventDefault();
document.addEventListener('keydown', e => { if (e.key === 'Escape') { sform.hidden = true; sbtn.setAttribute('aria-expanded', 'false'); $('#nav').classList.remove('open'); } });

$('#ft').innerHTML = `<div class="wrap"><div class="fg"><div><b>MODASHOP TARRAGONA</b><p class="mut">Moda actual. Estilo propio.</p></div>
<div><h4>TIENDA</h4><a href="#/">Inicio</a><a href="#/mujer">Mujer</a><a href="#/hombre">Hombre</a><a href="#/novedades">Novedades</a><a href="#/contacto">Contacto</a></div>
<div><h4>LEGAL</h4><a href="#/aviso-legal">Aviso legal</a><a href="#/privacidad">Privacidad</a><a href="#/cookies">Cookies</a></div>
<div><h4>REDES</h4><a href="${esc(C.instagram)}" target="_blank" rel="noopener">Instagram</a><a href="${wa('Hola, quería información sobre ModaShop Tarragona.')}" target="_blank" rel="noopener">WhatsApp</a></div></div>
<p class="cp">© 2026 ModaShop Tarragona</p></div>`;

function consent() { try { return JSON.parse(localStorage.getItem('ms-ck')) || {}; } catch { return {}; } }
const ck = $('#ck');
ck.innerHTML = `<p>Solo usamos cookies técnicas. El mapa de Google (terceros) necesita tu consentimiento. <a href="#/cookies"><u>Más información</u></a></p>
<div class="bt"><button class="btn p" data-a="y" type="button">ACEPTAR</button><button class="btn" data-a="n" type="button">RECHAZAR</button><button class="btn" data-a="c" type="button">CONFIGURAR</button></div>
<label id="cfg" hidden><input type="checkbox" id="cm"> Permitir Google Maps <button class="btn" data-a="s" type="button">GUARDAR</button></label>`;
ck.onclick = e => {
  const a = e.target.dataset.a; if (!a) return;
  if (a === 'c') { $('#cfg').hidden = false; return; }
  try { localStorage.setItem('ms-ck', JSON.stringify({done: true, maps: a === 'y' || (a === 's' && $('#cm').checked)})); } catch {}
  ck.hidden = true; if (location.hash.startsWith('#/contacto')) route();
};
if (!consent().done) ck.hidden = false;

addEventListener('hashchange', route);
route();
})();
