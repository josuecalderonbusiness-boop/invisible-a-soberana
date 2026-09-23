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
const { tieneDerechoVigente, tieneDerechoVigenteA, obtenerComprasVigentes, tieneRegistroActivo, obtenerRegistrosActivos, obtenerExperienciaGratuitaActiva, obtenerExperienciaGratuitaActivaConReintento, obtenerTieneRegistroHistorico, obtenerOportunidadBootcampActiva, obtenerReplayCompradoActivo, obtenerBootcampHitos, obtenerAccesoBootcamp, confirmarBootcampHitoVisto, obtenerMasterclassZoomJoin, obtenerBootcampZoomJoin, registrarClaseGratuita, obtenerProximaConvocatoriaPublica, obtenerSesionesDisponibles, relayBotonVerMiClaseAOrbit } = await import('./orbit-perfil-acceso.js');

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

// ── Puente QA temporal (Puerta 5, Ensayo General, Estación 4, 2026-09-13):
// consultarPerfilAcceso/obtenerExperienciaGratuitaActiva reenvían los 2
// headers de reloj QA SOLO cuando ambos vienen presentes — todo-o-nada, sin
// valores por defecto. Sin `qaReloj`, el comportamiento debe ser idéntico
// (regresión) al de antes de este cambio. ──

function mockFetchCapturaHeaders(t, body, ok = true) {
  let capturado = null;
  t.mock.method(global, 'fetch', async (url, opts) => {
    capturado = { url, headers: opts.headers };
    return { ok, status: ok ? 200 : 500, json: async () => body };
  });
  return () => capturado;
}

test('obtenerExperienciaGratuitaActiva: SIN qaReloj -> nunca agrega los headers QA (regresión, comportamiento idéntico a antes)', async (t) => {
  const leer = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [] });
  await obtenerExperienciaGratuitaActiva('alumna@correo.com');
  const { headers } = leer();
  assert.equal('x-qa-reloj-secret' in headers, false);
  assert.equal('x-qa-reloj-simulado' in headers, false);
  assert.equal(headers['x-mi-espacio-secret'], 'shh-mi-espacio'); // el header real de siempre sigue intacto
});

test('obtenerExperienciaGratuitaActiva: CON qaReloj completo -> agrega los 2 headers tal cual', async (t) => {
  const leer = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [] });
  await obtenerExperienciaGratuitaActiva('alumna@correo.com', { secreto: 'shh-qa', simulado: '2026-09-26T19:00:00-05:00' });
  const { headers } = leer();
  assert.equal(headers['x-qa-reloj-secret'], 'shh-qa');
  assert.equal(headers['x-qa-reloj-simulado'], '2026-09-26T19:00:00-05:00');
});

test('obtenerExperienciaGratuitaActiva: qaReloj con SOLO uno de los dos campos -> no agrega ninguno (todo-o-nada)', async (t) => {
  const leer1 = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [] });
  await obtenerExperienciaGratuitaActiva('alumna@correo.com', { secreto: 'shh-qa' });
  assert.equal('x-qa-reloj-secret' in leer1().headers, false);

  const leer2 = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [] });
  await obtenerExperienciaGratuitaActiva('alumna@correo.com', { simulado: '2026-09-26T19:00:00-05:00' });
  assert.equal('x-qa-reloj-simulado' in leer2().headers, false);
});

test('obtenerExperienciaGratuitaActiva: qaReloj vacío ({}) o undefined -> sin headers QA, mismo resultado', async (t) => {
  const leer1 = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [] });
  await obtenerExperienciaGratuitaActiva('alumna@correo.com', {});
  assert.equal('x-qa-reloj-secret' in leer1().headers, false);

  const leer2 = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [] });
  await obtenerExperienciaGratuitaActiva('alumna@correo.com', undefined);
  assert.equal('x-qa-reloj-secret' in leer2().headers, false);
});

// ── obtenerTieneRegistroHistorico / obtenerOportunidadBootcampActiva
// (Puerta 2, Bootcamp Codigo Soberana, diseño cerrado 2026-09-11) — mismo
// patron espejo que obtenerExperienciaGratuitaActiva. Orbit ya resuelve
// ambos campos; aqui solo se leen sin transformar nada. ──

test('obtenerTieneRegistroHistorico: false cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await obtenerTieneRegistroHistorico('alumna@correo.com'), false);
});

test('obtenerTieneRegistroHistorico: true cuando Orbit lo confirma', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], tieneRegistroHistorico: true });
  assert.equal(await obtenerTieneRegistroHistorico('alumna@correo.com'), true);
});

test('obtenerOportunidadBootcampActiva: null cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await obtenerOportunidadBootcampActiva('alumna@correo.com'), null);
});

test('obtenerOportunidadBootcampActiva: devuelve el objeto tal como lo manda Orbit, sin transformarlo', async (t) => {
  const oportunidad = { cohorteId: 'cohorte-1', abierta: true };
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], oportunidadBootcampActiva: oportunidad });
  assert.deepEqual(await obtenerOportunidadBootcampActiva('alumna@correo.com'), oportunidad);
});

test('obtenerOportunidadBootcampActiva: null explicito de Orbit (oportunidad cerrada o inexistente) se conserva tal cual', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], oportunidadBootcampActiva: null });
  assert.equal(await obtenerOportunidadBootcampActiva('alumna@correo.com'), null);
});

// Puerta 5 — Ensayo General, Estación 3 (hallazgo 2026-09-14): hasta este
// corte, a diferencia de obtenerExperienciaGratuitaActiva (arriba), esta
// funcion no reenviaba qaReloj — imposible de probar con reloj QA.
test('obtenerOportunidadBootcampActiva: CON qaReloj completo -> agrega los 2 headers tal cual (antes de este corte, no los agregaba)', async (t) => {
  const leer = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [], oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true } });
  await obtenerOportunidadBootcampActiva('alumna@correo.com', { secreto: 'shh-qa', simulado: '2026-09-30T02:00:00-05:00' });
  const { headers } = leer();
  assert.equal(headers['x-qa-reloj-secret'], 'shh-qa');
  assert.equal(headers['x-qa-reloj-simulado'], '2026-09-30T02:00:00-05:00');
});

test('obtenerOportunidadBootcampActiva: SIN qaReloj -> nunca agrega los headers QA (regresión, comportamiento normal)', async (t) => {
  const leer = mockFetchCapturaHeaders(t, { nombre: 'Alumna', programas: [], registros: [], oportunidadBootcampActiva: null });
  await obtenerOportunidadBootcampActiva('alumna@correo.com');
  const { headers } = leer();
  assert.equal('x-qa-reloj-secret' in headers, false);
  assert.equal('x-qa-reloj-simulado' in headers, false);
});

// ── obtenerReplayCompradoActivo (Puerta 3, Replay $5, diseño cerrado
// 2026-09-11) — mismo patron espejo, independiente de experienciaGratuita/
// oportunidadBootcamp. ──

test('obtenerReplayCompradoActivo: null cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await obtenerReplayCompradoActivo('alumna@correo.com'), null);
});

test('obtenerReplayCompradoActivo: devuelve el objeto tal como lo manda Orbit, sin transformarlo', async (t) => {
  const replay = { convocatoriaId: 'c1', fechaHora: '2026-09-10T18:00:00.000Z', nombreClase: 'He intentado todo y nada cambia', enlaceReplay: 'https://bunny.example/replay' };
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], replayCompradoActivo: replay });
  assert.deepEqual(await obtenerReplayCompradoActivo('alumna@correo.com'), replay);
});

test('obtenerReplayCompradoActivo: null explicito de Orbit (sin derecho o compra ya no aprobada) se conserva tal cual', async (t) => {
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], replayCompradoActivo: null });
  assert.equal(await obtenerReplayCompradoActivo('alumna@correo.com'), null);
});

// ── obtenerBootcampHitos / confirmarBootcampHitoVisto (Puerta 5, Corte 2,
// diseño cerrado 2026-09-12) — espejo del mismo patron, independiente de
// todo lo demas. ──

test('obtenerBootcampHitos: null cuando el campo no viene (compatibilidad hacia atras)', async (t) => {
  mockFetchOnce(t, { nombre: null, programas: [], registros: [] });
  assert.equal(await obtenerBootcampHitos('alumna@correo.com'), null);
});

test('obtenerBootcampHitos: devuelve el objeto tal como lo manda Orbit, sin transformarlo', async (t) => {
  const bootcampHitos = {
    cohorteId: 'cohorte-1',
    hitos: [
      { hito: 1, disponible: true, completado: true, enlaceEnVivo: null, enlaceReplay: 'https://bunny.example/dia1' },
      { hito: 2, disponible: false, completado: false, enlaceEnVivo: null, enlaceReplay: null },
      { hito: 3, disponible: false, completado: false, enlaceEnVivo: null, enlaceReplay: null },
    ],
    bootcampCompletado: false,
  };
  mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], bootcampHitos });
  assert.deepEqual(await obtenerBootcampHitos('alumna@correo.com'), bootcampHitos);
});

test('confirmarBootcampHitoVisto: llama a perfil-acceso?accion=bootcamp-replay-visto con el secreto compartido, correo y hito', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200, json: async () => ({ ok: true }),
  }));
  const resultado = await confirmarBootcampHitoVisto('alumna@correo.com', 1);
  assert.deepEqual(resultado, { ok: true });
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.match(url, /\/api\/v1\/perfil-acceso\?accion=bootcamp-replay-visto$/);
  assert.equal(opciones.headers['x-mi-espacio-secret'], 'shh-mi-espacio');
  assert.deepEqual(JSON.parse(opciones.body), { correo: 'alumna@correo.com', hito: 1 });
});

test('confirmarBootcampHitoVisto: Orbit responde error (ej. Hito no disponible) -> lanza con el motivo, nunca lo esconde', async (t) => {
  t.mock.method(global, 'fetch', async () => ({
    ok: false, status: 409, json: async () => ({ error: 'hito_no_disponible' }),
  }));
  await assert.rejects(() => confirmarBootcampHitoVisto('alumna@correo.com', 2), (err) => {
    assert.equal(err.motivo, 'hito_no_disponible');
    return true;
  });
});

// ── obtenerMasterclassZoomJoin (Puerta 5 — Ensayo General, Estación 4,
// diseño cerrado 2026-09-14) — mismo patron que confirmarBootcampHitoVisto,
// mas el mecanismo todo-o-nada de qaReloj (mismo que
// obtenerExperienciaGratuitaActiva). ──

test('obtenerMasterclassZoomJoin: llama a perfil-acceso?accion=masterclass-zoom-join con el secreto compartido y el correo', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, convocatoriaId: 'c1', meetingNumber: '82659498763' }),
  }));
  const resultado = await obtenerMasterclassZoomJoin('alumna@correo.com');
  assert.deepEqual(resultado, { ok: true, convocatoriaId: 'c1', meetingNumber: '82659498763' });
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.match(url, /\/api\/v1\/perfil-acceso\?accion=masterclass-zoom-join$/);
  assert.equal(opciones.headers['x-mi-espacio-secret'], 'shh-mi-espacio');
  assert.deepEqual(JSON.parse(opciones.body), { correo: 'alumna@correo.com' });
  assert.equal('x-qa-reloj-secret' in opciones.headers, false);
});

test('obtenerMasterclassZoomJoin: con qaReloj completo, reenvia los 2 headers', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  await obtenerMasterclassZoomJoin('alumna@correo.com', { secreto: 'shh-qa', simulado: '2026-09-27T00:30:00-05:00' });
  const [, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal(opciones.headers['x-qa-reloj-secret'], 'shh-qa');
  assert.equal(opciones.headers['x-qa-reloj-simulado'], '2026-09-27T00:30:00-05:00');
});

test('obtenerMasterclassZoomJoin: Orbit responde error -> lanza con el motivo, nunca lo esconde', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 409, json: async () => ({ error: 'fase_no_en_vivo' }) }));
  await assert.rejects(() => obtenerMasterclassZoomJoin('alumna@correo.com'), (err) => {
    assert.equal(err.motivo, 'fase_no_en_vivo');
    return true;
  });
});

// ── obtenerBootcampZoomJoin (Puerta 5, Estación 7, diseño cerrado
// 2026-09-15) — equivalente de obtenerMasterclassZoomJoin para las 3
// Estaciones del Bootcamp, mismo patron, mas el parametro `hito`. ──

test('obtenerBootcampZoomJoin: llama a perfil-acceso?accion=bootcamp-zoom-registrar con el secreto compartido, el correo y el hito', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, meetingNumber: '111222333' }),
  }));
  const resultado = await obtenerBootcampZoomJoin('alumna@correo.com', 2);
  assert.deepEqual(resultado, { ok: true, meetingNumber: '111222333' });
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.match(url, /\/api\/v1\/perfil-acceso\?accion=bootcamp-zoom-registrar$/);
  assert.equal(opciones.headers['x-mi-espacio-secret'], 'shh-mi-espacio');
  assert.deepEqual(JSON.parse(opciones.body), { correo: 'alumna@correo.com', hito: 2 });
});

test('obtenerBootcampZoomJoin: Orbit responde error -> lanza con el motivo, nunca lo esconde', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 409, json: async () => ({ error: 'hito_no_disponible' }) }));
  await assert.rejects(() => obtenerBootcampZoomJoin('alumna@correo.com', 1), (err) => {
    assert.equal(err.motivo, 'hito_no_disponible');
    return true;
  });
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

// ── SIMULIVE — selector de sesión (diseño cerrado 2026-09-22):
// fechaHoraElegida es opcional — sin ella, byte a byte el mismo body de
// siempre (ya probado arriba); con ella, se reenvía tal cual, sin
// reformatear ni validar aquí (Orbit es quien la revalida). ──

test('registrarClaseGratuita: con fechaHoraElegida, la reenvia tal cual en el body (SIMULIVE)', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({
    status: 200,
    json: async () => ({ ok: true, mensaje: 'Tu registro fue recibido correctamente.', convocatoria: {} }),
  }));
  await registrarClaseGratuita({ email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test', fechaHoraElegida: '2026-09-22T19:00:00.000Z' });

  const [, opciones] = fetchMock.mock.calls[0].arguments;
  assert.deepEqual(JSON.parse(opciones.body), { email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test', fechaHoraElegida: '2026-09-22T19:00:00.000Z' });
});

test('registrarClaseGratuita: sin fechaHoraElegida, el body no incluye la clave (LIVE, sin cambio de comportamiento)', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ status: 200, json: async () => ({ ok: true }) }));
  await registrarClaseGratuita({ email: 'alumna@correo.com', telefono: '3001234567', nombre: 'Alumna', origen: 'landing-test' });

  const [, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal('fechaHoraElegida' in JSON.parse(opciones.body), false);
});

// ── obtenerExperienciaGratuitaActivaConReintento — hallazgo real 2026-09-09:
// la lectura de experienciaGratuitaActiva justo después de un registro puede
// llegar antes de que Orbit refleje internamente ese registro. Reintento
// acotado (máximo 3 intentos), esperaMs en 0 en las pruebas para que corran
// rápido sin fingir el reloj. ──

const EXPERIENCIA = { convocatoriaId: 'c1', fechaHora: '2026-09-27T00:00:00.000Z', duracionEstimada: 3600, ventanaReplayHoras: 72, fase: 'espera', enlaceEnVivo: null, enlaceReplay: null };

test('obtenerExperienciaGratuitaActivaConReintento: la encuentra en el primer intento, sin reintentar', async (t) => {
  const fetchMock = mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], experienciaGratuitaActiva: EXPERIENCIA });
  const resultado = await obtenerExperienciaGratuitaActivaConReintento('alumna@correo.com', 3, 0);
  assert.deepEqual(resultado, EXPERIENCIA);
  assert.equal(fetchMock.mock.calls.length, 1);
});

test('obtenerExperienciaGratuitaActivaConReintento: null en el primer intento, aparece en el segundo', async (t) => {
  let llamada = 0;
  const fetchMock = t.mock.method(global, 'fetch', async () => {
    llamada += 1;
    const experienciaGratuitaActiva = llamada === 1 ? null : EXPERIENCIA;
    return { ok: true, status: 200, json: async () => ({ nombre: 'Alumna', programas: [], registros: [], experienciaGratuitaActiva }) };
  });
  const resultado = await obtenerExperienciaGratuitaActivaConReintento('alumna@correo.com', 3, 0);
  assert.deepEqual(resultado, EXPERIENCIA);
  assert.equal(fetchMock.mock.calls.length, 2);
});

test('obtenerExperienciaGratuitaActivaConReintento: nunca aparece → null tras exactamente 3 intentos, sin loop infinito', async (t) => {
  const fetchMock = mockFetchOnce(t, { nombre: 'Alumna', programas: [], registros: [], experienciaGratuitaActiva: null });
  const resultado = await obtenerExperienciaGratuitaActivaConReintento('alumna@correo.com', 3, 0);
  assert.equal(resultado, null);
  assert.equal(fetchMock.mock.calls.length, 3);
});

// ── obtenerProximaConvocatoriaPublica (Puerta 2, Slice 6) — proxy del
// endpoint PUBLICO GET /api/v1/proxima-convocatoria (sin secreto), usado
// por la landing para mostrar la fecha real del proximo sabado. Distinto
// de obtenerProximaConvocatoriaDisponible (esa es la version autenticada
// de perfil-acceso, POST + secreto, para Mi Espacio). ──

test('obtenerProximaConvocatoriaPublica: llama a GET /api/v1/proxima-convocatoria sin secreto ni body', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ fechaHora: '2026-09-27T00:00:00.000Z', ventanaReplayHoras: 72 }) }));
  await obtenerProximaConvocatoriaPublica();

  assert.equal(fetchMock.mock.calls.length, 1);
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://orbit-mc-six.vercel.app/api/v1/proxima-convocatoria');
  assert.equal(opciones?.method, undefined); // GET por defecto, sin body
  assert.equal(opciones?.headers, undefined); // publica: nunca x-mi-espacio-secret
});

test('obtenerProximaConvocatoriaPublica: pass-through exacto de la respuesta de Orbit', async (t) => {
  const cuerpo = { fechaHora: '2026-10-04T00:00:00.000Z', ventanaReplayHoras: 72 };
  t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => cuerpo }));
  assert.deepEqual(await obtenerProximaConvocatoriaPublica(), cuerpo);
});

test('obtenerProximaConvocatoriaPublica: lanza con motivo si Orbit responde error', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }));
  await assert.rejects(() => obtenerProximaConvocatoriaPublica(), (err) => err.motivo === 'orbit_respondio_503');
});

// ── obtenerSesionesDisponibles (SIMULIVE, selector de sesión) — mismo
// patron exacto que obtenerProximaConvocatoriaPublica arriba: publica, sin
// secreto, GET, pass-through. ──

test('obtenerSesionesDisponibles: llama a GET /api/sesiones-disponibles sin secreto ni body', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ sesiones: [] }) }));
  await obtenerSesionesDisponibles();

  assert.equal(fetchMock.mock.calls.length, 1);
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://orbit-mc-six.vercel.app/api/sesiones-disponibles');
  assert.equal(opciones?.method, undefined); // GET por defecto, sin body
  assert.equal('x-mi-espacio-secret' in (opciones?.headers || {}), false);
});

test('obtenerSesionesDisponibles: pass-through exacto de la respuesta de Orbit', async (t) => {
  const cuerpo = { sesiones: [{ fechaHora: '2026-09-22T19:00:00.000Z', dia: 'hoy' }, { fechaHora: '2026-09-23T15:00:00.000Z', dia: 'mañana' }] };
  t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => cuerpo }));
  assert.deepEqual(await obtenerSesionesDisponibles(), cuerpo);
});

test('obtenerSesionesDisponibles: lanza con motivo si Orbit responde error', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(() => obtenerSesionesDisponibles(), (err) => err.motivo === 'orbit_respondio_500');
});

// ── relayBotonVerMiClaseAOrbit (Puerta 2, Slice 7e) — a diferencia de TODO
// lo demás en este archivo, esta función NUNCA debe lanzar: su único
// llamador es el webhook real de Meta (api/whatsapp.js), que debe
// responder 200 sin importar qué pase con Orbit. Mismo secreto/patrón que
// crearRegistroAutenticado (x-mi-espacio-secret), nunca el
// X-Hub-Signature-256 de Meta. ──

test('relayBotonVerMiClaseAOrbit: arma la petición correcta (URL, método, header de secreto, body) y devuelve {ok:true} en éxito', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
  const resultado = await relayBotonVerMiClaseAOrbit({ wamid: 'wamid.1', telefono: '573001112222', payload: 'VER_MI_CLASE', texto: 'Ver mi clase', timestampMeta: '1700000000' });

  assert.deepEqual(resultado, { ok: true });
  assert.equal(fetchMock.mock.calls.length, 1);
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, 'https://orbit-mc-six.vercel.app/api/v1/perfil-acceso?accion=whatsapp-relay-ver-mi-clase');
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers['x-mi-espacio-secret'], 'shh-mi-espacio');
  assert.deepEqual(JSON.parse(opciones.body), { wamid: 'wamid.1', telefono: '573001112222', payload: 'VER_MI_CLASE', texto: 'Ver mi clase', timestampMeta: '1700000000' });
});

test('relayBotonVerMiClaseAOrbit: Orbit responde 4xx/5xx -> {ok:false, motivo}, NUNCA lanza', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 500, json: async () => ({ error: 'Error interno' }) }));
  const resultado = await relayBotonVerMiClaseAOrbit({ wamid: 'w1', telefono: '573001112222' });
  assert.deepEqual(resultado, { ok: false, motivo: 'orbit_respondio_500' });
});

test('relayBotonVerMiClaseAOrbit: error de red (Orbit caído) -> {ok:false, motivo:"error_red"}, NUNCA lanza', async (t) => {
  t.mock.method(global, 'fetch', async () => { throw new Error('ECONNREFUSED'); });
  const resultado = await relayBotonVerMiClaseAOrbit({ wamid: 'w1', telefono: '573001112222' });
  assert.deepEqual(resultado, { ok: false, motivo: 'error_red' });
});

test('relayBotonVerMiClaseAOrbit: timeout -> {ok:false, motivo:"timeout"}, NUNCA lanza', async (t) => {
  t.mock.method(global, 'fetch', async (url, opciones) => {
    return new Promise((_, reject) => {
      opciones.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  });
  const resultado = await relayBotonVerMiClaseAOrbit({ wamid: 'w1', telefono: '573001112222' });
  assert.deepEqual(resultado, { ok: false, motivo: 'timeout' });
});

// ── obtenerAccesoBootcamp (gate de Puerta B, 2026-09-19) — UNA sola consulta a
// Orbit trae derecho + Hitos + Replay $5 + recorridoHabilitado. El gate lo
// decide Orbit (por producto de origen); esta capa solo lo representa: nunca
// lo reconstruye desde bootcampHitos ni desde ningun otro campo. ──

const HITOS_EJEMPLO = { cohorteId: 'c1', hitos: [{ hito: 1, disponible: false, completado: false }], bootcampCompletado: false };

test('obtenerAccesoBootcamp: sin derecho a codigo-soberana -> todo null/false, recorridoHabilitado false aunque Orbit diga true (nunca sin acceso)', async (t) => {
  mockFetchOnce(t, { programas: [{ programaId: 'mas-se-aleja', derecho: 'vigente' }], bootcampHitos: HITOS_EJEMPLO, recorridoHabilitado: true });
  assert.deepEqual(await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana'), { activo: false, bootcampHitos: null, replayCompradoActivo: null, recorridoHabilitado: false });
});

test('obtenerAccesoBootcamp: acceso REVOCADO -> no activo, recorridoHabilitado false', async (t) => {
  mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'revocado' }], bootcampHitos: HITOS_EJEMPLO, recorridoHabilitado: true });
  const r = await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana');
  assert.equal(r.activo, false);
  assert.equal(r.recorridoHabilitado, false);
});

test('obtenerAccesoBootcamp: origen Bootcamp, Orbit dice recorridoHabilitado:false -> activo pero SIN recorrido (aunque bootcampHitos venga lleno)', async (t) => {
  mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], bootcampHitos: HITOS_EJEMPLO, replayCompradoActivo: null, recorridoHabilitado: false });
  assert.deepEqual(await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana'), { activo: true, bootcampHitos: HITOS_EJEMPLO, replayCompradoActivo: null, recorridoHabilitado: false });
});

test('obtenerAccesoBootcamp: venta directa, Orbit dice recorridoHabilitado:true (sin Hitos) -> recorrido abierto, tal cual lo decidio Orbit', async (t) => {
  const sinHitos = { cohorteId: null, hitos: null, bootcampCompletado: false };
  mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], bootcampHitos: sinHitos, recorridoHabilitado: true });
  assert.deepEqual(await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana'), { activo: true, bootcampHitos: sinHitos, replayCompradoActivo: null, recorridoHabilitado: true });
});

test('obtenerAccesoBootcamp: Bootcamp completado, Orbit dice recorridoHabilitado:true -> recorrido abierto', async (t) => {
  const completo = { cohorteId: 'c1', hitos: [], bootcampCompletado: true };
  mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], bootcampHitos: completo, recorridoHabilitado: true });
  assert.equal((await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana')).recorridoHabilitado, true);
});

test('obtenerAccesoBootcamp: fail-closed — si Orbit NO manda recorridoHabilitado (o manda algo que no es true), es false; nunca se deriva de bootcampHitos', async (t) => {
  mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], bootcampHitos: HITOS_EJEMPLO });
  assert.equal((await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana')).recorridoHabilitado, false);
  mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], bootcampHitos: HITOS_EJEMPLO, recorridoHabilitado: 'true' });
  assert.equal((await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana')).recorridoHabilitado, false);
});

test('obtenerAccesoBootcamp: hace EXACTAMENTE una consulta a Orbit (o llega todo o falla todo, sin estados a medias)', async (t) => {
  const fetchMock = mockFetchOnce(t, { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], bootcampHitos: HITOS_EJEMPLO, recorridoHabilitado: false });
  await obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana');
  assert.equal(fetchMock.mock.calls.length, 1);
});

test('obtenerAccesoBootcamp: si Orbit falla, se propaga el error (workbook-acceso responde 503, nunca un "activo" a medias)', async (t) => {
  mockFetchOnce(t, {}, false);
  await assert.rejects(() => obtenerAccesoBootcamp('alumna@correo.com', 'codigo-soberana'), /Orbit respondió 500/);
});
