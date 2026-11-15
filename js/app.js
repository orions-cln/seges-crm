/* SEGES – Mini-CRM · Módulo 1: estructura de la app (sesión, navegación, utilidades). */
const CRM = (function () {
  const st = { token: null, usuario: null, cfg: null, vistas: [], actual: null };
  const $ = function (s, el) { return (el || document).querySelector(s); };

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
  /** Llama al servidor (Apps Script) sin cookies; la sesión viaja como token en el cuerpo. */
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

  /** Llama a una función del servidor pasando el token de sesión. */
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

  let temporizadorAviso;
  function aviso(msg, tipo) {
    const el = $('#aviso');
    el.textContent = msg;
    el.className = 'aviso ' + (tipo || '');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () { el.classList.add('oculto'); }, 4000);
  }

  function modal(html) {
    $('#modalCuerpo').innerHTML = html;
    $('#modal').classList.remove('oculto');
    return $('#modalCuerpo');
  }
  function cerrarModal() { $('#modal').classList.add('oculto'); $('#modalCuerpo').innerHTML = ''; }

  /** Ventana de confirmación propia. Devuelve una promesa true/false. */
  function confirmar(texto, etiquetaSi) {
    return new Promise(function (ok) {
      const c = modal('<p>' + esc(texto) + '</p><div class="acciones">' +
        '<button class="btn peligro" id="cfSi">' + esc(etiquetaSi || 'Sí') + '</button>' +
        '<button class="btn sec" id="cfNo">Cancelar</button></div>');
      $('#cfSi', c).onclick = function () { cerrarModal(); ok(true); };
      $('#cfNo', c).onclick = function () { cerrarModal(); ok(false); };
    });
  }

  function registrarVista(id, def) { st.vistas.push(Object.assign({ id: id, orden: 50 }, def)); }
  function hayVista(id) { return st.vistas.some(function (v) { return v.id === id; }); }
  function esAdmin() { return !!(st.usuario && st.usuario.rol === 'admin'); }
  function visibles() {
    return st.vistas.filter(function (v) { return !v.soloAdmin || esAdmin(); })
                    .sort(function (a, b) { return a.orden - b.orden; });
  }

  function pintarNav() {
    const nav = $('#nav');
    nav.innerHTML = '';
    visibles().forEach(function (v) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v.titulo;
      b.dataset.vista = v.id;
      b.onclick = function () { ir(v.id); };
      nav.appendChild(b);
    });
  }

  async function ir(id, params) {
    const lista = visibles();
    const v = lista.find(function (x) { return x.id === id; }) || lista[0];
    if (!v) { $('#vista').innerHTML = '<p class="vacio">No hay módulos instalados.</p>'; return; }
    st.actual = v.id;
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('activo', b.dataset.vista === v.id); });
    const cont = $('#vista');
    cont.innerHTML = '<p class="cargando">Cargando…</p>';
    window.scrollTo(0, 0);
    try { await v.render(cont, params || {}); }
    catch (e) { cont.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }

  function mostrarLogin() {
    document.body.classList.remove('dentro');
    $('#login').classList.remove('oculto');
  }

  function entrarListo(r) {
    guardarToken(r.token);
    st.usuario = r.usuario;
    st.cfg = r.cfg;
    $('#usrNombre').textContent = r.usuario.nombre + (r.usuario.rol === 'admin' ? ' · admin' : '');
    $('#login').classList.add('oculto');
    document.body.classList.add('dentro');
    pintarNav();
    const v = visibles()[0];
    ir(v ? v.id : null);
  }

  /* Formato de fechas en hora de Culiacán */
  function fecha(isoTxt, conHora) {
    if (!isoTxt) return '';
    const d = new Date(isoTxt);
    if (isNaN(d)) return '';
    const op = { timeZone: (st.cfg && st.cfg.zona) || 'America/Mazatlan', day: '2-digit', month: 'short', year: 'numeric' };
    if (conHora !== false) { op.hour = '2-digit'; op.minute = '2-digit'; }
    return d.toLocaleString('es-MX', op);
  }

  /** Enlace directo al chat: en celular abre la app; en computadora, WhatsApp Web. */
  function esCelular() { return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent); }
  function waLink(tel, texto) {
    const d = String(tel || '').replace(/\D/g, '').slice(-10);
    if (d.length !== 10) return '';
    const lada = (st.cfg && st.cfg.lada) || '52';
    const txt = texto ? '&text=' + encodeURIComponent(texto) : '';
    return esCelular()
      ? 'whatsapp://send?phone=' + lada + d + txt
      : 'https://web.whatsapp.com/send?phone=' + lada + d + txt;
  }

  function datosForm(form) {
    const o = {};
    new FormData(form).forEach(function (v, k) { o[k] = v; });
    return o;
  }

  /** "Área / Tipificación" → "Tipificación" (para mostrar). */
  function tipNombre(m) { m = String(m || ''); const i = m.indexOf(' / '); return i >= 0 ? m.slice(i + 3) : m; }

  function opciones(lista, actual) {
    return (lista || []).map(function (x) {
      return '<option' + (x === actual ? ' selected' : '') + '>' + esc(x) + '</option>';
    }).join('');
  }

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
      try { await llamarDirecto('salir', st.token); } catch (e) {}
      guardarToken(null); st.usuario = null; mostrarLogin();
    };
    $('#modal').onclick = function (ev) { if (ev.target.id === 'modal') cerrarModal(); };

    try {
      const r = await llamarDirecto('iniciar', leerToken());
      r.login ? mostrarLogin() : entrarListo(r);
    } catch (e) {
      mostrarLogin();
      $('#loginError').textContent = 'No pude conectar: ' + ((e && e.message) || e);
    }
  }

  return { st: st, $: $, esc: esc, llamar: llamar, aviso: aviso, modal: modal, cerrarModal: cerrarModal,
           confirmar: confirmar, registrarVista: registrarVista, hayVista: hayVista, ir: ir, esAdmin: esAdmin,
           fecha: fecha, waLink: waLink, datosForm: datosForm, opciones: opciones, tipNombre: tipNombre, arrancar: arrancar };
})();
/* SEGES – Mini-CRM · Módulo 1: vista Clientes. */
(function () {
  const $ = CRM.$, esc = CRM.esc;
  let temporizador;

  CRM.registrarVista('clientes', {
    titulo: 'Clientes',
    orden: 30,
    render: async function (cont, p) {
      if (p.id) return detalle(cont, p.id);
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Directorio</p><h1>Clientes</h1></div><button class="btn" id="btnNuevo" type="button">+ Nuevo cliente</button></div>' +
        '<input id="q" class="buscador" type="search" placeholder="Buscar por nombre, teléfono o correo" value="' + esc(p.q || '') + '">' +
        '<div id="lista" class="lista"></div>';
      $('#btnNuevo', cont).onclick = function () { formulario(null); };
      const q = $('#q', cont);
      q.oninput = function () { clearTimeout(temporizador); temporizador = setTimeout(function () { buscar(q.value); }, 300); };
      await buscar(q.value);
    }
  });

  async function buscar(q) {
    const lista = $('#lista');
    if (!lista) return;
    lista.innerHTML = '<p class="cargando">Buscando…</p>';
    try {
      const r = await CRM.llamar('clientesBuscar', q);
      if (!r.length) { lista.innerHTML = '<p class="vacio">' + (q ? 'Sin resultados.' : 'Aún no hay clientes. Crea el primero.') + '</p>'; return; }
      lista.innerHTML = r.map(function (c) {
        return '<button class="tarjeta" type="button" data-id="' + esc(c.id) + '">' +
          '<strong>' + esc(c.nombre) + '</strong>' +
          '<span>' + esc(c.telefono) + (c.telefono && c.correo ? ' · ' : '') + esc(c.correo) + '</span>' +
          '<small>' + esc(c.id) + (c.ciudad ? ' · ' + esc(c.ciudad) : '') + '</small></button>';
      }).join('');
      lista.querySelectorAll('.tarjeta').forEach(function (b) {
        b.onclick = function () { CRM.ir('clientes', { id: b.dataset.id }); };
      });
    } catch (e) { lista.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
  }

  async function detalle(cont, id) {
    const c = await CRM.llamar('clienteObtener', id);
    const wa = CRM.waLink(c.telefono, 'Hola ' + c.nombre.split(' ')[0] + ', te escribimos de SEGES.');
    const hayTickets = CRM.hayVista('tickets');

    cont.innerHTML =
      '<p><button class="btn-link" id="volver" type="button">← Clientes</button></p>' +
      '<div class="encabezado"><div><p class="eyebrow">Cliente · ' + esc(c.id) + '</p><h1>' + esc(c.nombre) + '</h1></div></div>' +
      '<div class="ficha"><div class="rejilla">' +
        dato('Teléfono', c.telefono) + dato('Correo', c.correo) + dato('Ciudad', c.ciudad) +
        dato('Alta', CRM.fecha(c.alta, false)) +
      '</div>' + (c.notas ? dato('Notas', c.notas) : '') + '</div>' +
      '<div class="acciones">' +
        (hayTickets ? '<button class="btn" id="btnCaso" type="button">+ Nuevo caso</button>' : '') +
        (wa ? '<a class="btn wa" href="' + esc(wa) + '" target="seges_whatsapp">Abrir WhatsApp</a>' : '') +
        '<button class="btn sec" id="btnEditar" type="button">Editar</button>' +
        (CRM.esAdmin() ? '<button class="btn peligro" id="btnBorrar" type="button">Borrar</button>' : '') +
      '</div>' +
      '<h2 class="sep">Historial de casos (' + c.historial.length + ')</h2>' +
      (c.historial.length
        ? '<div class="tabla-scroll"><table><thead><tr><th>Folio</th><th>Asunto</th><th>Tipificación</th><th>Canal</th><th>Estado</th><th>Creado</th></tr></thead><tbody>' +
          c.historial.map(function (t) {
            return '<tr class="clic" data-folio="' + esc(t.folio) + '"><td>' + esc(t.folio) + '</td><td>' + esc(t.asunto) + '</td><td>' +
              esc(CRM.tipNombre(t.motivo)) + '</td><td>' + esc(t.canal) + '</td><td>' + etiquetaEstado(t.estado) + '</td><td>' + esc(CRM.fecha(t.creado)) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<p class="vacio">Sin casos todavía.</p>');

    $('#volver', cont).onclick = function () { CRM.ir('clientes'); };
    $('#btnEditar', cont).onclick = function () { formulario(c); };
    if ($('#btnCaso', cont)) $('#btnCaso', cont).onclick = function () { CRM.ir('tickets', { nuevo: true, cliente: c.id }); };
    if ($('#btnBorrar', cont)) $('#btnBorrar', cont).onclick = function () { borrar(c); };
    if (hayTickets) cont.querySelectorAll('tr.clic').forEach(function (tr) {
      tr.onclick = function () { CRM.ir('tickets', { folio: tr.dataset.folio }); };
    });
  }

  function dato(etiqueta, valor) {
    return '<div class="dato"><b>' + esc(etiqueta) + '</b>' + (valor ? esc(valor) : '—') + '</div>';
  }

  function etiquetaEstado(e) {
    const ult = (CRM.st.cfg.estados || []).slice(-1)[0];
    return '<span class="etiqueta' + (e === ult ? ' verde' : '') + '">' + esc(e) + '</span>';
  }

  function formulario(c) {
    c = c || {};
    const m = CRM.modal(
      '<p class="eyebrow">' + (c.id ? esc(c.id) : 'Directorio') + '</p><h2>' + (c.id ? 'Editar cliente' : 'Nuevo cliente') + '</h2>' +
      '<form id="fCli">' +
        '<label>Nombre *<input name="nombre" required maxlength="120" value="' + esc(c.nombre) + '"></label>' +
        '<div class="rejilla">' +
          '<label>Teléfono (10 dígitos)<input name="telefono" type="tel" inputmode="tel" value="' + esc(c.telefono) + '"></label>' +
          '<label>Correo<input name="correo" type="email" value="' + esc(c.correo) + '"></label>' +
        '</div>' +
        '<label>Ciudad<input name="ciudad" maxlength="80" value="' + esc(c.ciudad) + '"></label>' +
        '<label>Notas<textarea name="notas" rows="3" maxlength="2000">' + esc(c.notas) + '</textarea></label>' +
        '<p id="fErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" id="fCancelar">Cancelar</button></div>' +
      '</form>');
    $('#fCancelar', m).onclick = CRM.cerrarModal;
    $('#fCli', m).onsubmit = async function (ev) {
      ev.preventDefault();
      const btn = $('button[type=submit]', m);
      btn.disabled = true;
      $('#fErr', m).textContent = '';
      try {
        const d = CRM.datosForm(ev.target);
        if (c.id) d.id = c.id;
        const r = await CRM.llamar('clienteGuardar', d);
        CRM.cerrarModal();
        CRM.aviso(r.nuevo ? 'Cliente ' + r.id + ' creado.' : 'Cambios guardados.');
        CRM.ir('clientes', { id: r.id });
      } catch (e) {
        $('#fErr', m).textContent = e.message;
        btn.disabled = false;
      }
    };
  }

  async function borrar(c) {
    if (!(await CRM.confirmar('¿Borrar a ' + c.nombre + ' (' + c.id + ')? No se puede deshacer.', 'Borrar'))) return;
    try {
      await CRM.llamar('clienteBorrar', c.id);
      CRM.aviso('Cliente borrado.');
      CRM.ir('clientes');
    } catch (e) { CRM.aviso(e.message, 'mal'); }
  }
})();
/* SEGES – Mini-CRM · Módulo 2: vistas Casos y Respuestas rápidas. */
(function () {
  const $ = CRM.$, esc = CRM.esc;
  let temporizador;
  const filtro = { estado: 'abiertos', q: '', semaforo: '' };

  /* ───────── utilidades ───────── */

  function horasTxt(ms) {
    const h = Math.round(Math.abs(ms) / 3600000);
    if (h < 1) return 'menos de 1 h';
    if (h < 48) return h + ' h';
    return Math.round(h / 24) + ' días';
  }

  function semaforoTxt(t) {
    if (t.semaforo === 'cerrado') return 'Resuelto a tiempo';
    if (t.semaforo === 'cerrado-tarde') return 'Resuelto fuera de tiempo';
    if (!t.vence) return '';
    const dif = new Date(t.vence).getTime() - Date.now();
    return dif < 0 ? 'Vencido hace ' + horasTxt(dif) : 'Vence en ' + horasTxt(dif);
  }

  function chipEstado(t) {
    const tipo = t.cerrado ? 'ok' : (t.estado === CRM.st.cfg.estados[0] ? 'nuevo' : '');
    return '<span class="chip ' + tipo + '">' + esc(t.estado) + '</span>';
  }

  function chipSemaforo(t) {
    return '<span class="chip sem-' + esc(t.semaforo) + '"><i class="punto"></i>' + esc(semaforoTxt(t)) + '</span>';
  }

  function rellenar(texto, t) {
    const nombre = String(t.cliente || '').split(' ')[0];
    return String(texto)
      .replace(/\{nombre\}/g, nombre)
      .replace(/\{folio\}/g, t.folio || '')
      .replace(/\{pedido\}/g, t.pedido || '')
      .replace(/\{motivo\}/g, CRM.tipNombre(t.motivo).toLowerCase())
      .replace(/\{tienda\}/g, 'SEGES');
  }

  async function respuestas() {
    if (!CRM.st.respuestas) CRM.st.respuestas = await CRM.llamar('respuestasListar', false);
    return CRM.st.respuestas;
  }

  /* ───────── vista Casos ───────── */

  CRM.registrarVista('tickets', {
    titulo: 'Casos',
    orden: 10,
    render: async function (cont, p) {
      if (p.folio) return detalle(cont, p.folio);
      if (p.nuevo) { lista(cont); return formularioNuevo(p.cliente); }
      return lista(cont);
    }
  });

  async function lista(cont) {
    cont.innerHTML =
      '<div class="encabezado"><div><p class="eyebrow">Atención al cliente</p><h1>Casos</h1></div>' +
      '<button class="btn" id="btnNuevoCaso" type="button">+ Nuevo caso</button></div>' +
      '<div class="stats" id="stats"></div>' +
      '<div class="filtros">' +
        '<input id="qCaso" class="buscador" type="search" placeholder="Buscar folio, cliente, asunto o pedido" value="' + esc(filtro.q) + '">' +
        '<select id="fEstado"><option value="abiertos">Abiertos</option><option value="todos">Todos</option>' +
          CRM.opciones(CRM.st.cfg.estados) + '</select>' +
      '</div>' +
      '<div id="listaCasos" class="lista"><p class="cargando">Cargando casos…</p></div>';
    $('#fEstado', cont).value = filtro.estado;
    $('#btnNuevoCaso', cont).onclick = function () { formularioNuevo(); };
    $('#fEstado', cont).onchange = function (e) { filtro.estado = e.target.value; filtro.semaforo = ''; cargar(); };
    const q = $('#qCaso', cont);
    q.oninput = function () { clearTimeout(temporizador); temporizador = setTimeout(function () { filtro.q = q.value; cargar(); }, 300); };
    await cargar();
  }

  const memoria = {};
  async function cargar() {
    const caja = $('#listaCasos');
    if (!caja) return;
    const clave = JSON.stringify(filtro);
    if (memoria[clave]) pintarLista(caja, memoria[clave]);   // muestra al instante lo último conocido
    try {
      const r = await CRM.llamar('ticketsListar', filtro);
      memoria[clave] = r;
      if (clave === JSON.stringify(filtro) && $('#listaCasos') === caja) pintarLista(caja, r);
    } catch (e) { if (!memoria[clave]) caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; else CRM.aviso(e.message, 'mal'); }
  }

  function pintarLista(caja, r) {
      pintarStats(r.conteo);
      if (!r.casos.length) {
        caja.innerHTML = '<div class="vacio-caja"><p class="eyebrow">Todo en orden</p><p>' +
          (filtro.q || filtro.semaforo ? 'No hay casos con ese filtro.' : 'No hay casos abiertos.') + '</p></div>';
        return;
      }
      caja.innerHTML = r.casos.map(function (t) {
        return '<button class="tarjeta caso sem-borde-' + esc(t.semaforo) + '" type="button" data-folio="' + esc(t.folio) + '">' +
          '<div class="caso-arriba"><span class="folio">' + esc(t.folio) + '</span>' + chipSemaforo(t) + '</div>' +
          '<strong>' + esc(t.asunto) + '</strong>' +
          '<span>' + esc(t.cliente) + (t.pedido ? ' · Pedido #' + esc(t.pedido) : '') + '</span>' +
          '<div class="chips">' + chipEstado(t) + '<span class="chip">' + esc(CRM.tipNombre(t.motivo)) + '</span><span class="chip">' + esc(t.canal) + '</span>' +
          (t.prioridad === 'Alta' || t.prioridad === 'Urgente' ? '<span class="chip alerta">' + esc(t.prioridad) + '</span>' : '') + '</div>' +
        '</button>';
      }).join('');
      caja.querySelectorAll('.caso').forEach(function (b) {
        b.onclick = function () { CRM.ir('tickets', { folio: b.dataset.folio }); };
      });
  }

  function pintarStats(c) {
    const s = $('#stats');
    if (!s) return;
    const item = function (clave, valor, etiqueta, clase) {
      return '<button type="button" class="stat ' + clase + (filtro.semaforo === clave ? ' activo' : '') + '" data-sem="' + clave + '">' +
        '<b>' + valor + '</b><span>' + etiqueta + '</span></button>';
    };
    s.innerHTML = item('', c.abiertos, 'Abiertos', '') + item('vencido', c.vencidos, 'Vencidos', 'rojo') +
      item('pronto', c.pronto, 'Por vencer', 'ambar') + '<div class="stat fijo"><b>' + c.resueltosHoy + '</b><span>Resueltos hoy</span></div>';
    s.querySelectorAll('button.stat').forEach(function (b) {
      b.onclick = function () {
        filtro.semaforo = filtro.semaforo === b.dataset.sem ? '' : b.dataset.sem;
        if (filtro.semaforo) filtro.estado = 'abiertos';
        const sel = $('#fEstado'); if (sel) sel.value = filtro.estado;
        cargar();
      };
    });
  }

  /* ───────── detalle ───────── */

  async function detalle(cont, folio) {
    const t = await CRM.llamar('ticketObtener', folio);
    const cfg = CRM.st.cfg;
    const wa = CRM.waLink(t.telefono, rellenar('Hola {nombre}, te escribimos de SEGES por tu caso {folio}.', t));

    cont.innerHTML =
      '<p><button class="btn-link" id="volver" type="button">← Casos</button></p>' +
      '<div class="encabezado"><div><p class="eyebrow">' + esc(t.folio) + ' · ' + esc(t.canal) + '</p><h1>' + esc(t.asunto) + '</h1></div>' +
        '<div class="chips">' + chipEstado(t) + chipSemaforo(t) + '</div></div>' +

      '<div class="pasos" id="pasos">' + cfg.estados.map(function (e, i) {
        const idx = cfg.estados.indexOf(t.estado);
        return '<button type="button" class="paso' + (i < idx ? ' hecho' : '') + (i === idx ? ' actual' : '') + '" data-estado="' + esc(e) + '">' +
          '<i>' + (i + 1) + '</i><span>' + esc(e) + '</span></button>';
      }).join('') + '</div>' +

      '<div class="columnas">' +
        '<section class="panel">' +
          '<p class="eyebrow">Datos del caso</p>' +
          '<div class="rejilla">' +
            dato('Cliente', '<button class="btn-link" id="irCliente" type="button">' + esc(t.cliente) + '</button>', true) +
            dato('Teléfono', esc(t.telefono), true) + dato('Pedido', t.pedido ? '#' + esc(t.pedido) : '', true) +
            dato('Tipificación', esc(CRM.tipNombre(t.motivo)), true) + dato('Prioridad', esc(t.prioridad), true) + dato('Atiende', esc(t.atendio), true) +
            dato('Creado', esc(CRM.fecha(t.creado)), true) + dato('Meta de respuesta', esc(CRM.fecha(t.vence)), true) +
            dato('Próximo contacto', esc(CRM.fecha(t.proximo, false)), true) +
          '</div>' +
          '<div class="acciones">' +
            '<button class="btn" id="btnResp" type="button">Respuesta rápida</button>' +
            (wa ? '<a class="btn sec" id="btnWa" href="' + esc(wa) + '" target="seges_whatsapp">Abrir WhatsApp</a>' : '') +
            '<button class="btn sec" id="btnEditar" type="button">Editar</button>' +
            (CRM.esAdmin() ? '<button class="btn peligro" id="btnBorrar" type="button">Borrar</button>' : '') +
          '</div>' +
        '</section>' +

        '<section class="panel">' +
          '<p class="eyebrow">Línea de tiempo</p>' +
          '<form id="fNota" class="nota-form">' +
            '<textarea name="texto" rows="2" placeholder="Escribe una nota, lo que dijo el cliente o lo que hiciste…" required></textarea>' +
            '<div class="fila"><select name="tipo">' + CRM.opciones(t.tiposNota.filter(function (x) { return x !== 'Sistema'; })) + '</select>' +
            '<button class="btn" type="submit">Agregar</button></div>' +
          '</form>' +
          '<ol class="linea">' + t.notas.map(function (n) {
            return '<li class="nota tipo-' + esc(n.tipo.toLowerCase().replace(/\s+/g, '-')) + '">' +
              '<div class="nota-cab"><span class="chip">' + esc(n.tipo) + '</span><small>' + esc(n.autor) + ' · ' + esc(CRM.fecha(n.fecha)) + '</small></div>' +
              '<p>' + esc(n.texto).replace(/\n/g, '<br>') + '</p></li>';
          }).join('') + '</ol>' +
        '</section>' +
      '</div>';

    $('#volver', cont).onclick = function () { CRM.ir('tickets'); };
    $('#irCliente', cont).onclick = function () { CRM.ir('clientes', { id: t.idCliente }); };
    $('#btnEditar', cont).onclick = function () { formularioEditar(t); };
    $('#btnResp', cont).onclick = function () { modalRespuesta(t); };
    if ($('#btnWa', cont)) $('#btnWa', cont).onclick = function () {
      CRM.llamar('ticketNota', t.folio, 'WhatsApp', 'Se abrió el chat de WhatsApp con el cliente.').catch(function () {});
    };
    if ($('#btnBorrar', cont)) $('#btnBorrar', cont).onclick = async function () {
      if (!(await CRM.confirmar('¿Borrar el caso ' + t.folio + ' y todas sus notas? No se puede deshacer.', 'Borrar'))) return;
      try { await CRM.llamar('ticketBorrar', t.folio); CRM.aviso('Caso borrado.'); CRM.ir('tickets'); }
      catch (e) { CRM.aviso(e.message, 'mal'); }
    };
    cont.querySelectorAll('.paso').forEach(function (b) {
      b.onclick = async function () {
        if (b.dataset.estado === t.estado) return;
        b.disabled = true;
        try {
          await CRM.llamar('ticketActualizar', t.folio, { estado: b.dataset.estado });
          CRM.aviso('Estado: ' + b.dataset.estado);
          CRM.ir('tickets', { folio: t.folio });
        } catch (e) { CRM.aviso(e.message, 'mal'); b.disabled = false; }
      };
    });
    $('#fNota', cont).onsubmit = async function (ev) {
      ev.preventDefault();
      const d = CRM.datosForm(ev.target), btn = $('button[type=submit]', ev.target);
      btn.disabled = true;
      try { await CRM.llamar('ticketNota', t.folio, d.tipo, d.texto); CRM.ir('tickets', { folio: t.folio }); }
      catch (e) { CRM.aviso(e.message, 'mal'); btn.disabled = false; }
    };
  }

  function dato(etiqueta, html, yaEscapado) {
    return '<div class="dato"><b>' + esc(etiqueta) + '</b>' + (html ? (yaEscapado ? html : esc(html)) : '—') + '</div>';
  }

  /* ───────── respuesta rápida ───────── */

  async function modalRespuesta(t) {
    const m = CRM.modal('<p class="eyebrow">Respuesta rápida · ' + esc(t.folio) + '</p><p class="cargando">Cargando plantillas…</p>');
    let lista;
    try { lista = await respuestas(); } catch (e) { m.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; return; }
    lista = lista.filter(function (r) { return r.canal === 'Todos' || r.canal === t.canal; });
    m.innerHTML =
      '<p class="eyebrow">Respuesta rápida · ' + esc(t.folio) + '</p><h2>Enviar a ' + esc(t.cliente) + '</h2>' +
      (lista.length
        ? '<div class="plantillas">' + lista.map(function (r, i) {
            return '<button type="button" class="pill-opcion' + (i === 0 ? ' activo' : '') + '" data-i="' + i + '">' + esc(r.nombre) + '</button>';
          }).join('') + '</div>'
        : '<p class="vacio">No hay plantillas. Créalas en la pestaña Respuestas.</p>') +
      '<label>Mensaje<textarea id="rTexto" rows="6"></textarea></label>' +
      '<div class="acciones">' +
        (t.telefono ? '<a class="btn" id="rWa" target="seges_whatsapp" href="#">Enviar por WhatsApp</a>' : '') +
        '<button class="btn sec" id="rCopiar" type="button">Copiar</button>' +
        '<button class="btn sec" id="rCerrar" type="button">Cerrar</button>' +
      '</div>' +
      '<p class="ayuda">Al enviar por WhatsApp el mensaje queda registrado en la línea de tiempo del caso.</p>';
    const area = $('#rTexto', m), wa = $('#rWa', m);
    const actualizar = function () { if (wa) wa.href = CRM.waLink(t.telefono, area.value); };
    const elegir = function (i) {
      m.querySelectorAll('.pill-opcion').forEach(function (b) { b.classList.toggle('activo', Number(b.dataset.i) === i); });
      area.value = lista[i] ? rellenar(lista[i].texto, t) : '';
      actualizar();
    };
    m.querySelectorAll('.pill-opcion').forEach(function (b) { b.onclick = function () { elegir(Number(b.dataset.i)); }; });
    area.oninput = actualizar;
    elegir(0);
    if (wa) wa.onclick = function () {
      const texto = area.value;
      CRM.cerrarModal();
      CRM.llamar('ticketNota', t.folio, 'WhatsApp', 'Mensaje enviado: ' + texto)
        .then(function () { CRM.ir('tickets', { folio: t.folio }); })
        .catch(function (e) { CRM.aviso(e.message, 'mal'); });
    };
    $('#rCopiar', m).onclick = function () {
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (!ok && navigator.clipboard) navigator.clipboard.writeText(area.value).then(function () { CRM.aviso('Mensaje copiado.'); });
      else CRM.aviso(ok ? 'Mensaje copiado.' : 'Selecciona el texto y cópialo.');
    };
    $('#rCerrar', m).onclick = CRM.cerrarModal;
  }

  /* ───────── selector de tipificación (Área → Tipificación) ───────── */

  function camposTip(actual) {
    const tips = CRM.st.cfg.tipificaciones || [];
    if (!tips.length) return '<label>Motivo<select name="motivo">' + CRM.opciones(CRM.st.cfg.motivos, actual) + '</select></label>';
    const areas = [];
    tips.forEach(function (x) { if (areas.indexOf(x.area) < 0) areas.push(x.area); });
    const ac = tips.filter(function (x) { return x.etiqueta === actual; })[0];
    return '<div class="rejilla">' +
      '<label>Área *<select id="tArea"><option value="">Elige el área…</option>' +
        areas.map(function (a) { return '<option' + (ac && ac.area === a ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Tipificación *<select name="motivo" id="tTip" required></select></label></div>';
  }

  /** Conecta los selects. alElegir(tip) se llama cuando cambia la tipificación. */
  function montarTip(m, actual, alElegir) {
    const tips = CRM.st.cfg.tipificaciones || [];
    const area = $('#tArea', m), sel = $('#tTip', m);
    if (!area || !sel) return;
    const llenar = function () {
      const lista = tips.filter(function (x) { return x.area === area.value; });
      let html = '<option value="">' + (area.value ? 'Elige la tipificación…' : 'Primero elige el área') + '</option>';
      if (actual && !tips.some(function (x) { return x.etiqueta === actual; }) && !area.value)
        html = '<option value="' + esc(actual) + '" selected>(anterior) ' + esc(CRM.tipNombre(actual)) + '</option>';
      html += lista.map(function (x) {
        return '<option value="' + esc(x.etiqueta) + '"' + (x.etiqueta === actual ? ' selected' : '') + '>' + esc(x.nombre) + '</option>';
      }).join('');
      sel.innerHTML = html;
      sel.disabled = !area.value && !sel.value;
    };
    area.onchange = function () { llenar(); alElegir(null); };
    sel.onchange = function () { alElegir(tips.filter(function (x) { return x.etiqueta === sel.value; })[0] || null); };
    llenar();
  }

  /* ───────── nuevo caso ───────── */

  async function formularioNuevo(idCliente) {
    const cfg = CRM.st.cfg;
    const m = CRM.modal(
      '<p class="eyebrow">Nuevo caso</p><h2>¿Quién escribe?</h2>' +
      '<form id="fCaso">' +
        '<input type="hidden" name="idCliente">' +
        '<div id="cliElegido" class="cli-elegido oculto"></div>' +
        '<div id="cliBuscar"><input id="cliQ" type="search" placeholder="Busca por nombre, teléfono o correo" autocomplete="off">' +
          '<div id="cliRes" class="cli-res"></div>' +
          '<p class="ayuda">¿Es nuevo? Primero dalo de alta en Clientes.</p></div>' +
        camposTip('') +
        '<label>Asunto *<input name="asunto" maxlength="150" required placeholder="Se llena al elegir la tipificación"></label>' +
        '<div class="rejilla">' +
          '<label>Canal<select name="canal">' + CRM.opciones(cfg.canales, 'WhatsApp') + '</select></label>' +
          '<label>Prioridad<select name="prioridad">' + CRM.opciones(cfg.prioridades, 'Normal') + '</select></label>' +
          '<label>Pedido Tiendanube<input name="pedido" inputmode="numeric" maxlength="30" placeholder="Ej. 1024"></label>' +
        '</div>' +
        '<label>Próximo contacto<input name="proximo" type="date"></label>' +
        '<label>Nota inicial<textarea name="nota" rows="3" placeholder="Lo que pidió el cliente"></textarea></label>' +
        '<p id="cErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Crear caso</button><button class="btn sec" type="button" id="cCancelar">Cancelar</button></div>' +
      '</form>');

    const f = $('#fCaso', m);
    let asuntoTocado = false;
    f.asunto.oninput = function () { asuntoTocado = f.asunto.value.trim() !== ''; };
    montarTip(m, '', function (tip) {
      if (!tip) return;
      if (!asuntoTocado) f.asunto.value = tip.asunto;
      if (cfg.prioridades.indexOf(tip.prioridad) >= 0) f.prioridad.value = tip.prioridad;
    });
    const elegir = function (c) {
      f.idCliente.value = c.id;
      $('#cliElegido', m).innerHTML = '<div><strong>' + esc(c.nombre) + '</strong><small>' + esc(c.id) + ' · ' + esc(c.telefono || c.correo) + '</small></div>' +
        '<button class="btn-link" type="button" id="cliCambiar">Cambiar</button>';
      $('#cliElegido', m).classList.remove('oculto');
      $('#cliBuscar', m).classList.add('oculto');
      $('#cliCambiar', m).onclick = function () {
        f.idCliente.value = '';
        $('#cliElegido', m).classList.add('oculto');
        $('#cliBuscar', m).classList.remove('oculto');
        $('#cliQ', m).focus();
      };
    };
    const buscar = async function (q) {
      const caja = $('#cliRes', m);
      if (!q || q.length < 2) { caja.innerHTML = ''; return; }
      try {
        const r = await CRM.llamar('clientesBuscar', q);
        caja.innerHTML = r.slice(0, 6).map(function (c, i) {
          return '<button type="button" class="cli-opcion" data-i="' + i + '"><strong>' + esc(c.nombre) + '</strong><small>' +
            esc(c.telefono) + (c.correo ? ' · ' + esc(c.correo) : '') + '</small></button>';
        }).join('') || '<p class="vacio">Sin resultados.</p>';
        caja.querySelectorAll('.cli-opcion').forEach(function (b) { b.onclick = function () { elegir(r[Number(b.dataset.i)]); }; });
      } catch (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; }
    };
    $('#cliQ', m).oninput = function (e) { clearTimeout(temporizador); temporizador = setTimeout(function () { buscar(e.target.value); }, 250); };
    if (idCliente) {
      try { const c = await CRM.llamar('clientesBuscar', idCliente); if (c[0]) elegir(c[0]); } catch (e) {}
    }
    $('#cCancelar', m).onclick = CRM.cerrarModal;
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      const btn = $('button[type=submit]', f);
      $('#cErr', m).textContent = '';
      btn.disabled = true;
      try {
        const r = await CRM.llamar('ticketCrear', CRM.datosForm(f));
        CRM.cerrarModal();
        CRM.aviso('Caso ' + r.folio + ' creado.');
        CRM.ir('tickets', { folio: r.folio });
      } catch (e) { $('#cErr', m).textContent = e.message; btn.disabled = false; }
    };
  }

  /* ───────── editar caso ───────── */

  function formularioEditar(t) {
    const cfg = CRM.st.cfg;
    const prox = t.proximo ? t.proximo.slice(0, 10) : '';
    const atiende = t.usuarios.indexOf(t.atendio) >= 0 ? t.usuarios : [t.atendio].concat(t.usuarios);
    const m = CRM.modal(
      '<p class="eyebrow">Editar · ' + esc(t.folio) + '</p><h2>' + esc(t.asunto) + '</h2>' +
      '<form id="fEd">' +
        camposTip(t.motivo) +
        '<label>Asunto<input name="asunto" maxlength="150" required value="' + esc(t.asunto) + '"></label>' +
        '<div class="rejilla">' +
          '<label>Canal<select name="canal">' + CRM.opciones(cfg.canales, t.canal) + '</select></label>' +
          '<label>Prioridad<select name="prioridad">' + CRM.opciones(cfg.prioridades, t.prioridad) + '</select></label>' +
          '<label>Atiende<select name="atendio">' + CRM.opciones(atiende, t.atendio) + '</select></label>' +
          '<label>Pedido Tiendanube<input name="pedido" maxlength="30" value="' + esc(t.pedido) + '"></label>' +
          '<label>Próximo contacto<input name="proximo" type="date" value="' + esc(prox) + '"></label>' +
        '</div>' +
        '<p id="eErr" class="error"></p>' +
        '<div class="acciones"><button class="btn" type="submit">Guardar</button><button class="btn sec" type="button" id="eCancelar">Cancelar</button></div>' +
      '</form>');
    const fe = $('#fEd', m);
    const tipActual = (cfg.tipificaciones || []).filter(function (x) { return x.etiqueta === t.motivo; })[0];
    let asuntoTocado = !tipActual || t.asunto !== tipActual.asunto;
    fe.asunto.oninput = function () { asuntoTocado = true; };
    montarTip(m, t.motivo, function (tip) { if (tip && !asuntoTocado) fe.asunto.value = tip.asunto; });
    $('#eCancelar', m).onclick = CRM.cerrarModal;
    fe.onsubmit = async function (ev) {
      ev.preventDefault();
      const btn = $('button[type=submit]', ev.target);
      const d = CRM.datosForm(ev.target);
      if (d.motivo === t.motivo || !d.motivo) delete d.motivo;   // sin cambio (o valor anterior fuera del catálogo)
      btn.disabled = true;
      try {
        const r = await CRM.llamar('ticketActualizar', t.folio, d);
        CRM.cerrarModal();
        CRM.aviso(r.cambios ? 'Cambios guardados.' : 'Sin cambios.');
        CRM.ir('tickets', { folio: t.folio });
      } catch (e) { $('#eErr', m).textContent = e.message; btn.disabled = false; }
    };
  }

  /* ───────── vista Respuestas ───────── */

  CRM.registrarVista('respuestas', {
    titulo: 'Respuestas',
    orden: 60,
    render: async function (cont) {
      const lista = await CRM.llamar('respuestasListar', true);
      CRM.st.respuestas = null;
      cont.innerHTML =
        '<div class="encabezado"><div><p class="eyebrow">Plantillas</p><h1>Respuestas rápidas</h1></div>' +
        '<button class="btn" id="btnNuevaResp" type="button">+ Nueva respuesta</button></div>' +
        '<p class="ayuda">Variables: {nombre} {folio} {pedido} {motivo} (tipificación). Se reemplazan solas al usarlas en un caso.</p>' +
        '<div class="lista">' + (lista.length ? lista.map(function (r, i) {
          return '<button class="tarjeta" type="button" data-i="' + i + '">' +
            '<div class="caso-arriba"><strong>' + esc(r.nombre) + '</strong><div class="chips"><span class="chip">' + esc(r.canal) + '</span>' +
            (r.activa ? '' : '<span class="chip">Inactiva</span>') + '</div></div>' +
            '<span>' + esc(r.texto) + '</span></button>';
        }).join('') : '<p class="vacio">Aún no hay respuestas.</p>') + '</div>';
      $('#btnNuevaResp', cont).onclick = function () { editarResp({ canal: 'Todos', activa: true }); };
      cont.querySelectorAll('.tarjeta').forEach(function (b) { b.onclick = function () { editarResp(lista[Number(b.dataset.i)]); }; });
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
        (r.id && CRM.esAdmin() ? '<button class="btn peligro" type="button" id="pBorrar">Borrar</button>' : '') +
        '<button class="btn sec" type="button" id="pCancelar">Cancelar</button></div>' +
      '</form>');
    $('#pCancelar', m).onclick = CRM.cerrarModal;
    if ($('#pBorrar', m)) $('#pBorrar', m).onclick = async function () {
      try { await CRM.llamar('respuestaBorrar', r.id); CRM.cerrarModal(); CRM.aviso('Respuesta borrada.'); CRM.ir('respuestas'); }
      catch (e) { $('#pErr', m).textContent = e.message; }
    };
    $('#fResp', m).onsubmit = async function (ev) {
      ev.preventDefault();
      const d = CRM.datosForm(ev.target);
      d.activa = ev.target.activa.checked;
      if (r.id) d.id = r.id;
      try { await CRM.llamar('respuestaGuardar', d); CRM.cerrarModal(); CRM.aviso('Respuesta guardada.'); CRM.ir('respuestas'); }
      catch (e) { $('#pErr', m).textContent = e.message; }
    };
  }
})();
CRM.arrancar();
