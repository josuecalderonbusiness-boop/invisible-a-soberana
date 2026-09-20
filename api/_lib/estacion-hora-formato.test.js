// api/_lib/estacion-hora-formato.test.js — UX (2026-09-20), punto 1: la hora de la Estación en la
// PWA es SIEMPRE "hora de Colombia" y la misma referencia que usan Orbit (correo, Push, WhatsApp).
// Se ejecuta el código REAL de public/workbook/index.html dentro de un contexto `vm`.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const PAGINA = fs.readFileSync(new URL('../../public/workbook/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Solo la función: termina en el primer "\n}\n" después de su inicio (no depende de lo que se añada después).
function fuenteFormato() {
  const i = PAGINA.indexOf('function _formatFechaHitoWB(');
  assert.ok(i > 0, 'no se encontró _formatFechaHitoWB');
  const j = PAGINA.indexOf('\n}\n', i);
  assert.ok(j > i, 'no se encontró el final de _formatFechaHitoWB');
  return PAGINA.slice(i, j + 3);
}

function cargarFormato() {
  const ctx = vm.createContext({ Intl, Date, Number, isNaN });
  vm.runInContext(fuenteFormato() + '\nthis.f = _formatFechaHitoWB;', ctx);
  return ctx.f;
}

// Fechas reales de la cohorte del primer Bootcamp (00:00Z = 7:00 p. m. Bogotá del día anterior).
const E1 = '2026-10-08T00:00:00.000Z';
const E2 = '2026-10-09T00:00:00.000Z';
const E3 = '2026-10-10T00:00:00.000Z';

test('la referencia es exactamente la aprobada (y coincide con la de Orbit)', () => {
  const f = cargarFormato();
  assert.equal(f(E1), 'miércoles 7 de octubre · 7:00 p. m. (hora de Colombia)');
  assert.equal(f(E2), 'jueves 8 de octubre · 7:00 p. m. (hora de Colombia)');
  assert.equal(f(E3), 'viernes 9 de octubre · 7:00 p. m. (hora de Colombia)');
});

test('no depende de la zona horaria del dispositivo (teléfono mal configurado / VPN / viaje)', () => {
  const f = cargarFormato();
  const original = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/Mexico_City', 'Europe/Madrid', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      assert.equal(f(E1), 'miércoles 7 de octubre · 7:00 p. m. (hora de Colombia)', `TZ=${tz}`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test('la hora sale de la fecha (no está atada a las 7): mañana, mediodía y después de medianoche', () => {
  const f = cargarFormato();
  assert.match(f('2026-10-07T14:05:00Z'), / · 9:05 a\. m\. \(hora de Colombia\)$/);
  assert.match(f('2026-10-07T17:00:00Z'), / · 12:00 p\. m\. \(hora de Colombia\)$/);
  assert.match(f('2026-10-07T05:30:00Z'), / · 12:30 a\. m\. \(hora de Colombia\)$/);
});

test('fecha inválida o vacía devuelve cadena vacía (nunca lanza ni inventa una hora)', () => {
  const f = cargarFormato();
  assert.equal(f('no es fecha'), '');
  assert.equal(f(undefined), '');
  assert.equal(f(null), '');
});

test('la tarjeta "Próximamente" usa esa referencia y ya no formatea con la zona del dispositivo', () => {
  assert.ok(PAGINA.includes("Disponible el ' + _formatFechaHitoWB(h.fecha) + '</p>"), 'la tarjeta usa _formatFechaHitoWB(h.fecha)');
  const cuerpo = fuenteFormato();
  assert.ok(!/toLocaleString/.test(cuerpo), 'sin toLocaleString a secas (usaría la zona del dispositivo)');
  assert.ok(/timeZone: 'America\/Bogota'/.test(cuerpo), 'zona fija de Colombia');
});
