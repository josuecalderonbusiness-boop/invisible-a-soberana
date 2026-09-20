// UX 2026-09-20 (punto 6 aprobado): pantalla de entrada y portada del recorrido.
//  · Entrada: "TU ESPACIO", botón "ENTRAR A MI ESPACIO →", sin la promesa vieja de "solo en este
//    dispositivo", y error de correo claro (sin "acceso no autorizado").
//  · Portada: sin nombre inventado desde el correo, y sin barra "0 de 10" mientras el recorrido está bloqueado.
// Se ejecuta el código REAL de public/workbook/index.html en un contexto `vm` (DOM simulado).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const leer = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PAGINA = leer('../../public/workbook/index.html');
const MODULO = leer('../../public/mi-espacio/html-seguro.js');

function cortar(desde, hasta) {
  const i = PAGINA.indexOf(desde);
  assert.ok(i >= 0, `no se encontró: ${desde}`);
  const j = PAGINA.indexOf(hasta, i + desde.length);
  assert.ok(j > i, `no se encontró el final: ${hasta}`);
  return PAGINA.slice(i, j);
}

const win = {};
vm.runInContext(MODULO, vm.createContext({ window: win, URL }));
const htmlSeguro = win.htmlSeguro;

// ── Entrada (login) ──────────────────────────────────────────────────────────────────────────────

test('la entrada dice "TU ESPACIO" y el botón "ENTRAR A MI ESPACIO →" en sus 4 apariciones', () => {
  assert.match(PAGINA, /<div class="brand-title">TU ESPACIO<\/div>/);
  assert.doesNotMatch(PAGINA, /Workshop Interactivo/);
  assert.doesNotMatch(PAGINA, /Comenzar mi Workbook/);
  assert.equal(PAGINA.split('ENTRAR A MI ESPACIO →').length - 1, 4, 'HTML + 3 restauraciones del botón');
  assert.match(PAGINA, /<button class="btn-primary" onclick="doLogin\(\)">ENTRAR A MI ESPACIO →<\/button>/);
});

test('se elimina la promesa "tu información se guarda solo en este dispositivo"', () => {
  assert.doesNotMatch(PAGINA, /se guarda solo en este dispositivo/);
  assert.doesNotMatch(PAGINA, /Nadie más tiene acceso a tus respuestas/);
  assert.doesNotMatch(PAGINA, /id="splash-login-footer"/);
});

test('sin conexión: el mensaje neutro sigue funcionando aunque ya no exista el pie del login', () => {
  const codigo = cortar('function mostrarSinConexion() {', 'async function resolverSesionYArrancar()');
  const card = { innerHTML: '' };
  const splash = { classList: { added: [], add(c) { this.added.push(c); } } };
  const ctx = vm.createContext({
    document: { getElementById: (id) => (id === 'splash-login-card' ? card : id === 'screen-splash' ? splash : null) },
  });
  vm.runInContext(codigo + '\nthis.f = mostrarSinConexion;', ctx);
  assert.doesNotThrow(() => ctx.f());
  assert.match(card.innerHTML, /Sin conexión/);
  assert.deepEqual(splash.classList.added, ['active']);
});

function correrAviso(nombreFuncion, siguiente, email) {
  const codigo = cortar(`function ${nombreFuncion}(email) {`, siguiente);
  const modal = { innerHTML: '' };
  const overlay = { abierto: false, classList: { add() { overlay.abierto = true; }, remove() {} } };
  const ctx = vm.createContext({
    htmlSeguro,
    document: { getElementById: (id) => (id === 'modal-content' ? modal : overlay) },
  });
  vm.runInContext(codigo + `\nthis.f = ${nombreFuncion};`, ctx);
  ctx.f(email);
  return { html: modal.innerHTML, abierto: overlay.abierto };
}

test('correo sin compra: mensaje aprobado, con el correo escrito y sin culpa', () => {
  const { html, abierto } = correrAviso('showAccesoDenegado', '// Puerta 2, Slice 8', 'ana@correo.com');
  assert.ok(abierto);
  assert.match(html, /No encontramos tu compra con <strong>ana@correo\.com<\/strong>\. Puede tardar unos minutos después de pagar\. Revisa que sea el correo del recibo e inténtalo de nuevo\./);
  assert.doesNotMatch(html, /Acceso no autorizado|no tiene acceso|Hotmart|🔒/);
  assert.match(html, /Intentar con otro correo/);
});

test('el correo escrito NO se inserta sin escapar (ni en el error de compra ni en el de verificación)', () => {
  const malo = '"><img src=x onerror=alert(1)>@x.com';
  const a = correrAviso('showAccesoDenegado', '// Puerta 2, Slice 8', malo).html;
  const b = correrAviso('showVerificacionFallida', '// ═══════════════════════════════════════════\n// APP INIT', malo).html;
  for (const html of [a, b]) {
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
  }
});

// ── Portada ─────────────────────────────────────────────────────────────────────────────────────

function portada({ nombre, correo = 'maria.gomez83@correo.com', bootcampHitos = { hitos: [] }, recorridoHabilitado = false, completada = false }) {
  const clases = new Set(completada ? ['completed'] : []);
  const saludo = { textContent: completada ? '¡Lo lograste, Soberana!' : 'Bienvenida de vuelta' };
  const heroName = { textContent: 'x', style: {} };
  const banner = {
    classList: {
      toggle(c, on) { if (on) clases.add(c); else clases.delete(c); },
      contains: (c) => clases.has(c),
    },
    querySelector: (s) => (s === '.hero-greeting' ? saludo : null),
  };
  const codigoNombre = cortar('function _nombreDesdeCorreo(correo) {', '// Puerta 5, Corte 5: offline');
  const codigoHero = cortar('// Saludo y progreso de la portada', 'function renderSectionsList() {');
  const ctx = vm.createContext({
    state: { user: { name: nombre, email: correo }, bootcampHitos, recorridoHabilitado },
    document: {
      querySelector: (s) => (s === '.hero-banner' ? banner : null),
      getElementById: (id) => (id === 'hero-name' ? heroName : null),
    },
  });
  vm.runInContext(codigoNombre + codigoHero + '\nthis.aplicar = wbAplicarEstadoHero;', ctx);
  ctx.aplicar();
  return { clases, saludo: saludo.textContent, nombre: heroName.textContent, nombreVisible: heroName.style.display !== 'none' };
}

test('Bootcamp bloqueado con nombre real: "Bienvenida", nombre real y sin barra de progreso', () => {
  const p = portada({ nombre: 'Ana Lucía Pérez' });
  assert.equal(p.saludo, 'Bienvenida');
  assert.equal(p.nombre, 'Ana');
  assert.ok(p.nombreVisible);
  assert.ok(p.clases.has('sin-progreso'));
});

test('el nombre deducido del correo NO se muestra ("Maria.gomez83" no es un nombre)', () => {
  const p = portada({ nombre: 'Maria.gomez83' });
  assert.equal(p.nombre, '');
  assert.equal(p.nombreVisible, false);
  assert.equal(p.saludo, 'Bienvenida');
});

test('sin nombre alguno tampoco se inventa: solo el saludo', () => {
  const p = portada({ nombre: '' });
  assert.equal(p.nombre, '');
  assert.equal(p.nombreVisible, false);
});

test('recorrido abierto (3 Estaciones completas): vuelve la barra y "Bienvenida de vuelta"', () => {
  const p = portada({ nombre: 'Ana', recorridoHabilitado: true });
  assert.equal(p.saludo, 'Bienvenida de vuelta');
  assert.ok(!p.clases.has('sin-progreso'));
});

test('venta directa (sin Estaciones): la barra de progreso se mantiene', () => {
  const p = portada({ nombre: 'Ana', bootcampHitos: null, recorridoHabilitado: true });
  assert.ok(!p.clases.has('sin-progreso'));
  assert.equal(p.saludo, 'Bienvenida de vuelta');
});

test('sin Estaciones y sin recorrido (no es un caso de Bootcamp): la portada no cambia de comportamiento', () => {
  const p = portada({ nombre: 'Ana', bootcampHitos: null, recorridoHabilitado: false });
  assert.ok(!p.clases.has('sin-progreso'), 'solo se oculta el progreso en el caso Bootcamp bloqueado');
  assert.equal(p.saludo, 'Bienvenida de vuelta');
});

test('recorrido terminado: no se pisa el saludo "¡Lo lograste, Soberana!"', () => {
  const p = portada({ nombre: 'Ana', bootcampHitos: null, recorridoHabilitado: true, completada: true });
  assert.equal(p.saludo, '¡Lo lograste, Soberana!', 'la función no lo pisa cuando la portada está completada');
});

test('el saludo/progreso se recalcula cada vez que se pinta el recorrido (entrada y refrescos)', () => {
  const inicio = cortar('function renderSectionsList() {', 'const list =');
  assert.match(inicio, /wbAplicarEstadoHero\(\);/);
  assert.match(PAGINA, /\.hero-banner\.sin-progreso \.progress-bar-container,\s*\n\s*\.hero-banner\.sin-progreso \.progress-label \{ display: none; \}/);
});
