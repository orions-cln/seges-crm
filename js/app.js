/* SEGES – CRM v6 · Núcleo: sesión, navegación, ventanas, utilidades. */
const CRM = (function () {
  const st = { token: null, usuario: null, cfg: null, vistas: [], actual: null, params: {} };
  const $ = function (s, el) { return (el || document).querySelector(s); };
  const $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

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
      if (m.indexOf('SESION_EXPIRADA') >= 0) {
        guardarToken(null);
        mostrarLogin();
        throw new Error('Tu sesión expiró. Vuelve a entrar.');
      }
      throw new Error(m.replace(/^Error:\s*/, ''));
    }
  }

  /* ───────── avisos y ventanas ───────── */
  let temporizadorAviso;
  function aviso(msg, tipo) {
    const el = $('#aviso');
    el.textContent = msg;
    el.className = 'aviso ' + (tipo || '');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () { el.classList.add('oculto'); }, tipo === 'mal' ? 6000 : 4000);
  }

  /** Animación de carga: 3 estrellas en carrusel. */
  function cargando(txt, chico) {
    return '<div class="cargando' + (chico ? ' chico' : '') + '"><div class="estrellas" aria-hidden="true"><i>★</i><i>★</i><i>★</i></div>' +
      (txt ? '<span>' + esc(txt) + '</span>' : '') + '</div>';
  }

  /**
   * Abre la ventana. opciones: { ancha, alCancelar } — si hay alCancelar, el fondo y Esc lo llaman en vez de cerrar directo.
   */
  function modal(html, opciones) {
    opciones = opciones || {};
    st.alCancelarModal = opciones.alCancelar || null;
    $('#modalCaja').className = 'modal-caja' + (opciones.ancha ? ' ancha' : '');
    $('#modalCuerpo').innerHTML = html;
    $('#modal').classList.remove('oculto');
    return $('#modalCuerpo');
  }
  function cerrarModal() { st.alCancelarModal = null; $('#modal').classList.add('oculto'); $('#modalCuerpo').innerHTML = ''; }
  function modalAbierto() { return !$('#modal').classList.contains('oculto'); }

  /** Confirmación en una capa propia (no borra el formulario abierto). Devuelve true/false. */
  let resolverConfirma = null;
  function confirmar(texto, etiquetaSi, opciones) {
    opciones = opciones || {};
    return new Promise(function (ok) {
      if (resolverConfirma) resolverConfirma(false);
      resolverConfirma = ok;
      const c = $('#confirmaCuerpo');
      c.innerHTML = (opciones.titulo ? '<h2>' + esc(opciones.titulo) + '</h2>' : '') + '<p>' + esc(texto) + '</p>' +
        (opciones.casilla ? '<label class="check" style="margin-top:14px"><input type="checkbox" id="cfCasilla"> ' + esc(opciones.casilla) + '</label>' : '') +
        '<div class="acciones">' +
        '<button class="btn ' + (opciones.peligro === false ? '' : 'peligro lleno') + '" id="cfSi" type="button">' + esc(etiquetaSi || 'Sí') + '</button>' +
        '<button class="btn sec" id="cfNo" type="button">' + esc(opciones.no || 'No') + '</button></div>';
      $('#confirma').classList.remove('oculto');
      const si = $('#cfSi', c);
      if (opciones.casilla) { si.disabled = true; $('#cfCasilla', c).onchange = function () { si.disabled = !this.checked; }; }
      const fin = function (v) { $('#confirma').classList.add('oculto'); c.innerHTML = ''; resolverConfirma = null; ok(v); };
      si.onclick = function () { fin(true); };
      $('#cfNo', c).onclick = function () { fin(false); };
      (opciones.casilla ? $('#cfNo', c) : si).focus();
    });
  }
  function cancelarConfirma() { if (resolverConfirma) { $('#confirma').classList.add('oculto'); $('#confirmaCuerpo').innerHTML = ''; const r = resolverConfirma; resolverConfirma = null; r(false); } }

  /** Cancelar un formulario: pregunta dos veces si hay algo escrito. */
  async function descartar(form, inicial) {
    const sucio = form && inicial !== undefined && firmaForm(form) !== inicial;
    if (sucio) {
      if (!(await confirmar('¿Cancelar? Lo que escribiste no se guardará.', 'Sí, cancelar', { no: 'Seguir editando' }))) return false;
      if (!(await confirmar('Confírmalo otra vez: se descartan los cambios.', 'Descartar', { no: 'Volver', titulo: '¿Seguro?' }))) return false;
    }
    cerrarModal();
    return true;
  }
  function firmaForm(form) {
    const o = [];
    $$('input, select, textarea', form).forEach(function (el) { o.push(el.name + '=' + (el.type === 'checkbox' ? el.checked : el.value)); });
    return o.join('&');
  }

  /** Eliminar: pregunta dos veces, la segunda con casilla de confirmación. */
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
  /** Íconos de la barra lateral (trazo, heredan el color del texto). */
  const ICONOS = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.3c1.9.8 3 2.8 3 5.7"/>',
    folios: '<rect x="5" y="3.5" width="14" height="18" rx="2"/><path d="M9 3.5h6v3H9z"/><path d="M8.5 11h7M8.5 15h5"/>',
    respuestas: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    otro: '<circle cx="12" cy="12" r="8"/>'
  };
  function icono(id) {
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONOS[id] || ICONOS.otro) + '</svg>';
  }
  function pintarNav() {
    const nav = $('#nav');
    nav.innerHTML = visibles().map(function (v) {
      return '<button type="button" data-vista="' + esc(v.id) + '" title="' + esc(v.titulo) + '"><span class="ico">' + esc(v.icono || v.titulo[0].toLowerCase()) +
        '</span><span>' + esc(v.titulo) + '</span></button>';
    }).join('') + '<div class="pie">SEGES CRM · v8</div>';
    $$('button', nav).forEach(function (b) { b.onclick = function () { ir(b.dataset.vista); }; });
  }

  function hashDe(id, params) {
    const p = params || {};
    const sub = p.folio || p.id || '';
    return '#' + id + (sub ? '/' + encodeURIComponent(sub) : '');
  }
  function leerHash() {
    const h = decodeURIComponent((location.hash || '').slice(1));
    if (!h) return null;
    const i = h.indexOf('/');
    const id = i >= 0 ? h.slice(0, i) : h, sub = i >= 0 ? h.slice(i + 1) : '';
    const p = {};
    if (sub) { if (id === 'folios') p.folio = sub; else p.id = sub; }
    return { id: id, params: p };
  }

  let turno = 0;
  async function ir(id, params, sinHistorial) {
    const lista = visibles();
    const v = lista.find(function (x) { return x.id === id; }) || lista[0];
    if (!v) { $('#vista').innerHTML = '<p class="vacio">No hay módulos instalados.</p>'; return; }
    params = params || {};
    st.actual = v.id; st.params = params;
    if (!sinHistorial) {
      const h = hashDe(v.id, params);
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
    if (st.alSalir) st.alSalir();
  }

  function entrarListo(r) {
    guardarToken(r.token);
    st.usuario = r.usuario;
    st.cfg = r.cfg;
    $('#usrNombre').textContent = r.usuario.nombre;
    $('#usrRol').textContent = r.usuario.rol || 'agente';
    $('#usrInicial').textContent = String(r.usuario.nombre || '?').trim().charAt(0).toUpperCase();
    $('#login').classList.add('oculto');
    document.body.classList.add('dentro');
    pintarNav();
    const h = leerHash();
    if (h && hayVista(h.id)) ir(h.id, h.params, true);
    else ir(visibles()[0].id);
    if (st.alEntrar) st.alEntrar();
  }

  /* ───────── formatos ───────── */
  function fecha(isoTxt, conHora) {
    if (!isoTxt) return '';
    const d = new Date(isoTxt);
    if (isNaN(d)) return '';
    const op = { timeZone: zona(), day: '2-digit', month: 'short', year: 'numeric' };
    if (conHora !== false) { op.hour = '2-digit'; op.minute = '2-digit'; }
    return d.toLocaleString('es-MX', op);
  }
  function zona() { return (st.cfg && st.cfg.zona) || 'America/Mazatlan'; }
  function diaClave(isoTxt) {
    const d = new Date(isoTxt);
    return isNaN(d) ? '' : d.toLocaleDateString('en-CA', { timeZone: zona() });
  }
  function hace(isoTxt) {
    const ms = Date.now() - new Date(isoTxt).getTime();
    if (isNaN(ms)) return '';
    const m = Math.round(ms / 60000);
    if (m < 1) return 'ahora';
    if (m < 60) return 'hace ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'hace ' + h + ' h';
    const d = Math.round(h / 24);
    return 'hace ' + d + ' d';
  }

  function esCelular() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); }
  function waLink(tel, texto) {
    const d = String(tel || '').replace(/\D/g, '').slice(-10);
    if (d.length !== 10) return '';
    const lada = (st.cfg && st.cfg.lada) || '52';
    const txt = texto ? '&text=' + encodeURIComponent(texto) : '';
    return esCelular() ? 'whatsapp://send?phone=' + lada + d + txt : 'https://web.whatsapp.com/send?phone=' + lada + d + txt;
  }

  function datosForm(form) {
    const o = {};
    $$('input[name], select[name], textarea[name]', form).forEach(function (el) {
      if (el.type === 'checkbox') { if (el.checked) o[el.name] = 'on'; return; }
      o[el.name] = el.value;
    });
    return o;
  }
  /** "Área / Causa / Subcausa" → "Subcausa". */
  function tipNombre(m) { m = String(m || ''); const i = m.lastIndexOf(' / '); return i >= 0 ? m.slice(i + 3) : m; }
  function opciones(lista, actual, vacia) {
    return (vacia !== undefined ? '<option value="">' + esc(vacia) + '</option>' : '') + (lista || []).map(function (x) {
      return '<option' + (x === actual ? ' selected' : '') + '>' + esc(x) + '</option>';
    }).join('');
  }
  function chipPrioridad(p) {
    p = p || 'Normal';
    return '<span class="chip p-' + esc(p.toLowerCase()) + '">' + esc(p) + '</span>';
  }
  const COLOR_ESTADO = ['var(--azul)', 'var(--ambar)', 'var(--violeta)', 'var(--turq)', 'var(--verde)', 'var(--ayuda)'];
  function colorEstado(e) {
    const i = ((st.cfg && st.cfg.estados) || []).indexOf(e);
    return COLOR_ESTADO[i >= 0 ? i % COLOR_ESTADO.length : 0];
  }
  /* ───────── Tiendanube ───────── */
  function tnActivo() { return !!(st.cfg && st.cfg.tienda); }
  function dinero(v, moneda) {
    const n = Number(v);
    if (isNaN(n) || v === '') return '';
    return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (moneda && moneda !== 'MXN' ? ' ' + moneda : '');
  }
  /** Tarjeta de un pedido de Tiendanube. opciones: { compacto, asignar } */
  function pedidoHtml(p, opciones) {
    opciones = opciones || {};
    const cPago = p.pagado ? 'ok' : (/reembols|anulad|contracargo|vencid|abandon/i.test(p.pago) ? 'mal' : 'alerta');
    const cEnvio = p.enviado ? 'ok' : (p.cancelado ? '' : 'alerta');
    const chips = '<div class="chips">' + (p.cancelado ? '<span class="chip mal">Cancelado</span>' : '') +
      '<span class="chip ' + cPago + '">' + esc(p.pago || 'Pago —') + '</span>' +
      '<span class="chip ' + cEnvio + '">' + esc(p.envio || 'Envío —') + '</span></div>';
    const cab = '<div class="ped-cab"><b>Pedido #' + esc(p.numero) + '</b><span>' + esc(fecha(p.fecha)) + '</span><b>' + esc(dinero(p.total, p.moneda)) + '</b></div>';
    if (opciones.compacto) {
      return '<div class="pedido compacto">' + cab + chips +
        '<small>' + esc(p.productos.map(function (x) { return x.cantidad + ' × ' + x.nombre; }).join(', ')) + '</small>' +
        '<div class="acciones" style="margin-top:6px">' +
          (opciones.asignar ? '<button class="btn chico" type="button" data-asignar="' + esc(p.numero) + '">Asignar a este folio</button>' : '') +
          '<a class="btn sec chico" href="' + esc(p.url) + '" target="_blank" rel="noopener">Ver en Tiendanube</a></div></div>';
    }
    return '<div class="pedido">' + cab + chips +
      '<ul class="ped-productos">' + p.productos.map(function (x) {
        return '<li><span>' + x.cantidad + ' × ' + esc(x.nombre) + '</span><span>' + esc(dinero(x.precio, p.moneda)) + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="datos">' +
        dato('Comprador', [p.nombre, p.correo, p.telefono].filter(String).join(' · ')) +
        (p.paqueteria ? dato('Envío', p.paqueteria + (p.ciudad ? ' · ' + p.ciudad : '')) : (p.ciudad ? dato('Ciudad', p.ciudad) : '')) +
        dato('Guía', p.guia ? (p.guiaUrl ? '<a href="' + esc(p.guiaUrl) + '" target="_blank" rel="noopener">' + esc(p.guia) + '</a>' : esc(p.guia)) : '', true) +
        (p.fechaPago ? dato('Pagado', fecha(p.fechaPago)) : '') +
        (p.fechaCancelado ? dato('Cancelado', fecha(p.fechaCancelado)) : '') +
      '</div>' +
      '<div class="acciones"><a class="btn sec chico" href="' + esc(p.url) + '" target="_blank" rel="noopener">Ver en Tiendanube</a></div></div>';
  }

  function esFinal(e) {
    const es = (st.cfg && st.cfg.estados) || [];
    return es.slice(es.length > 2 ? -2 : -1).indexOf(e) >= 0;
  }
  function chipEstado(e) {
    return '<span class="chip" style="border-color:' + colorEstado(e) + ';color:' + colorEstado(e) + '">' + esc(e) + '</span>';
  }
  function dato(etiqueta, valor, html, faltaSiVacio) {
    const vacio = !valor && valor !== 0;
    return '<div class="dato"><b>' + esc(etiqueta) + '</b><span' + (vacio && faltaSiVacio ? ' class="falta"' : '') + '>' +
      (vacio ? (faltaSiVacio ? 'Falta' : '—') : (html ? valor : esc(valor))) + '</span></div>';
  }

  /* ───────── arranque ───────── */
  async function arrancar() {
    $('#formLogin').onsubmit = async function (ev) {
      ev.preventDefault();
      const f = ev.target, btn = $('button', f);
      $('#loginError').textContent = '';
      btn.disabled = true;
      try {
        const d = datosForm(f);
        entrarListo(await llamarDirecto('entrar', d.correo, d.pin));
        f.reset();
      } catch (e) {
        $('#loginError').textContent = ((e && e.message) || String(e)).replace(/^Error:\s*/, '');
      } finally { btn.disabled = false; }
    };
    $('#btnSalir').onclick = async function () {
      if (!(await confirmar('¿Cerrar sesión?', 'Salir', { peligro: false, no: 'Cancelar' }))) return;
      try { await llamarDirecto('salir', st.token); } catch (e) {}
      guardarToken(null); st.usuario = null; mostrarLogin();
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
      if (!st.usuario) return;
      const h = leerHash();
      if (h && hayVista(h.id)) ir(h.id, h.params, true);
    });

    $('#vista').innerHTML = '';
    try {
      const r = await llamarDirecto('iniciar', leerToken());
      r.login ? mostrarLogin() : entrarListo(r);
    } catch (e) {
      mostrarLogin();
      $('#loginError').textContent = 'No pude conectar: ' + ((e && e.message) || e);
    }
  }

  return { st: st, $: $, $$: $$, esc: esc, llamar: llamar, aviso: aviso, cargando: cargando, modal: modal, cerrarModal: cerrarModal,
           confirmar: confirmar, descartar: descartar, firmaForm: firmaForm, confirmarBorrado: confirmarBorrado,
           registrarVista: registrarVista, hayVista: hayVista, ir: ir, recargar: recargar, esAdmin: esAdmin, esJefe: esJefe,
           fecha: fecha, diaClave: diaClave, hace: hace, waLink: waLink, datosForm: datosForm, opciones: opciones, tipNombre: tipNombre,
           chipPrioridad: chipPrioridad, chipEstado: chipEstado, colorEstado: colorEstado, esFinal: esFinal, dato: dato, arrancar: arrancar,
           tnActivo: tnActivo, dinero: dinero, pedidoHtml: pedidoHtml };
})();

/* ═════════════ Buscador general y notificaciones (cabecera) ═════════════ */
(function () {
  const $ = CRM.$, esc = CRM.esc;
  let tBusca, tNotif, ultimas = [];

  function cerrarBusca() { $('#buscaRes').classList.add('oculto'); }
  async function buscar(q) {
    const caja = $('#buscaRes');
    if (q.trim().length < 2) { cerrarBusca(); return; }
    caja.innerHTML = CRM.cargando('', true);
    caja.classList.remove('oculto');
    try {
      const r = await CRM.llamar('buscarGlobal', q);
      if ($('#buscaGlobal').value !== q) return;
      let html = '';
      if (r.clientes.length) html += '<h4>Clientes</h4>' + r.clientes.map(function (c) {
        return '<button class="res-item" type="button" data-cli="' + esc(c.id) + '"><span>' + esc(c.nombre || '(sin nombre)') +
          '</span><small>' + esc(c.id) + ' · ' + esc(c.telefono || c.correo) + '</small></button>';
      }).join('');
      if (r.folios.length) html += '<h4>Folios</h4>' + r.folios.map(function (t) {
        return '<button class="res-item" type="button" data-folio="' + esc(t.folio) + '"><span><span class="mono">' + esc(t.folio) + '</span> · ' + esc(t.asunto) +
          '</span><small>' + esc(t.cliente) + ' · ' + esc(t.estado) + '</small></button>';
      }).join('');
      const conTn = CRM.tnActivo() && q.trim().length >= 3;
      caja.innerHTML = (html || (conTn ? '' : '<p class="vacio">Sin resultados para «' + esc(q) + '».</p>')) +
        (conTn ? '<div id="buscaTn"><h4>En Tiendanube</h4>' + CRM.cargando('', true) + '</div>' : '');
      enlazar(caja);
      if (!conTn) return;
      let tn = [];
      try { tn = await CRM.llamar('tnBuscarClientes', q); } catch (e) { tn = null; }
      const box = $('#buscaTn', caja);
      if (!box || $('#buscaGlobal').value !== q) return;
      const ya = r.clientes.map(function (c) { return c.id; });
      const fallo = tn === null;
      tn = (tn || []).filter(function (x) { return ya.indexOf(x.idCrm) < 0; });
      box.innerHTML = fallo ? '<p class="ayuda" style="padding:0 10px">No pude consultar Tiendanube.</p>' : '<h4>En Tiendanube</h4>' + (tn.length ? tn.map(function (x) {
        return '<button class="res-item" type="button" ' + (x.idCrm ? 'data-cli="' + esc(x.idCrm) + '"' : 'data-tn="' + esc(x.tnId) + '"') + '><span>' +
          esc(x.nombre || x.correo) + '</span><small>' + (x.idCrm ? 'Ya en el CRM · ' + esc(x.idCrm) : 'Importar · ' + esc(x.correo || x.telefono)) + '</small></button>';
      }).join('') : '<p class="ayuda" style="padding:0 10px">Sin coincidencias en la tienda.</p>');
      if (!html && !tn.length) box.insertAdjacentHTML('beforebegin', '<p class="vacio">Sin resultados para «' + esc(q) + '».</p>');
      enlazar(box);
    } catch (e) { caja.innerHTML = '<p class="error" style="padding:10px">' + esc(e.message) + '</p>'; }
  }
  function enlazar(cont) {
    CRM.$$('.res-item', cont).forEach(function (b) {
      b.onclick = async function () {
        if (b.dataset.tn) {
          b.disabled = true; b.querySelector('small').textContent = 'Importando…';
          try {
            const r = await CRM.llamar('tnImportarCliente', b.dataset.tn);
            CRM.aviso(r.nuevo ? 'Cliente ' + r.id + ' importado de Tiendanube.' : 'Ya existía como ' + r.id + '.');
            cerrarBusca(); $('#buscaGlobal').value = '';
            CRM.ir('clientes', { id: r.id });
          } catch (e) { CRM.aviso(e.message, 'mal'); b.disabled = false; }
          return;
        }
        cerrarBusca(); $('#buscaGlobal').value = '';
        if (b.dataset.cli) CRM.ir('clientes', { id: b.dataset.cli }); else CRM.ir('folios', { folio: b.dataset.folio });
      };
    });
  }

  /* Notificaciones: se calculan en el servidor; "leído" se guarda en este navegador. */
  function claveLeidas() { return 'crmLeidas:' + ((CRM.st.usuario && CRM.st.usuario.correo) || ''); }
  function leidas() { try { return JSON.parse(localStorage.getItem(claveLeidas()) || '[]'); } catch (e) { return []; } }
  function guardarLeidas(a) { try { localStorage.setItem(claveLeidas(), JSON.stringify(a.slice(-400))); } catch (e) {} }
  function claveN(n) { return n.tipo + '|' + n.folio + '|' + n.fecha; }
  function marcar(lista) { const l = leidas(); lista.forEach(function (n) { const k = claveN(n); if (l.indexOf(k) < 0) l.push(k); }); guardarLeidas(l); }

  async function cargarNotif() {
    if (!CRM.st.usuario) return;
    try { ultimas = await CRM.llamar('notificaciones'); } catch (e) { return; }
    pintarGlobo();
    if (!$('#panelNotif').classList.contains('oculto')) pintarPanel();
  }
  function pintarGlobo() {
    const l = leidas();
    const n = ultimas.filter(function (x) { return l.indexOf(claveN(x)) < 0; }).length;
    const g = $('#globo');
    g.textContent = n > 9 ? '9+' : String(n);
    g.classList.toggle('oculto', !n);
  }
  function pintarPanel() {
    const p = $('#panelNotif'), l = leidas();
    p.innerHTML = '<header><b>Notificaciones</b><button class="btn-link" type="button" id="nTodas">Marcar todo como leído</button></header>' +
      (ultimas.length ? ultimas.map(function (n, i) {
        const nueva = l.indexOf(claveN(n)) < 0;
        return '<button class="notif t-' + esc(n.tipo) + (nueva ? ' nueva' : '') + '" type="button" data-i="' + i + '"><i></i><span>' + esc(n.texto) +
          '<small>' + esc(n.folio) + ' · ' + esc(CRM.hace(n.fecha) || CRM.fecha(n.fecha)) + '</small></span></button>';
      }).join('') : '<p class="vacio">Todo en orden. No hay pendientes.</p>');
    $('#nTodas', p).onclick = function () { marcar(ultimas); pintarGlobo(); pintarPanel(); };
    CRM.$$('.notif', p).forEach(function (b) {
      b.onclick = function () {
        const n = ultimas[Number(b.dataset.i)];
        marcar([n]); pintarGlobo();
        p.classList.add('oculto');
        CRM.ir('folios', { folio: n.folio });
      };
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const q = $('#buscaGlobal');
    q.addEventListener('input', function () { clearTimeout(tBusca); tBusca = setTimeout(function () { buscar(q.value); }, 300); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; cerrarBusca(); } });
    q.addEventListener('focus', function () { if (q.value.trim().length >= 2 && $('#buscaRes').innerHTML) $('#buscaRes').classList.remove('oculto'); });
    $('#btnCampana').onclick = function (e) {
      e.stopPropagation();
      const p = $('#panelNotif');
      if (p.classList.toggle('oculto')) return;
      pintarPanel();
      cargarNotif();
    };
    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.buscador')) cerrarBusca();
      if (!e.target.closest('#panelNotif') && !e.target.closest('#btnCampana')) $('#panelNotif').classList.add('oculto');
    });
  });

  CRM.st.alEntrar = function () { cargarNotif(); clearInterval(tNotif); tNotif = setInterval(cargarNotif, 120000); };
  CRM.st.alSalir = function () { clearInterval(tNotif); ultimas = []; $('#globo').classList.add('oculto'); $('#panelNotif').classList.add('oculto'); };
  CRM.notificacionesRefrescar = cargarNotif;
})();

/* ═════════════ Inicio (panel con gráficas) ═════════════ */
(function () {
  const $ = CRM.$, esc = CRM.esc;

  CRM.registrarVista('inicio', {
    titulo: 'Inicio', orden: 10,
    render: async function (cont, p, vigente) {
      const t = await CRM.llamar('tablero');
      if (!vigente()) return;
      const pendNoUrg = Math.max(0, t.abiertos - t.urgentes);
      const hora = new Date().toLocaleString('es-MX', { timeZone: CRM.st.cfg.zona, hour: 'numeric', hour12: false });
      const saludo = hora < 12 ? 'Buenos días' : (hora < 19 ? 'Buenas tardes' : 'Buenas noches');
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Panel</p><h1>' + esc(saludo) + ', ' + esc(String(CRM.st.usuario.nombre).split(' ')[0]) + '</h1></div>' +
        '<div class="acciones"><button class="btn" id="iNuevo" type="button">+ Nuevo folio</button><button class="btn sec" id="iRec" type="button">Actualizar</button></div></div>' +
        '<div class="kpis">' +
          kpi('pend', t.abiertos, 'Pendientes', 'var(--ambar)') +
          kpi('urg', t.urgentes, 'Urgentes pendientes', 'var(--rojo)') +
          kpi('venc', t.vencidos, 'Vencidos (fuera de tiempo)', 'var(--rojo)') +
          kpi('aten', t.atendidos, 'Atendidos', 'var(--verde)') +
          kpi('mios', t.misAbiertos, 'Mis folios abiertos', 'var(--azul)') +
          kpi('hoy', t.resueltosHoy, 'Resueltos hoy', 'var(--turq)') +
        '</div>' +
        '<div class="graficas">' +
          '<div class="panel"><div class="panel-cab"><h2>Últimos 14 días</h2><div class="leyenda"><span><i style="background:var(--azul)"></i>Creados</span>' +
            '<span><i style="background:var(--verde)"></i>Resueltos</span></div></div>' + barrasDias(t.dias) + '</div>' +
          '<div class="panel"><div class="panel-cab"><h2>Atendidos y pendientes</h2></div>' +
            dona([{ n: 'Atendidos', v: t.atendidos, c: 'var(--verde)' }, { n: 'Pendientes', v: pendNoUrg, c: 'var(--ambar)' },
                  { n: 'Urgentes pendientes', v: t.urgentes, c: 'var(--rojo)' }], t.total, 'folios') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h2>Folios por estado</h2></div>' +
            barrasH(CRM.st.cfg.estados.map(function (e) { return { n: e, v: t.porEstado[e] || 0, c: CRM.colorEstado(e) }; }), 'estado') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h2>Urgentes pendientes</h2><span class="chip p-urgente">' + t.urgentes + '</span></div>' +
            (t.urgentesLista.length ? '<div class="lista">' + t.urgentesLista.map(function (u) {
              return '<button class="tarjeta" type="button" data-folio="' + esc(u.folio) + '"><div class="cab-t"><strong>' + esc(u.asunto) +
                '</strong><span class="mono">' + esc(u.folio) + '</span></div><span>' + esc(u.cliente) + ' · ' + esc(u.estado) + ' · ' + esc(CRM.hace(u.creado)) + '</span></button>';
            }).join('') + '</div>' : '<p class="vacio">Sin urgentes pendientes.</p>') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h2>Pendientes por área</h2></div>' +
            barrasH(orden(t.porArea).map(function (x) { return { n: x[0], v: x[1], c: 'var(--azul)' }; }), 'area') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h2>Carga por persona</h2><span class="ayuda" style="margin:0">abiertos</span></div>' +
            barrasH(orden(t.porAgente).map(function (x) { return { n: x[0], v: x[1], c: 'var(--violeta)' }; }), 'atendio') + '</div>' +
        '</div>';
      $('#iNuevo', cont).onclick = function () { CRM.nuevoFolio(); };
      $('#iRec', cont).onclick = function () { CRM.recargar(); };
      const filtros = { pend: {}, urg: { prioridad: 'Urgente' }, venc: { semaforo: 'vencido' }, aten: { soloCerrados: true },
                        mios: { atendio: CRM.st.usuario.nombre }, hoy: { soloCerrados: true } };
      CRM.$$('.kpi', cont).forEach(function (b) { b.onclick = function () { CRM.irFolios(filtros[b.dataset.k]); }; });
      CRM.$$('.tarjeta', cont).forEach(function (b) { b.onclick = function () { CRM.ir('folios', { folio: b.dataset.folio }); }; });
      CRM.$$('[data-filtro]', cont).forEach(function (b) {
        b.onclick = function () { const f = {}; f[b.dataset.filtro] = b.dataset.valor; if (b.dataset.filtro === 'estado') f.soloEstado = b.dataset.valor; CRM.irFolios(f); };
      });
    }
  });

  function kpi(k, v, txt, color) {
    return '<button class="kpi" type="button" data-k="' + k + '" style="--c:' + color + '"><b>' + esc(v) + '</b><span>' + esc(txt) + '</span></button>';
  }
  function orden(o) { return Object.keys(o || {}).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }

  function barrasDias(dias) {
    const W = 640, H = 200, pi = 26, pb = 24, pt = 10;
    const max = Math.max(1, Math.max.apply(null, dias.map(function (d) { return Math.max(d.creados, d.resueltos); })));
    const paso = Math.ceil(max / 4);
    const tope = paso * 4;
    const ancho = (W - pi) / dias.length, bw = Math.min(14, ancho / 3);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Creados y resueltos por día">';
    for (let i = 0; i <= 4; i++) {
      const y = pt + (H - pt - pb) * (1 - i / 4);
      s += '<line x1="' + pi + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#263052" stroke-width="1"/>' +
           '<text x="' + (pi - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (paso * i) + '</text>';
    }
    dias.forEach(function (d, i) {
      const x = pi + ancho * i + ancho / 2;
      const alto = function (v) { return (H - pt - pb) * v / tope; };
      const hc = alto(d.creados), hr = alto(d.resueltos);
      s += '<rect x="' + (x - bw - 1) + '" y="' + (H - pb - hc) + '" width="' + bw + '" height="' + hc + '" rx="3" fill="#6E9BE8"><title>' + d.dia + ': ' + d.creados + ' creados</title></rect>' +
           '<rect x="' + (x + 1) + '" y="' + (H - pb - hr) + '" width="' + bw + '" height="' + hr + '" rx="3" fill="#3FB984"><title>' + d.dia + ': ' + d.resueltos + ' resueltos</title></rect>';
      if (i % 2 === 0 || dias.length <= 7) s += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">' + d.dia.slice(8) + '/' + d.dia.slice(5, 7) + '</text>';
    });
    return s + '</svg>';
  }

  function dona(segs, total, unidad) {
    const R = 54, C = 2 * Math.PI * R;
    const suma = segs.reduce(function (a, x) { return a + x.v; }, 0);
    let off = 0, s = '<svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Distribución de folios">' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#1E2849" stroke-width="20"/>';
    segs.forEach(function (x) {
      if (!x.v || !suma) return;
      const largo = C * x.v / suma;
      s += '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + x.c + '" stroke-width="20" stroke-dasharray="' + largo + ' ' + (C - largo) +
           '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"><title>' + esc(x.n) + ': ' + x.v + '</title></circle>';
      off += largo;
    });
    s += '<text x="70" y="68" text-anchor="middle" style="font-size:26px;font-weight:750;fill:#E6EAF3">' + total + '</text>' +
         '<text x="70" y="88" text-anchor="middle">' + esc(unidad) + '</text></svg>';
    return '<div class="dona-cont">' + s + '<div class="leyenda">' + segs.map(function (x) {
      const pct = suma ? Math.round(100 * x.v / suma) : 0;
      return '<span><i style="background:' + x.c + '"></i>' + esc(x.n) + '<b>' + x.v + '</b> <small>(' + pct + '%)</small></span>';
    }).join('') + '</div></div>';
  }

  function barrasH(items, filtro) {
    if (!items.length || !items.some(function (x) { return x.v; })) return '<p class="vacio">Sin datos todavía.</p>';
    const max = Math.max.apply(null, items.map(function (x) { return x.v; })) || 1;
    return '<div class="barras-h">' + items.map(function (x) {
      return '<div class="barra-h" style="--c:' + x.c + '"><span title="' + esc(x.n) + '">' +
        (filtro && x.v ? '<button class="btn-link" type="button" data-filtro="' + filtro + '" data-valor="' + esc(x.n) + '" style="color:var(--suave);font-weight:500">' + esc(x.n) + '</button>' : esc(x.n)) +
        '</span><div class="pista"><i style="width:' + (100 * x.v / max) + '%"></i></div><b>' + x.v + '</b></div>';
    }).join('') + '</div>';
  }
})();

/* ═════════════ Clientes ═════════════ */
(function () {
  const $ = CRM.$, esc = CRM.esc;
  let temporizador, ultimaQ = '';

  CRM.registrarVista('clientes', {
    titulo: 'Clientes', orden: 20,
    render: async function (cont, p, vigente) {
      if (p.id) return ficha(cont, p.id, vigente);
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Directorio</p><h1>Clientes</h1></div>' +
        '<div class="acciones"><button class="btn" id="btnNuevo" type="button">+ Nuevo</button></div></div>' +
        '<div class="filtros"><input id="qCli" type="search" placeholder="Buscar por nombre, teléfono, correo o número" autocomplete="off" value="' + esc(ultimaQ) + '"></div>' +
        '<div id="tablaCli">' + CRM.cargando('Cargando clientes…') + '</div>';
      $('#btnNuevo', cont).onclick = function () { formulario(null); };
      const q = $('#qCli', cont);
      q.oninput = function () { clearTimeout(temporizador); temporizador = setTimeout(function () { ultimaQ = q.value; tabla(q.value); }, 300); };
      await tabla(ultimaQ);
    }
  });

  function celda(v, mono) { return v ? '<td' + (mono ? ' class="mono"' : '') + '>' + esc(v) + '</td>' : '<td class="falta">Falta</td>'; }

  async function tabla(q) {
    const caja = $('#tablaCli');
    if (!caja) return;
    try {
      const r = await CRM.llamar('clientesBuscar', q || '');
      if (!$('#tablaCli')) return;
      caja.innerHTML = r.length ? '<div class="tabla-cont"><table><thead><tr><th>Número</th><th>Nombre</th><th>Teléfono</th><th>Correo</th>' +
        '<th class="ocultar-cel">Ciudad</th><th class="ocultar-cel">Actualizado</th></tr></thead><tbody>' +
        r.map(function (c) {
          return '<tr class="clic" data-id="' + esc(c.id) + '"><td class="mono">' + esc(c.id) + '</td>' + celda(c.nombre) + celda(c.telefono, true) + celda(c.correo) +
            (c.ciudad ? '<td class="ocultar-cel">' + esc(c.ciudad) + '</td>' : '<td class="ocultar-cel falta">Falta</td>') +
            '<td class="ocultar-cel"><small>' + esc(CRM.fecha(c.actualizado || c.alta, false)) + '</small></td></tr>';
        }).join('') + '</tbody></table></div>' + (r.length >= 100 ? '<p class="ayuda">Se muestran los 100 más recientes; usa la búsqueda para encontrar otros.</p>' : '')
        : '<div class="panel"><p class="vacio">' + (q ? 'Sin resultados para «' + esc(q) + '».' : 'Aún no hay clientes. Crea el primero con «+ Nuevo».') + '</p></div>';
      CRM.$$('tr.clic', caja).forEach(function (tr) { tr.onclick = function () { CRM.ir('clientes', { id: tr.dataset.id }); }; });
    } catch (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }

  function esAuto(c) { return /alta autom[aá]tica/i.test(c.notas || ''); }
  function faltantes(c) {
    return [['Nombre', c.nombre], ['Teléfono', c.telefono], ['Correo', c.correo], ['Ciudad', c.ciudad]]
      .filter(function (x) { return !x[1]; }).map(function (x) { return x[0]; });
  }

  async function ficha(cont, id, vigente) {
    const c = await CRM.llamar('clienteObtener', id);
    if (!vigente()) return;
    const wa = CRM.waLink(c.telefono, 'Hola ' + String(c.nombre || '').split(' ')[0] + ', te escribimos de SEGES.');
    const falta = faltantes(c);
    const auto = esAuto(c);
    cont.innerHTML =
      '<div class="encabezado"><div><p class="eyebrow"><button class="btn-link" id="volver" type="button">← Clientes</button> · <span class="mono">' + esc(c.id) + '</span></p>' +
        '<h1>' + (c.nombre ? esc(c.nombre) : '<span class="falta">Sin nombre</span>') + '</h1></div>' +
        '<div class="acciones">' +
          (wa ? '<a class="btn wa" id="btnWa" target="seges_whatsapp" rel="noopener" href="' + esc(wa) + '">Abrir WhatsApp</a>' : '<button class="btn wa" type="button" disabled title="Falta el teléfono">Abrir WhatsApp</button>') +
          '<button class="btn" id="btnFolio" type="button">+ Nuevo folio</button>' +
          '<button class="btn sec" id="btnEditar" type="button">Editar</button>' +
          (CRM.esJefe() ? '<button class="btn peligro" id="btnBorrar" type="button">Eliminar</button>' : '') +
        '</div></div>' +
      ((auto || falta.length) && falta.length ? '<div class="aviso-regla rojo">' + (auto ? 'Cliente dado de alta automáticamente. ' : '') +
        'Faltan datos: ' + esc(falta.join(', ')) + '. Complétalos con «Editar».</div>' : '') +
      '<div class="det">' +
        '<div class="panel"><h2>Datos del cliente</h2><div class="datos">' +
          CRM.dato('Número', '<span class="mono">' + esc(c.id) + '</span>', true) +
          CRM.dato('Nombre', c.nombre, false, true) +
          CRM.dato('Teléfono', c.telefono, false, true) +
          CRM.dato('Correo', c.correo, false, true) +
          CRM.dato('Ciudad', c.ciudad, false, true) +
          CRM.dato('Notas', c.notas) +
          CRM.dato('Alta', CRM.fecha(c.alta, false)) +
          CRM.dato('Folios', String(c.historial.length)) +
        '</div></div>' +
        '<div><div class="panel"><div class="panel-cab"><h2>Historial de casos</h2>' +
          (c.historial.length > 5 ? '<button class="btn-link" id="verTodos" type="button">Ver todos (' + c.historial.length + ')</button>' : '') + '</div>' +
          '<div id="hist"></div></div>' +
          (CRM.tnActivo() ? '<div class="panel"><div class="panel-cab"><h2>Pedidos en Tiendanube</h2><span id="tnGastado" class="ayuda" style="margin:0"></span></div>' +
            '<div id="tnPed">' + CRM.cargando('Consultando la tienda…', true) + '</div></div>' : '') +
        '</div>' +
      '</div>';
    const pintarHist = function (todos) {
      const h = todos ? c.historial : c.historial.slice(0, 5);
      $('#hist', cont).innerHTML = h.length ? '<div class="tabla-cont"><table><thead><tr><th>Folio</th><th>Asunto</th><th>Estado</th><th class="ocultar-cel">Prioridad</th>' +
        '<th class="ocultar-cel">Atiende</th><th>Fecha</th></tr></thead><tbody>' + h.map(function (t) {
          return '<tr class="clic" data-folio="' + esc(t.folio) + '"><td class="mono">' + esc(t.folio) + '</td><td>' + esc(t.asunto) + '<small>' + esc(CRM.tipNombre(t.motivo)) +
            '</small></td><td>' + CRM.chipEstado(t.estado) + '</td><td class="ocultar-cel">' + CRM.chipPrioridad(t.prioridad) + '</td><td class="ocultar-cel">' +
            esc(t.atendio || '—') + '</td><td><small>' + esc(CRM.fecha(t.creado)) + '</small></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="vacio">Sin casos todavía.</p>';
      CRM.$$('tr.clic', cont).forEach(function (tr) { tr.onclick = function () { CRM.ir('folios', { folio: tr.dataset.folio }); }; });
    };
    pintarHist(false);
    if ($('#verTodos', cont)) $('#verTodos', cont).onclick = function () {
      const todos = this.dataset.todos !== '1';
      this.dataset.todos = todos ? '1' : '';
      this.textContent = todos ? 'Ver menos' : 'Ver todos (' + c.historial.length + ')';
      pintarHist(todos);
    };
    $('#volver', cont).onclick = function () { CRM.ir('clientes'); };
    $('#btnEditar', cont).onclick = function () { formulario(c); };
    $('#btnFolio', cont).onclick = function () { CRM.nuevoFolio(c); };
    if ($('#btnBorrar', cont)) $('#btnBorrar', cont).onclick = function () { borrar(c); };
    if (CRM.tnActivo()) pedidosTn(c);
  }

  async function pedidosTn(c) {
    const box = $('#tnPed');
    if (!box) return;
    if (!c.correo) { box.innerHTML = '<p class="ayuda">Agrega el correo del cliente para ver sus pedidos de la tienda.</p>'; return; }
    try {
      const r = await CRM.llamar('tnPedidosCliente', c.id);
      if (!$('#tnPed') || CRM.st.params.id !== c.id) return;
      $('#tnGastado').textContent = r.enTienda && r.gastado ? 'Total comprado: ' + CRM.dinero(r.gastado) : '';
      box.innerHTML = r.pedidos.length ? '<div class="lista">' + r.pedidos.map(function (p) { return CRM.pedidoHtml(p, { compacto: true }); }).join('') + '</div>'
        : '<p class="vacio">' + (r.enTienda ? 'Tiene cuenta en la tienda, pero sin pedidos.' : 'No encontré compras con ' + esc(c.correo) + '.') + '</p>';
    } catch (e) { box.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }

  function formulario(c, alGuardar) {
    const nuevo = !c;
    c = c || {};
    const m = CRM.modal(
      '<p class="eyebrow">' + (nuevo ? 'Nuevo cliente' : 'Editar · ' + esc(c.id)) + '</p><h2>' + (nuevo ? 'Alta de cliente' : esc(c.nombre || 'Cliente')) + '</h2>' +
      '<form id="fCli" novalidate>' +
        '<label>Nombre *<input name="nombre" maxlength="120" required value="' + esc(c.nombre) + '"' + (c.id && !c.nombre ? ' class="falta"' : '') + '></label>' +
        '<div class="rejilla">' +
          '<label>Correo<input name="correo" type="email" maxlength="120" value="' + esc(c.correo) + '"></label>' +
          '<label>Teléfono (10 dígitos)<input name="telefono" inputmode="tel" maxlength="20" value="' + esc(c.telefono) + '"></label>' +
          '<label>Número de cliente<input readonly value="' + esc(c.id || 'Se asigna al guardar') + '"></label>' +
          '<label>Ciudad<input name="ciudad" maxlength="80" value="' + esc(c.ciudad) + '"></label>' +
        '</div>' +
        '<label>Notas<textarea name="notas" rows="3" maxlength="2000">' + esc(c.notas) + '</textarea></label>' +
        '<p class="ayuda">Necesita al menos teléfono o correo.</p>' +
        '<p id="fErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" id="fCancelar">Cancelar</button></div>' +
      '</form>', { alCancelar: function () { cancelar(); } });
    const f = $('#fCli', m), inicial = CRM.firmaForm(f);
    const cancelar = function () { CRM.descartar(f, inicial); };
    $('#fCancelar', m).onclick = cancelar;
    f.nombre.focus();
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const btn = $('button[type=submit]', f);
      $('#fErr', m).textContent = '';
      const d = CRM.datosForm(f);
      if (!d.nombre.trim()) { $('#fErr', m).textContent = 'Falta el nombre.'; return; }
      if (!d.telefono.trim() && !d.correo.trim()) { $('#fErr', m).textContent = 'Escribe al menos un teléfono o un correo.'; return; }
      if (c.id) d.id = c.id;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const r = await CRM.llamar('clienteGuardar', d);
        CRM.cerrarModal();
        CRM.aviso(r.nuevo ? 'Cliente ' + r.id + ' creado.' : 'Cambios guardados.');
        if (alGuardar) alGuardar(r.id); else CRM.ir('clientes', { id: r.id });
      } catch (e) { $('#fErr', m).textContent = e.message; btn.disabled = false; btn.textContent = 'Guardar'; }
    };
  }

  async function borrar(c) {
    if (c.historial.length) {
      CRM.aviso('No se puede eliminar: ' + (c.nombre || c.id) + ' tiene ' + c.historial.length + ' folio(s). Elimina primero sus folios.', 'mal');
      return;
    }
    if (!(await CRM.confirmarBorrado('al cliente ' + (c.nombre || '') + ' (' + c.id + ')'))) return;
    try {
      await CRM.llamar('clienteBorrar', c.id);
      CRM.aviso('Cliente eliminado.');
      CRM.ir('clientes');
    } catch (e) { CRM.aviso(e.message, 'mal'); }
  }

  CRM.clienteFormulario = formulario;
})();

/* ═════════════ Folios: Kanban, nuevo folio, seguimiento ═════════════ */
(function () {
  const $ = CRM.$, esc = CRM.esc;
  let temporizador;
  const filtro = { q: '', prioridad: '', atendio: '', canal: '', area: '', semaforo: '', soloEstado: '', soloCerrados: false };
  let personas = [];
  const POR_COLUMNA = 40;
  const TIPOS_CONTACTO = ['WhatsApp', 'Llamada', 'Correo enviado'];

  function rellenar(texto, t) {
    return String(texto || '')
      .replace(/\{nombre\}/g, String(t.cliente || '').split(' ')[0])
      .replace(/\{folio\}/g, t.folio)
      .replace(/\{pedido\}/g, t.pedido || 's/n')
      .replace(/\{motivo\}/g, CRM.tipNombre(t.motivo).toLowerCase());
  }
  async function respuestas() {
    if (!CRM.st.respuestas) CRM.st.respuestas = await CRM.llamar('respuestasListar', false);
    return CRM.st.respuestas;
  }
  function horasTxt(ms) {
    const h = Math.abs(ms) / 3600000;
    if (h < 1) return Math.round(h * 60) + ' min';
    if (h < 48) return Math.round(h) + ' h';
    return Math.round(h / 24) + ' d';
  }
  function semaforoTxt(t) {
    if (t.cerrado) return '';
    const ms = new Date(t.vence).getTime() - Date.now();
    if (isNaN(ms)) return '';
    return ms < 0 ? 'Vencido hace ' + horasTxt(ms) : 'Vence en ' + horasTxt(ms);
  }

  CRM.irFolios = function (f) {
    Object.keys(filtro).forEach(function (k) { filtro[k] = k === 'soloCerrados' ? false : ''; });
    Object.assign(filtro, f || {});
    CRM.ir('folios');
  };

  CRM.registrarVista('folios', {
    titulo: 'Folios', orden: 30,
    render: async function (cont, p, vigente) {
      if (p.folio) return detalle(cont, p.folio, vigente);
      const cfg = CRM.st.cfg;
      const areas = [];
      (cfg.tipificaciones || []).forEach(function (x) { if (areas.indexOf(x.area) < 0) areas.push(x.area); });
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Seguimiento</p><h1>Folios</h1></div>' +
        '<div class="acciones"><button class="btn" id="btnNuevo" type="button">+ Nuevo folio</button>' +
        '<button class="btn sec" id="btnRevisar" type="button">Revisar correo</button></div></div>' +
        '<div class="filtros">' +
          '<input id="fq" type="search" placeholder="Buscar folio, cliente, asunto, pedido…" value="' + esc(filtro.q) + '">' +
          '<select id="fPri">' + CRM.opciones(cfg.prioridades, filtro.prioridad, 'Prioridad: todas') + '</select>' +
          '<select id="fAt"><option value="">Atiende: todos</option></select>' +
          '<select id="fCanal">' + CRM.opciones(cfg.canales, filtro.canal, 'Canal: todos') + '</select>' +
          '<select id="fArea">' + CRM.opciones(areas, filtro.area, 'Área: todas') + '</select>' +
          '<select id="fSem"><option value="">Tiempo: todos</option><option value="vencido">Vencidos</option><option value="pronto">Por vencer</option></select>' +
          '<button class="btn-link" id="fLimpiar" type="button">Limpiar filtros</button>' +
        '</div>' +
        '<div class="resumen" id="resumen"></div>' +
        '<div id="tablero">' + CRM.cargando('Cargando folios…') + '</div>';
      $('#fSem', cont).value = filtro.semaforo;
      $('#btnNuevo', cont).onclick = function () { nuevoFolio(); };
      $('#btnRevisar', cont).onclick = async function () {
        const b = this; b.disabled = true; b.textContent = 'Revisando…';
        try {
          const r = await CRM.llamar('correoRevisarAhora');
          CRM.aviso(r.ocupado ? 'Ya se está revisando el correo; intenta en un minuto.' :
            (r.nuevos || r.respuestas ? 'Correo: ' + r.nuevos + ' folio(s) nuevo(s), ' + r.respuestas + ' respuesta(s).' : 'Sin correos nuevos.'));
          cargar(); CRM.notificacionesRefrescar();
        } catch (e) { CRM.aviso(e.message, 'mal'); }
        b.disabled = false; b.textContent = 'Revisar correo';
      };
      const enlazar = function (sel, k) { $(sel, cont).onchange = function () { filtro[k] = this.value; filtro.soloEstado = ''; filtro.soloCerrados = false; cargar(); }; };
      enlazar('#fPri', 'prioridad'); enlazar('#fAt', 'atendio'); enlazar('#fCanal', 'canal'); enlazar('#fArea', 'area'); enlazar('#fSem', 'semaforo');
      const q = $('#fq', cont);
      q.oninput = function () { clearTimeout(temporizador); temporizador = setTimeout(function () { filtro.q = q.value; cargar(); }, 300); };
      $('#fLimpiar', cont).onclick = function () { CRM.irFolios({}); };
      await cargar();
    }
  });

  async function cargar() {
    const caja = $('#tablero');
    if (!caja) return;
    const f = { estado: 'todos', q: filtro.q, prioridad: filtro.prioridad, atendio: filtro.atendio, canal: filtro.canal, area: filtro.area, semaforo: filtro.semaforo };
    try {
      const r = await CRM.llamar('ticketsListar', f);
      if (!$('#tablero')) return;
      r.casos.forEach(function (t) { if (t.atendio && personas.indexOf(t.atendio) < 0) personas.push(t.atendio); });
      if (CRM.st.usuario && personas.indexOf(CRM.st.usuario.nombre) < 0) personas.push(CRM.st.usuario.nombre);
      personas.sort();
      const fAt = $('#fAt');
      if (fAt) fAt.innerHTML = CRM.opciones(personas, filtro.atendio, 'Atiende: todos');
      pintar(caja, r);
    } catch (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }

  function pintar(caja, r) {
    const estados = CRM.st.cfg.estados;
    let casos = r.casos;
    if (filtro.soloCerrados) casos = casos.filter(function (t) { return t.cerrado; });
    const grupos = {};
    estados.forEach(function (e) { grupos[e] = []; });
    casos.forEach(function (t) { (grupos[t.estado] = grupos[t.estado] || []).push(t); });
    const visibles = filtro.soloEstado ? [filtro.soloEstado] : estados;
    const abiertos = casos.filter(function (t) { return !t.cerrado; }).length;
    $('#resumen').innerHTML =
      '<span><b>' + casos.length + '</b>en esta vista</span><span><b>' + abiertos + '</b>abiertos</span>' +
      '<span><b>' + r.conteo.total + '</b>folios en total</span><span><b style="color:var(--rojo)">' + r.conteo.urgentes + '</b>urgentes pendientes</span>' +
      '<span><b style="color:var(--rojo)">' + r.conteo.vencidos + '</b>vencidos</span>' +
      (filtro.soloEstado || filtro.soloCerrados ? '<button class="btn-link" id="verTodasCol" type="button">Ver todas las columnas</button>' : '');
    if ($('#verTodasCol')) $('#verTodasCol').onclick = function () { filtro.soloEstado = ''; filtro.soloCerrados = false; pintar(caja, r); };
    caja.innerHTML = '<div class="kanban">' + visibles.map(function (e) {
      const lista = grupos[e] || [];
      if (!CRM.esFinal(e)) lista.sort(function (a, b) {
        const pu = (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0);
        return pu || (a.vence > b.vence ? 1 : -1);
      });
      else lista.sort(function (a, b) { return a.actualizado < b.actualizado ? 1 : -1; });
      return '<section class="columna" style="--c:' + CRM.colorEstado(e) + '"><header><b>' + esc(e) + '</b><span>' + lista.length + '</span></header>' +
        '<div class="tarjetas">' + (lista.length ? lista.slice(0, POR_COLUMNA).map(tarjeta).join('') +
          (lista.length > POR_COLUMNA ? '<p class="mas">+' + (lista.length - POR_COLUMNA) + ' más · usa la búsqueda o los filtros</p>' : '')
          : '<p class="mas">Sin folios</p>') + '</div></section>';
    }).join('') + '</div>';
    CRM.$$('.tarjeta-folio', caja).forEach(function (b) { b.onclick = function () { CRM.ir('folios', { folio: b.dataset.folio }); }; });
  }

  function tarjeta(t) {
    const sem = semaforoTxt(t);
    return '<button class="tarjeta-folio' + (t.urgente && !t.cerrado ? ' urg' : '') + '" type="button" data-folio="' + esc(t.folio) + '">' +
      '<div class="fila1"><span class="folio">' + esc(t.folio) + '</span>' + CRM.chipPrioridad(t.prioridad) + '</div>' +
      '<strong>' + esc(t.asunto) + '</strong>' +
      '<div class="meta"><span>' + esc(t.cliente) + '</span><span>' + esc(t.canal) + '</span></div>' +
      '<div class="meta"><span>👤 ' + esc(t.atendio || 'Sin asignar') + '</span>' +
        (sem ? '<span class="sem-' + esc(t.semaforo) + '">' + esc(sem) + '</span>' : '<span>' + esc(CRM.fecha(t.actualizado, false)) + '</span>') + '</div>' +
    '</button>';
  }

  /* ───────── selector de tipificación en 3 niveles ───────── */

  function camposTip() {
    return '<div class="rejilla tres">' +
      '<label>Área *<select id="tArea"></select></label>' +
      '<label>Causa *<select id="tCausa"></select></label>' +
      '<label>Subcausa *<select id="tSub" name="motivo"></select></label></div>';
  }
  /** Conecta Área → Causa → Subcausa. alElegir(tip|null). */
  function montarTip(m, actual, alElegir) {
    const tips = CRM.st.cfg.tipificaciones || [];
    const sA = $('#tArea', m), sC = $('#tCausa', m), sS = $('#tSub', m);
    const ac = tips.filter(function (x) { return x.etiqueta === actual; })[0];
    const unicos = function (arr) { const o = []; arr.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; };
    const llenarA = function (sel) {
      sA.innerHTML = '<option value="">Elige el área…</option>' + unicos(tips.map(function (x) { return x.area; }))
        .map(function (a) { return '<option' + (a === sel ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('');
    };
    const llenarC = function (sel) {
      const lista = unicos(tips.filter(function (x) { return x.area === sA.value; }).map(function (x) { return x.causa; }));
      sC.innerHTML = '<option value="">' + (sA.value ? 'Elige la causa…' : '—') + '</option>' +
        lista.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
      sC.disabled = !sA.value;
      if (lista.length === 1 && !sel) sC.value = lista[0];
    };
    const llenarS = function (sel) {
      const lista = tips.filter(function (x) { return x.area === sA.value && x.causa === sC.value; });
      sS.innerHTML = '<option value="">' + (sC.value ? 'Elige la subcausa…' : '—') + '</option>' +
        lista.map(function (x) { return '<option value="' + esc(x.etiqueta) + '"' + (x.etiqueta === sel ? ' selected' : '') + '>' + esc(x.sub) + '</option>'; }).join('');
      sS.disabled = !sC.value;
      if (lista.length === 1 && !sel) sS.value = lista[0].etiqueta;
    };
    const avisar = function () { alElegir(tips.filter(function (x) { return x.etiqueta === sS.value; })[0] || null); };
    llenarA(ac ? ac.area : ''); llenarC(ac ? ac.causa : ''); llenarS(ac ? ac.etiqueta : '');
    if (actual && !ac) {
      sS.innerHTML = '<option value="" selected>(actual, fuera del catálogo) ' + esc(actual) + '</option>' + sS.innerHTML.replace(/^<option value="">[^<]*<\/option>/, '');
    }
    sA.onchange = function () { llenarC(''); llenarS(''); avisar(); };
    sC.onchange = function () { llenarS(''); avisar(); };
    sS.onchange = avisar;
    return { tip: function () { return tips.filter(function (x) { return x.etiqueta === sS.value; })[0] || null; } };
  }

  /* ───────── selector de cliente (con búsqueda) ───────── */

  function campoCliente() {
    return '<input type="hidden" name="idCliente">' +
      '<label style="margin-bottom:4px">Cliente *</label>' +
      '<div id="cliElegido" class="sel-cli oculto"></div>' +
      '<div id="cliBuscar"><input id="cliQ" type="search" placeholder="Busca por nombre, teléfono, correo o número" autocomplete="off" style="margin:0 0 8px">' +
        '<div id="cliRes" class="cli-res"></div></div>';
  }
  function montarCliente(m, f, inicial) {
    let t;
    const elegir = function (c) {
      f.idCliente.value = c.id;
      $('#cliElegido', m).innerHTML = '<div><strong>' + esc(c.nombre || '(sin nombre)') + '</strong><small>' + esc(c.id) + ' · ' + esc(c.telefono || c.correo || '') + '</small></div>' +
        '<button class="btn-link" type="button" id="cliCambiar">Cambiar</button>';
      $('#cliElegido', m).classList.remove('oculto');
      $('#cliBuscar', m).classList.add('oculto');
      $('#cliCambiar', m).onclick = function () {
        $('#cliElegido', m).classList.add('oculto');
        $('#cliBuscar', m).classList.remove('oculto');
        $('#cliQ', m).value = ''; $('#cliRes', m).innerHTML = '';
        $('#cliQ', m).focus();
      };
    };
    const buscar = async function (q) {
      const caja = $('#cliRes', m);
      if (!q || q.length < 2) { caja.innerHTML = ''; return; }
      caja.innerHTML = CRM.cargando('', true);
      try {
        const r = await CRM.llamar('clientesBuscar', q);
        caja.innerHTML = r.slice(0, 6).map(function (c, i) {
          return '<button type="button" class="cli-opcion" data-i="' + i + '"><strong>' + esc(c.nombre || '(sin nombre)') + '</strong><small>' +
            esc(c.id) + ' · ' + esc(c.telefono) + (c.correo ? ' · ' + esc(c.correo) : '') + '</small></button>';
        }).join('') || (CRM.tnActivo() && q.length >= 3 ? '' : '<p class="ayuda">Sin resultados. Si es nuevo, primero dalo de alta en Clientes.</p>');
        CRM.$$('.cli-opcion', caja).forEach(function (b) { b.onclick = function () { elegir(r[Number(b.dataset.i)]); }; });
        if (!CRM.tnActivo() || q.length < 3) return;
        caja.insertAdjacentHTML('beforeend', '<div class="tn-res">' + CRM.cargando('Buscando en Tiendanube…', true) + '</div>');
        let tn = [];
        try { tn = await CRM.llamar('tnBuscarClientes', q); } catch (e) { tn = []; }
        const box = $('.tn-res', caja);
        if (!box || $('#cliQ', m).value !== q) return;
        const ids = r.map(function (c) { return c.id; });
        tn = tn.filter(function (x) { return !x.idCrm || ids.indexOf(x.idCrm) < 0; });
        box.innerHTML = tn.length ? '<p class="ayuda" style="margin:6px 0 4px">De Tiendanube</p>' + tn.map(function (x, i) {
          return '<button type="button" class="cli-opcion" data-tn="' + i + '"><strong>' + esc(x.nombre || x.correo) + '</strong><small>' +
            (x.idCrm ? 'Ya en el CRM · ' + esc(x.idCrm) : 'Se importa al elegirlo · ' + esc(x.correo || x.telefono)) + '</small></button>';
        }).join('') : (r.length ? '' : '<p class="ayuda">Sin resultados en el CRM ni en Tiendanube. Si es nuevo, dalo de alta en Clientes.</p>');
        CRM.$$('[data-tn]', box).forEach(function (b) {
          b.onclick = async function () {
            const x = tn[Number(b.dataset.tn)];
            b.disabled = true;
            try {
              const id = x.idCrm || (await CRM.llamar('tnImportarCliente', x.tnId)).id;
              elegir({ id: id, nombre: x.nombre, telefono: x.telefono, correo: x.correo });
            } catch (e) { CRM.aviso(e.message, 'mal'); b.disabled = false; }
          };
        });
      } catch (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
    };
    $('#cliQ', m).oninput = function (e) { clearTimeout(t); t = setTimeout(function () { buscar(e.target.value); }, 250); };
    if (inicial && inicial.id) elegir(inicial);
  }

  /** Revisa en Tiendanube el número de pedido escrito (no bloquea el guardado). */
  function vigilarPedido(m, f) {
    const info = $('#pedInfo', m);
    if (!CRM.tnActivo() || !info) return;
    let t;
    const revisar = async function () {
      const n = f.pedido.value.replace(/^#/, '').trim();
      if (!n) { info.textContent = ''; return; }
      if (!/^\d+$/.test(n)) { info.innerHTML = '<span class="falta">El número de pedido debe tener solo dígitos.</span>'; return; }
      info.textContent = 'Buscando el pedido #' + n + ' en Tiendanube…';
      try {
        const p = await CRM.llamar('tnPedido', n, f.idCliente.value || '');
        if (f.pedido.value.replace(/^#/, '').trim() !== n) return;
        if (!p.existe) { info.innerHTML = '<span class="falta">El pedido #' + esc(n) + ' no existe en Tiendanube.</span>'; return; }
        info.innerHTML = '✓ Pedido #' + esc(p.numero) + ' · ' + esc(p.nombre) + ' · ' + esc(CRM.dinero(p.total, p.moneda)) + ' · ' + esc(p.pago) + ' · ' + esc(p.envio) +
          (p.coincide === false ? ' <span class="falta">· El correo/teléfono del pedido no coincide con el cliente elegido.</span>' : '');
      } catch (e) { info.innerHTML = '<span class="falta">' + esc(e.message) + '</span>'; }
    };
    f.pedido.addEventListener('input', function () { clearTimeout(t); t = setTimeout(revisar, 600); });
    if (f.pedido.value) revisar();
  }

  /* ───────── nuevo folio ───────── */

  function nuevoFolio(cliente) {
    const cfg = CRM.st.cfg;
    const m = CRM.modal(
      '<p class="eyebrow">Nuevo folio</p><h2>Registrar caso</h2>' +
      '<form id="fFolio" novalidate>' +
        campoCliente() +
        camposTip() +
        '<p class="auto-info" id="asuntoAuto">Asunto: se genera al elegir la tipificación.</p>' +
        '<div class="rejilla">' +
          '<label>Pedido (opcional)<input name="pedido" inputmode="numeric" maxlength="30" placeholder="Ej. 1024"></label>' +
          '<label>Canal de atención<select name="canal">' + CRM.opciones(cfg.canales, 'WhatsApp') + '</select></label>' +
          '<label>Medio de contacto preferido<select name="medio">' + CRM.opciones(cfg.canales, 'WhatsApp') + '</select></label>' +
          '<label>Prioridad <small id="priAuto" style="color:var(--ayuda);font-weight:500">(automática)</small><select name="prioridad">' + CRM.opciones(cfg.prioridades, 'Normal') + '</select></label>' +
        '</div><p class="auto-info" id="pedInfo"></p>' +
        '<label>Descripción del caso *<textarea name="descripcion" rows="4" maxlength="5000" placeholder="¿Qué pasó y qué pide el cliente?"></textarea></label>' +
        '<p id="nErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar y generar folio</button><button class="btn sec" type="button" id="nCancelar">Cancelar</button></div>' +
      '</form>', { ancha: true, alCancelar: function () { cancelar(); } });
    const f = $('#fFolio', m);
    let priTocada = false, medioTocado = false;
    f.prioridad.onchange = function () { priTocada = true; $('#priAuto', m).textContent = '(editada)'; };
    f.medio.onchange = function () { medioTocado = true; };
    f.canal.onchange = function () { if (!medioTocado) f.medio.value = f.canal.value; };
    const tipCtl = montarTip(m, '', function (tip) {
      $('#asuntoAuto', m).innerHTML = tip ? 'Asunto: <b>' + esc(tip.asunto) + '</b> (automático)' : 'Asunto: se genera al elegir la tipificación.';
      if (tip && !priTocada && cfg.prioridades.indexOf(tip.prioridad) >= 0) f.prioridad.value = tip.prioridad;
    });
    montarCliente(m, f, cliente);
    vigilarPedido(m, f);
    const inicial = CRM.firmaForm(f);
    const cancelar = function () { CRM.descartar(f, inicial); };
    $('#nCancelar', m).onclick = cancelar;
    if (!cliente) $('#cliQ', m).focus();
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const err = $('#nErr', m), btn = $('button[type=submit]', f);
      err.textContent = '';
      const d = CRM.datosForm(f);
      const tip = tipCtl.tip();
      if (!d.idCliente) { err.textContent = 'Elige el cliente.'; return; }
      if (!tip) { err.textContent = 'Completa la tipificación (área, causa y subcausa).'; return; }
      if (!d.descripcion.trim()) { err.textContent = 'Escribe la descripción del caso.'; return; }
      d.asunto = tip.asunto;
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const r = await CRM.llamar('ticketCrear', d);
        CRM.cerrarModal();
        CRM.aviso('Folio ' + r.folio + ' generado.');
        CRM.ir('folios', { folio: r.folio });
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Guardar y generar folio'; }
    };
  }
  CRM.nuevoFolio = nuevoFolio;

  /* ───────── seguimiento del folio ───────── */

  const ICONO_NOTA = { 'Nota': 'N', 'WhatsApp': 'W', 'Llamada': 'L', 'Correo enviado': '↗', 'Correo recibido': '↙', 'Sistema': '•' };
  function claseTipo(tipo) { return 't-' + String(tipo || 'nota').toLowerCase().replace(/\s+/g, '-'); }

  async function detalle(cont, folio, vigente) {
    const t = await CRM.llamar('ticketObtener', folio);
    if (!vigente()) return;
    const cfg = CRM.st.cfg;
    const jefe = CRM.esJefe();
    const idx = cfg.estados.indexOf(t.estado);
    const contacto = t.notas.some(function (n) { return TIPOS_CONTACTO.indexOf(n.tipo) >= 0; });
    const wa = CRM.waLink(t.telefono, rellenar('Hola {nombre}, te escribimos de SEGES por tu folio {folio}.', t));
    const fc = t.ficha || {};
    const atiende = t.usuarios.indexOf(t.atendio) >= 0 || !t.atendio ? t.usuarios : [t.atendio].concat(t.usuarios);
    let regla = '';
    if (idx === 0 && !contacto) regla = '<div class="aviso-regla">Para pasar a «' + esc(cfg.estados[1]) + '» primero avisa al cliente (WhatsApp, llamada o correo). ' +
      'Al registrarlo, el folio avanza solo.</div>';
    if (t.estado === cfg.estados[cfg.estados.length - 2] && t.resuelto && cfg.estados.length > 2) {
      const cierre = new Date(new Date(t.resuelto).getTime() + (cfg.horasCierre || 72) * 3600000).toISOString();
      regla = '<div class="aviso-regla">Se cerrará automáticamente el ' + esc(CRM.fecha(cierre)) + ' (' + (cfg.horasCierre || 72) + ' h después de resolverse).</div>';
    }
    if (t.estado === cfg.estados[cfg.estados.length - 1]) regla = '<div class="aviso-regla">Folio cerrado. Si el cliente responde por correo se abre un folio nuevo.</div>';

    cont.innerHTML =
      '<div class="encabezado"><div><p class="eyebrow"><button class="btn-link" id="volver" type="button">← Folios</button> · <span class="mono">' + esc(t.folio) + '</span></p>' +
        '<h1>' + esc(t.asunto) + '</h1></div>' +
        '<div class="acciones"><button class="btn sec" id="btnModificar" type="button">Modificar</button>' +
        (jefe ? '<button class="btn peligro" id="btnBorrar" type="button">Eliminar</button>' : '') + '</div></div>' +
      '<div class="barra-estado">' +
        '<div class="pasos">' + cfg.estados.map(function (e, i) {
          return '<span class="paso' + (i < idx ? ' hecho' : '') + (i === idx ? ' actual' : '') + '">' + esc(e) + '</span>';
        }).join('') + '</div>' +
        '<div class="marcar"><span>Marcar como</span><select id="selEstado">' + CRM.opciones(cfg.estados.filter(function (e) { return e !== t.estado; }), '', 'Elige…') + '</select>' +
        '<button class="btn chico" id="btnEstado" type="button" disabled>Confirmar</button></div>' +
      '</div>' + regla +
      '<div class="det">' +
        '<div>' +
          '<div class="panel"><h2>Folio</h2><div class="datos">' +
            CRM.dato('Folio', '<span class="mono">' + esc(t.folio) + '</span>', true) +
            '<div class="dato"><b>Atiende</b><span>' + (jefe
              ? '<select id="selAtiende" style="margin:0;padding:5px 8px">' + CRM.opciones(atiende, t.atendio, t.atendio ? undefined : 'Sin asignar') + '</select>'
              : esc(t.atendio || 'Sin asignar')) + '</span></div>' +
            CRM.dato('Prioridad', CRM.chipPrioridad(t.prioridad), true) +
            CRM.dato('Área', t.area) + CRM.dato('Causa', t.causa) + CRM.dato('Subcausa', t.sub || CRM.tipNombre(t.motivo)) +
            CRM.dato('Pedido', t.pedido) +
            CRM.dato('Canal', t.canal) +
            CRM.dato('Medio preferido', t.medio) +
            CRM.dato('Creado', CRM.fecha(t.creado) + (t.creo ? ' · ' + t.creo : '')) +
            (t.cerrado ? CRM.dato('Resuelto', CRM.fecha(t.resuelto)) : CRM.dato('Meta de respuesta', '<span class="' + (t.semaforo === 'vencido' ? 'falta' : '') + '">' +
              esc(CRM.fecha(t.vence)) + ' · ' + esc(semaforoTxt(t)) + '</span>', true)) +
            (t.proximo ? CRM.dato('Próximo contacto', CRM.fecha(t.proximo, false)) : '') +
          '</div></div>' +
          '<div class="panel"><div class="panel-cab"><h2>Cliente</h2><button class="btn-link" id="irCliente" type="button">Ver ficha →</button></div><div class="datos">' +
            CRM.dato('Nombre', fc.nombre || t.cliente, false, true) +
            CRM.dato('Número', fc.id || t.idCliente) +
            CRM.dato('Teléfono', fc.telefono, false, true) +
            CRM.dato('Correo', fc.correo, false, true) +
            CRM.dato('Ciudad', fc.ciudad, false, true) +
          '</div></div>' +
        '</div>' +
        '<div>' +
          (CRM.tnActivo() ? '<div class="panel"><div class="panel-cab"><h2>' + (t.pedido ? 'Pedido de Tiendanube' : 'Pedidos del cliente en Tiendanube') +
            '</h2></div><div id="tnFolio">' + CRM.cargando('Consultando la tienda…', true) + '</div></div>' : '') +
          '<div class="panel"><h2>Descripción del caso</h2>' + (t.descripcion ? '<div class="desc">' + esc(t.descripcion) + '</div>' : '<p class="ayuda">Sin descripción. Agrégala con «Modificar».</p>') + '</div>' +
          '<div class="panel"><div class="panel-cab"><h2>Contactar al cliente</h2></div><div class="acciones" style="margin-top:0">' +
            '<button class="btn" id="btnResp" type="button">Respuesta rápida</button>' +
            (wa ? '<a class="btn wa" id="btnWa" target="seges_whatsapp" rel="noopener" href="' + esc(wa) + '">Enviar mensaje (WhatsApp)</a>' : '<button class="btn wa" type="button" disabled title="El cliente no tiene teléfono">Enviar mensaje (WhatsApp)</button>') +
            '<button class="btn sec" id="btnCorreo" type="button">Enviar correo</button>' +
          '</div></div>' +
          '<div class="panel"><h2>Línea de tiempo</h2>' +
            '<form id="fNota" class="nota-form"><select name="tipo">' + CRM.opciones(['Nota', 'Llamada', 'WhatsApp']) + '</select>' +
              '<textarea name="texto" rows="2" placeholder="Registra una nota o el resultado de una llamada" required></textarea>' +
              '<button class="btn" type="submit">Registrar</button></form>' +
            lineaTiempo(t.notas) +
          '</div>' +
        '</div>' +
      '</div>';

    $('#volver', cont).onclick = function () { CRM.ir('folios'); };
    $('#irCliente', cont).onclick = function () { CRM.ir('clientes', { id: t.idCliente }); };
    $('#btnModificar', cont).onclick = function () { modificar(t); };
    $('#btnResp', cont).onclick = function () { modalRespuesta(t); };
    $('#btnCorreo', cont).onclick = function () { modalCorreo(t, ''); };
    if ($('#btnWa', cont)) $('#btnWa', cont).onclick = function () {
      CRM.llamar('ticketNota', t.folio, 'WhatsApp', 'Se abrió el chat de WhatsApp con el cliente.')
        .then(function () { if (CRM.st.params.folio === t.folio) CRM.recargar(); }).catch(function () {});
    };
    if ($('#btnBorrar', cont)) $('#btnBorrar', cont).onclick = async function () {
      if (!(await CRM.confirmarBorrado('el folio ' + t.folio + ' y toda su línea de tiempo'))) return;
      try { await CRM.llamar('ticketBorrar', t.folio); CRM.aviso('Folio eliminado.'); CRM.ir('folios'); }
      catch (e) { CRM.aviso(e.message, 'mal'); }
    };
    const sel = $('#selEstado', cont), bEst = $('#btnEstado', cont);
    sel.onchange = function () { bEst.disabled = !sel.value; };
    bEst.onclick = async function () {
      const nuevo = sel.value;
      if (!nuevo) return;
      const extra = nuevo === cfg.estados[cfg.estados.length - 2] ? ' Se cerrará solo en ' + (cfg.horasCierre || 72) + ' h.' : '';
      if (!(await CRM.confirmar('¿Marcar el folio ' + t.folio + ' como «' + nuevo + '»?' + extra, 'Sí, marcar', { peligro: false, no: 'Cancelar' }))) return;
      bEst.disabled = true;
      try {
        await CRM.llamar('ticketActualizar', t.folio, { estado: nuevo });
        CRM.aviso('Estado: ' + nuevo);
        CRM.recargar();
      } catch (e) { CRM.aviso(e.message, 'mal'); bEst.disabled = false; }
    };
    if ($('#selAtiende', cont)) $('#selAtiende', cont).onchange = async function () {
      const s = this, nuevo = s.value;
      if (!(await CRM.confirmar('¿Asignar el folio ' + t.folio + ' a ' + nuevo + '?', 'Asignar', { peligro: false, no: 'Cancelar' }))) { s.value = t.atendio; return; }
      try { await CRM.llamar('ticketActualizar', t.folio, { atendio: nuevo }); CRM.aviso('Ahora atiende ' + nuevo + '.'); CRM.recargar(); }
      catch (e) { CRM.aviso(e.message, 'mal'); s.value = t.atendio; }
    };
    $('#fNota', cont).onsubmit = async function (ev) {
      ev.preventDefault();
      const d = CRM.datosForm(ev.target), btn = $('button[type=submit]', ev.target);
      if (!d.texto.trim()) return;
      btn.disabled = true;
      try { await CRM.llamar('ticketNota', t.folio, d.tipo, d.texto); CRM.recargar(); }
      catch (e) { CRM.aviso(e.message, 'mal'); btn.disabled = false; }
    };
    if (CRM.tnActivo()) pedidoFolio(t);
  }

  async function pedidoFolio(t) {
    const box = $('#tnFolio');
    if (!box) return;
    const vigente = function () { return $('#tnFolio') && CRM.st.params.folio === t.folio; };
    try {
      if (t.pedido) {
        const p = await CRM.llamar('tnPedido', t.pedido, t.idCliente);
        if (!vigente()) return;
        box.innerHTML = !p.existe ? '<p class="falta">El pedido #' + esc(t.pedido) + ' no existe en Tiendanube. Corrígelo con «Modificar».</p>'
          : (p.coincide === false ? '<div class="aviso-regla rojo">El correo o teléfono del pedido no coincide con el cliente de este folio. Revisa que sea el pedido correcto.</div>' : '') +
            CRM.pedidoHtml(p);
        return;
      }
      if (!t.correo) { box.innerHTML = '<p class="ayuda">Este folio no tiene pedido. Agrega el correo del cliente para ver sus compras, o escribe el número con «Modificar».</p>'; return; }
      const r = await CRM.llamar('tnPedidosCliente', t.idCliente);
      if (!vigente()) return;
      box.innerHTML = r.pedidos.length
        ? '<p class="ayuda" style="margin-top:0">Este folio no tiene pedido asignado. Compras recientes del cliente:</p><div class="lista">' +
          r.pedidos.slice(0, 5).map(function (p) { return CRM.pedidoHtml(p, { compacto: true, asignar: true }); }).join('') + '</div>'
        : '<p class="ayuda" style="margin:0">Sin compras de ' + esc(t.correo) + ' en la tienda.</p>';
      CRM.$$('[data-asignar]', box).forEach(function (b) {
        b.onclick = async function () {
          if (!(await CRM.confirmar('¿Asignar el pedido #' + b.dataset.asignar + ' al folio ' + t.folio + '?', 'Asignar', { peligro: false, no: 'Cancelar' }))) return;
          try { await CRM.llamar('ticketActualizar', t.folio, { pedido: b.dataset.asignar }); CRM.aviso('Pedido asignado.'); CRM.recargar(); }
          catch (e) { CRM.aviso(e.message, 'mal'); }
        };
      });
    } catch (e) { box.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }

  function lineaTiempo(notas) {
    if (!notas.length) return '<p class="vacio">Sin movimientos.</p>';
    let html = '', dia = '';
    const hoy = CRM.diaClave(new Date().toISOString()), ayer = CRM.diaClave(new Date(Date.now() - 86400000).toISOString());
    notas.forEach(function (n) {
      const d = CRM.diaClave(n.fecha);
      if (d !== dia) {
        if (dia) html += '</ol>';
        dia = d;
        const etq = d === hoy ? 'Hoy' : (d === ayer ? 'Ayer' : CRM.fecha(n.fecha, false));
        html += '<div class="tl-dia">' + esc(etq) + '</div><ol class="tl">';
      }
      const hora = new Date(n.fecha).toLocaleTimeString('es-MX', { timeZone: CRM.st.cfg.zona, hour: '2-digit', minute: '2-digit' });
      html += '<li class="' + claseTipo(n.tipo) + '"><span class="punto">' + esc(ICONO_NOTA[n.tipo] || 'N') + '</span>' +
        '<div class="tl-cab"><b>' + esc(n.tipo) + '</b><small>' + esc(n.autor) + ' · ' + esc(hora) + '</small></div>' +
        '<div class="tl-txt">' + esc(n.texto) + '</div></li>';
    });
    return html + '</ol>';
  }

  /* ───────── modificar folio ───────── */

  function modificar(t) {
    const cfg = CRM.st.cfg;
    const prox = t.proximo ? CRM.diaClave(t.proximo) : '';
    const m = CRM.modal(
      '<p class="eyebrow">Modificar · ' + esc(t.folio) + '</p><h2>' + esc(t.asunto) + '</h2>' +
      '<form id="fMod" novalidate>' +
        campoCliente() +
        camposTip() +
        '<p class="auto-info" id="asuntoAuto">Asunto: <b>' + esc(t.asunto) + '</b> (automático)</p>' +
        '<div class="rejilla">' +
          '<label>Pedido<input name="pedido" maxlength="30" value="' + esc(t.pedido) + '"></label>' +
          '<label>Canal de atención<select name="canal">' + CRM.opciones(cfg.canales, t.canal) + '</select></label>' +
          '<label>Medio preferido<select name="medio">' + CRM.opciones(cfg.canales, t.medio) + '</select></label>' +
          '<label>Prioridad<select name="prioridad">' + CRM.opciones(cfg.prioridades, t.prioridad) + '</select></label>' +
          '<label>Próximo contacto<input name="proximo" type="date" value="' + esc(prox) + '"></label>' +
        '</div><p class="auto-info" id="pedInfo"></p>' +
        '<label>Descripción del caso<textarea name="descripcion" rows="4" maxlength="5000">' + esc(t.descripcion) + '</textarea></label>' +
        '<p id="mErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar cambios</button><button class="btn sec" type="button" id="mCancelar">Cancelar</button></div>' +
      '</form>', { ancha: true, alCancelar: function () { cancelar(); } });
    const f = $('#fMod', m);
    let priTocada = false;
    f.prioridad.onchange = function () { priTocada = true; };
    const tipCtl = montarTip(m, t.motivo, function (tip) {
      $('#asuntoAuto', m).innerHTML = 'Asunto: <b>' + esc(tip ? tip.asunto : t.asunto) + '</b> (automático)';
      if (tip && !priTocada && cfg.prioridades.indexOf(tip.prioridad) >= 0) f.prioridad.value = tip.prioridad;
    });
    montarCliente(m, f, { id: t.idCliente, nombre: (t.ficha && t.ficha.nombre) || t.cliente, telefono: t.telefono, correo: t.correo });
    vigilarPedido(m, f);
    const inicial = CRM.firmaForm(f);
    const cancelar = function () { CRM.descartar(f, inicial); };
    $('#mCancelar', m).onclick = cancelar;
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const err = $('#mErr', m), btn = $('button[type=submit]', f);
      err.textContent = '';
      const d = CRM.datosForm(f);
      const tip = tipCtl.tip();
      const cambios = {};
      if (!d.idCliente) { err.textContent = 'Elige el cliente.'; return; }
      if (d.idCliente !== t.idCliente) cambios.idCliente = d.idCliente;
      if (tip && tip.etiqueta !== t.motivo) { cambios.motivo = tip.etiqueta; cambios.asunto = tip.asunto; }
      ['pedido', 'canal', 'medio', 'prioridad', 'descripcion'].forEach(function (k) { if (String(d[k] || '') !== String(t[k] || '')) cambios[k] = d[k]; });
      if (d.proximo !== prox) cambios.proximo = d.proximo;
      if (!Object.keys(cambios).length) { CRM.cerrarModal(); CRM.aviso('Sin cambios.'); return; }
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        await CRM.llamar('ticketActualizar', t.folio, cambios);
        CRM.cerrarModal();
        CRM.aviso('Cambios guardados.');
        CRM.recargar();
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Guardar cambios'; }
    };
  }

  /* ───────── respuesta rápida ───────── */

  async function modalRespuesta(t) {
    const m = CRM.modal('<p class="eyebrow">Respuesta rápida · ' + esc(t.folio) + '</p>' + CRM.cargando('Cargando plantillas…'));
    let lista;
    try { lista = await respuestas(); } catch (e) { m.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; return; }
    lista = lista.filter(function (r) { return r.canal === 'Todos' || r.canal === t.canal || r.canal === 'WhatsApp'; });
    m.innerHTML =
      '<p class="eyebrow">Respuesta rápida · ' + esc(t.folio) + '</p><h2>Para ' + esc(t.cliente) + '</h2>' +
      (lista.length
        ? '<div class="plantillas">' + lista.map(function (r, i) {
            return '<button type="button" class="pill-opcion' + (i === 0 ? ' activo' : '') + '" data-i="' + i + '">' + esc(r.nombre) + '</button>';
          }).join('') + '</div>'
        : '<p class="ayuda">No hay plantillas. Créalas en Respuestas.</p>') +
      '<label>Mensaje<textarea id="rTexto" rows="6"></textarea></label>' +
      '<div class="acciones">' +
        (t.telefono ? '<a class="btn wa" id="rWa" target="seges_whatsapp" rel="noopener" href="#">Enviar por WhatsApp</a>' : '') +
        '<button class="btn sec" id="rCorreo" type="button">Enviar por correo</button>' +
        '<button class="btn sec" id="rCopiar" type="button">Copiar</button>' +
        '<button class="btn sec" id="rCerrar" type="button">Cerrar</button>' +
      '</div>' +
      '<p class="ayuda">Lo que envíes queda registrado en la línea de tiempo del folio.</p>';
    const area = $('#rTexto', m), wa = $('#rWa', m);
    const actualizar = function () { if (wa) wa.href = CRM.waLink(t.telefono, area.value); };
    const elegir = function (i) {
      CRM.$$('.pill-opcion', m).forEach(function (b) { b.classList.toggle('activo', Number(b.dataset.i) === i); });
      area.value = lista[i] ? rellenar(lista[i].texto, t) : '';
      actualizar();
    };
    CRM.$$('.pill-opcion', m).forEach(function (b) { b.onclick = function () { elegir(Number(b.dataset.i)); }; });
    area.oninput = actualizar;
    elegir(0);
    if (wa) wa.onclick = function () {
      const texto = area.value;
      CRM.cerrarModal();
      CRM.llamar('ticketNota', t.folio, 'WhatsApp', 'Mensaje enviado: ' + texto)
        .then(function () { if (CRM.st.params.folio === t.folio) CRM.recargar(); })
        .catch(function (e) { CRM.aviso(e.message, 'mal'); });
    };
    $('#rCopiar', m).onclick = function () {
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (!ok && navigator.clipboard) navigator.clipboard.writeText(area.value).then(function () { CRM.aviso('Mensaje copiado.'); });
      else CRM.aviso(ok ? 'Mensaje copiado.' : 'Selecciona el texto y cópialo.');
    };
    $('#rCorreo', m).onclick = function () { modalCorreo(t, area.value); };
    $('#rCerrar', m).onclick = CRM.cerrarModal;
  }

  /* ───────── correo al cliente (diseño SEGES) ───────── */

  async function modalCorreo(t, textoInicial) {
    if (!t.correo) {
      const m0 = CRM.modal('<p class="eyebrow">Correo · ' + esc(t.folio) + '</p><h2>Falta el correo del cliente</h2>' +
        '<p>' + esc(t.cliente) + ' no tiene correo registrado. Agrégalo en su ficha y vuelve a intentar.</p>' +
        '<div class="acciones"><button class="btn" id="mIr" type="button">Ir a la ficha</button><button class="btn sec" id="mNo" type="button">Cerrar</button></div>');
      $('#mIr', m0).onclick = function () { CRM.cerrarModal(); CRM.ir('clientes', { id: t.idCliente }); };
      $('#mNo', m0).onclick = CRM.cerrarModal;
      return;
    }
    const m = CRM.modal('<p class="eyebrow">Correo · ' + esc(t.folio) + '</p>' + CRM.cargando('Cargando plantillas…'), { ancha: true });
    let lista = [];
    try { lista = (await respuestas()).filter(function (r) { return r.canal === 'Todos' || r.canal === 'Correo'; }); } catch (e) {}
    m.innerHTML =
      '<p class="eyebrow">Correo · ' + esc(t.folio) + '</p><h2>Para ' + esc(t.cliente) + '</h2>' +
      '<p class="ayuda">' + esc(t.correo) + ' · sale con el diseño de SEGES, firmado por ti; si responde, llega a segesmx+atencion@gmail.com.</p>' +
      (lista.length ? '<div class="plantillas">' + lista.map(function (r, i) {
        return '<button type="button" class="pill-opcion" data-i="' + i + '">' + esc(r.nombre) + '</button>';
      }).join('') + '</div>' : '') +
      '<label>Asunto<input id="mAsunto" maxlength="150" value="' + esc(t.asunto) + '"></label>' +
      '<label>Mensaje<textarea id="mTexto" rows="8" placeholder="Escribe tu respuesta. El saludo «Hola ' + esc(String(t.cliente).split(' ')[0]) + ',» y la firma se agregan solos."></textarea></label>' +
      '<p id="mErr" class="error"></p>' +
      '<div class="acciones">' +
        '<button class="btn" id="mEnviar" type="button">Enviar correo</button>' +
        '<button class="btn sec" id="mVer" type="button">Vista previa</button>' +
        '<button class="btn sec" id="mCerrar" type="button">Cancelar</button>' +
      '</div><div id="mPrevia"></div>';
    const area = $('#mTexto', m), asunto = $('#mAsunto', m), err = $('#mErr', m);
    area.value = quitarSaludo(textoInicial || '');
    const inicialTxt = area.value;
    CRM.$$('.pill-opcion', m).forEach(function (b) {
      b.onclick = function () {
        CRM.$$('.pill-opcion', m).forEach(function (x) { x.classList.toggle('activo', x === b); });
        area.value = quitarSaludo(rellenar(lista[Number(b.dataset.i)].texto, t));
      };
    });
    const cancelar = async function () {
      if (area.value !== inicialTxt) {
        if (!(await CRM.confirmar('¿Cancelar el correo? Lo que escribiste no se guardará.', 'Sí, cancelar', { no: 'Seguir editando' }))) return;
        if (!(await CRM.confirmar('Confírmalo otra vez: se descarta el correo.', 'Descartar', { no: 'Volver', titulo: '¿Seguro?' }))) return;
      }
      CRM.cerrarModal();
    };
    CRM.st.alCancelarModal = cancelar;
    $('#mCerrar', m).onclick = cancelar;
    $('#mVer', m).onclick = async function () {
      err.textContent = ''; this.disabled = true;
      try {
        const r = await CRM.llamar('correoVistaPrevia', t.folio, asunto.value, area.value);
        const box = $('#mPrevia', m);
        box.innerHTML = '<p class="ayuda">Asunto: <b>' + esc(r.asunto) + '</b> · te quedan ' + esc(r.quedan) + ' correos hoy</p>';
        const fr = document.createElement('iframe');
        fr.className = 'previa-correo'; fr.setAttribute('sandbox', 'allow-same-origin'); fr.setAttribute('title', 'Vista previa');
        fr.srcdoc = r.html; box.appendChild(fr);
        fr.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { err.textContent = e.message; }
      this.disabled = false;
    };
    $('#mEnviar', m).onclick = async function () {
      err.textContent = '';
      if (!area.value.trim()) { err.textContent = 'Escribe el mensaje.'; return; }
      const b = this; b.disabled = true; b.textContent = 'Enviando…';
      try {
        const r = await CRM.llamar('correoEnviar', t.folio, asunto.value, area.value);
        CRM.cerrarModal();
        CRM.aviso('Correo enviado a ' + r.para + '.');
        if (CRM.st.params.folio === t.folio) CRM.recargar();
      } catch (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'Enviar correo'; }
    };
  }

  function quitarSaludo(s) {
    const r = String(s || '').replace(/^\s*(hola|buen[oa]s? (d[ií]as|tardes|noches))\b[^,!\n]{0,40}[,!]\s*/i, '').trim();
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  /* ───────── Respuestas (plantillas) ───────── */

  CRM.registrarVista('respuestas', {
    titulo: 'Respuestas', orden: 60,
    render: async function (cont, p, vigente) {
      const lista = await CRM.llamar('respuestasListar', true);
      if (!vigente()) return;
      CRM.st.respuestas = null;
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Plantillas</p><h1>Respuestas rápidas</h1></div>' +
        '<div class="acciones"><button class="btn" id="btnNuevaResp" type="button">+ Nueva respuesta</button></div></div>' +
        '<p class="ayuda">Variables: {nombre} {folio} {pedido} {motivo}. Se reemplazan solas al usarlas en un folio.</p>' +
        '<div class="lista">' + (lista.length ? lista.map(function (r, i) {
          return '<button class="tarjeta" type="button" data-i="' + i + '">' +
            '<div class="cab-t"><strong>' + esc(r.nombre) + '</strong><div class="chips"><span class="chip">' + esc(r.canal) + '</span>' +
            (r.activa ? '' : '<span class="chip">Inactiva</span>') + '</div></div>' +
            '<span>' + esc(r.texto) + '</span></button>';
        }).join('') : '<p class="vacio">Aún no hay respuestas.</p>') + '</div>';
      $('#btnNuevaResp', cont).onclick = function () { editarResp({ canal: 'Todos', activa: true }); };
      CRM.$$('.tarjeta', cont).forEach(function (b) { b.onclick = function () { editarResp(lista[Number(b.dataset.i)]); }; });
    }
  });

  function editarResp(r) {
    const m = CRM.modal(
      '<p class="eyebrow">' + (r.id ? esc(r.id) : 'Nueva') + '</p><h2>' + (r.id ? 'Editar respuesta' : 'Nueva respuesta') + '</h2>' +
      '<form id="fResp">' +
        '<label>Nombre<input name="nombre" maxlength="80" required value="' + esc(r.nombre) + '"></label>' +
        '<label>Canal<select name="canal">' + CRM.opciones(['Todos', 'WhatsApp', 'Correo'], r.canal) + '</select></label>' +
        '<label>Texto<textarea name="texto" rows="5" required>' + esc(r.texto) + '</textarea></label>' +
        '<label class="check"><input type="checkbox" name="activa"' + (r.activa ? ' checked' : '') + '> Activa</label>' +
        '<p id="pErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar</button>' +
        (r.id && CRM.esJefe() ? '<button class="btn peligro" type="button" id="pBorrar">Eliminar</button>' : '') +
        '<button class="btn sec" type="button" id="pCancelar">Cancelar</button></div>' +
      '</form>', { alCancelar: function () { cancelar(); } });
    const f = $('#fResp', m), inicial = CRM.firmaForm(f);
    const cancelar = function () { CRM.descartar(f, inicial); };
    $('#pCancelar', m).onclick = cancelar;
    if ($('#pBorrar', m)) $('#pBorrar', m).onclick = async function () {
      if (!(await CRM.confirmarBorrado('la respuesta «' + r.nombre + '»'))) return;
      try { await CRM.llamar('respuestaBorrar', r.id); CRM.cerrarModal(); CRM.aviso('Respuesta eliminada.'); CRM.ir('respuestas'); }
      catch (e) { $('#pErr', m).textContent = e.message; }
    };
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const d = CRM.datosForm(ev.target);
      d.activa = ev.target.activa.checked;
      if (r.id) d.id = r.id;
      try { await CRM.llamar('respuestaGuardar', d); CRM.cerrarModal(); CRM.aviso('Respuesta guardada.'); CRM.ir('respuestas'); }
      catch (e) { $('#pErr', m).textContent = e.message; }
    };
  }
})();

/* ═════════════ Ajustes (solo administrador): conexión con Tiendanube ═════════════ */
(function () {
  const $ = CRM.$, esc = CRM.esc;

  CRM.registrarVista('ajustes', {
    titulo: 'Ajustes', orden: 90, soloAdmin: true,
    render: async function (cont, p, vigente) {
      const e = await CRM.llamar('tnEstado');
      if (!vigente()) return;
      CRM.st.cfg.tienda = e.conectado;
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Administración</p><h1>Ajustes</h1></div></div>' +
        '<div class="det">' +
          '<div class="panel"><div class="panel-cab"><h2>Tiendanube</h2>' +
            (e.conectado ? '<span class="chip ok">Conectado</span>' : '<span class="chip mal">Sin conectar</span>') + '</div>' +
            (e.conectado
              ? '<div class="datos">' + CRM.dato('Tienda', e.tienda) + CRM.dato('Número', e.numero) + CRM.dato('Conectada desde', CRM.fecha(e.desde)) +
                CRM.dato('Acceso', 'Solo lectura (pedidos y clientes)') + '</div>'
              : '<p class="ayuda">Conecta la tienda para ver pedidos dentro de los folios, las compras de cada cliente e importar clientes.</p>') +
            '<form id="fTn" autocomplete="off" style="margin-top:16px">' +
              '<label>Número de tienda<input name="tienda" inputmode="numeric" maxlength="15" value="' + esc(e.numero) + '" placeholder="Ej. 8238234"></label>' +
              '<label>Clave de acceso (access token)<input name="clave" type="password" autocomplete="new-password" spellcheck="false" placeholder="' +
                (e.conectado ? 'Déjala vacía para conservar la actual' : 'Pega aquí la clave de la aplicación a medida') + '"></label>' +
              '<p id="tnErr" class="error"></p>' +
              '<div class="acciones"><button class="btn" type="submit">' + (e.conectado ? 'Cambiar clave y probar' : 'Conectar y probar') + '</button>' +
              (e.conectado ? '<button class="btn peligro" type="button" id="tnQuitar">Desconectar</button>' : '') + '</div>' +
            '</form>' +
          '</div>' +
          '<div class="panel"><h2>Cómo obtener la clave</h2><ol class="pasos-txt">' +
            '<li>Entra al administrador de Tiendanube → <b>Aplicaciones</b> → <b>Aplicaciones a medida</b>.</li>' +
            '<li>Crea una app llamada <b>SEGES CRM</b> con permisos de <b>solo lectura</b> en Pedidos y Clientes.</li>' +
            '<li>Instálala y copia el <b>access token</b> y el <b>número de tienda</b>.</li>' +
            '<li>Pégalos aquí y toca «Conectar y probar».</li></ol>' +
            '<h2 style="margin-top:18px">Avisos automáticos</h2>' +
            '<p class="ayuda">Cada 10 minutos el CRM revisa la tienda y abre un folio cuando un pedido se <b>cancela</b> o lleva <b>' + esc(e.diasSinEnvio) +
              ' días pagado sin enviarse</b> (los días se cambian en la hoja Config, TN_DIAS_SIN_ENVIO). Se asigna a quien tenga menos folios abiertos y nunca se duplica.</p>' +
          '</div>' +
        '</div>';
      const f = $('#fTn', cont);
      f.onsubmit = async function (ev) {
        ev.preventDefault();
        const err = $('#tnErr', cont), btn = $('button[type=submit]', f);
        err.textContent = '';
        const d = { tienda: f.tienda.value.trim(), clave: f.clave.value.trim() };
        if (!d.clave) { err.textContent = 'Pega la clave de acceso.'; return; }
        btn.disabled = true; btn.textContent = 'Probando conexión…';
        try {
          const r = await CRM.llamar('tnConfigGuardar', d);
          f.clave.value = '';
          CRM.st.cfg.tienda = true;
          CRM.aviso('Conectado a ' + r.tienda + '.');
          CRM.recargar();
        } catch (e2) { err.textContent = e2.message; btn.disabled = false; btn.textContent = 'Conectar y probar'; }
      };
      if ($('#tnQuitar', cont)) $('#tnQuitar', cont).onclick = async function () {
        if (!(await CRM.confirmarBorrado('la conexión con Tiendanube'))) return;
        try { await CRM.llamar('tnDesconectar'); CRM.st.cfg.tienda = false; CRM.aviso('Tiendanube desconectado.'); CRM.recargar(); }
        catch (e3) { CRM.aviso(e3.message, 'mal'); }
      };
    }
  });
})();

CRM.arrancar();
