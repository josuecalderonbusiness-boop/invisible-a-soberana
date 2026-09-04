// api/_lib/orbit-perfil-acceso.test.js — pruebas de tieneRegistroActivo /
// obtenerRegistrosActivos (Puerta 2, Slice 3), espejo de las que ya cubrían
// tieneDerechoVigente / obtenerComprasVigentes (sin tests previos en este
// archivo — se agregan ambas parejas para no dejar el patrón sin cobertura).
// global.fetch se stubbea con node:test mock, sin tocar la red ni Orbit real.

import test from 'node:test';
import assert from 'node:assert/strict';

// El modulo lee MI_ESPACIO_ORBIT_SECRET de process.env en su ambito de
// carga (top-level const) — con `import` estatico, los imports se resuelven
// antes de que corra cualquier linea de este archivo, asi que fijar la env
// var despues de un `import` estatico llega tarde. Se fija primero y se
// carga el modulo con `import()` dinamico (mismo resultado, orden correcto).
process.env.MI_ESPACIO_ORBIT_SECRET = process.env.MI_ESPACIO_ORBIT_SECRET || 'shh-mi-espacio';
const { tieneDerechoVigente, obtenerComprasVigentes, tieneRegistroActivo, obtenerRegistrosActivos, obtenerExperienciaGratuitaActiva, obtenerCodigoSoberana } = await import('./orbit-perfil-acceso.js');

function mockFetchOnce(t, body, ok = true) {
  return t.mock.method(global, 'fetch', async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  }));
}

test('tieneRegistroActivo: false cuando registros viene vacio', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await tieneRegistroActivo('alumna@correo.com'), false);
});

test('tieneRegistroActivo: false cuando el campo registros no viene en la respuesta (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [] });
  assert.equal(await tieneRegistroActivo('alumna@correo.com'), false);
});

test('tieneRegistroActivo: true cuando hay al menos un registro activo', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [{ convocatoriaId: 'c1', fechaHora: '2026-09-10T18:00:00.000Z' }] });
  assert.equal(await tieneRegistroActivo('alumna@correo.com'), true);
});

test('obtenerRegistrosActivos: devuelve la lista tal como la manda Orbit, sin transformarla', async (t) => {
  const registros = [{ convocatoriaId: 'c1', fechaHora: '2026-09-10T18:00:00.000Z' }];
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros });
  assert.deepEqual(await obtenerRegistrosActivos('alumna@correo.com'), registros);
});

test('obtenerRegistrosActivos: [] cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [] });
  assert.deepEqual(await obtenerRegistrosActivos('alumna@correo.com'), []);
});

// Cobertura de referencia, no repetida antes en este archivo: confirma que
// registros nuevo no interfiere con programas existente en la misma respuesta.
test('tieneDerechoVigente y tieneRegistroActivo leen la misma respuesta sin pisarse', async (t) => {
  mockFetchOnce(t, {
    nombre: 'Alumna',
    programas: [{ programaId: 'mas-se-aleja', derecho: 'vigente' }],
    registros: [{ convocatoriaId: 'c1', fechaHora: '2026-09-10T18:00:00.000Z' }],
  });
  assert.equal(await tieneDerechoVigente('alumna@correo.com'), true);
});

test('obtenerComprasVigentes sigue devolviendo solo programas, aunque registros venga poblado', async (t) => {
  mockFetchOnce(t, {
    nombre: 'Alumna',
    programas: [{ programaId: 'mas-se-aleja', derecho: 'vigente' }],
    registros: [{ convocatoriaId: 'c1', fechaHora: '2026-09-10T18:00:00.000Z' }],
  });
  assert.deepEqual(await obtenerComprasVigentes('alumna@correo.com'), [{ producto: 'mas-se-aleja' }]);
});

// ── obtenerExperienciaGratuitaActiva (Puerta 2, Slice 5) — unico contrato
// de la experiencia gratuita activa, reemplaza el candidato descartado de
// extender registros[] (P4, eliminado). Espejo del patron ya usado arriba. ──

test('obtenerExperienciaGratuitaActiva: null cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await obtenerExperienciaGratuitaActiva('alumna@correo.com'), null);
});

test('obtenerExperienciaGratuitaActiva: devuelve el objeto tal como lo manda Orbit, sin transformarlo', async (t) => {
  const experiencia = {
    convocatoriaId: 'c1', fechaHora: '2026-09-10T18:00:00.000Z',
    duracionEstimada: 5400, ventanaReplayHoras: 72, fase: 'en_vivo',
    enlaceEnVivo: 'https://zoom.us/j/en-vivo', enlaceReplay: null,
  };
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], experienciaGratuitaActiva: experiencia });
  assert.deepEqual(await obtenerExperienciaGratuitaActiva('alumna@correo.com'), experiencia);
});

// ── obtenerCodigoSoberana (Puerta 2, Slice 6) — espejo del patron de
// obtenerExperienciaGratuitaActiva. NUNCA es la fuente del Derecho (eso
// sigue siendo obtenerComprasVigentes/programas[]) — solo informa la fase
// operativa del Bootcamp, cuando existe. ──

test('obtenerCodigoSoberana: null cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await obtenerCodigoSoberana('alumna@correo.com'), null);
});

test('obtenerCodigoSoberana: null explicito de Orbit se conserva tal cual (Derecho sin Cohorte identificable)', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], codigoSoberana: null });
  assert.equal(await obtenerCodigoSoberana('alumna@correo.com'), null);
});

test('obtenerCodigoSoberana: devuelve el objeto tal como lo manda Orbit, sin transformarlo', async (t) => {
  const codigoSoberana = {
    cohorteId: 'b2222222-2222-2222-2222-222222222222',
    fase: 'dia2',
    fechaLimiteFase: '2026-10-05T18:00:00.000Z',
    sesionActual: { dia: 2, enlaceEnVivo: 'https://zoom.us/j/dia2', enlaceReplay: null },
    replaysDisponibles: [{ dia: 1, enlaceReplay: 'https://bunny.example/dia1' }],
  };
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], codigoSoberana });
  assert.deepEqual(await obtenerCodigoSoberana('alumna@correo.com'), codigoSoberana);
});
