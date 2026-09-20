// api/_lib/html-seguro.test.js — Seguridad, Fase 1 cliente (2026-09-20).
// Comprueba public/mi-espacio/html-seguro.js y, sobre todo, que el código REAL
// de public/workbook/index.html (tarjeta del feed y modal de sesión en vivo)
// ya no pinta datos de Firestore sin escapar/validar. El código de la página se
// extrae del HTML y se ejecuta en un contexto `vm` — no hay copia en la prueba.
// Sin red, sin Firebase, sin escrituras.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const leer = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const MODULO = leer('../../public/mi-espacio/html-seguro.js');
const PAGINA = leer('../../public/workbook/index.html');
const SW = leer('../../public/workbook/sw.js');

function cargarModulo() {
  const window = {};
  vm.runInContext(MODULO, vm.createContext({ window, URL }));
  return window.htmlSeguro;
}

// Corta el código de la página entre dos marcadores (inicio inclusive, fin exclusive).
function cortar(desde, hasta) {
  const i = PAGINA.indexOf(desde);
  const j = PAGINA.indexOf(hasta, i + 1);
  assert.ok(i >= 0 && j > i, `no se encontró el tramo ${desde} … ${hasta}`);
  return PAGINA.slice(i, j);
}

// ── Módulo ─────────────────────────────────────────────────────────────────
test('escapeHtml escapa los seis caracteres peligrosos y no toca acentos ni emoji', () => {
  const { escapeHtml } = cargarModulo();
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&\``), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;&#96;');
  assert.equal(escapeHtml('Ana completó el Código Soberana 🔥'), 'Ana completó el Código Soberana 🔥');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('urlSegura acepta solo https y rechaza todo lo demás', () => {
  const { urlSegura } = cargarModulo();
  assert.equal(urlSegura('https://us05web.zoom.us/j/86473598410?pwd=abc'), 'https://us05web.zoom.us/j/86473598410?pwd=abc');
  assert.equal(urlSegura('  https://zoom.us/j/1  '), 'https://zoom.us/j/1');
  for (const malo of [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>',
    'http://zoom.us/j/1', '//evil.com/x', '/relativo', 'zoom.us/j/1', 'ftp://x.com', 'vbscript:1',
    'https://', '', '   ', null, undefined, 42, {}, [],
  ]) assert.equal(urlSegura(malo), '', `debería rechazar ${JSON.stringify(malo)}`);
});

test('urlSegura codifica comillas y espacios: el resultado no puede romper un atributo', () => {
  const { urlSegura, escapeHtml } = cargarModulo();
  const u = urlSegura('https://x.com/a"onmouseover="alert(1)');
  assert.ok(!u.includes('"'), 'sin comillas dobles sin codificar');
  assert.ok(!escapeHtml(u).includes('"'));
});

test('idSeguro deja pasar ids de Firestore y de Bunny y descarta el resto', () => {
  const { idSeguro } = cargarModulo();
  assert.equal(idSeguro('aB3dE5gH7jK9mN1pQ3rS'), 'aB3dE5gH7jK9mN1pQ3rS');
  assert.equal(idSeguro('a24ce52e-4395-4b7c-8b6b-50a154ec746c'), 'a24ce52e-4395-4b7c-8b6b-50a154ec746c');
  for (const malo of ["x');alert(1);//", 'a b', 'a"b', '../etc', '', null, undefined, 7, 'a'.repeat(129), 'a<b>'])
    assert.equal(idSeguro(malo), '', `debería rechazar ${JSON.stringify(malo)}`);
});

// ── Tarjeta del feed (código real de la página) ────────────────────────────
function cargarTarjeta() {
  const codigo = cortar('function _buildFeedCard(f) {', 'function _renderFeedBlock(');
  const window = {};
  vm.runInContext(MODULO, vm.createContext({ window, URL }));
  const ctx = vm.createContext({
    htmlSeguro: window.htmlSeguro,
    _getLikedPosts: () => ({}),
    _likeKey: () => 'k',
    _timeAgo: () => 'hace 1 min',
  });
  vm.runInContext(codigo + '\nthis._buildFeedCard = _buildFeedCard;', ctx);
  return ctx._buildFeedCard;
}

test('tarjeta del feed: name/event/initial hostiles llegan escapados, sin etiquetas inyectadas', () => {
  const tarjeta = cargarTarjeta();
  const html = tarjeta({
    id: 'aB3dE5gH7jK9mN1pQ3rS',
    name: '<img src=x onerror=alert(1)>',
    initial: '<svg onload=alert(2)>',
    event: '</div><script>alert(3)</script><a href="javascript:alert(4)">x</a>',
    hearts: 3,
  });
  for (const malo of ['<img', '<svg onload', '<script', '<a href'])
    assert.ok(!html.includes(malo), `no debe contener ${malo} sin escapar`);
  // Invariante estructural: mismas etiquetas que una tarjeta normal (nada inyectado).
  const normal = tarjeta({ id: 'aB3dE5gH7jK9mN1pQ3rS', name: 'A', initial: 'A', event: 'e', hearts: 3 });
  const cuenta = (s, c) => s.split(c).length - 1;
  assert.equal(cuenta(html, '<'), cuenta(normal, '<'), 'mismo número de etiquetas abiertas');
  assert.equal(cuenta(html, '>'), cuenta(normal, '>'), 'mismo número de etiquetas cerradas');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(3)&lt;/script&gt;'));
});

test('tarjeta del feed: un docId hostil no puede salir del atributo onclick', () => {
  const tarjeta = cargarTarjeta();
  const html = tarjeta({ id: "x');alert(1);//", name: 'Ana', event: 'hola', hearts: 1 });
  assert.ok(!html.includes('alert(1)'), 'el id hostil no debe aparecer');
  assert.ok(html.includes("novToggleHeart(this,'',1)"), 'sin id seguro el handler recibe cadena vacía (no-op)');
});

test('tarjeta del feed: post normal se ve igual (acentos, emoji, id válido, corazones)', () => {
  const tarjeta = cargarTarjeta();
  const html = tarjeta({ id: 'aB3dE5gH7jK9mN1pQ3rS', name: 'Sofía A.', event: 'Sofía completó el Código Soberana 🔥', hearts: 5 });
  assert.ok(html.includes('Sofía A.'));
  assert.ok(html.includes('completó el Código Soberana 🔥'));
  assert.ok(html.includes("novToggleHeart(this,'aB3dE5gH7jK9mN1pQ3rS',5)"));
  assert.ok(html.includes('<span>5</span>'));
});

test('tarjeta del feed: hearts no numérico o no finito se trata como 0', () => {
  const tarjeta = cargarTarjeta();
  for (const h of ['<b>', NaN, Infinity, null, undefined, {}]) {
    const html = tarjeta({ id: 'aB3dE5gH7jK9mN1pQ3rS', name: 'A', event: 'e', hearts: h });
    assert.ok(html.includes('<span>0</span>'), `hearts=${String(h)}`);
  }
});

// ── Modal de sesión en vivo (código real de la página) ─────────────────────
function cargarModalSesion() {
  const codigo = cortar('function _formatFechaSabado(', 'function iniciarCountdown(')
    + cortar('function renderSabadoEstado(', 'async function openSabadoModal(');
  const window = {};
  vm.runInContext(MODULO, vm.createContext({ window, URL }));
  const drawer = { innerHTML: '' };
  const ctx = vm.createContext({
    htmlSeguro: window.htmlSeguro,
    URLSearchParams, URL, Date, Math, String, console: { log() {}, warn() {} },
    document: { getElementById: (id) => (id === 'drawer-sabado' ? drawer : null) },
    localStorage: { getItem: () => null },
    state: { user: { email: 'a@b.co' } },
    _sabadoCurrentData: null,
    _sabadoCountdownInterval: null,
    clearInterval() {},
    iniciarCountdown() {},
  });
  vm.runInContext(codigo + '\nthis.renderSabadoEstado = renderSabadoEstado;\nthis._googleCalendarLink = _googleCalendarLink;', ctx);
  const dibujar = (estado, sesion, extra = {}) => {
    ctx._sabadoCurrentData = { sesion, semNum: 1, nodeKey: 'n1', semana: 1, isDone: false, ...extra };
    drawer.innerHTML = '';
    ctx.renderSabadoEstado(estado);
    return drawer.innerHTML;
  };
  return { dibujar, ctx };
}

const FECHA = '2026-09-26T15:00:00-05:00';

test('sesión en vivo: zoom_link javascript: no se pinta; https válido sí', () => {
  const { dibujar } = cargarModalSesion();
  for (const estado of ['soon', 'live']) {
    const malo = dibujar(estado, { fecha_iso: FECHA, zoom_link: 'javascript:alert(1)' });
    assert.ok(!malo.includes('javascript:'), `${estado}: sin javascript:`);
    assert.ok(!malo.includes('btn-primary'), `${estado}: sin botón si el enlace no es seguro`);
    const bueno = dibujar(estado, { fecha_iso: FECHA, zoom_link: 'https://us05web.zoom.us/j/86473598410?pwd=abc' });
    assert.ok(bueno.includes('href="https://us05web.zoom.us/j/86473598410?pwd=abc"'), `${estado}: enlace legítimo intacto`);
  }
});

test('sesión en vivo: comillas en zoom_link no rompen el atributo href', () => {
  const { dibujar } = cargarModalSesion();
  const html = dibujar('live', { fecha_iso: FECHA, zoom_link: 'https://x.com/a"onmouseover="alert(1)' });
  assert.ok(!html.includes('onmouseover="alert'), 'no debe abrir un atributo nuevo');
});

test('sesión programada: descripcion hostil llega escapada', () => {
  const { dibujar } = cargarModalSesion();
  const html = dibujar('upcoming', { fecha_iso: FECHA, descripcion: '"</p><img src=x onerror=alert(1)>' });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('sesión terminada: id de Bunny hostil no llega al iframe; id válido sí; cae a URL segura', () => {
  const { dibujar } = cargarModalSesion();
  const hostil = dibujar('ended', { fecha_iso: FECHA, grabacion_bunny_id: '"><script>alert(1)</script>' });
  assert.ok(!hostil.includes('<script'));
  assert.ok(!hostil.includes('<iframe'), 'sin iframe con id inválido');
  assert.ok(hostil.includes('Grabación en proceso'), 'sin grabación válida se ve "en proceso"');

  const bueno = dibujar('ended', { fecha_iso: FECHA, grabacion_bunny_id: 'a24ce52e-4395-4b7c-8b6b-50a154ec746c' });
  assert.ok(bueno.includes('https://iframe.mediadelivery.net/embed/636956/a24ce52e-4395-4b7c-8b6b-50a154ec746c?autoplay=false'));

  const respaldo = dibujar('ended', { fecha_iso: FECHA, grabacion_bunny_id: '"><b>', grabacion_url: 'https://cdn.example.com/replay.mp4' });
  assert.ok(!respaldo.includes('<iframe'));
  assert.ok(respaldo.includes('href="https://cdn.example.com/replay.mp4"'), 'cae al enlace https válido');
});

test('sesión terminada: grabacion_url javascript: no se pinta', () => {
  const { dibujar } = cargarModalSesion();
  const html = dibujar('ended', { fecha_iso: FECHA, grabacion_url: 'javascript:alert(1)' });
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('Grabación en proceso'));
});

test('enlace de Google Calendar: zoom_link inseguro no viaja como location/details', () => {
  const { ctx } = cargarModalSesion();
  const malo = ctx._googleCalendarLink({ fecha_iso: FECHA, zoom_link: 'javascript:alert(1)' }, 1);
  assert.ok(!decodeURIComponent(malo).includes('javascript:'));
  const bueno = ctx._googleCalendarLink({ fecha_iso: FECHA, zoom_link: 'https://zoom.us/j/1' }, 1);
  assert.ok(decodeURIComponent(bueno).includes('https://zoom.us/j/1'));
});

// ── Estado del código de la página ─────────────────────────────────────────
test('la página ya no contiene ni envía la clave de administración', () => {
  assert.ok(!PAGINA.includes('adminKey'), 'public/workbook/index.html no debe mencionar adminKey');
  assert.ok(!PAGINA.includes('Admin2026'));
});

test('la página no interpola datos de Firestore crudos en el feed ni en los enlaces de sesión', () => {
  for (const crudo of ['${f.name', '${f.event', '${f.initial', '${sesion.zoom_link}', '${sesion.grabacion_url}', '${sesion.grabacion_bunny_id}', '${sesion.descripcion']) {
    assert.ok(!PAGINA.includes(crudo), `no debe quedar ${crudo}`);
  }
  assert.ok(!/_liveZoomLink\s*=\s*sesion\s*&&\s*sesion\.zoom_link/.test(PAGINA), 'popup en vivo: enlace validado');
});

test('html-seguro.js se carga antes de bunny-replay.js y antes de cualquier uso', () => {
  const i = PAGINA.indexOf('<script src="/mi-espacio/html-seguro.js"></script>');
  const j = PAGINA.indexOf('<script src="/mi-espacio/bunny-replay.js"></script>');
  const uso = PAGINA.indexOf('htmlSeguro.');
  assert.ok(i > 0 && j > i, 'orden de carga');
  assert.ok(uso > i, 'el primer uso va después de la carga');
});

test('service worker: caché v367 y el módulo va en la precarga', () => {
  assert.ok(SW.includes("const CACHE_NAME = 'soberana-v367';"));
  assert.ok(SW.includes("'/mi-espacio/html-seguro.js'"));
});
