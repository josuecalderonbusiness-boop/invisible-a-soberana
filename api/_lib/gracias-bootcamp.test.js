// UX 2026-09-20 (punto 8 aprobado): página de gracias /bienvenida-bootcamp.
//  · Muestra el correo que se está comprobando (y el de la compra ya confirmada).
//  · Ya no habla de la "clase gratuita": quien acaba de comprar no tiene por qué recordarla.
// Se ejecuta el script REAL de la página con un DOM simulado. Sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const HTML = fs.readFileSync(new URL('../../public/bienvenida-bootcamp/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = HTML.slice(HTML.indexOf('<script>') + 8, HTML.lastIndexOf('</script>'));
// Solo lo que la compradora lee: sin comentarios ni script.
const VISIBLE = HTML.slice(HTML.indexOf('<body>'), HTML.indexOf('<script>')).replace(/<!--[\s\S]*?-->/g, '');

// ── Textos ────────────────────────────────────────────────────────────────────────────────────────

test('ninguna pantalla habla de la "clase gratuita"', () => {
  assert.doesNotMatch(VISIBLE, /clase gratuita|clase-gratuita|registrarte/i);
});

test('la pantalla de "Estamos preparando tu espacio" dice qué correo se está comprobando y cómo cambiarlo', () => {
  assert.match(VISIBLE, /Estamos comprobando la compra con <strong id="bc-correo-comprobado"><\/strong>/);
  assert.match(VISIBLE, /toca «Usar otro correo» y escribe el de tu recibo/);
  assert.match(VISIBLE, /id="bc-btn-otro-correo"/);
});

test('la pantalla de compra confirmada muestra el correo de la compra', () => {
  assert.match(VISIBLE, /Correo de tu compra: <strong id="bc-correo-bienvenida"><\/strong>/);
});

// ── Comportamiento con el script real ────────────────────────────────────────────────────────────

function cargar({ search = '', respuestas = [] }) {
  const elementos = new Map();
  const el = (id) => {
    if (!elementos.has(id)) {
      const e = {
        id, style: { display: 'none' }, disabled: false, value: '', listeners: {}, _texto: '',
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        focus() {},
      };
      Object.defineProperty(e, 'textContent', { get() { return this._texto; }, set(v) { this._texto = String(v); } });
      Object.defineProperty(e, 'innerHTML', { set() { throw new Error('la página no debe escribir HTML: ' + id); }, get() { return ''; } });
      elementos.set(id, e);
    }
    return elementos.get(id);
  };
  const peticiones = [];
  const ctx = vm.createContext({
    URLSearchParams, JSON, console: { log() {}, warn() {} },
    window: { location: { search } },
    document: { getElementById: el },
    fetch(url, opts) {
      peticiones.push({ url, cuerpo: JSON.parse(opts.body) });
      const r = respuestas.shift();
      if (!r) return Promise.reject(new Error('sin red'));
      return Promise.resolve({ status: r.status || 200, json: () => Promise.resolve(r.json) });
    },
  });
  vm.runInContext(SCRIPT, ctx); // la página arranca sola (bcInit() al final del script)
  return { ctx, el, peticiones, visible: () => ['bc-pedir-correo', 'bc-confirmando', 'bc-bienvenida'].filter((i) => el(i).style.display === 'block') };
}

test('con correo en la URL y compra aún no lista: pantalla "preparando", con ese correo a la vista', async () => {
  const p = cargar({ search: '?email=ana%40correo.com', respuestas: [{ json: { activo: false } }] });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.visible(), ['bc-confirmando']);
  assert.equal(p.el('bc-correo-comprobado').textContent, 'ana@correo.com');
  assert.deepEqual(p.peticiones.map((x) => x.cuerpo), [{ correo: 'ana@correo.com' }]);
});

test('con compra confirmada: pantalla de bienvenida con el correo de la compra', async () => {
  const p = cargar({ search: '?email=ana%40correo.com', respuestas: [{ json: { activo: true } }] });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.visible(), ['bc-bienvenida']);
  assert.equal(p.el('bc-correo-bienvenida').textContent, 'ana@correo.com');
});

test('un correo hostil en la URL se muestra como texto, jamás como HTML', async () => {
  const malo = '"><img src=x onerror=alert(1)>@x.com';
  const p = cargar({ search: '?email=' + encodeURIComponent(malo), respuestas: [{ json: { activo: false } }] });
  await new Promise((r) => setImmediate(r)); // si escribiera innerHTML, el elemento lanzaría
  assert.equal(p.el('bc-correo-comprobado').textContent, malo, 'texto literal');
});

test('sin correo en la URL: lo pide; al escribirlo lo comprueba y lo muestra', async () => {
  const p = cargar({ search: '', respuestas: [{ json: { activo: false } }] });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.visible(), ['bc-pedir-correo']);
  p.el('bc-input-correo').value = ' luz@correo.com ';
  await p.el('bc-form-correo').listeners.submit({ preventDefault() {} });
  assert.deepEqual(p.visible(), ['bc-confirmando']);
  assert.equal(p.el('bc-correo-comprobado').textContent, 'luz@correo.com');
});

test('"Usar otro correo": vuelve a pedirlo y no deja el correo anterior a la vista', async () => {
  const p = cargar({ search: '?email=ana%40correo.com', respuestas: [{ json: { activo: false } }] });
  await new Promise((r) => setImmediate(r));
  p.el('bc-btn-otro-correo').listeners.click();
  assert.deepEqual(p.visible(), ['bc-pedir-correo']);
  assert.equal(p.el('bc-correo-comprobado').textContent, '');
  assert.equal(p.el('bc-correo-bienvenida').textContent, '');
});

test('una caída de red o un 503 nunca se muestran como compra rechazada: "preparando" con el correo', async () => {
  for (const respuestas of [[{ status: 503, json: {} }], []]) {
    const p = cargar({ search: '?email=ana%40correo.com', respuestas });
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(p.visible(), ['bc-confirmando']);
    assert.equal(p.el('bc-correo-comprobado').textContent, 'ana@correo.com');
  }
});

test('comprobar de nuevo mantiene el correo y solo hace un intento por toque (nunca un bucle)', async () => {
  const p = cargar({ search: '?email=ana%40correo.com', respuestas: [{ json: { activo: false } }, { json: { activo: true } }] });
  await new Promise((r) => setImmediate(r));
  await p.el('bc-btn-reintentar').listeners.click();
  assert.equal(p.peticiones.length, 2, 'uno automático + uno por el toque');
  assert.deepEqual(p.visible(), ['bc-bienvenida']);
  assert.equal(p.el('bc-correo-bienvenida').textContent, 'ana@correo.com');
});
