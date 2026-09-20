// api/_lib/estacion-actualizacion.test.js — UX (2026-09-20), punto 2: la tarjeta de cada Estación se
// abre sola a la hora exacta, SIN polling, cron ni infraestructura nueva.
//
// Se ejecuta el código REAL de public/workbook/index.html (helpers + renderBootcampHitosBlock) dentro
// de un contexto `vm` con un reloj falso y un DOM mínimo. Sin red, sin Firebase.
//
// Pruebas obligatorias (aprobadas): (a) NUNCA volver a pintar mientras haya un Zoom embebido activo o
// conectándose; (b) un reloj adelantado no permite entrar antes de hora — la decisión es de Orbit.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const PAGINA = fs.readFileSync(new URL('../../public/workbook/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const INI = PAGINA.indexOf('const HITO_NOMBRES_WB = {');
const FIN = PAGINA.indexOf('// Puerta 5, Corte 8 (pendiente cerrado, diseño aprobado 2026-09-12):', INI);
assert.ok(INI > 0 && FIN > INI, 'no se encontró el bloque de Estaciones en la página');
const CODIGO = PAGINA.slice(INI, FIN);

// ── Datos: fechas reales de la cohorte del primer Bootcamp ─────────────────
const F1 = Date.parse('2026-10-08T00:00:00.000Z'); // miércoles 7-oct 7:00 p. m. Bogotá
const F2 = Date.parse('2026-10-09T00:00:00.000Z');
const F3 = Date.parse('2026-10-10T00:00:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

const hitosBase = (extra = {}) => [
  { hito: 1, fecha: iso(F1), disponible: false, completado: false, enlaceEnVivo: 'https://zoom.example/j/1', enlaceReplay: null, ...(extra[1] || {}) },
  { hito: 2, fecha: iso(F2), disponible: false, completado: false, enlaceEnVivo: 'https://zoom.example/j/2', enlaceReplay: null, ...(extra[2] || {}) },
  { hito: 3, fecha: iso(F3), disponible: false, completado: false, enlaceEnVivo: 'https://zoom.example/j/3', enlaceReplay: null, ...(extra[3] || {}) },
];

// ── Entorno falso: reloj, temporizadores, DOM mínimo, espías ────────────────
function crearEntorno({ ahora, hitos = hitosBase(), respuestasFetch = [] }) {
  let reloj = ahora;
  let secuencia = 0;
  let pendientes = [];
  const spies = { abrir: [], cerrarZoom: 0, toasts: [], refrescos: 0, fetchs: [], escrituras: 0, timeoutsCreados: 0 };
  const docListeners = {};
  const winListeners = {};

  class FechaFalsa extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj); }
    static now() { return reloj; }
  }

  const estado = { embedActivo: false, conectando: false };
  let html = '';
  let botones = [];
  let htmlDeLosBotones = null;
  const wrap = {
    style: {},
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; spies.escrituras++; },
    querySelector(sel) {
      if (sel === '[data-zoom-embed-activo]') return estado.embedActivo ? {} : null;
      if (sel === '[data-wb-vivo-btn][disabled]') return estado.conectando ? {} : null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-wb-vivo-btn]') {
        if (htmlDeLosBotones !== html) {
          htmlDeLosBotones = html;
          botones = [...html.matchAll(/data-wb-vivo-btn data-hito="(\d)" data-enlace-generico="([^"]+)"/g)].map((m) => {
            const b = { dataset: { hito: m[1], enlaceGenerico: m[2] }, textContent: '🔴 Entrar en vivo', disabled: false, style: {}, listeners: {}, addEventListener(ev, fn) { this.listeners[ev] = fn; } };
            return b;
          });
        }
        return botones;
      }
      return [];
    },
  };
  const contenedor = { id: '', dataset: {}, style: {} };

  const ctx = vm.createContext({
    Date: FechaFalsa, Intl, Number, Math, JSON, Object, Array, String, parseInt, isFinite, isNaN, console: { log() {}, warn() {} },
    setTimeout(fn, ms) { const id = ++secuencia; spies.timeoutsCreados++; pendientes.push({ id, fn, en: reloj + ms, ms }); return id; },
    clearTimeout(id) { pendientes = pendientes.filter((t) => t.id !== id); },
    document: {
      visibilityState: 'visible',
      getElementById(id) { if (id === 'bootcamp-hitos-block') return wrap; if (id.startsWith('wb-zoom-embed-')) { contenedor.id = id; return contenedor; } return null; },
      addEventListener(ev, fn) { docListeners[ev] = fn; },
    },
    window: {
      addEventListener(ev, fn) { winListeners[ev] = fn; },
      open(...a) { spies.abrir.push(a); },
      cerrarZoomEmbebidoActivo() { spies.cerrarZoom++; },
      vincularReplayBunny() {},
    },
    state: { bootcampHitos: { cohorteId: 'c1', hitos, bootcampCompletado: false } },
    showToast(m) { spies.toasts.push(m); },
    wbRefrescarSesionTrasHito() { spies.refrescos++; return Promise.resolve(true); },
    wbConfirmarHitoVisto() {},
    wbReverificarPuertaB() { return Promise.resolve(false); },
    fetch(url) {
      spies.fetchs.push(String(url));
      const r = respuestasFetch.shift();
      if (!r) return Promise.reject(new Error('fetch inesperado: ' + url));
      return Promise.resolve({ status: r.status || 200, headers: { get: (k) => (k === 'Date' && r.date ? r.date : null) }, json: () => Promise.resolve(r.json) });
    },
  });
  vm.runInContext(CODIGO + `
    this.api = {
      wbHitoDisponible, wbRevaluarHitos, wbRegistrarHoraServidor, wbAhoraMs, wbFirmaHitos, wbProgramarTransicionHitos,
      render: renderBootcampHitosBlock,
      negada: () => _wbNegadaPorServidor,
      temporizador: () => _wbTimerHitos,
    };`, ctx);

  // Reloj falso: ejecuta en orden los temporizadores vencidos
  const avanzarA = (t) => {
    for (;;) {
      const vencidos = pendientes.filter((p) => p.en <= t).sort((a, b) => a.en - b.en);
      if (!vencidos.length) break;
      const p = vencidos[0];
      pendientes = pendientes.filter((x) => x.id !== p.id);
      reloj = Math.max(reloj, p.en);
      p.fn();
    }
    reloj = t;
  };
  return {
    api: ctx.api, ctx, spies, estado, wrap, contenedor, docListeners, winListeners,
    hoy: () => reloj,
    pendientes: () => pendientes.slice(),
    avanzar: (ms) => avanzarA(reloj + ms),
    avanzarA,
    // el reloj avanza SIN ejecutar temporizadores (teléfono dormido / pestaña congelada)
    dormir: (ms) => { reloj += ms; },
    hitos: () => ctx.state.bootcampHitos.hitos,
    html: () => html,
  };
}
const DISPONIBLE = /<div style="[^"]*">Disponible<\/div>/;

// ═════════════════════════════════════════════════════════════════════════
test('wbHitoDisponible: Orbit dice sí → sí; fecha futura → no; fecha pasada → sí; "aún no" de Orbit gana al reloj; fecha inválida → no', () => {
  const e = crearEntorno({ ahora: F1 - 60_000 });
  const { api } = e;
  assert.equal(api.wbHitoDisponible({ hito: 1, fecha: iso(F1), disponible: true }), true);
  assert.equal(api.wbHitoDisponible({ hito: 1, fecha: iso(F1), disponible: false }), false, 'aún faltan 60 s');
  e.dormir(120_000);
  assert.equal(api.wbHitoDisponible({ hito: 1, fecha: iso(F1), disponible: false }), true, 'ya pasó la fecha');
  api.negada()[1] = true;
  assert.equal(api.wbHitoDisponible({ hito: 1, fecha: iso(F1), disponible: false }), false, 'Orbit dijo aún no');
  assert.equal(api.wbHitoDisponible({ hito: 1, fecha: iso(F1), disponible: true }), true, 'un dato del servidor con disponible:true manda');
  assert.equal(api.wbHitoDisponible({ hito: 2, fecha: 'basura', disponible: false }), false);
  assert.equal(api.wbHitoDisponible({ hito: 2, fecha: null, disponible: false }), false);
});

test('se abre SOLA a la hora exacta, sin recargar y sin pedir nada al servidor (fetch prohibido)', () => {
  const e = crearEntorno({ ahora: F1 - 30_000 }); // 6:59:30 p. m.
  e.api.render();
  assert.match(e.html(), /🔒 Próximamente/);
  assert.ok(!DISPONIBLE.test(e.html()));

  e.avanzarA(F1 + 299); // justo antes del margen de 300 ms
  assert.match(e.html().slice(0, e.html().indexOf('VOLVER')), /Próximamente/, 'todavía no');
  e.avanzarA(F1 + 400);
  assert.match(e.html(), DISPONIBLE, 'a las 7:00 p. m. la tarjeta de la Estación 1 dice Disponible');
  assert.match(e.html(), /🔴 Entrar en vivo/);
  assert.equal(e.spies.fetchs.length, 0, 'cero peticiones: todo salió del dato que ya tenía');
  assert.equal((e.html().match(/Próximamente/g) || []).length, 2, 'Estaciones 2 y 3 siguen bloqueadas');
});

test('UN solo temporizador, hacia la próxima Estación por abrir (no uno por Estación, no repetido)', () => {
  const e = crearEntorno({ ahora: F1 - 60_000 });
  e.api.render();
  const p = e.pendientes();
  assert.equal(p.length, 1);
  assert.equal(p[0].ms, 60_300, '60 s + 300 ms de margen');
  // pintar varias veces no apila temporizadores
  for (let i = 0; i < 6; i++) e.api.render();
  assert.equal(e.pendientes().length, 1, 'el temporizador se reemplaza, no se acumula');
  // al vencer, se programa el siguiente (Estación 2), sigue siendo uno solo
  e.avanzarA(F1 + 1000);
  assert.equal(e.pendientes().length, 1);
  assert.equal(e.pendientes()[0].en, F2 + 300);
});

test('cero polling: sin nada por abrir no hay temporizador, y un día entero después no se crea ninguno más', () => {
  const e = crearEntorno({ ahora: F3 + 3600_000, hitos: hitosBase({ 1: { disponible: true, completado: true }, 2: { disponible: true }, 3: { disponible: true } }) });
  e.api.render();
  assert.equal(e.pendientes().length, 0);
  const antes = e.spies.timeoutsCreados;
  e.avanzar(24 * 3600_000);
  assert.equal(e.spies.timeoutsCreados, antes, 'ningún temporizador nuevo');
  assert.equal(e.spies.fetchs.length, 0);
});

test('el código nuevo no usa setInterval ni fetch, y solo crea el setTimeout único (garantía por lectura del código)', () => {
  const i = CODIGO.indexOf('let _wbOffsetServidorMs');
  const j = CODIGO.indexOf('function renderBootcampHitosBlock(');
  // sin comentarios: un comentario puede nombrar setTimeout sin usarlo
  const bloque = CODIGO.slice(i, j).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/setInterval\s*\(/.test(bloque), 'sin setInterval');
  assert.ok(!/\bfetch\s*\(/.test(bloque), 'sin fetch');
  assert.equal((bloque.match(/setTimeout\s*\(/g) || []).length, 1, 'un solo setTimeout');
  assert.ok(!/setInterval\s*\(/.test(PAGINA.slice(PAGINA.indexOf('function wbRegistrarHoraServidor('), PAGINA.indexOf('function renderBootcampHitosBlock('))));
});

test('teléfono dormido: el temporizador no corrió, pero al volver a la app (visibilitychange/pageshow/focus) la tarjeta se abre', () => {
  for (const evento of ['visibilitychange', 'pageshow', 'focus']) {
    const e = crearEntorno({ ahora: F1 - 30_000 });
    e.api.render();
    e.dormir(90_000); // pasan las 7:00 con el temporizador congelado
    assert.ok(!DISPONIBLE.test(e.html()), 'sigue mostrando el estado viejo mientras no vuelva');
    const oyente = evento === 'visibilitychange' ? e.docListeners.visibilitychange : e.winListeners[evento];
    assert.equal(typeof oyente, 'function', `hay oyente de ${evento}`);
    oyente();
    assert.match(e.html(), DISPONIBLE, `tras ${evento} se abre`);
    assert.equal(e.spies.fetchs.length, 0);
  }
});

test('el Push tocado con la app ya abierta enfoca la ventana (focus): la tarjeta se actualiza', () => {
  const e = crearEntorno({ ahora: F1 - 300_000 }); // 6:55 p. m., app abierta
  e.api.render();
  e.dormir(6 * 60_000); // 7:01 p. m.
  e.winListeners.focus();
  assert.match(e.html(), DISPONIBLE);
});

test('visibilitychange con la app OCULTA no hace nada', () => {
  const e = crearEntorno({ ahora: F1 - 30_000 });
  e.api.render();
  e.dormir(90_000);
  e.ctx.document.visibilityState = 'hidden';
  const escrituras = e.spies.escrituras;
  e.docListeners.visibilitychange();
  assert.equal(e.spies.escrituras, escrituras);
});

test('no vuelve a pintar si nada cambió (evita trabajo y parpadeos)', () => {
  const e = crearEntorno({ ahora: F1 - 3600_000 }); // falta una hora
  e.api.render();
  const escrituras = e.spies.escrituras;
  e.docListeners.visibilitychange();
  e.winListeners.pageshow();
  e.winListeners.focus();
  e.api.wbRevaluarHitos();
  assert.equal(e.spies.escrituras, escrituras, 'ninguna escritura del DOM');
  assert.equal(e.pendientes().length, 1, 'y el temporizador sigue programado');
});

// ── Corrección por la hora del servidor (teléfono con el reloj mal puesto) ──
const cabeceraDate = (ms) => ({ headers: { get: (k) => (k === 'Date' ? new Date(ms).toUTCString() : null) } });

test('reloj del teléfono ADELANTADO 5 min: con la hora del servidor NO se abre antes de tiempo', () => {
  const real = F1 - 30_000; // en realidad faltan 30 s
  const e = crearEntorno({ ahora: real + 300_000 }); // el teléfono cree que ya pasaron 4:30 min
  e.api.wbRegistrarHoraServidor(cabeceraDate(real));
  e.api.render();
  assert.match(e.html(), /Próximamente/, 'el teléfono dice que ya pasó la hora, el servidor dice que no');
  assert.ok(!DISPONIBLE.test(e.html()));
  assert.equal(e.pendientes()[0].ms, 30_300, 'el temporizador cuenta con la hora del servidor');
  e.avanzar(30_000);
  assert.ok(!DISPONIBLE.test(e.html()), 'todavía faltan 300 ms de margen');
  e.avanzar(400);
  assert.match(e.html(), DISPONIBLE, 'se abre a la hora REAL');
});

test('reloj del teléfono ATRASADO 5 min: tampoco llega tarde (se abre a la hora real)', () => {
  const real = F1 - 30_000;
  const e = crearEntorno({ ahora: real - 300_000 });
  e.api.wbRegistrarHoraServidor(cabeceraDate(real));
  e.api.render();
  assert.equal(e.pendientes()[0].ms, 30_300);
  e.avanzar(30_400);
  assert.match(e.html(), DISPONIBLE);
});

test('sin cabecera Date (o inválida) se usa el reloj del dispositivo, sin romper nada', () => {
  const e = crearEntorno({ ahora: F1 - 30_000 });
  e.api.wbRegistrarHoraServidor({ headers: { get: () => null } });
  e.api.wbRegistrarHoraServidor({ headers: { get: () => 'no es una fecha' } });
  e.api.wbRegistrarHoraServidor(null);
  e.api.wbRegistrarHoraServidor({});
  assert.equal(e.api.wbAhoraMs(), e.hoy());
});

// ── El reloj del teléfono NUNCA da acceso real: Orbit decide ────────────────
function clicEnEntrarEnVivo(e, { hito = 1, respuesta }) {
  // abrirZoomEmbebido real: pide la info; si no es ok:true, llama a onFallback(motivo, enlaceGenérico)
  e.ctx.window.abrirZoomEmbebido = async (o) => {
    const d = await o.obtenerJoinInfo();
    if (!d || d.ok !== true) { o.onFallback((d && d.motivo) || 'desconocido', (d && d.enlaceGenerico) || o.enlaceGenericoRespaldo || null); return; }
    o.onExito();
  };
  e.api.render();
  const boton = e.wrap.querySelectorAll('[data-wb-vivo-btn]').find((b) => b.dataset.hito === String(hito));
  assert.ok(boton, 'la tarjeta muestra "Entrar en vivo" según el reloj del teléfono');
  return boton.listeners.click();
}

test('OBLIGATORIA — reloj ADELANTADO sin hora de servidor: la tarjeta se abre, pero Orbit responde 409 y NO se abre NINGÚN enlace', async () => {
  // El teléfono cree que son las 7:04; en realidad son las 6:58 (Orbit lo sabe).
  const real = F1 - 120_000;
  const e = crearEntorno({
    ahora: F1 + 240_000,
    respuestasFetch: [{ status: 409, date: new Date(real).toUTCString(), json: { error: 'hito_no_disponible' } }],
  });
  await clicEnEntrarEnVivo(e, { hito: 1 });
  await new Promise((r) => setImmediate(r));

  assert.equal(e.spies.abrir.length, 0, 'ningún enlace se abre (ni el genérico): la entrada real la decide Orbit');
  assert.equal(e.spies.toasts.length, 1);
  assert.match(e.spies.toasts[0], /Todavía no es la hora\. Empieza el miércoles 7 de octubre · 7:00 p\. m\. \(hora de Colombia\)\./);
  assert.match(e.html(), /Próximamente/, 'la tarjeta vuelve a "Próximamente"');
  assert.ok(e.spies.refrescos >= 1, 'pide al servidor el dato fresco');
  assert.equal(e.api.wbAhoraMs(), real, 'y la hora del servidor de esa respuesta corrige el reloj');
});

test('un dato NUEVO del servidor reemplaza el "aún no" (no queda bloqueada para siempre)', async () => {
  const e = crearEntorno({ ahora: F1 + 240_000, respuestasFetch: [{ status: 409, date: new Date(F1 - 120_000).toUTCString(), json: { error: 'hito_no_disponible' } }] });
  await clicEnEntrarEnVivo(e, { hito: 1 });
  await new Promise((r) => setImmediate(r));
  assert.equal(e.api.negada()[1], true);
  // llega un dato fresco del servidor (objeto nuevo) diciendo que ya está disponible
  e.ctx.state.bootcampHitos = { cohorteId: 'c1', hitos: hitosBase({ 1: { disponible: true } }), bootcampCompletado: false };
  e.api.render();
  assert.deepEqual({ ...e.api.negada() }, {});
  assert.match(e.html(), DISPONIBLE);
});

test('otros fallos de Zoom (p. ej. zoom_no_configurado) SIGUEN cayendo al enlace genérico: solo "aún no" lo bloquea', async () => {
  const e = crearEntorno({
    ahora: F1 + 1000,
    hitos: hitosBase({ 1: { disponible: true } }),
    respuestasFetch: [{ status: 200, json: { ok: false, motivo: 'zoom_no_configurado', enlaceGenerico: 'https://zoom.example/generico' } }],
  });
  await clicEnEntrarEnVivo(e, { hito: 1 });
  await new Promise((r) => setImmediate(r));
  assert.equal(e.spies.abrir.length, 1);
  assert.equal(e.spies.abrir[0][0], 'https://zoom.example/generico');
  assert.equal(e.spies.toasts.length, 0);
});

// ═════════════════════════════════════════════════════════════════════════
// OBLIGATORIA — protección del Zoom embebido activo
// ═════════════════════════════════════════════════════════════════════════
function prepararConZoomActivo(marca) {
  const e = crearEntorno({ ahora: F1 - 1000, hitos: hitosBase({ 1: { disponible: true } }) }); // Estación 1 abierta; la 2 abre en un día
  e.api.render();
  const htmlAntes = e.html();
  e.estado[marca] = true; // embedActivo | conectando
  const escrituras = e.spies.escrituras;
  // Pasa la hora de la Estación 2 mientras ella está EN la clase de la Estación 1
  e.dormir(F2 - e.hoy() + 5000);
  return { e, htmlAntes, escrituras };
}

for (const [marca, descripcion] of [['embedActivo', 'con un Zoom embebido ACTIVO'], ['conectando', 'mientras el Zoom se está CONECTANDO (botón deshabilitado)']]) {
  test(`OBLIGATORIA — NINGÚN re-render ${descripcion}: temporizador, visibilitychange, pageshow y focus no tocan el DOM ni cierran Zoom`, () => {
    const { e, htmlAntes, escrituras } = prepararConZoomActivo(marca);
    // la disponibilidad SÍ cambió (la firma difiere): sin la protección se volvería a pintar
    assert.notEqual(e.api.wbFirmaHitos(e.hitos()), e.api.wbFirmaHitos(e.hitos().map((h) => ({ ...h, fecha: iso(F3 + 86_400_000) }))), 'control: la firma es sensible al tiempo');

    e.avanzarA(F2 + 6000);           // vence el temporizador
    e.docListeners.visibilitychange();
    e.winListeners.pageshow();
    e.winListeners.focus();
    e.api.wbRevaluarHitos();

    assert.equal(e.spies.escrituras, escrituras, 'el DOM de las tarjetas NO se reconstruyó');
    assert.equal(e.html(), htmlAntes, 'el HTML es exactamente el mismo');
    assert.equal(e.spies.cerrarZoom, 0, 'NUNCA se cerró la sesión de Zoom');
  });

  test(`control — la misma situación SIN Zoom activo (${marca}=false) sí se actualiza: la protección es la única razón de que no se pinte`, () => {
    const { e, escrituras } = prepararConZoomActivo(marca);
    e.estado[marca] = false;
    e.docListeners.visibilitychange();
    assert.ok(e.spies.escrituras > escrituras, 'sin Zoom activo, se vuelve a pintar');
    assert.match(e.html().slice(e.html().indexOf('Volver')), /Disponible/, 'la Estación 2 ya está abierta');
    assert.equal(e.spies.cerrarZoom, 0);
  });
}

test('OBLIGATORIA — tras salir de Zoom, el siguiente evento sí actualiza lo que quedó pendiente', () => {
  const { e } = prepararConZoomActivo('embedActivo');
  e.avanzarA(F2 + 6000);
  e.winListeners.focus();
  assert.ok(!/Volver<\/div><div[^>]*>Disponible/.test(e.html()), 'aún protegida');
  e.estado.embedActivo = false;
  e.winListeners.focus();
  assert.match(e.html().slice(e.html().indexOf('Volver')), /Disponible/);
});

test('pintar de nuevo por OTRA razón (p. ej. completar un replay) sigue cerrando el embed como antes: eso no cambió', () => {
  const e = crearEntorno({ ahora: F1 + 1000, hitos: hitosBase({ 1: { disponible: true } }) });
  e.api.render();
  e.estado.embedActivo = true;
  e.api.render(); // llamada directa (comportamiento previo, diseñado en la Estación 7)
  assert.equal(e.spies.cerrarZoom, 1);
});
