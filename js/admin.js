(() => {
'use strict';
const C = window.MODASHOP, $ = s => document.querySelector(s), ad = $('#ad');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATS = ['Camisetas', 'Sudaderas', 'Pantalones', 'Chaquetas', 'Vestidos', 'Accesorios'];
const opts = a => a.map(x => `<option>${esc(x)}</option>`).join('');
const eur = n => new Intl.NumberFormat('es-ES', {style: 'currency', currency: 'EUR'}).format(n);

let tok = sessionStorage.getItem('ms-t') || '';
const hp = new URLSearchParams(location.hash.slice(1));
if (hp.get('token')) { tok = hp.get('token'); sessionStorage.setItem('ms-t', tok); }
const flag = hp.get('error');
if (location.hash) history.replaceState(null, '', location.pathname);

function toast(t, isBad) {
  const e = $('#toast'); e.textContent = t; e.className = isBad ? 'bad' : ''; e.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { e.hidden = true; }, 5000);
}
function login(msg) {
  tok = ''; sessionStorage.removeItem('ms-t'); $('#out').hidden = true;
  ad.innerHTML = `<h1>PANEL DE ADMINISTRACIÓN</h1><p class="mut" style="margin:16px 0 28px">Acceso solo para el propietario.</p>
<a class="btn p" href="${esc(C.api)}/auth/login">ACCEDER CON GITHUB</a>${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ''}`;
}
async function api(path, opt = {}) {
  let r;
  try { r = await fetch(C.api + path, {...opt, headers: {Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json'}}); }
  catch { throw new Error('Error de conexión. Inténtalo de nuevo.'); }
  if (r.status === 401) { login('Error de autenticación. Inicia sesión de nuevo.'); throw new Error('auth'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}

async function toImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Solo se permiten imágenes JPG, PNG o WEBP.');
  if (file.size > 15e6) throw new Error('Una imagen supera el tamaño máximo.');
  const bmp = await createImageBitmap(file), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let u = c.toDataURL('image/webp', .82);
  if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/jpeg', .85);
  return u.split(',')[1];
}

async function panel() {
  $('#out').hidden = false;
  ad.innerHTML = `<h1>MODASHOP TARRAGONA<br>PANEL DE ADMINISTRACIÓN</h1>
<div class="ah"><h2>PRODUCTOS</h2><button class="btn p" id="new" type="button" aria-expanded="false">+ AÑADIR PRODUCTO</button></div>
<form class="af" id="af" hidden>
<label>Nombre<input name="name" required maxlength="80"></label>
<label>Precio (€)<input name="price" type="number" step="0.01" min="0" required></label>
<label>Categoría<select name="category">${opts(CATS)}</select></label>
<label>Sección<select name="gender">${opts(['Mujer', 'Hombre', 'Unisex'])}</select></label>
<label>SKU / referencia<input name="sku" required maxlength="30" pattern="[A-Za-z0-9_.\\-]+"></label>
<label>Etiqueta (opcional)<select name="badge"><option value="">Sin etiqueta</option>${opts(['NUEVO', 'DESTACADO', 'OFERTA', 'AGOTADO'])}</select></label>
<label>Tallas (separadas por comas)<input name="sizes" placeholder="XS, S, M, L, XL"></label>
<label>Colores (separados por comas)<input name="colors" placeholder="Negro, Blanco"></label>
<label class="w">Descripción<textarea name="description" maxlength="2000"></textarea></label>
<label class="w">Imagen principal<input name="main" type="file" accept="image/jpeg,image/png,image/webp" required></label>
<label class="w">Imágenes adicionales (hasta 5)<input name="extra" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
<button class="btn p" type="submit">AÑADIR PRODUCTO</button></form>
<div class="tbw"><table class="tb"><thead><tr><th></th><th>NOMBRE</th><th>PRECIO</th><th>CATEGORÍA</th><th class="hm">SKU</th><th class="hm">CREADO</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="7">Cargando…</td></tr></tbody></table></div>`;
  $('#new').onclick = () => { const f = $('#af'); f.hidden = !f.hidden; $('#new').setAttribute('aria-expanded', String(!f.hidden)); };
  $('#af').onsubmit = add;
  await list();
}
async function list() {
  try {
    const l = (await api('/api/products')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $('#rows').innerHTML = l.length ? l.map(p => `<tr><td><img src="../${esc(p.images[0])}" alt="" onerror="this.remove()"></td><td>${esc(p.name)}</td><td>${eur(p.price)}</td><td>${esc(p.category)}</td>
<td class="hm">${esc(p.sku)}</td><td class="hm">${new Date(p.createdAt).toLocaleDateString('es-ES')}</td><td><button class="btn" type="button" data-id="${esc(p.id)}">ELIMINAR</button></td></tr>`).join('')
      : '<tr><td colspan="7">Todavía no hay productos.</td></tr>';
  } catch (e) { if (e.message !== 'auth') $('#rows').innerHTML = `<tr><td colspan="7" class="err">${esc(e.message)}</td></tr>`; }
}
async function add(e) {
  e.preventDefault();
  const f = e.target, b = f.querySelector('[type=submit]'), v = f.elements, csv = s => s.split(',').map(x => x.trim()).filter(Boolean);
  b.disabled = true;
  try {
    const files = [v.main.files[0], ...[...v.extra.files].slice(0, 5)];
    let images;
    try { images = await Promise.all(files.map(toImage)); }
    catch (er) { toast(er.message || 'No se ha podido subir la imagen. Inténtalo de nuevo.', true); return; }
    await api('/api/products', {method: 'POST', body: JSON.stringify({
      name: v.name.value, price: v.price.value, category: v.category.value, gender: v.gender.value, sku: v.sku.value,
      badge: v.badge.value, description: v.description.value, sizes: csv(v.sizes.value), colors: csv(v.colors.value), images})});
    f.reset(); f.hidden = true; $('#new').setAttribute('aria-expanded', 'false');
    toast('Producto añadido correctamente.'); await list();
  } catch (er) { if (er.message !== 'auth') toast(`No se ha podido añadir el producto. ${er.message || 'Inténtalo de nuevo.'}`, true); }
  finally { b.disabled = false; }
}

let target = '';
document.addEventListener('click', e => { const id = e.target.dataset?.id; if (id) { target = id; $('#dg').showModal(); } });
$('#no').onclick = () => $('#dg').close();
$('#yes').onclick = async () => {
  $('#dg').close();
  try { await api('/api/products/' + encodeURIComponent(target), {method: 'DELETE'}); toast('Producto eliminado correctamente.'); await list(); }
  catch (er) { if (er.message !== 'auth') toast(`No se ha podido eliminar el producto. ${er.message || 'Inténtalo de nuevo.'}`, true); }
};
$('#out').onclick = () => login('');

if (flag === 'denied') login('ACCESS DENIED');
else if (flag) login('Error de autenticación. Inténtalo de nuevo.');
else if (!tok) login('');
else panel();
})();
