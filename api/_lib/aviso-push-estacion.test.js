// api/_lib/aviso-push-estacion.test.js — UX (2026-09-20), punto 4: el permiso de Push explica para qué sirve y la
// tarjeta de la Estación ofrece "🔔 Avisarme 1 hora antes" — respetando el estado REAL del permiso y del
// dispositivo (nunca ofrece activar algo que ya está activo).
// Se ejecuta el código REAL de public/workbook/index.html en un contexto `vm`. Sin red, sin Firebase, sin Push real.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const PAGINA = fs.readFileSync(new URL('../../public/workbook/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function funcion(nombre) {
  const i = PAGINA.indexOf(`function ${nombre}(`);
  assert.ok(i > 0, `no se encontró ${nombre}`);
  const j = PAGINA.indexOf('\n}\n', i);
  return PAGINA.slice(i, j + 3);
}
// Bloque nuevo: saveFcmToken + estado/HTML/activación del aviso + textos del modal
const I4 = PAGINA.indexOf('let _wbFcmRegistroEnCurso = false;');
const F4 = PAGINA.lastIndexOf('// ═', PAGINA.indexOf('// DATA MODEL', I4));
assert.ok(I4 > 0 && F4 > I4, 'no se encontró el bloque del aviso');
const BLOQUE_AVISO = PAGINA.slice(I4, F4);
// Bloque de Estaciones (pintado de tarjetas), para la prueba de integración
const I2 = PAGINA.indexOf('const HITO_NOMBRES_WB = {');
const F2 = PAGINA.indexOf('// Puerta 5, Corte 8 (pendiente cerrado, diseño aprobado 2026-09-12):', I2);
const BLOQUE_ESTACIONES = PAGINA.slice(I2, F2);

const F1 = '2026-10-08T00:00:00.000Z';
const F2S = '2026-10-09T00:00:00.000Z';
const F3S = '2026-10-10T00:00:00.000Z';
const hitos3 = (ex = {}) => [
  { hito: 1, fecha: F1, disponible: false, completado: false, enlaceEnVivo: null, enlaceReplay: null, ...(ex[1] || {}) },
  { hito: 2, fecha: F2S, disponible: false, completado: false, enlaceEnVivo: null, enlaceReplay: null, ...(ex[2] || {}) },
  { hito: 3, fecha: F3S, disponible: false, completado: false, enlaceEnVivo: null, enlaceReplay: null, ...(ex[3] || {}) },
];

function crearEntorno({
  permiso = 'default', registradoComo = null, bootcamp = true, ios = false, standalone = false, soportado = true, usuario = true,
  respuestaPermiso = 'granted', sinRegistroSW = false, tokenNulo = false, fallaLegado = false, fallaDispositivo = false, hitos = hitos3(),
  ahora = Date.parse('2026-09-20T12:00:00Z'),
} = {}) {
  const spies = { permisoPedido: 0, escrituras: [], toasts: [], cerrarZoom: 0, escriturasWrap: 0, foreground: 0 };
  const almacen = {};
  if (registradoComo) almacen.soberana_fcm_registrado = JSON.stringify({ email: registradoComo, en: '2026-09-19T00:00:00Z' });
  const cont = { innerHTML: '' };
  let htmlWrap = '';
  const wrap = {
    style: {}, get innerHTML() { return htmlWrap; }, set innerHTML(v) { htmlWrap = v; spies.escriturasWrap++; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const Notification = {
    permission: permiso,
    requestPermission: async () => { spies.permisoPedido++; Notification.permission = respuestaPermiso; return respuestaPermiso; },
  };
  const base = { matchMedia: () => ({ matches: standalone }), addEventListener() {} };
  const ventana = soportado ? { ...base, Notification, PushManager: {} } : base;
  const coleccion = (nombre) => ({
    doc: () => ({
      set: async (d) => {
        spies.escrituras.push({ ruta: nombre, datos: d });
        if (nombre === 'tokens' && fallaLegado) throw new Error('legado rechazado');
      },
      collection: (n2) => ({ doc: () => ({ set: async (d) => { spies.escrituras.push({ ruta: `${nombre}/${n2}`, datos: d }); if (fallaDispositivo) throw new Error('dispositivo rechazado'); } }) }),
    }),
  });
  class FechaFalsa extends Date { constructor(...a) { if (a.length) super(...a); else super(ahora); } static now() { return ahora; } }
  const ctx = vm.createContext({
    Date: FechaFalsa, Intl, JSON, Object, Array, String, Number, Math, isFinite, isNaN, console: { log() {}, warn() {}, error() {} },
    window: ventana, Notification: soportado ? Notification : undefined,
    navigator: {
      userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' : 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      standalone: standalone && ios, platform: 'Win32',
      serviceWorker: { getRegistration: async () => (sinRegistroSW ? null : { scope: '/workbook/' }) },
    },
    localStorage: { getItem: (k) => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } },
    state: { user: usuario ? { email: 'ana@correo.com', name: 'Ana' } : null, bootcampHitos: bootcamp ? { cohorteId: 'c', hitos, bootcampCompletado: false } : null },
    document: { getElementById: (id) => (id === 'wb-aviso-push' ? cont : id === 'bootcamp-hitos-block' ? wrap : null), visibilityState: 'visible', addEventListener() {} },
    setTimeout() { return 1; }, clearTimeout() {},
    firebase: { messaging: () => ({ getToken: async () => (tokenNulo ? null : 'token-de-prueba-123') }) },
    db: { collection: coleccion },
    FCM_VAPID: 'vapid', showToast: (m) => spies.toasts.push(m),
    iniciarForegroundPush: () => { spies.foreground++; },
    wbConfirmarHitoVisto() {}, wbReverificarPuertaB() { return Promise.resolve(false); }, wbRefrescarSesionTrasHito() { return Promise.resolve(true); },
    fetch: () => Promise.reject(new Error('sin red')),
  });
  ctx.window.cerrarZoomEmbebidoActivo = () => { spies.cerrarZoom++; };
  vm.runInContext([funcion('estaInstalada'), funcion('pushSoportado'), BLOQUE_AVISO, BLOQUE_ESTACIONES].join('\n') + `
    this.api = { wbEstadoAvisoPush, wbHtmlAvisoPush, wbPintarAvisoPush, wbActivarAvisoEstacion, wbTextosModalPush, saveFcmToken,
                 render: renderBootcampHitosBlock, enCurso: (v) => { _wbFcmRegistroEnCurso = v; } };`, ctx);
  return { api: ctx.api, ctx, spies, almacen, cont, wrap, Notification, html: () => htmlWrap };
}
const HAY_BOTON = /<button[^>]*id="wb-aviso-push-btn"[^>]*>🔔 Avisarme 1 hora antes<\/button>/;

// ── Estado 1: Push YA AUTORIZADO (y dispositivo registrado) ─────────────────
test('Push YA AUTORIZADO y dispositivo registrado: NO hay botón; solo la confirmación "Te avisaremos 1 hora antes"', () => {
  const e = crearEntorno({ permiso: 'granted', registradoComo: 'ana@correo.com' });
  assert.equal(e.api.wbEstadoAvisoPush(), 'activo');
  e.api.wbPintarAvisoPush();
  assert.ok(!/<button/.test(e.cont.innerHTML), 'ningún botón que parezca pedir activar otra vez');
  assert.match(e.cont.innerHTML, /🔔 Te avisaremos 1 hora antes\./);
  assert.equal(e.spies.permisoPedido, 0);
  assert.equal(e.spies.escrituras.length, 0, 'no se registra nada de nuevo');
});

// ── Estado 2: Push NO AUTORIZADO ────────────────────────────────────────────
test('Push NO autorizado (nunca decidió): botón "🔔 Avisarme 1 hora antes"; al pulsarlo pide permiso UNA vez, registra el dispositivo y pasa a "activo"', async () => {
  const e = crearEntorno({ permiso: 'default', respuestaPermiso: 'granted' });
  assert.equal(e.api.wbEstadoAvisoPush(), 'permitir');
  e.api.wbPintarAvisoPush();
  assert.match(e.cont.innerHTML, HAY_BOTON);

  const boton = { disabled: false, textContent: '🔔 Avisarme 1 hora antes' };
  const promesa = e.api.wbActivarAvisoEstacion(boton);
  assert.equal(boton.disabled, true);
  assert.equal(boton.textContent, 'Activando…');
  assert.equal(e.spies.permisoPedido, 1, 'requestPermission se llama de inmediato, dentro del clic (iOS lo exige)');
  await promesa;

  assert.equal(e.spies.permisoPedido, 1);
  assert.deepEqual(e.spies.escrituras.map((x) => x.ruta), ['tokens', 'dispositivos_push/tokens']);
  assert.equal(e.api.wbEstadoAvisoPush(), 'activo');
  assert.match(e.cont.innerHTML, /Te avisaremos 1 hora antes/);
  assert.ok(!/<button/.test(e.cont.innerHTML));
  assert.equal(JSON.parse(e.almacen.soberana_fcm_registrado).email, 'ana@correo.com');
});

test('Push NO autorizado: si rechaza el diálogo del navegador → texto de "bloqueadas", sin registrar nada ni molestar con un aviso', async () => {
  const e = crearEntorno({ permiso: 'default', respuestaPermiso: 'denied' });
  e.api.wbPintarAvisoPush();
  await e.api.wbActivarAvisoEstacion({ disabled: false, textContent: '' });
  assert.equal(e.spies.escrituras.length, 0);
  assert.equal(e.api.wbEstadoAvisoPush(), 'bloqueado');
  assert.match(e.cont.innerHTML, /bloqueadas\. Actívalas en los ajustes de tu navegador/);
  assert.ok(!/<button/.test(e.cont.innerHTML));
  assert.equal(e.spies.toasts.length, 0);
});

test('Push NO autorizado: si cierra el diálogo sin decidir → el botón sigue ahí (puede volver a intentarlo)', async () => {
  const e = crearEntorno({ permiso: 'default', respuestaPermiso: 'default' });
  await e.api.wbActivarAvisoEstacion({ disabled: false, textContent: '' });
  assert.equal(e.spies.escrituras.length, 0);
  assert.equal(e.api.wbEstadoAvisoPush(), 'permitir');
  assert.match(e.cont.innerHTML, HAY_BOTON);
});

test('Push BLOQUEADO por el navegador (denied): sin botón, con la salida; nunca vuelve a pedir permiso', () => {
  const e = crearEntorno({ permiso: 'denied' });
  assert.equal(e.api.wbEstadoAvisoPush(), 'bloqueado');
  e.api.wbPintarAvisoPush();
  assert.ok(!/<button/.test(e.cont.innerHTML));
  assert.equal(e.spies.permisoPedido, 0);
});

// ── Estado 3: usuario SIN DISPOSITIVO REGISTRADO ────────────────────────────
test('SIN DISPOSITIVO REGISTRADO (permiso concedido, pero este dispositivo no quedó guardado): botón que REINTENTA el registro sin volver a pedir permiso', async () => {
  const e = crearEntorno({ permiso: 'granted', registradoComo: null });
  assert.equal(e.api.wbEstadoAvisoPush(), 'sin_dispositivo');
  e.api.wbPintarAvisoPush();
  assert.match(e.cont.innerHTML, HAY_BOTON);

  await e.api.wbActivarAvisoEstacion({ disabled: false, textContent: '' });
  assert.equal(e.spies.permisoPedido, 0, 'ya tiene permiso: NO se vuelve a pedir');
  assert.deepEqual(e.spies.escrituras.map((x) => x.ruta), ['tokens', 'dispositivos_push/tokens']);
  assert.equal(e.api.wbEstadoAvisoPush(), 'activo');
  assert.ok(!/<button/.test(e.cont.innerHTML));
});

test('SIN DISPOSITIVO REGISTRADO y el registro vuelve a fallar: avisa con claridad y el botón sigue para reintentar', async () => {
  const e = crearEntorno({ permiso: 'granted', fallaDispositivo: true });
  await e.api.wbActivarAvisoEstacion({ disabled: false, textContent: '' });
  assert.equal(e.spies.toasts.length, 1);
  assert.equal(e.spies.toasts[0], 'No pudimos activar el aviso. Inténtalo de nuevo.');
  assert.equal(e.almacen.soberana_fcm_registrado, undefined, 'no se marca como registrado si falló');
  assert.equal(e.api.wbEstadoAvisoPush(), 'sin_dispositivo');
  assert.match(e.cont.innerHTML, HAY_BOTON);
});

test('el registro de OTRA cuenta en este dispositivo no cuenta: sigue sin dispositivo registrado para esta usuaria', () => {
  const e = crearEntorno({ permiso: 'granted', registradoComo: 'otra@correo.com' });
  assert.equal(e.api.wbEstadoAvisoPush(), 'sin_dispositivo');
});

test('mientras el registro está EN CURSO no se ofrece nada (evita el parpadeo del botón al abrir la app)', () => {
  const e = crearEntorno({ permiso: 'granted', registradoComo: null });
  e.api.enCurso(true);
  assert.equal(e.api.wbEstadoAvisoPush(), 'no_aplica');
  e.api.wbPintarAvisoPush();
  assert.equal(e.cont.innerHTML, '');
});

// ── Cuándo NO aplica ────────────────────────────────────────────────────────
test('no aplica (no se muestra nada): sin Estaciones, sin sesión, navegador sin Push, iPhone sin instalar', () => {
  assert.equal(crearEntorno({ bootcamp: false }).api.wbEstadoAvisoPush(), 'no_aplica');
  assert.equal(crearEntorno({ usuario: false }).api.wbEstadoAvisoPush(), 'no_aplica');
  assert.equal(crearEntorno({ soportado: false }).api.wbEstadoAvisoPush(), 'no_aplica');
  assert.equal(crearEntorno({ ios: true, standalone: false }).api.wbEstadoAvisoPush(), 'no_aplica', 'Safari no puede pedir permiso sin la app instalada');
  assert.equal(crearEntorno({ ios: true, standalone: true, permiso: 'default' }).api.wbEstadoAvisoPush(), 'permitir', 'iPhone con la app instalada sí');
  const e = crearEntorno({ bootcamp: false });
  e.api.wbPintarAvisoPush();
  assert.equal(e.cont.innerHTML, '');
});

// ── saveFcmToken: mismos guardados de siempre + resultado ───────────────────
test('saveFcmToken: éxito → true, mismos dos guardados con la MISMA forma que exigen las reglas de Firestore, y marca el dispositivo', async () => {
  const e = crearEntorno({ permiso: 'granted' });
  const ok = await e.api.saveFcmToken();
  assert.equal(ok, true);
  const [legado, disp] = e.spies.escrituras;
  assert.deepEqual(Object.keys(legado.datos).sort(), ['email', 'fecha', 'token']);
  assert.equal(legado.datos.email, 'ana@correo.com');
  assert.deepEqual(Object.keys(disp.datos).sort(), ['actualizadoEn', 'plataforma', 'token']);
  assert.equal(disp.datos.token, 'token-de-prueba-123');
  assert.equal(JSON.parse(e.almacen.soberana_fcm_registrado).email, 'ana@correo.com');
  assert.equal(e.spies.foreground, 1);
});

test('saveFcmToken: sin service worker, sin token o con un guardado rechazado → false y NUNCA marca el dispositivo', async () => {
  for (const opcion of [{ sinRegistroSW: true }, { tokenNulo: true }, { fallaLegado: true }, { fallaDispositivo: true }]) {
    const e = crearEntorno({ permiso: 'granted', ...opcion });
    assert.equal(await e.api.saveFcmToken(), false, JSON.stringify(opcion));
    assert.equal(e.almacen.soberana_fcm_registrado, undefined, JSON.stringify(opcion));
  }
});

test('saveFcmToken: al terminar repinta el recuadro del aviso (la tarjeta pasa sola de botón a confirmación)', async () => {
  const e = crearEntorno({ permiso: 'granted' });
  e.api.wbPintarAvisoPush();
  assert.match(e.cont.innerHTML, HAY_BOTON);
  await e.api.saveFcmToken();
  assert.match(e.cont.innerHTML, /Te avisaremos 1 hora antes/);
});

// ── Integración con la tarjeta de la Estación ───────────────────────────────
const contarRecuadros = (html) => (html.match(/id="wb-aviso-push"/g) || []).length;

test('el recuadro va SOLO en la tarjeta de la PRÓXIMA Estación (la primera que ni está completada ni abierta)', () => {
  const e = crearEntorno({ permiso: 'default' });
  e.api.render();
  assert.equal(contarRecuadros(e.html()), 1);
  assert.ok(e.html().indexOf('wb-aviso-push') < e.html().indexOf('Estación 2'), 'dentro de la Estación 1');

  const e2 = crearEntorno({ permiso: 'default', hitos: hitos3({ 1: { completado: true } }) });
  e2.api.render();
  assert.equal(contarRecuadros(e2.html()), 1);
  assert.ok(e2.html().indexOf('wb-aviso-push') > e2.html().indexOf('Estación 2'), 'ahora en la Estación 2');

  const e3 = crearEntorno({ permiso: 'default', hitos: hitos3({ 1: { disponible: true, enlaceEnVivo: 'https://z.example/1' } }) });
  e3.api.render();
  assert.equal(contarRecuadros(e3.html()), 1, 'la Estación 1 está abierta: el aviso pasa a la próxima');
  assert.ok(e3.html().indexOf('wb-aviso-push') > e3.html().indexOf('Estación 2'));

  const e4 = crearEntorno({ permiso: 'default', hitos: hitos3({ 1: { completado: true }, 2: { completado: true }, 3: { disponible: true } }) });
  e4.api.render();
  assert.equal(contarRecuadros(e4.html()), 0, 'sin Estaciones por venir no hay aviso');
});

test('al pintar la tarjeta, el recuadro queda con el botón (o la confirmación) según el estado real', () => {
  const nuevo = crearEntorno({ permiso: 'default' });
  nuevo.api.render();
  assert.match(nuevo.cont.innerHTML, HAY_BOTON);
  const activo = crearEntorno({ permiso: 'granted', registradoComo: 'ana@correo.com' });
  activo.api.render();
  assert.match(activo.cont.innerHTML, /Te avisaremos 1 hora antes/);
});

test('activar el aviso NO reconstruye las tarjetas (no puede cerrar un Zoom embebido activo)', async () => {
  const e = crearEntorno({ permiso: 'default' });
  e.api.render();
  const escrituras = e.spies.escriturasWrap;
  await e.api.wbActivarAvisoEstacion({ disabled: false, textContent: '' });
  assert.equal(e.spies.escriturasWrap, escrituras, 'solo cambia el recuadro');
  assert.equal(e.spies.cerrarZoom, 0);
});

// ── Texto del permiso ───────────────────────────────────────────────────────
test('el texto del permiso con Estaciones es exactamente el aprobado; sin Estaciones (venta directa) queda el de siempre', () => {
  const con = crearEntorno({ bootcamp: true }).api.wbTextosModalPush();
  assert.deepEqual({ ...con }, {
    titulo: 'Que no se te pase ninguna Estación',
    cuerpo: 'Te avisaremos un día antes y una hora antes de cada Estación, para que no tengas que estar pendiente del reloj.',
    boton: 'Activar avisos',
  });
  const sin = crearEntorno({ bootcamp: false }).api.wbTextosModalPush();
  assert.deepEqual({ ...sin }, {
    titulo: 'No te pierdas nada',
    cuerpo: 'Recibe mensajes de Josué y celebraciones de la comunidad directamente en tu celular',
    boton: 'Activar notificaciones',
  });
});

test('el modal real usa ese texto (ids presentes y maybeShowNotifModal lo aplica antes de abrirse)', () => {
  assert.ok(PAGINA.includes('id="notif-modal-title"') && PAGINA.includes('id="notif-modal-body"'));
  const f = funcion('maybeShowNotifModal');
  assert.ok(f.includes('wbTextosModalPush()'));
  assert.ok(f.indexOf('wbTextosModalPush()') < f.indexOf("classList.add('open')"), 'el texto se pone antes de abrir el modal');
  assert.ok(PAGINA.includes('posponerPushDesdeModal()">Ahora no</button>'), '"Ahora no" no cambió');
});
