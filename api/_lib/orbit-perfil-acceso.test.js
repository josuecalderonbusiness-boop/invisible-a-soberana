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
const { tieneDerechoVigente, tieneDerechoVigenteA, obtenerComprasVigentes, tieneRegistroActivo, obtenerRegistrosActivos, obtenerExperienciaGratuitaActiva, registrarClaseGratuita } = await import('./orbit-perfil-acceso.js');

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

// ── tieneDerechoVigenteA (Puerta 2, Slice 8) — espejo acotado a un
// programaId específico, usado por workbook-acceso para que /workbook
// pregunte en vivo por el Derecho a codigo-soberana, en vez de leer
// Firestore workbook_acceso. ──

test('tieneDerechoVigenteA: true si el programaId pedido está vigente', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], registros: [] });
  assert.equal(await tieneDerechoVigenteA('alumna@correo.com', 'codigo-soberana'), true);
});

test('tieneDerechoVigenteA: false si tiene otro Derecho vigente pero no el programaId pedido (la masterclass no abre el Workbook)', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [{ programaId: 'mas-se-aleja', derecho: 'vigente' }], registros: [] });
  assert.equal(await tieneDerechoVigenteA('alumna@correo.com', 'codigo-soberana'), false);
});

test('tieneDerechoVigenteA: false si el programaId pedido existe pero no está vigente (revocado)', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [{ programaId: 'codigo-soberana', derecho: 'revocado' }], registros: [] });
  assert.equal(await tieneDerechoVigenteA('alumna@correo.com', 'codigo-soberana'), false);
});

test('tieneDerechoVigenteA: false sin programas en absoluto', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await tieneDerechoVigenteA('nadie@correo.com', 'codigo-soberana'), false);
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

// ── registrarClaseGratuita (Puerta 2, Slice 2) — proxy same-origin de
// /api/registro. A diferencia de todo lo anterior en este archivo, este
// endpoint de Orbit es PUBLICO — la prueba clave es que NO lleva
// x-mi-espacio-secret, y que el status/cuerpo de Orbit viajan sin cambios
// (pass-through), para no romper el contrato que ya consume la landing. ──

test('registrarClaseGratuita: llama a /api/registro (no /api/v1/*) sin el header de secreto', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({
    status: 200,
    json: async () => ({ ok: true, mensaje: 'Tu registro fue recibido correctamente.', convocatoria: { fecha_hora: '2026-09-27T00:00:00.000Z', ventana_replay_horas: 72 } }),
  }));
  await registrarClaseGratuita({ email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test' });

  assert.equal(fetchMock.mock.calls.length, 1);
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://orbit-mc-six.vercel.app/api/registro');
  assert.equal(opciones.method, 'POST');
  assert.equal('x-mi-espacio-secret' in opciones.headers, false);
  assert.deepEqual(JSON.parse(opciones.body), { email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test' });
});

test('registrarClaseGratuita: pass-through exacto de una respuesta exitosa de Orbit', async (t) => {
  const cuerpoOrbit = { ok: true, mensaje: 'Tu registro fue recibido correctamente.', convocatoria: { fecha_hora: '2026-09-27T00:00:00.000Z', ventana_replay_horas: 72 } };
  t.mock.method(global, 'fetch', async () => ({ status: 200, json: async () => cuerpoOrbit }));
  const resultado = await registrarClaseGratuita({ email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test' });
  assert.deepEqual(resultado, { status: 200, cuerpo: cuerpoOrbit });
});

test('registrarClaseGratuita: pass-through exacto de un error de Orbit (sin convocatoria abierta)', async (t) => {
  const cuerpoOrbit = { ok: false, error: 'No hay ninguna clase gratuita abierta en este momento.' };
  t.mock.method(global, 'fetch', async () => ({ status: 409, json: async () => cuerpoOrbit }));
  const resultado = await registrarClaseGratuita({ email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test' });
  assert.deepEqual(resultado, { status: 409, cuerpo: cuerpoOrbit });
});
