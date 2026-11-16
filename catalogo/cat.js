/* SEGES – Catálogo e inventario v1 · Mismo servidor, usuarios y PIN del CRM. */
const CAT = (function () {
  const st = { token: null, usuario: null, cfg: null, cat: null, vistas: [], actual: null, params: {}, productos: null, cargadoEn: 0 };
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Solo direcciones https para imágenes y enlaces. */
  function url(u) { u = String(u || ''); return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ''; }

  function guardarToken(t) {
    st.token = t;
    try { t ? sessionStorage.setItem('crmToken', t) : sessionStorage.removeItem('crmToken'); } catch (e) {}
  }
  function leerToken() { try { return sessionStorage.getItem('crmToken'); } catch (e) { return null; } }

  const API_URL = 'https://script.google.com/macros/s/AKfycbwcXMGlNCYP9ahk_L3_0aU8GSVcy8Lpe43Kd5cAkALCsUrhYs1sp3LG01v-LdzIn_sQJQ/exec';
  async function llamarDirecto(fn) {
    const args = Array.prototype.slice.call(arguments, 1);
    let r, j;
    try {
      r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, args: args }), credentials: 'omit', redirect: 'follow', cache: 'no-store' });
    } catch (e) { throw new Error('Sin conexión con el servidor. Revisa tu internet.'); }
    try { j = await r.json(); } catch (e) { throw new Error('El servidor respondió algo inesperado.'); }
    if (!j || !j.ok) throw new Error((j && j.error) || 'Error desconocido.');
    return j.data;
  }
  async function llamar(fn) {
    const args = Array.prototype.slice.call(arguments, 1);
    try {
      return await llamarDirecto.apply(null, [fn, st.token].concat(args));
    } catch (e) {
      const m = (e && e.message) || String(e);
      if (m.indexOf('SESION_EXPIRADA') >= 0) { guardarToken(null); mostrarLogin(); throw new Error('Tu sesión expiró. Vuelve a entrar.'); }
      if (m.indexOf('Operación no permitida') >= 0) throw new Error('El servidor todavía no tiene el módulo de catálogo publicado.');
      throw new Error(m.replace(/^Error:\s*/, ''));
    }
  }

  /* ───────── avisos y ventanas ───────── */
  let tAviso;
  function aviso(msg, tipo) {
    const el = $('#aviso');
    el.textContent = msg;
    el.className = 'aviso ' + (tipo || '');
    clearTimeout(tAviso);
    tAviso = setTimeout(function () { el.classList.add('oculto'); }, tipo === 'mal' ? 7000 : 4000);
  }
  function cargando(txt, chico) {
    return '<div class="cargando' + (chico ? ' chico' : '') + '"><div class="estrellas" aria-hidden="true"><i>★</i><i>★</i><i>★</i></div>' +
      (txt ? '<span>' + esc(txt) + '</span>' : '') + '</div>';
  }
  function modal(html, op) {
    op = op || {};
    st.alCancelarModal = op.alCancelar || null;
    $('#modalCaja').className = 'modal-caja' + (op.ancha ? ' ancha' : '');
    $('#modalCuerpo').innerHTML = html;
    $('#modal').classList.remove('oculto');
    return $('#modalCuerpo');
  }
  function cerrarModal() { st.alCancelarModal = null; $('#modal').classList.add('oculto'); $('#modalCuerpo').innerHTML = ''; }
  function modalAbierto() { return !$('#modal').classList.contains('oculto'); }

  let resolverConfirma = null;
  function confirmar(texto, si, op) {
    op = op || {};
    return new Promise(function (ok) {
      if (resolverConfirma) resolverConfirma(false);
      resolverConfirma = ok;
      const c = $('#confirmaCuerpo');
      c.innerHTML = (op.titulo ? '<h2>' + esc(op.titulo) + '</h2>' : '') + '<p>' + esc(texto) + '</p>' +
        (op.casilla ? '<label class="check" style="margin-top:14px"><input type="checkbox" id="cfCasilla"> ' + esc(op.casilla) + '</label>' : '') +
        '<div class="acciones"><button class="btn ' + (op.peligro === false ? '' : 'peligro lleno') + '" id="cfSi" type="button">' + esc(si || 'Sí') + '</button>' +
        '<button class="btn sec" id="cfNo" type="button">' + esc(op.no || 'No') + '</button></div>';
      $('#confirma').classList.remove('oculto');
      const b = $('#cfSi', c);
      if (op.casilla) { b.disabled = true; $('#cfCasilla', c).onchange = function () { b.disabled = !this.checked; }; }
      const fin = function (v) { $('#confirma').classList.add('oculto'); c.innerHTML = ''; resolverConfirma = null; ok(v); };
      b.onclick = function () { fin(true); };
      $('#cfNo', c).onclick = function () { fin(false); };
      (op.casilla ? $('#cfNo', c) : b).focus();
    });
  }
  function cancelarConfirma() { if (resolverConfirma) { $('#confirma').classList.add('oculto'); $('#confirmaCuerpo').innerHTML = ''; const r = resolverConfirma; resolverConfirma = null; r(false); } }
  function firmaForm(form) {
    const o = [];
    $$('input, select, textarea', form).forEach(function (el) { if (el.type !== 'file') o.push(el.name + '=' + (el.type === 'checkbox' ? el.checked : el.value)); });
    return o.join('&');
  }
  async function descartar(form, inicial) {
    if (form && inicial !== undefined && firmaForm(form) !== inicial) {
      if (!(await confirmar('¿Cancelar? Lo que escribiste no se guardará.', 'Sí, cancelar', { no: 'Seguir editando' }))) return false;
      if (!(await confirmar('Confírmalo otra vez: se descartan los cambios.', 'Descartar', { no: 'Volver', titulo: '¿Seguro?' }))) return false;
    }
    cerrarModal();
    return true;
  }
  async function confirmarBorrado(que) {
    if (!(await confirmar('¿Eliminar ' + que + '?', 'Continuar', { titulo: 'Eliminar', no: 'Cancelar' }))) return false;
    return confirmar('Esta acción no se puede deshacer.', 'Eliminar definitivamente',
      { titulo: 'Segunda confirmación', casilla: 'Entiendo que ' + que + ' se borra para siempre.', no: 'Cancelar' });
  }

  /* ───────── navegación ───────── */
  function registrarVista(id, def) { st.vistas.push(Object.assign({ id: id, orden: 50 }, def)); }
  function hayVista(id) { return visibles().some(function (v) { return v.id === id; }); }
  function esAdmin() { return !!(st.usuario && st.usuario.rol === 'admin'); }
  function esJefe() { return !!(st.usuario && (st.usuario.rol === 'admin' || st.usuario.rol === 'supervisor')); }
  function visibles() {
    return st.vistas.filter(function (v) { return (!v.soloJefe || esJefe()) && (!v.soloAdmin || esAdmin()); })
      .sort(function (a, b) { return a.orden - b.orden; });
  }
  function pintarNav() {
    const nav = $('#nav');
    nav.innerHTML = visibles().map(function (v) {
      return '<button type="button" data-vista="' + esc(v.id) + '" title="' + esc(v.titulo) + '"><span class="ico">' + esc(v.icono) +
        '</span><span>' + esc(v.titulo) + '</span></button>';
    }).join('') + '<div class="pie"><a href="../">← Ir al CRM</a><br>SEGES Catálogo · v1</div>';
    $$('button', nav).forEach(function (b) { b.onclick = function () { ir(b.dataset.vista); }; });
  }
  function leerHash() {
    const h = decodeURIComponent((location.hash || '').slice(1));
    if (!h) return null;
    const i = h.indexOf('/');
    return { id: i >= 0 ? h.slice(0, i) : h, params: i >= 0 ? { id: h.slice(i + 1) } : {} };
  }
  let turno = 0;
  async function ir(id, params, sinHistorial) {
    const lista = visibles();
    const v = lista.find(function (x) { return x.id === id; }) || lista[0];
    params = params || {};
    st.actual = v.id; st.params = params;
    if (!sinHistorial) {
      const h = '#' + v.id + (params.id ? '/' + encodeURIComponent(params.id) : '');
      if (location.hash !== h) history.pushState(null, '', h);
    }
    $$('#nav button').forEach(function (b) { b.classList.toggle('activo', b.dataset.vista === v.id); });
    const cont = $('#vista');
    const mio = ++turno;
    cont.innerHTML = cargando('Cargando…');
    window.scrollTo(0, 0);
    try { await v.render(cont, params, function () { return mio === turno; }); }
    catch (e) { if (mio === turno) cont.innerHTML = '<div class="panel"><p class="error">' + esc(e.message) + '</p></div>'; }
  }
  function recargar() { return ir(st.actual, st.params, true); }

  function mostrarLogin() {
    document.body.classList.remove('dentro');
    $('#login').classList.remove('oculto');
  }
  async function entrarListo(r) {
    guardarToken(r.token);
    st.usuario = r.usuario;
    st.cfg = r.cfg;
    $('#usrNombre').textContent = r.usuario.nombre;
    $('#usrRol').textContent = r.usuario.rol || 'agente';
    $('#usrInicial').textContent = String(r.usuario.nombre || '?').trim().charAt(0).toUpperCase();
    $('#login').classList.add('oculto');
    document.body.classList.add('dentro');
    $('#vista').innerHTML = cargando('Preparando el catálogo…');
    try { st.cat = await llamar('catInicio'); }
    catch (e) { $('#vista').innerHTML = '<div class="panel"><p class="error">' + esc(e.message) + '</p></div>'; return; }
    pintarNav();
    const h = leerHash();
    if (h && hayVista(h.id)) ir(h.id, h.params, true); else ir(visibles()[0].id);
  }
  async function refrescarCfg() { try { st.cat = await llamar('catInicio'); } catch (e) {} }

  /* ───────── datos de productos (caché corta en memoria) ───────── */
  async function productos(forzar) {
    if (!forzar && st.productos && Date.now() - st.cargadoEn < 60000) return st.productos;
    st.productos = await llamar('catProductos');
    st.cargadoEn = Date.now();
    return st.productos;
  }
  function olvidarProductos() { st.productos = null; }

  /* ───────── formatos ───────── */
  function fecha(iso, conHora) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const op = { timeZone: 'America/Mazatlan', day: '2-digit', month: 'short', year: 'numeric' };
    if (conHora !== false) { op.hour = '2-digit'; op.minute = '2-digit'; }
    return d.toLocaleString('es-MX', op);
  }
  function dinero(v) {
    if (v === '' || v === null || v === undefined || isNaN(Number(v))) return '—';
    const n = Number(v);
    return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function ganancia(v) {
    if (v === '' || v === null || v === undefined) return '<span class="ayuda">—</span>';
    return '<span class="' + (v < 0 ? 'gan-mal' : v === 0 ? 'gan-cero' : 'gan-ok') + '">' + esc(dinero(v)) + '</span>';
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function datosForm(form) {
    const o = {};
    $$('input[name], select[name], textarea[name]', form).forEach(function (el) {
      if (el.type === 'file') return;
      if (el.type === 'checkbox') { o[el.name] = el.checked ? 'SI' : 'NO'; return; }
      o[el.name] = el.value;
    });
    return o;
  }
  function opciones(lista, actual, vacia) {
    return (vacia !== undefined ? '<option value="">' + esc(vacia) + '</option>' : '') + (lista || []).map(function (x) {
      const v = typeof x === 'object' ? x.v : x, t = typeof x === 'object' ? x.t : x;
      return '<option value="' + esc(v) + '"' + (String(v) === String(actual) ? ' selected' : '') + '>' + esc(t) + '</option>';
    }).join('');
  }
  function chipTipo(t) { return '<span class="chip ' + (t === 'SEGES' ? 'seges' : 'drop') + '">' + esc(t === 'SEGES' ? 'SEGES' : 'Dropshipping') + '</span>'; }
  const COLOR_ESTADO = { Activo: 'var(--verde)', Borrador: 'var(--ayuda)', Pausado: 'var(--ambar)', Descontinuado: 'var(--rojo)' };
  function chipEstado(e) { const c = COLOR_ESTADO[e] || 'var(--ayuda)'; return '<span class="chip" style="border-color:' + c + ';color:' + c + '">' + esc(e) + '</span>'; }
  function estadoTn(p) {
    if (!p.enTienda) return p.pendiente ? { c: 'pend', t: 'Por enviar a Tiendanube' } : { c: '', t: 'No está en Tiendanube' };
    if (/^Error/.test(p.resultado || '')) return { c: 'mal', t: p.resultado };
    if (p.pendiente) return { c: 'pend', t: 'Cambios sin enviar' };
    return p.visibleTn ? { c: 'ok', t: 'Publicado en la tienda' } : { c: '', t: 'En Tiendanube (oculto)' };
  }
  function dato(et, val, html) {
    const vacio = !val && val !== 0;
    return '<div class="dato"><b>' + esc(et) + '</b><span>' + (vacio ? '—' : (html ? val : esc(val))) + '</span></div>';
  }
  function proveedorNombre(id) {
    const p = (st.cat.proveedores || []).find(function (x) { return x.id === id; });
    return p ? p.nombre : '';
  }

  /* ───────── arranque ───────── */
  async function arrancar() {
    $('#formLogin').onsubmit = async function (ev) {
      ev.preventDefault();
      const f = ev.target, btn = $('button', f);
      $('#loginError').textContent = '';
      btn.disabled = true;
      try { const d = datosForm(f); await entrarListo(await llamarDirecto('entrar', d.correo, d.pin)); f.reset(); }
      catch (e) { $('#loginError').textContent = ((e && e.message) || String(e)).replace(/^Error:\s*/, ''); }
      finally { btn.disabled = false; }
    };
    $('#btnSalir').onclick = async function () {
      if (!(await confirmar('¿Cerrar sesión?', 'Salir', { peligro: false, no: 'Cancelar' }))) return;
      try { await llamarDirecto('salir', st.token); } catch (e) {}
      guardarToken(null); st.usuario = null; st.productos = null; mostrarLogin();
    };
    $('#irInicio').onclick = function () { ir(visibles()[0].id); };
    $('#modal').addEventListener('mousedown', function (ev) {
      if (ev.target.id !== 'modal') return;
      if (st.alCancelarModal) st.alCancelarModal(); else cerrarModal();
    });
    $('#confirma').addEventListener('mousedown', function (ev) { if (ev.target.id === 'confirma') cancelarConfirma(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (resolverConfirma) { cancelarConfirma(); return; }
      if (modalAbierto()) { if (st.alCancelarModal) st.alCancelarModal(); else cerrarModal(); }
    });
    window.addEventListener('popstate', function () {
      if (!st.usuario || !st.cat) return;
      const h = leerHash();
      if (h && hayVista(h.id)) ir(h.id, h.params, true);
    });
    try {
      const r = await llamarDirecto('iniciar', leerToken());
      r.login ? mostrarLogin() : entrarListo(r);
    } catch (e) {
      mostrarLogin();
      $('#loginError').textContent = 'No pude conectar: ' + ((e && e.message) || e);
    }
  }

  return { st: st, $: $, $$: $$, esc: esc, url: url, llamar: llamar, aviso: aviso, cargando: cargando, modal: modal, cerrarModal: cerrarModal,
           confirmar: confirmar, descartar: descartar, firmaForm: firmaForm, confirmarBorrado: confirmarBorrado, registrarVista: registrarVista,
           ir: ir, recargar: recargar, esAdmin: esAdmin, esJefe: esJefe, fecha: fecha, dinero: dinero, ganancia: ganancia, norm: norm,
           datosForm: datosForm, opciones: opciones, chipTipo: chipTipo, chipEstado: chipEstado, estadoTn: estadoTn, dato: dato,
           proveedorNombre: proveedorNombre, productos: productos, olvidarProductos: olvidarProductos, refrescarCfg: refrescarCfg, arrancar: arrancar };
})();

/* ═════════════ Gráficas (SVG sin librerías) ═════════════ */
const GRAF = (function () {
  const esc = CAT.esc;
  function dona(segs, total, unidad) {
    const R = 54, C = 2 * Math.PI * R;
    const suma = segs.reduce(function (a, x) { return a + x.v; }, 0);
    let off = 0, s = '<svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="' + esc(unidad) + '">' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#1E2849" stroke-width="20"/>';
    segs.forEach(function (x) {
      if (!x.v || !suma) return;
      const largo = C * x.v / suma;
      s += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + x.c + '" stroke-width="20" stroke-dasharray="' + largo + ' ' + (C - largo) +
        '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"><title>' + esc(x.n) + ': ' + x.v + '</title></circle>';
      off += largo;
    });
    s += '<text x="70" y="68" text-anchor="middle" style="font-size:26px;font-weight:750;fill:#E6EAF3">' + esc(total) + '</text>' +
      '<text x="70" y="88" text-anchor="middle">' + esc(unidad) + '</text></svg>';
    return '<div class="dona-cont">' + s + '<div class="leyenda">' + segs.map(function (x) {
      const pct = suma ? Math.round(100 * x.v / suma) : 0;
      return '<span><i style="background:' + x.c + '"></i>' + esc(x.n) + '<b>' + x.v + '</b> <small>(' + pct + '%)</small></span>';
    }).join('') + '</div></div>';
  }
  function barrasH(items, fmt) {
    if (!items.length || !items.some(function (x) { return x.v; })) return '<p class="vacio">Sin datos todavía.</p>';
    const max = Math.max.apply(null, items.map(function (x) { return Math.abs(x.v); })) || 1;
    return '<div class="barras-h">' + items.map(function (x) {
      return '<div class="barra-h" style="--c:' + (x.c || 'var(--ambar)') + '"><span title="' + esc(x.n) + '">' + esc(x.n) +
        '</span><div class="pista"><i style="width:' + (100 * Math.abs(x.v) / max) + '%"></i></div><b>' + esc(fmt ? fmt(x.v) : x.v) + '</b></div>';
    }).join('') + '</div>';
  }
  /** Barras apiladas SEGES / Dropshipping por categoría. */
  function apiladas(items) {
    if (!items.length) return '<p class="vacio">Sin productos todavía.</p>';
    const max = Math.max.apply(null, items.map(function (x) { return x.total; })) || 1;
    return '<div class="apiladas">' + items.map(function (x) {
      return '<div class="apilada"><span title="' + esc(x.n) + '">' + esc(x.n) + '</span><div class="pista" title="SEGES ' + x.seges + ' · Dropshipping ' + x.drop + '">' +
        '<i style="width:' + (100 * x.seges / max) + '%;background:var(--ambar)"></i><i style="width:' + (100 * x.drop / max) + '%;background:var(--azul)"></i></div><b>' + x.total + '</b></div>';
    }).join('') + '</div><div class="leyenda" style="margin-top:10px"><span><i style="background:var(--ambar)"></i>SEGES</span><span><i style="background:var(--azul)"></i>Dropshipping</span></div>';
  }
  /** Columnas apiladas por semana (altas de productos). */
  function semanas(l) {
    const W = 640, H = 190, pi = 26, pb = 24, pt = 10;
    const max = Math.max(1, Math.max.apply(null, l.map(function (s) { return s.seges + s.drop; })));
    const paso = Math.ceil(max / 4), tope = paso * 4;
    const ancho = (W - pi) / l.length, bw = Math.min(26, ancho * 0.6);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Productos dados de alta por semana">';
    for (let i = 0; i <= 4; i++) {
      const y = pt + (H - pt - pb) * (1 - i / 4);
      s += '<line x1="' + pi + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#263052" stroke-width="1"/><text x="' + (pi - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (paso * i) + '</text>';
    }
    l.forEach(function (d, i) {
      const x = pi + ancho * i + ancho / 2;
      const alto = function (v) { return (H - pt - pb) * v / tope; };
      const hs = alto(d.seges), hd = alto(d.drop);
      const et = d.semana.slice(8) + '/' + d.semana.slice(5, 7);
      s += '<rect x="' + (x - bw / 2) + '" y="' + (H - pb - hs) + '" width="' + bw + '" height="' + hs + '" fill="#E8A33D"><title>Semana del ' + et + ': ' + d.seges + ' SEGES</title></rect>' +
        '<rect x="' + (x - bw / 2) + '" y="' + (H - pb - hs - hd) + '" width="' + bw + '" height="' + hd + '" fill="#6E9BE8"><title>Semana del ' + et + ': ' + d.drop + ' Dropshipping</title></rect>';
      if (i % 2 === 1 || l.length <= 8) s += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">' + et + '</text>';
    });
    return s + '</svg>';
  }
  return { dona: dona, barrasH: barrasH, apiladas: apiladas, semanas: semanas };
})();

/* ═════════════ Buscador de la cabecera ═════════════ */
(function () {
  const $ = CAT.$, esc = CAT.esc;
  let t;
  function cerrar() { $('#buscaRes').classList.add('oculto'); }
  document.addEventListener('DOMContentLoaded', function () {
    const inp = $('#buscaGlobal'), caja = $('#buscaRes');
    inp.oninput = function () {
      clearTimeout(t);
      const q = CAT.norm(inp.value.trim());
      if (q.length < 2) { cerrar(); return; }
      t = setTimeout(async function () {
        caja.innerHTML = CAT.cargando('', true); caja.classList.remove('oculto');
        try {
          const l = (await CAT.productos()).filter(function (p) { return CAT.norm(p.sku + ' ' + p.nombre + ' ' + p.etiquetas + ' ' + p.marca).indexOf(q) >= 0; }).slice(0, 8);
          caja.innerHTML = l.length ? '<h4>Productos</h4>' + l.map(function (p) {
            return '<button class="res-item" type="button" data-sku="' + esc(p.sku) + '"><b>' + esc(p.nombre) + '</b><small>' + esc(p.sku) + ' · ' + esc(p.categoria) + ' · ' + esc(CAT.dinero(p.precio)) + '</small></button>';
          }).join('') : '<p class="vacio">Sin resultados.</p>';
          CAT.$$('.res-item', caja).forEach(function (b) { b.onclick = function () { cerrar(); inp.value = ''; CAT.ir('productos', { id: b.dataset.sku }); }; });
        } catch (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
      }, 250);
    };
    document.addEventListener('mousedown', function (ev) { if (!ev.target.closest('.buscador')) cerrar(); });
  });
})();

/* ═════════════ Inicio (tablero) ═════════════ */
(function () {
  const $ = CAT.$, esc = CAT.esc;
  CAT.registrarVista('inicio', {
    titulo: 'Inicio', icono: 'i', orden: 10, soloJefe: true,
    render: async function (cont, p, vigente) {
      const r = await CAT.llamar('catTablero');
      if (!vigente()) return;
      const t = r.t;
      const kpi = function (k, v, txt, c) { return '<button class="kpi" type="button" data-k="' + k + '" style="--c:' + c + '"><b>' + esc(v) + '</b><span>' + esc(txt) + '</span></button>'; };
      const est = r.porEstado || {};
      const lista = function (l, fmt) {
        return l.length ? '<ul class="mini-lista">' + l.map(function (x) {
          return '<li data-sku="' + esc(x.sku) + '"><span>' + esc(x.nombre) + ' <small>' + esc(x.sku) + '</small></span><span>' + fmt(x) + '</span></li>';
        }).join('') + '</ul>' : '<p class="vacio">Nada por aquí.</p>';
      };
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Panel del catálogo</p><h1>Inicio</h1></div>' +
        '<div class="acciones"><button class="btn sec" id="btnRec" type="button">Actualizar</button><button class="btn" id="btnNuevoP" type="button">+ Nuevo producto</button></div></div>' +
        '<div class="kpis">' +
          kpi('todos', t.total, 'Productos en catálogo', 'var(--ambar)') +
          kpi('activos', t.activos, 'Activos', 'var(--verde)') +
          kpi('visibles', t.visibles, 'Publicados en la tienda', 'var(--turq)') +
          kpi('pendientes', t.pendientes, 'Cambios por enviar', 'var(--violeta)') +
          kpi('sinFoto', t.sinFoto, 'Sin foto', 'var(--azul)') +
          kpi('stockBajo', t.stockBajo, 'Stock bajo (SEGES)', 'var(--ambar)') +
          kpi('perdida', t.perdida, 'Venden con pérdida', 'var(--rojo)') +
          kpi('inventario', CAT.dinero(t.valorCosto), 'Inventario SEGES a costo (' + t.unidades + ' pzas)', 'var(--verde)') +
        '</div>' +
        '<div class="graficas">' +
          '<div class="panel"><div class="panel-cab"><h3>Productos por categoría</h3><small class="ayuda">' + r.porCategoria.length + ' categorías</small></div>' + GRAF.apiladas(r.porCategoria) + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>SEGES vs Dropshipping</h3></div>' +
            GRAF.dona([{ n: 'SEGES', v: t.seges, c: '#E8A33D' }, { n: 'Dropshipping', v: t.drop, c: '#6E9BE8' }], t.total, 'productos') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Altas por semana</h3><small class="ayuda">Últimas 12 semanas</small></div>' + GRAF.semanas(r.semanas) +
            '<div class="leyenda"><span><i style="background:var(--ambar)"></i>SEGES</span><span><i style="background:var(--azul)"></i>Dropshipping</span></div></div>' +
          '<div class="panel"><div class="panel-cab"><h3>Estado del catálogo</h3></div>' +
            GRAF.dona(['Activo', 'Borrador', 'Pausado', 'Descontinuado'].map(function (e, i) { return { n: e, v: est[e] || 0, c: ['#3FB984', '#8F99B3', '#E8A33D', '#E5675A'][i] }; }), t.total, 'productos') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Ganancia promedio por categoría</h3><small class="ayuda">Por venta, después de costo y envío</small></div>' +
            GRAF.barrasH(r.porCategoria.filter(function (c) { return c.gananciaProm !== ''; }).map(function (c) {
              return { n: c.n, v: c.gananciaProm, c: c.gananciaProm < 0 ? 'var(--rojo)' : 'var(--verde)' };
            }), CAT.dinero) + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Productos por proveedor</h3></div>' +
            GRAF.barrasH(r.porProveedor.map(function (x) { return { n: x.n, v: x.v, c: 'var(--turq)' }; })) + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Mayor ganancia por venta</h3></div>' + lista(r.mejores, function (x) { return CAT.ganancia(x.ganancia); }) + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Menor ganancia por venta</h3></div>' + lista(r.peores, function (x) { return CAT.ganancia(x.ganancia); }) + '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Alertas</h3></div>' +
            (r.alertas.perdida.length ? '<p class="eyebrow" style="color:var(--rojo)">Con pérdida</p>' + lista(r.alertas.perdida, function (x) { return CAT.ganancia(x.ganancia); }) : '') +
            (r.alertas.stockBajo.length ? '<p class="eyebrow">Stock bajo</p>' + lista(r.alertas.stockBajo, function (x) { return esc(x.stock + ' / mín ' + (x.stockMin || 0)); }) : '') +
            (r.alertas.sinFoto.length ? '<p class="eyebrow">Sin foto</p>' + lista(r.alertas.sinFoto, function () { return '<small>Falta foto</small>'; }) : '') +
            (r.alertas.pendientes.length ? '<p class="eyebrow">Por enviar a Tiendanube</p>' + lista(r.alertas.pendientes, function () { return '<small>Pendiente</small>'; }) : '') +
            (!r.alertas.perdida.length && !r.alertas.stockBajo.length && !r.alertas.sinFoto.length && !r.alertas.pendientes.length ? '<p class="vacio">Sin alertas.</p>' : '') +
          '</div>' +
          '<div class="panel"><div class="panel-cab"><h3>Últimos movimientos</h3><button class="btn-link" type="button" id="verInv">Ver inventario</button></div>' +
            (r.movimientos.length ? '<ul class="mini-lista">' + r.movimientos.map(function (m) {
              return '<li data-sku="' + esc(m.sku) + '"><span>' + esc(m.tipo) + ' · ' + esc(m.sku) + ' <small>' + esc(m.motivo) + '</small></span><span><b>' + (m.tipo === 'Salida' ? '−' : m.tipo === 'Entrada' ? '+' : '=') + esc(m.cantidad) + '</b> <small>' + esc(CAT.fecha(m.fecha, false)) + '</small></span></li>';
            }).join('') + '</ul>' : '<p class="vacio">Sin movimientos todavía.</p>') + '</div>' +
        '</div>';
      $('#btnRec', cont).onclick = function () { CAT.olvidarProductos(); CAT.recargar(); };
      $('#btnNuevoP', cont).onclick = function () { CAT.formProducto(null); };
      $('#verInv', cont).onclick = function () { CAT.ir('inventario'); };
      CAT.$$('.kpi', cont).forEach(function (b) {
        b.onclick = function () { b.dataset.k === 'inventario' ? CAT.ir('inventario') : CAT.irProductos(b.dataset.k); };
      });
      CAT.$$('li[data-sku]', cont).forEach(function (li) { li.onclick = function () { CAT.ir('productos', { id: li.dataset.sku }); }; });
    }
  });
})();

/* ═════════════ Productos ═════════════ */
(function () {
  const $ = CAT.$, esc = CAT.esc;
  const filtro = { q: '', tipo: '', categoria: '', estado: '', rapido: '', vista: 'tarjetas', orden: 'reciente' };
  const RAPIDOS = [{ v: 'pendientes', t: 'Por enviar a Tiendanube' }, { v: 'visibles', t: 'Publicados en la tienda' }, { v: 'noTienda', t: 'No están en Tiendanube' },
                   { v: 'sinFoto', t: 'Sin foto' }, { v: 'stockBajo', t: 'Stock bajo' }, { v: 'perdida', t: 'Con pérdida' }, { v: 'sinCosto', t: 'Sin costo capturado' }];

  CAT.irProductos = function (k) {
    Object.assign(filtro, { q: '', tipo: '', categoria: '', estado: '', rapido: '' });
    if (k === 'activos') filtro.estado = 'Activo';
    else if (k && k !== 'todos') filtro.rapido = k;
    CAT.ir('productos');
  };

  CAT.registrarVista('productos', {
    titulo: 'Productos', icono: 'p', orden: 20,
    render: async function (cont, p, vigente) {
      if (p.id) return ficha(cont, p.id, vigente);
      const cats = CAT.st.cat.categorias.map(function (c) { return c.nombre; });
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Catálogo</p><h1>Productos</h1></div><div class="acciones">' +
          (CAT.st.cat.puede.tienda ? '<button class="btn sec" id="btnPend" type="button">Enviar pendientes a Tiendanube</button>' : '') +
          '<button class="btn" id="btnNuevo" type="button">+ Nuevo</button></div></div>' +
        '<div class="filtros">' +
          '<input id="fQ" type="search" placeholder="Buscar nombre, SKU, etiqueta o marca" value="' + esc(filtro.q) + '">' +
          '<select id="fTipo">' + CAT.opciones(CAT.st.cat.tipos, filtro.tipo, 'Todos los tipos') + '</select>' +
          '<select id="fCat">' + CAT.opciones(cats, filtro.categoria, 'Todas las categorías') + '</select>' +
          '<select id="fEst">' + CAT.opciones(CAT.st.cat.estados, filtro.estado, 'Todos los estados') + '</select>' +
          '<select id="fRap">' + CAT.opciones(RAPIDOS, filtro.rapido, 'Sin filtro rápido') + '</select>' +
          '<select id="fOrd">' + CAT.opciones([{ v: 'reciente', t: 'Más recientes' }, { v: 'nombre', t: 'Nombre A–Z' }, { v: 'sku', t: 'SKU' },
            { v: 'precio', t: 'Precio mayor' }, { v: 'ganancia', t: 'Mayor ganancia' }, { v: 'gananciaAsc', t: 'Menor ganancia' }, { v: 'stock', t: 'Menos stock' }], filtro.orden) + '</select>' +
          '<div class="vista-toggle"><button type="button" data-v="tarjetas">Tarjetas</button><button type="button" data-v="tabla">Tabla</button></div>' +
        '</div><div id="resumenP" class="resumen"></div><div id="listaP">' + CAT.cargando('Cargando productos…') + '</div>';
      const leer = function () {
        filtro.q = $('#fQ').value; filtro.tipo = $('#fTipo').value; filtro.categoria = $('#fCat').value;
        filtro.estado = $('#fEst').value; filtro.rapido = $('#fRap').value; filtro.orden = $('#fOrd').value; pintar();
      };
      let t;
      $('#fQ', cont).oninput = function () { clearTimeout(t); t = setTimeout(leer, 200); };
      ['#fTipo', '#fCat', '#fEst', '#fRap', '#fOrd'].forEach(function (s) { $(s, cont).onchange = leer; });
      CAT.$$('.vista-toggle button', cont).forEach(function (b) {
        b.classList.toggle('activo', b.dataset.v === filtro.vista);
        b.onclick = function () { filtro.vista = b.dataset.v; CAT.$$('.vista-toggle button', cont).forEach(function (x) { x.classList.toggle('activo', x === b); }); pintar(); };
      });
      $('#btnNuevo', cont).onclick = function () { CAT.formProducto(null); };
      if ($('#btnPend', cont)) $('#btnPend', cont).onclick = enviarPendientes;
      await CAT.productos();
      if (vigente()) pintar();
    }
  });

  function cumple(p) {
    if (filtro.tipo && p.tipo !== filtro.tipo) return false;
    if (filtro.categoria && p.categoria !== filtro.categoria) return false;
    if (filtro.estado && p.estado !== filtro.estado) return false;
    const r = filtro.rapido;
    if (r === 'pendientes' && !p.pendiente) return false;
    if (r === 'visibles' && !p.visibleTn) return false;
    if (r === 'noTienda' && p.enTienda) return false;
    if (r === 'sinFoto' && p.fotos.length) return false;
    if (r === 'stockBajo' && !(p.stockBajo && p.estado === 'Activo')) return false;
    if (r === 'perdida' && !(p.ganancia !== '' && p.ganancia < 0)) return false;
    if (r === 'sinCosto' && p.costo !== '') return false;
    if (filtro.q) {
      const q = CAT.norm(filtro.q);
      if (CAT.norm(p.sku + ' ' + p.nombre + ' ' + p.etiquetas + ' ' + p.marca + ' ' + CAT.proveedorNombre(p.proveedor)).indexOf(q) < 0) return false;
    }
    return true;
  }
  const num = function (v, def) { return v === '' || v === null || v === undefined ? def : Number(v); };
  function ordenar(l) {
    const o = filtro.orden;
    const f = {
      nombre: function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); },
      sku: function (a, b) { return a.sku.localeCompare(b.sku); },
      precio: function (a, b) { return num(b.precio, -1) - num(a.precio, -1); },
      ganancia: function (a, b) { return num(b.ganancia, -1e9) - num(a.ganancia, -1e9); },
      gananciaAsc: function (a, b) { return num(a.ganancia, 1e9) - num(b.ganancia, 1e9); },
      stock: function (a, b) { return num(a.stock, 1e9) - num(b.stock, 1e9); }
    }[o];
    return f ? l.slice().sort(f) : l;
  }

  function pintar() {
    const caja = $('#listaP');
    if (!caja || !CAT.st.productos) return;
    const todos = CAT.st.productos;
    const l = ordenar(todos.filter(cumple));
    const pend = todos.filter(function (p) { return p.pendiente; }).length;
    if ($('#btnPend')) { $('#btnPend').textContent = 'Enviar ' + pend + ' pendiente' + (pend === 1 ? '' : 's') + ' a Tiendanube'; $('#btnPend').disabled = !pend; }
    $('#resumenP').innerHTML = '<span><b>' + l.length + '</b>de ' + todos.length + ' productos</span>' +
      '<span><b>' + l.filter(function (p) { return p.tipo === 'SEGES'; }).length + '</b>SEGES</span>' +
      '<span><b>' + l.filter(function (p) { return p.tipo !== 'SEGES'; }).length + '</b>Dropshipping</span>' +
      '<span><b>' + l.filter(function (p) { return p.visibleTn; }).length + '</b>publicados</span>';
    if (!l.length) {
      caja.innerHTML = '<div class="panel"><p class="vacio">' + (todos.length ? 'Ningún producto coincide con los filtros.' : 'Aún no hay productos. Crea el primero con «+ Nuevo»' + (CAT.esAdmin() ? ' o impórtalos de Tiendanube en Ajustes.' : '.')) + '</p></div>';
      return;
    }
    const visibles = l.slice(0, 300);
    if (filtro.vista === 'tabla') {
      caja.innerHTML = '<div class="tabla-cont"><table><thead><tr><th></th><th>SKU</th><th>Nombre</th><th class="ocultar-cel">Categoría</th><th class="ocultar-cel">Tipo</th>' +
        '<th class="num">Precio</th><th class="num ocultar-cel">WhatsApp</th><th class="num">Ganancia</th><th class="num ocultar-cel">Stock</th><th class="ocultar-cel">Tienda</th></tr></thead><tbody>' +
        visibles.map(function (p) {
          const e = CAT.estadoTn(p);
          return '<tr class="clic" data-sku="' + esc(p.sku) + '"><td>' + (CAT.url(p.fotos[0]) ? '<img class="miniatura" loading="lazy" alt="" src="' + esc(CAT.url(p.fotos[0])) + '">' : '<span class="miniatura"></span>') + '</td>' +
            '<td class="mono">' + esc(p.sku) + '</td><td>' + esc(p.nombre) + '<br><small>' + CAT.chipEstado(p.estado) + '</small></td><td class="ocultar-cel">' + esc(p.categoria) + '</td>' +
            '<td class="ocultar-cel">' + CAT.chipTipo(p.tipo) + '</td><td class="num">' + esc(CAT.dinero(p.promo !== '' ? p.promo : p.precio)) + '</td>' +
            '<td class="num ocultar-cel">' + esc(CAT.dinero(p.precioWa)) + '</td><td class="num">' + CAT.ganancia(p.ganancia) + '</td>' +
            '<td class="num ocultar-cel">' + (p.stock === '' ? '∞' : esc(p.stock)) + '</td><td class="ocultar-cel"><span class="punto-tn ' + e.c + '" title="' + esc(e.t) + '"></span></td></tr>';
        }).join('') + '</tbody></table></div>';
      CAT.$$('tr.clic', caja).forEach(function (tr) { tr.onclick = function () { CAT.ir('productos', { id: tr.dataset.sku }); }; });
    } else {
      caja.innerHTML = '<div class="prod-grid">' + visibles.map(function (p) {
        const e = CAT.estadoTn(p), f = CAT.url(p.fotos[0]);
        return '<button class="prod" type="button" data-sku="' + esc(p.sku) + '"><div class="foto">' +
          (f ? '<img loading="lazy" alt="" src="' + esc(f) + '">' : 'Sin foto') +
          '<div class="chips"><span class="chip solido ' + (p.tipo === 'SEGES' ? 'seges' : 'drop') + '">' + esc(p.tipo === 'SEGES' ? 'SEGES' : 'Drop') + '</span>' +
          (p.estado !== 'Activo' ? '<span class="chip solido">' + esc(p.estado) + '</span>' : '') + '</div></div>' +
          '<div class="cuerpo"><span class="sku">' + esc(p.sku) + ' · ' + esc(p.categoria) + '</span><strong>' + esc(p.nombre) + '</strong>' +
          '<div class="precios"><b>' + esc(CAT.dinero(p.promo !== '' ? p.promo : p.precio)) + '</b>' + CAT.ganancia(p.ganancia) + '</div>' +
          '<div class="meta"><span>' + (p.tipo === 'SEGES' ? 'Stock ' + esc(p.stock === '' ? 0 : p.stock) : 'Stock ∞') + (p.stockBajo ? ' ⚠' : '') + '</span>' +
          '<span><span class="punto-tn ' + e.c + '" title="' + esc(e.t) + '"></span></span></div></div></button>';
      }).join('') + '</div>';
      CAT.$$('.prod', caja).forEach(function (b) { b.onclick = function () { CAT.ir('productos', { id: b.dataset.sku }); }; });
    }
    if (l.length > 300) caja.insertAdjacentHTML('beforeend', '<p class="ayuda">Se muestran 300 de ' + l.length + '. Usa los filtros para ver los demás.</p>');
  }

  /* ───── Envío masivo ───── */
  async function enviarPendientes() {
    const n = CAT.st.productos.filter(function (p) { return p.pendiente; }).length;
    if (!n) return;
    if (!(await CAT.confirmar('Se enviarán ' + n + ' producto(s) a Tiendanube: se crean los nuevos y se actualizan los cambiados. Solo se publican los Activos con foto y «Publicar» marcado.', 'Enviar', { peligro: false, no: 'Cancelar', titulo: 'Enviar a Tiendanube' }))) return;
    const m = CAT.modal('<h2>Enviando a Tiendanube…</h2><div class="barra-progreso"><i id="bp" style="width:3%"></i></div><p id="bpTxt" class="ayuda">Esto puede tardar unos minutos. No cierres esta ventana.</p><div id="bpErr"></div>');
    CAT.st.alCancelarModal = function () {};
    let hechos = 0, errores = [], vueltas = 0, r;
    try {
      do {
        r = await CAT.llamar('catTnEnviarPendientes');
        hechos += r.hechos.length; errores = errores.concat(r.errores); vueltas++;
        $('#bp', m).style.width = Math.min(100, Math.round(100 * (hechos + errores.length) / n)) + '%';
        $('#bpTxt', m).textContent = hechos + ' enviados' + (errores.length ? ', ' + errores.length + ' con error' : '') + (r.quedan ? '; faltan ' + r.quedan + '…' : '.');
      } while (r.quedan > 0 && r.hechos.length > 0 && vueltas < 15);
      $('#bp', m).style.width = '100%';
      $('#bpErr', m).innerHTML = (errores.length ? '<p class="error">Con error:</p><ul class="mini-lista">' + errores.slice(0, 15).map(function (e) {
        return '<li><span class="mono">' + esc(e.sku) + '</span><small>' + esc(e.error) + '</small></li>'; }).join('') + '</ul>' : '') +
        (r.saltados ? '<p class="ayuda">' + r.saltados + ' sin precio no se enviaron.</p>' : '') +
        '<div class="acciones"><button class="btn" id="bpOk" type="button">Listo</button></div>';
    } catch (e) {
      $('#bpErr', m).innerHTML = '<p class="error">' + esc(e.message) + '</p><div class="acciones"><button class="btn" id="bpOk" type="button">Cerrar</button></div>';
    }
    $('#bpOk', m).onclick = function () { CAT.cerrarModal(); CAT.olvidarProductos(); CAT.recargar(); };
  }

  /* ───── Ficha ───── */
  async function ficha(cont, sku, vigente) {
    const p = await CAT.llamar('catProducto', sku);
    if (!vigente()) return;
    const puede = CAT.st.cat.puede;
    const e = CAT.estadoTn(p);
    const venta = p.promo !== '' ? p.promo : p.precio;
    cont.innerHTML =
      '<div class="encabezado"><div><p class="eyebrow"><button class="btn-link" type="button" id="volver">← Productos</button> · ' + esc(p.sku) + '</p><h1>' + esc(p.nombre) + '</h1>' +
        '<div class="chips">' + CAT.chipTipo(p.tipo) + CAT.chipEstado(p.estado) + '<span class="chip">' + esc(p.categoria) + '</span></div></div>' +
        '<div class="acciones">' +
          '<button class="btn" id="btnEditar" type="button">Editar</button>' +
          (p.tipo === 'SEGES' ? '<button class="btn sec" id="btnMov" type="button">Movimiento de stock</button>' : '') +
          '<button class="btn sec" id="btnDup" type="button">Duplicar</button>' +
          (puede.borrar ? '<button class="btn peligro" id="btnBorrar" type="button">Eliminar</button>' : '') +
        '</div></div>' +
      '<div class="graficas">' +
        '<div class="panel"><div class="panel-cab"><h3>Fotos</h3><small class="ayuda">La primera es la principal · máx. 10</small></div>' +
          '<div class="galeria" id="galeria"></div><input type="file" id="archFoto" accept="image/*" multiple class="oculto">' +
          '<p class="ayuda" id="fotoEstado"></p></div>' +
        '<div class="panel"><div class="panel-cab"><h3>Tiendanube</h3></div>' +
          '<div class="estado-tn"><span class="punto-tn ' + e.c + '"></span><b>' + esc(e.t) + '</b></div>' +
          '<div class="datos" style="margin-top:12px">' +
            CAT.dato('Publicar', p.publicar === 'SI' ? 'Sí (si está Activo y tiene foto)' : 'No') +
            CAT.dato('Último envío', p.sync ? CAT.fecha(p.sync) : '') + CAT.dato('Resultado', p.resultado) + '</div>' +
          '<div class="acciones">' +
            (puede.tienda && CAT.st.cat.tienda ? '<button class="btn" id="btnEnviar" type="button">' + (p.enTienda ? 'Enviar cambios' : 'Crear en Tiendanube') + '</button>' : '') +
            (p.tnUrl ? '<a class="btn sec" href="' + esc(CAT.url(p.tnUrl)) + '" target="_blank" rel="noopener">Ver en Tiendanube</a>' : '') +
          '</div>' + (!CAT.st.cat.tienda ? '<p class="ayuda">El catálogo aún no está conectado a Tiendanube.</p>' : '') + '</div>' +
        '<div class="panel"><div class="panel-cab"><h3>Precios y ganancia</h3></div><div class="cifras">' +
          '<div class="cifra"><small>Costo</small><b>' + esc(CAT.dinero(p.costo)) + '</b></div>' +
          '<div class="cifra"><small>Envío estimado</small><b>' + esc(CAT.dinero(p.envio)) + '</b></div>' +
          '<div class="cifra"><small>Precio Tiendanube</small><b>' + esc(CAT.dinero(p.precio)) + '</b>' + (p.promo !== '' ? '<small>Promoción ' + esc(CAT.dinero(p.promo)) + '</small>' : '') + '</div>' +
          '<div class="cifra"><small>Ganancia en tienda</small><b>' + CAT.ganancia(p.ganancia) + '</b>' + (p.margen !== '' ? '<small>' + esc(p.margen) + '% de ' + esc(CAT.dinero(venta)) + '</small>' : '') + '</div>' +
          '<div class="cifra"><small>Precio WhatsApp</small><b>' + esc(CAT.dinero(p.precioWa)) + '</b></div>' +
          '<div class="cifra"><small>Ganancia WhatsApp</small><b>' + CAT.ganancia(p.gananciaWa) + '</b></div>' +
        '</div>' + (p.ganancia !== '' && p.ganancia < 0 ? '<p class="error">Este producto se vende con pérdida. Sube el precio o revisa el costo.</p>' : '') +
          (p.costo === '' ? '<p class="ayuda">Captura el costo para calcular la ganancia.</p>' : '') + '</div>' +
        '<div class="panel"><div class="panel-cab"><h3>Inventario</h3></div><div class="datos">' +
          CAT.dato('Stock', p.tipo === 'SEGES' ? String(p.stock === '' ? 0 : p.stock) + (p.stockBajo ? ' ⚠ bajo' : '') : (p.stock === '' ? 'Ilimitado (dropshipping)' : String(p.stock))) +
          (p.tipo === 'SEGES' ? CAT.dato('Stock mínimo', String(p.stockMin === '' ? 0 : p.stockMin)) : '') + '</div>' +
          (p.movimientos.length ? '<ul class="mini-lista" style="margin-top:10px">' + p.movimientos.slice(0, 8).map(function (m) {
            return '<li><span>' + esc(m.tipo) + ' <small>' + esc(m.motivo) + ' · ' + esc(m.usuario) + '</small></span><span><b>' + (m.tipo === 'Salida' ? '−' : m.tipo === 'Entrada' ? '+' : '=') + esc(m.cantidad) +
              '</b> → ' + esc(m.despues) + ' <small>' + esc(CAT.fecha(m.fecha, false)) + '</small></span></li>'; }).join('') + '</ul>' : '<p class="ayuda" style="margin-top:10px">Sin movimientos.</p>') + '</div>' +
        '<div class="panel"><div class="panel-cab"><h3>Proveedor (interno)</h3></div><div class="datos">' +
          (p.proveedorObj ? CAT.dato('Proveedor', esc(p.proveedorObj.nombre) + ' <small class="ayuda">' + esc(p.proveedorObj.id) + ' · ' + esc(p.proveedorObj.tipo) + '</small>', true) +
            CAT.dato('Contacto', [p.proveedorObj.contacto, p.proveedorObj.telefono].filter(String).join(' · ')) +
            (CAT.url(p.proveedorObj.enlace) ? CAT.dato('Sitio', '<a href="' + esc(p.proveedorObj.enlace) + '" target="_blank" rel="noopener">Abrir</a>', true) : '')
            : CAT.dato('Proveedor', 'Sin asignar')) +
          CAT.dato('Referencia', CAT.url(p.proveedorRef) ? '<a href="' + esc(p.proveedorRef) + '" target="_blank" rel="noopener">Abrir enlace del proveedor</a>' : esc(p.proveedorRef), true) +
          CAT.dato('Notas internas', p.notas) + '</div></div>' +
        '<div class="panel ancha"><div class="panel-cab"><h3>Ficha de venta</h3></div><div class="datos">' +
          CAT.dato('Marca', p.marca || 'Genérico') + CAT.dato('Etiquetas', p.etiquetas) +
          CAT.dato('Medidas', [p.peso !== '' ? p.peso + ' kg' : '', p.alto !== '' ? p.alto + ' alto' : '', p.ancho !== '' ? p.ancho + ' ancho' : '', p.largo !== '' ? p.largo + ' largo (cm)' : ''].filter(String).join(' · ')) +
          CAT.dato('Alta', CAT.fecha(p.alta) + (p.creo ? ' · ' + p.creo : '')) + CAT.dato('Actualizado', CAT.fecha(p.actualizado)) + '</div>' +
          '<p class="desc" style="white-space:pre-wrap;margin-top:12px">' + (p.descripcion ? esc(p.descripcion) : '<span class="ayuda">Sin descripción.</span>') + '</p></div>' +
      '</div>';
    $('#volver', cont).onclick = function () { CAT.ir('productos'); };
    $('#btnEditar', cont).onclick = function () { CAT.formProducto(p); };
    $('#btnDup', cont).onclick = function () { const c = Object.assign({}, p, { sku: '', skuOriginal: '', fotos: [], tnId: '', nombre: p.nombre + ' (copia)', stock: '', estado: 'Borrador' }); CAT.formProducto(c, true); };
    if ($('#btnMov', cont)) $('#btnMov', cont).onclick = function () { CAT.formMovimiento(p.sku); };
    if ($('#btnBorrar', cont)) $('#btnBorrar', cont).onclick = function () { borrar(p); };
    if ($('#btnEnviar', cont)) $('#btnEnviar', cont).onclick = async function () {
      const b = this; b.disabled = true; b.textContent = 'Enviando…';
      try { const r = await CAT.llamar('catTnEnviar', p.sku); CAT.aviso(r.resultado, 'ok'); CAT.olvidarProductos(); CAT.recargar(); }
      catch (err) { CAT.aviso(err.message, 'mal'); b.disabled = false; b.textContent = 'Reintentar'; }
    };
    galeria(p);
  }

  function galeria(p) {
    const g = $('#galeria');
    if (!g) return;
    g.innerHTML = p.fotos.map(function (f, i) {
      return '<div class="ft' + (i === 0 ? ' principal' : '') + '"><img loading="lazy" alt="Foto ' + (i + 1) + '" src="' + esc(CAT.url(f)) + '"><div class="ctl">' +
        (i > 0 ? '<button type="button" data-izq="' + i + '" title="Mover a la izquierda">←</button>' : '<span></span>') +
        '<button type="button" data-quitar="' + i + '" title="Quitar">✕</button></div></div>';
    }).join('') + (p.fotos.length < 10 ? '<button class="agregar" type="button" id="btnFoto">+ Subir foto<br><small>desde el celular o la compu</small></button>' +
      '<button class="agregar" type="button" id="btnFotoUrl">+ Foto por enlace</button>' : '');
    const guardarFotos = async function (lista) {
      $('#fotoEstado').textContent = 'Guardando…';
      try { await CAT.llamar('catProductoGuardar', Object.assign({}, p, { skuOriginal: p.sku, fotos: lista })); CAT.olvidarProductos(); CAT.recargar(); }
      catch (e) { $('#fotoEstado').textContent = ''; CAT.aviso(e.message, 'mal'); }
    };
    CAT.$$('[data-izq]', g).forEach(function (b) { b.onclick = function () { const i = Number(b.dataset.izq); const l = p.fotos.slice(); const x = l[i]; l[i] = l[i - 1]; l[i - 1] = x; guardarFotos(l); }; });
    CAT.$$('[data-quitar]', g).forEach(function (b) {
      b.onclick = async function () {
        if (!(await CAT.confirmar('¿Quitar esta foto? En Tiendanube se quita cuando envíes los cambios.', 'Quitar', { no: 'Cancelar' }))) return;
        const l = p.fotos.slice(); l.splice(Number(b.dataset.quitar), 1); guardarFotos(l);
      };
    });
    if ($('#btnFotoUrl')) $('#btnFotoUrl').onclick = function () {
      const m = CAT.modal('<h2>Agregar foto por enlace</h2><form id="fUrl"><label>Dirección de la imagen (https://…)<input name="u" type="url" required placeholder="https://…/foto.jpg"></label>' +
        '<p class="ayuda">Se sube a Tiendanube cuando envíes el producto.</p><div class="acciones"><button class="btn" type="submit">Agregar</button><button class="btn sec" type="button" id="cUrl">Cancelar</button></div></form>');
      $('#cUrl', m).onclick = CAT.cerrarModal;
      $('#fUrl', m).onsubmit = function (ev) { ev.preventDefault(); const u = CAT.url(ev.target.u.value.trim()); if (!u) { CAT.aviso('El enlace debe empezar con https://', 'mal'); return; } CAT.cerrarModal(); guardarFotos(p.fotos.concat([u])); };
    };
    if ($('#btnFoto')) {
      $('#btnFoto').onclick = function () {
        if (!CAT.st.cat.tienda) { CAT.aviso('Para subir fotos desde el equipo, primero conecta el catálogo con Tiendanube (Ajustes). Mientras, usa «Foto por enlace».', 'mal'); return; }
        $('#archFoto').click();
      };
      $('#archFoto').onchange = async function () {
        const archivos = Array.prototype.slice.call(this.files || []).slice(0, 10 - p.fotos.length);
        this.value = '';
        if (!archivos.length) return;
        const est = $('#fotoEstado');
        for (let i = 0; i < archivos.length; i++) {
          est.textContent = 'Subiendo foto ' + (i + 1) + ' de ' + archivos.length + '…';
          try {
            const b64 = await comprimir(archivos[i]);
            await CAT.llamar('catFotoSubir', p.sku, b64, p.sku + '_' + Date.now() + '.jpg');
          } catch (e) { CAT.aviso('Foto ' + (i + 1) + ': ' + e.message, 'mal'); }
        }
        est.textContent = '';
        CAT.olvidarProductos(); CAT.recargar();
      };
    }
  }

  /** Reduce la foto a 1600 px máx. y JPEG para que suba rápido desde el celular. */
  function comprimir(archivo) {
    return new Promise(function (ok, mal) {
      if (!/^image\//.test(archivo.type)) { mal(new Error('El archivo no es una imagen.')); return; }
      const lector = new FileReader();
      lector.onerror = function () { mal(new Error('No pude leer la imagen.')); };
      lector.onload = function () {
        const img = new Image();
        img.onerror = function () { mal(new Error('Formato de imagen no compatible (usa JPG o PNG).')); };
        img.onload = function () {
          const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const x = c.getContext('2d');
          x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          x.drawImage(img, 0, 0, c.width, c.height);
          let q = 0.86, d = c.toDataURL('image/jpeg', q);
          while (d.length > 2800000 && q > 0.4) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
          ok(d.split(',')[1]);
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  async function borrar(p) {
    if (!(await CAT.confirmarBorrado('el producto ' + p.sku))) return;
    let tambien = false;
    if (p.enTienda) tambien = await CAT.confirmar('Este producto también está en Tiendanube. ¿Quieres borrarlo allá también?', 'Sí, borrar en Tiendanube', { no: 'No, solo del catálogo', titulo: 'Tiendanube' });
    try { const r = await CAT.llamar('catProductoBorrar', p.sku, tambien); CAT.aviso(r.mensaje, 'ok'); CAT.olvidarProductos(); CAT.ir('productos'); }
    catch (e) { CAT.aviso(e.message, 'mal'); }
  }

  /* ───── Formulario ───── */
  CAT.formProducto = function (p, esCopia) {
    const nuevo = !p || esCopia;
    p = p || { tipo: 'Dropshipping', estado: 'Borrador', publicar: 'SI', fotos: [] };
    const c = CAT.st.cat;
    const v = function (x) { return x === '' || x === undefined || x === null ? '' : CAT.esc(x); };
    const provs = c.proveedores.filter(function (x) { return x.activo || x.id === p.proveedor; }).map(function (x) { return { v: x.id, t: x.nombre + ' (' + x.id + ')' }; });
    const m = CAT.modal(
      '<h2>' + (nuevo ? 'Nuevo producto' : 'Editar ' + esc(p.sku)) + '</h2><form id="fProd" autocomplete="off">' +
      '<label>Nombre del producto *<input name="nombre" required maxlength="150" value="' + v(p.nombre) + '"></label>' +
      '<div class="rejilla">' +
        '<label>Tipo *<select name="tipo">' + CAT.opciones([{ v: 'SEGES', t: 'SEGES (inventario propio)' }, { v: 'Dropshipping', t: 'Dropshipping' }], p.tipo) + '</select></label>' +
        '<label>Categoría *<select name="categoria" required>' + CAT.opciones(c.categorias.map(function (x) { return x.nombre; }), p.categoria, 'Elige…') + '</select></label>' +
        '<label>Estado<select name="estado">' + CAT.opciones(c.estados, p.estado) + '</select></label>' +
        '<label>Marca<input name="marca" maxlength="60" placeholder="Genérico" value="' + v(p.marca) + '"></label>' +
      '</div>' +
      '<label class="check"><input type="checkbox" name="publicar"' + (p.publicar !== 'NO' ? ' checked' : '') + ' style="accent-color:var(--ambar)"> Publicar en Tiendanube (solo si está Activo y tiene foto)</label>' +
      (nuevo ? '<label>SKU<input name="sku" maxlength="20" placeholder="Automático (ej. HO20001)" style="text-transform:uppercase"></label>' : '') +
      '<div class="seccion-form"><h3>Precios</h3><div class="rejilla">' +
        '<label>Costo proveedor<input name="costo" inputmode="decimal" value="' + v(p.costo) + '" placeholder="$"></label>' +
        '<label>Envío estimado<input name="envio" inputmode="decimal" value="' + v(p.envio) + '" placeholder="$"></label>' +
        '<label>Precio Tiendanube<input name="precio" inputmode="decimal" value="' + v(p.precio) + '" placeholder="$"></label>' +
        '<label>Precio promoción<input name="promo" inputmode="decimal" value="' + v(p.promo) + '" placeholder="Opcional"></label>' +
        '<label>Precio WhatsApp<input name="precioWa" inputmode="decimal" value="' + v(p.precioWa) + '" placeholder="$"></label>' +
      '</div><div class="vista-gan" id="vistaGan"></div></div>' +
      '<div class="seccion-form"><h3>Inventario</h3><div class="rejilla">' +
        '<label>Stock<input name="stock" inputmode="numeric" value="' + v(p.stock) + '" placeholder="Vacío = ilimitado (dropshipping)"></label>' +
        '<label>Stock mínimo (alerta)<input name="stockMin" inputmode="numeric" value="' + v(p.stockMin) + '"></label>' +
      '</div>' + (!nuevo && p.tipo === 'SEGES' ? '<p class="ayuda">Si cambias el stock aquí se registra como «Ajuste». Para compras y ventas usa «Movimiento de stock».</p>' : '') + '</div>' +
      '<div class="seccion-form"><h3>Proveedor (interno, no se publica)</h3><div class="rejilla">' +
        '<label>Proveedor<select name="proveedor">' + CAT.opciones(provs, p.proveedor, 'Sin proveedor') + '</select></label>' +
        '<label>SKU o enlace del proveedor<input name="proveedorRef" maxlength="300" value="' + v(p.proveedorRef) + '"></label>' +
      '</div><button class="btn-link" type="button" id="nuevoProv">+ Agregar proveedor nuevo</button></div>' +
      '<div class="seccion-form"><h3>Ficha de venta</h3>' +
        '<label>Descripción<textarea name="descripcion" rows="6" maxlength="5000">' + v(p.descripcion) + '</textarea></label>' +
        '<label>Etiquetas (separadas por coma)<input name="etiquetas" maxlength="300" value="' + v(p.etiquetas) + '"></label>' +
        '<div class="rejilla cuatro">' +
          '<label>Peso (kg)<input name="peso" inputmode="decimal" value="' + v(p.peso) + '"></label>' +
          '<label>Alto (cm)<input name="alto" inputmode="decimal" value="' + v(p.alto) + '"></label>' +
          '<label>Ancho (cm)<input name="ancho" inputmode="decimal" value="' + v(p.ancho) + '"></label>' +
          '<label>Largo (cm)<input name="largo" inputmode="decimal" value="' + v(p.largo) + '"></label>' +
        '</div>' +
        '<label>Notas internas<textarea name="notas" rows="2" maxlength="2000">' + v(p.notas) + '</textarea></label></div>' +
      '<p class="error" id="errProd"></p>' +
      '<div class="acciones"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" id="cancProd">Cancelar</button></div></form>',
      { ancha: true });
    const f = $('#fProd', m);
    const inicial = CAT.firmaForm(f);
    const cancelar = function () { CAT.descartar(f, inicial); };
    CAT.st.alCancelarModal = cancelar;
    $('#cancProd', m).onclick = cancelar;
    const calc = function () {
      const n = function (k) { const x = String(f[k].value).replace(/[$,\s]/g, ''); return x === '' ? null : Number(x); };
      const costo = n('costo'), envio = n('envio') || 0, precio = n('precio'), promo = n('promo'), wa = n('precioWa');
      const venta = promo !== null && precio !== null && promo < precio ? promo : precio;
      const g = costo !== null && venta !== null ? venta - costo - envio : null, gw = costo !== null && wa !== null ? wa - costo - envio : null;
      $('#vistaGan', m).innerHTML = '<span>Ganancia tienda:<b>' + (g === null || isNaN(g) ? '—' : CAT.ganancia(Math.round(g * 100) / 100)) + '</b></span>' +
        (g !== null && venta ? '<span>Margen:<b>' + Math.round(1000 * g / venta) / 10 + '%</b></span>' : '') +
        '<span>Ganancia WhatsApp:<b>' + (gw === null || isNaN(gw) ? '—' : CAT.ganancia(Math.round(gw * 100) / 100)) + '</b></span>';
    };
    ['costo', 'envio', 'precio', 'promo', 'precioWa'].forEach(function (k) { f[k].oninput = calc; });
    calc();
    $('#nuevoProv', m).onclick = async function () {
      const nombre = prompt('Nombre del proveedor nuevo:');
      if (!nombre || nombre.trim().length < 2) return;
      try {
        const r = await CAT.llamar('catProveedorGuardar', { nombre: nombre.trim(), tipo: 'Otro' });
        await CAT.refrescarCfg();
        const sel = f.proveedor;
        sel.insertAdjacentHTML('beforeend', '<option value="' + esc(r.id) + '">' + esc(nombre.trim() + ' (' + r.id + ')') + '</option>');
        sel.value = r.id;
        CAT.aviso('Proveedor ' + r.id + ' creado. Completa sus datos en Proveedores.', 'ok');
      } catch (e) { CAT.aviso(e.message, 'mal'); }
    };
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const b = $('button[type=submit]', f);
      $('#errProd', m).textContent = '';
      const d = CAT.datosForm(f);
      d.skuOriginal = nuevo ? '' : p.sku;
      d.fotos = nuevo ? [] : p.fotos;
      b.disabled = true; b.textContent = 'Guardando…';
      try {
        const r = await CAT.llamar('catProductoGuardar', d);
        CAT.cerrarModal(); CAT.olvidarProductos();
        CAT.aviso((nuevo ? 'Producto creado: ' : 'Guardado: ') + r.sku, 'ok');
        CAT.ir('productos', { id: r.sku });
      } catch (e) { $('#errProd', m).textContent = e.message; b.disabled = false; b.textContent = 'Guardar'; }
    };
  };
})();

/* ═════════════ Inventario ═════════════ */
(function () {
  const $ = CAT.$, esc = CAT.esc;
  CAT.registrarVista('inventario', {
    titulo: 'Inventario', icono: 's', orden: 30,
    render: async function (cont, p, vigente) {
      cont.innerHTML = '<div class="encabezado"><div><p class="eyebrow">Productos SEGES</p><h1>Inventario</h1></div>' +
        '<div class="acciones"><button class="btn" id="btnMovN" type="button">+ Movimiento</button></div></div>' +
        '<div class="graficas"><div class="panel"><div class="panel-cab"><h3>Existencias</h3><input id="qInv" type="search" placeholder="Buscar" style="max-width:200px;margin:0"></div><div id="exist">' + CAT.cargando('', true) + '</div></div>' +
        '<div class="panel"><div class="panel-cab"><h3>Movimientos recientes</h3></div><div id="movs">' + CAT.cargando('', true) + '</div></div></div>';
      $('#btnMovN', cont).onclick = function () { CAT.formMovimiento(''); };
      const [prods, movs] = await Promise.all([CAT.productos(), CAT.llamar('catMovimientos')]);
      if (!vigente()) return;
      const seges = prods.filter(function (x) { return x.tipo === 'SEGES'; }).sort(function (a, b) { return (b.stockBajo - a.stockBajo) || a.nombre.localeCompare(b.nombre, 'es'); });
      const pintarExist = function (q) {
        q = CAT.norm(q);
        const l = seges.filter(function (x) { return !q || CAT.norm(x.sku + ' ' + x.nombre).indexOf(q) >= 0; });
        $('#exist').innerHTML = l.length ? '<div class="tabla-cont"><table><thead><tr><th>SKU</th><th>Producto</th><th class="num">Stock</th><th class="num ocultar-cel">Mín.</th><th class="num ocultar-cel">Valor a costo</th></tr></thead><tbody>' +
          l.map(function (x) {
            return '<tr class="clic" data-sku="' + esc(x.sku) + '"><td class="mono">' + esc(x.sku) + '</td><td>' + esc(x.nombre) + (x.estado !== 'Activo' ? ' <small class="ayuda">(' + esc(x.estado) + ')</small>' : '') + '</td>' +
              '<td class="num"' + (x.stockBajo ? ' style="color:var(--rojo);font-weight:700"' : '') + '>' + esc(x.stock === '' ? 0 : x.stock) + '</td><td class="num ocultar-cel">' + esc(x.stockMin === '' ? 0 : x.stockMin) + '</td>' +
              '<td class="num ocultar-cel">' + esc(x.costo !== '' && x.stock !== '' ? CAT.dinero(x.costo * x.stock) : '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="vacio">' + (seges.length ? 'Sin resultados.' : 'No hay productos SEGES (inventario propio) todavía.') + '</p>';
        CAT.$$('tr.clic', $('#exist')).forEach(function (tr) { tr.onclick = function () { CAT.ir('productos', { id: tr.dataset.sku }); }; });
      };
      $('#qInv', cont).oninput = function () { pintarExist(this.value); };
      pintarExist('');
      $('#movs').innerHTML = movs.length ? '<ul class="mini-lista">' + movs.slice(0, 60).map(function (m) {
        return '<li data-sku="' + esc(m.sku) + '"><span><b>' + esc(m.tipo) + '</b> · <span class="mono">' + esc(m.sku) + '</span><br><small>' + esc(m.motivo) + ' · ' + esc(m.usuario) + '</small></span>' +
          '<span style="text-align:right"><b>' + (m.tipo === 'Salida' ? '−' : m.tipo === 'Entrada' ? '+' : '=') + esc(m.cantidad) + '</b> <small>(' + esc(m.antes) + ' → ' + esc(m.despues) + ')</small><br><small>' + esc(CAT.fecha(m.fecha)) + '</small></span></li>';
      }).join('') + '</ul>' : '<p class="vacio">Sin movimientos todavía.</p>';
      CAT.$$('li[data-sku]', $('#movs')).forEach(function (li) { li.onclick = function () { CAT.ir('productos', { id: li.dataset.sku }); }; });
    }
  });

  CAT.formMovimiento = async function (sku) {
    const prods = (await CAT.productos()).filter(function (x) { return x.tipo === 'SEGES'; });
    if (!prods.length) { CAT.aviso('Primero crea un producto de tipo SEGES (inventario propio).', 'mal'); return; }
    const m = CAT.modal('<h2>Movimiento de stock</h2><form id="fMov">' +
      '<label>Producto<select name="sku" required>' + CAT.opciones(prods.map(function (x) { return { v: x.sku, t: x.sku + ' · ' + x.nombre + ' (stock ' + (x.stock === '' ? 0 : x.stock) + ')' }; }), sku, 'Elige…') + '</select></label>' +
      '<div class="rejilla"><label>Tipo<select name="tipo">' + CAT.opciones([{ v: 'Entrada', t: 'Entrada (compra, devolución)' }, { v: 'Salida', t: 'Salida (venta, merma)' }, { v: 'Ajuste', t: 'Ajuste (conteo físico: stock final)' }], 'Entrada') + '</select></label>' +
      '<label>Cantidad<input name="cantidad" inputmode="numeric" required></label></div>' +
      '<label>Motivo<input name="motivo" required maxlength="200" placeholder="Ej. compra a proveedor, venta por WhatsApp, conteo"></label>' +
      '<p class="error" id="errMov"></p><div class="acciones"><button class="btn" type="submit">Registrar</button><button class="btn sec" type="button" id="cMov">Cancelar</button></div></form>');
    const f = $('#fMov', m), ini = CAT.firmaForm(f);
    const canc = function () { CAT.descartar(f, ini); };
    CAT.st.alCancelarModal = canc; $('#cMov', m).onclick = canc;
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const b = $('button[type=submit]', f); b.disabled = true;
      try { const r = await CAT.llamar('catMovimiento', CAT.datosForm(f)); CAT.cerrarModal(); CAT.olvidarProductos(); CAT.aviso('Listo. Stock de ' + r.sku + ': ' + r.stock, 'ok'); CAT.recargar(); }
      catch (e) { $('#errMov', m).textContent = e.message; b.disabled = false; }
    };
  };
})();

/* ═════════════ Proveedores ═════════════ */
(function () {
  const $ = CAT.$, esc = CAT.esc;
  CAT.registrarVista('proveedores', {
    titulo: 'Proveedores', icono: 'v', orden: 40,
    render: async function (cont, p, vigente) {
      const l = await CAT.llamar('catProveedores');
      if (!vigente()) return;
      cont.innerHTML = '<div class="encabezado"><div><p class="eyebrow">Uso interno</p><h1>Proveedores</h1></div>' +
        '<div class="acciones"><button class="btn" id="btnProvN" type="button">+ Nuevo</button></div></div>' +
        (l.length ? '<div class="tabla-cont"><table><thead><tr><th>ID</th><th>Nombre</th><th class="ocultar-cel">Tipo</th><th class="ocultar-cel">Contacto</th><th class="ocultar-cel">Ciudad</th><th class="num">Productos</th></tr></thead><tbody>' +
          l.map(function (x) {
            return '<tr class="clic" data-id="' + esc(x.id) + '"><td class="mono">' + esc(x.id) + '</td><td>' + esc(x.nombre) + (x.activo ? '' : ' <small class="ayuda">(inactivo)</small>') + '</td>' +
              '<td class="ocultar-cel">' + esc(x.tipo) + '</td><td class="ocultar-cel">' + esc([x.contacto, x.telefono].filter(String).join(' · ')) + '</td><td class="ocultar-cel">' + esc(x.ciudad) + '</td><td class="num">' + x.productos + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="panel"><p class="vacio">Aún no hay proveedores. Agrega el primero con «+ Nuevo».</p></div>');
      $('#btnProvN', cont).onclick = function () { form(null); };
      CAT.$$('tr.clic', cont).forEach(function (tr) { tr.onclick = function () { form(l.find(function (x) { return x.id === tr.dataset.id; })); }; });
    }
  });

  function form(x) {
    const nuevo = !x; x = x || { tipo: 'Otro', activo: true };
    const v = function (k) { return esc(x[k] || ''); };
    const m = CAT.modal('<h2>' + (nuevo ? 'Nuevo proveedor' : esc(x.id) + ' · ' + esc(x.nombre)) + '</h2><form id="fProv">' +
      '<div class="rejilla"><label>Nombre *<input name="nombre" required maxlength="120" value="' + v('nombre') + '"></label>' +
      '<label>Tipo<select name="tipo">' + CAT.opciones(CAT.st.cat.provTipos, x.tipo) + '</select></label>' +
      '<label>Contacto<input name="contacto" maxlength="120" value="' + v('contacto') + '"></label>' +
      '<label>Teléfono / WhatsApp<input name="telefono" inputmode="tel" value="' + v('telefono') + '"></label>' +
      '<label>Correo<input name="correo" type="email" value="' + v('correo') + '"></label>' +
      '<label>Ciudad<input name="ciudad" maxlength="80" value="' + v('ciudad') + '"></label></div>' +
      '<label>Sitio o enlace<input name="enlace" type="url" placeholder="https://" value="' + v('enlace') + '"></label>' +
      '<label>Condiciones (precio por pieza, mínimos, envíos, reventa autorizada…)<textarea name="condiciones" rows="3">' + v('condiciones') + '</textarea></label>' +
      '<label>Notas<textarea name="notas" rows="2">' + v('notas') + '</textarea></label>' +
      '<label class="check"><input type="checkbox" name="activo"' + (x.activo ? ' checked' : '') + ' style="accent-color:var(--ambar)"> Activo</label>' +
      (!nuevo ? '<p class="ayuda">' + x.productos + ' producto(s) con este proveedor.</p>' : '') +
      '<p class="error" id="errProv"></p><div class="acciones"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" id="cProv">Cancelar</button>' +
      (!nuevo && x.productos ? '<button class="btn sec" type="button" id="verProds">Ver productos</button>' : '') +
      (!nuevo && CAT.st.cat.puede.borrar ? '<button class="btn peligro" type="button" id="bProv">Eliminar</button>' : '') + '</div></form>', { ancha: true });
    const f = $('#fProv', m), ini = CAT.firmaForm(f);
    const canc = function () { CAT.descartar(f, ini); };
    CAT.st.alCancelarModal = canc; $('#cProv', m).onclick = canc;
    if ($('#verProds', m)) $('#verProds', m).onclick = function () { CAT.cerrarModal(); CAT.irProductos(); setTimeout(function () { const q = document.getElementById('fQ'); if (q) { q.value = x.nombre; q.oninput(); } }, 400); };
    if ($('#bProv', m)) $('#bProv', m).onclick = async function () {
      if (!(await CAT.confirmarBorrado('el proveedor ' + x.id))) return;
      try { await CAT.llamar('catProveedorBorrar', x.id); CAT.cerrarModal(); await CAT.refrescarCfg(); CAT.aviso('Proveedor eliminado.', 'ok'); CAT.recargar(); }
      catch (e) { CAT.aviso(e.message, 'mal'); }
    };
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const d = CAT.datosForm(f); d.id = x.id || ''; d.activo = d.activo === 'SI';
      const b = $('button[type=submit]', f); b.disabled = true;
      try { await CAT.llamar('catProveedorGuardar', d); CAT.cerrarModal(); await CAT.refrescarCfg(); CAT.aviso('Proveedor guardado.', 'ok'); CAT.recargar(); }
      catch (e) { $('#errProv', m).textContent = e.message; b.disabled = false; }
    };
  }
})();

/* ═════════════ Ajustes (solo admin) ═════════════ */
(function () {
  const $ = CAT.$, esc = CAT.esc;
  CAT.registrarVista('ajustes', {
    titulo: 'Ajustes', icono: 'a', orden: 90, soloAdmin: true,
    render: async function (cont, p, vigente) {
      const e = await CAT.llamar('catTnEstado');
      if (!vigente()) return;
      const cats = CAT.st.cat.categorias;
      cont.innerHTML = '<div class="encabezado"><div><p class="eyebrow">Solo administrador</p><h1>Ajustes del catálogo</h1></div>' +
        '<div class="acciones"><a class="btn sec" href="' + esc(CAT.url(CAT.st.cat.hoja)) + '" target="_blank" rel="noopener">Abrir la hoja de Google</a></div></div>' +
        '<div class="graficas">' +
        '<div class="panel"><div class="panel-cab"><h3>Tiendanube (editar productos)</h3></div>' +
          (e.conectado ? '<div class="estado-tn"><span class="punto-tn ok"></span><b>Conectado a ' + esc(e.tienda) + '</b> <small class="ayuda">tienda ' + esc(e.numero) + (e.desde ? ' · desde ' + esc(CAT.fecha(e.desde, false)) : '') + '</small></div>' +
            '<div class="acciones"><button class="btn sec" id="btnCambiar" type="button">Cambiar clave</button><button class="btn peligro" id="btnDesc" type="button">Desconectar</button></div>'
            : '<p class="ayuda">El CRM ya lee pedidos, pero para crear y editar productos el catálogo necesita su propia clave con permiso de <b>Editar productos</b>.</p>' +
              '<ol class="pasos-txt"><li>En Tiendanube entra a <b>Mis aplicaciones → Apps a medida</b>.</li><li>Crea la app «SEGES Catálogo» con los permisos <b>Leer productos</b> y <b>Editar productos</b>.</li><li>Instálala y copia el <b>token de acceso</b>.</li><li>Pégalo aquí abajo.</li></ol>') +
          '<form id="fTn" class="' + (e.conectado ? 'oculto' : '') + '" style="margin-top:12px"><div class="rejilla"><label>Número de tienda<input name="tienda" inputmode="numeric" value="' + esc(e.numero) + '"></label>' +
          '<label>Token de acceso<input name="clave" type="password" autocomplete="off" required></label></div>' +
          '<p class="error" id="errTn"></p><div class="acciones"><button class="btn" type="submit">Conectar</button></div></form></div>' +
        '<div class="panel"><div class="panel-cab"><h3>Importar desde Tiendanube</h3></div>' +
          '<p class="ayuda">Trae al catálogo los productos que ya están en la tienda y que todavía no están aquí (por SKU). No cambia nada en Tiendanube. Después captura costo y proveedor.</p>' +
          '<label>Marcar los importados como<select id="impTipo">' + CAT.opciones([{ v: 'Dropshipping', t: 'Dropshipping' }, { v: 'SEGES', t: 'SEGES (inventario propio)' }], 'Dropshipping') + '</select></label>' +
          '<div class="acciones"><button class="btn" id="btnImp" type="button"' + (e.conectado ? '' : ' disabled') + '>Importar</button></div><div id="impRes"></div></div>' +
        '<div class="panel ancha"><div class="panel-cab"><h3>Categorías y prefijos de SKU</h3><small class="ayuda">SKU = prefijo + número que empieza en 2 (HO20001)</small></div>' +
          '<div class="chips">' + cats.map(function (c) { return '<span class="chip">' + esc(c.prefijo) + ' · ' + esc(c.nombre) + '</span>'; }).join('') + '</div>' +
          '<form id="fCat" class="rejilla" style="margin-top:14px;align-items:end"><label>Nueva categoría<input name="nombre" maxlength="40" required></label>' +
          '<label>Prefijo (2 letras)<input name="prefijo" maxlength="2" required style="text-transform:uppercase"></label>' +
          '<div class="acciones" style="margin-bottom:12px"><button class="btn sec" type="submit">Agregar</button></div></form>' +
          '<p class="ayuda">Para renombrar o desactivar una categoría, hazlo en la pestaña «Categorias» de la hoja.</p></div>' +
        '</div>';
      $('#fTn', cont).onsubmit = async function (ev) {
        ev.preventDefault();
        const b = $('button', this); b.disabled = true; $('#errTn').textContent = '';
        try { const r = await CAT.llamar('catTnConectar', CAT.datosForm(this)); CAT.aviso('Conectado a ' + r.tienda, 'ok'); await CAT.refrescarCfg(); CAT.recargar(); }
        catch (err) { $('#errTn').textContent = err.message; b.disabled = false; }
      };
      if ($('#btnCambiar', cont)) $('#btnCambiar', cont).onclick = function () { $('#fTn').classList.remove('oculto'); this.disabled = true; };
      if ($('#btnDesc', cont)) $('#btnDesc', cont).onclick = async function () {
        if (!(await CAT.confirmar('El catálogo dejará de enviar productos a Tiendanube hasta que lo conectes de nuevo. El CRM no se ve afectado.', 'Desconectar', { no: 'Cancelar' }))) return;
        try { await CAT.llamar('catTnDesconectar'); await CAT.refrescarCfg(); CAT.recargar(); } catch (err) { CAT.aviso(err.message, 'mal'); }
      };
      $('#btnImp', cont).onclick = async function () {
        const tipo = $('#impTipo').value;
        if (!(await CAT.confirmar('Se agregarán al catálogo los productos de Tiendanube que no estén aquí, marcados como ' + tipo + '.', 'Importar', { peligro: false, no: 'Cancelar' }))) return;
        const b = this; b.disabled = true; $('#impRes').innerHTML = CAT.cargando('Importando…', true);
        try {
          const r = await CAT.llamar('catTnImportar', tipo);
          $('#impRes').innerHTML = '<p>' + r.nuevos + ' importados, ' + r.enlazados + ' enlazados, ' + r.yaEstaban + ' ya estaban' + (r.sinSku ? ', ' + r.sinSku + ' sin SKU (no se importan)' : '') + '.</p>' +
            (r.conflictos.length ? '<p class="error">SKU repetido con otro nombre (revisar): ' + esc(r.conflictos.join(', ')) + '</p>' : '');
          CAT.olvidarProductos();
        } catch (err) { $('#impRes').innerHTML = '<p class="error">' + esc(err.message) + '</p>'; }
        b.disabled = false;
      };
      $('#fCat', cont).onsubmit = async function (ev) {
        ev.preventDefault();
        try { await CAT.llamar('catCategoriaGuardar', CAT.datosForm(this)); await CAT.refrescarCfg(); CAT.aviso('Categoría agregada.', 'ok'); CAT.recargar(); }
        catch (err) { CAT.aviso(err.message, 'mal'); }
      };
    }
  });
})();

document.addEventListener('DOMContentLoaded', CAT.arrancar);
