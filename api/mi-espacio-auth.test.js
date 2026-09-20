// api/mi-espacio-auth.test.js — pruebas de las guardas de entrada que no
// requieren Firestore ni Orbit (metodo, forma del payload, ruteo por
// `accion`). El camino feliz de los 3 puntos de bloqueo de Puerta 2
// (solicitarCuentaAccion/crearCuentaAccion/loginAccion, criterio nuevo
// `hayDerecho || hayRegistroActivo`) necesita Firestore real (cuenta.js) y
// Orbit real (orbit-perfil-acceso.js) — node:test no tiene mock.module
// estable en esta version de Node para interceptar esos imports sin
// tocarlos (verificado: TypeError "t.mock.module is not a function" en
// v24.14.1). Mismo gap ya documentado en
// api/v1/programa/resolver-edicion.test.js — gap documentado, no simulado.
// La logica del criterio nuevo esta cubierta indirectamente por
// api/_lib/orbit-perfil-acceso.test.js (tieneRegistroActivo/
// obtenerRegistrosActivos), que es la unica pieza nueva con red mockeable.

import test from 'node:test';
import assert from 'node:assert/strict';

// El modulo (via auth-session.js) lee MI_ESPACIO_SESSION_SECRET de
// process.env en su ambito de carga (top-level const) — mismo gotcha ya
// documentado en api/_lib/orbit-perfil-acceso.test.js: con `import`
// estatico los imports se resuelven antes de que corra cualquier linea de
// este archivo, asi que fijar la env var despues llega tarde. Se fija
// primero y se carga el modulo con `import()` dinamico.
process.env.MI_ESPACIO_SESSION_SECRET = process.env.MI_ESPACIO_SESSION_SECRET || 'shh-test-session-secret';
process.env.CLASE_GRATUITA_SESSION_SECRET = process.env.CLASE_GRATUITA_SESSION_SECRET || 'shh-test-clase-gratuita-secret';
process.env.MI_ESPACIO_ORBIT_SECRET = process.env.MI_ESPACIO_ORBIT_SECRET || 'shh-test-orbit-secret';
process.env.ORBIT_SHARED_SECRET = process.env.ORBIT_SHARED_SECRET || 'shh-test-orbit-shared-secret';
process.env.BOOTCAMP_CONTINUIDAD_SECRET = process.env.BOOTCAMP_CONTINUIDAD_SECRET || 'shh-test-bootcamp-continuidad-secret';
const { default: handler } = await import('./mi-espacio-auth.js');
const { crearToken: crearTokenClaseGratuitaTest } = await import('./_lib/auth-clase-gratuita.js');
const { crearToken: crearTokenSesionTest } = await import('./_lib/auth-session.js');
const { crearToken: crearTokenContinuidadTest } = await import('./_lib/auth-continuidad-bootcamp.js');

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

test('404 si la accion no existe', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'no-existe' }, body: {} }, res);
  assert.equal(res.statusCode, 404);
});

test('cuenta-crear: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'cuenta-crear' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('cuenta-crear: 400 si el correo o la contraseña no son validos (nunca llega a tocar Firestore/Orbit)', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'cuenta-crear' }, body: { correo: 'no-es-un-correo', password: '1234567' } }, res);
  assert.equal(res.statusCode, 400);
});

test('cuenta-solicitar: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'cuenta-solicitar' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('cuenta-solicitar: 400 si el correo no es valido (nunca llega a tocar Firestore/Orbit)', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'cuenta-solicitar' }, body: { correo: 'no-es-un-correo' } }, res);
  assert.equal(res.statusCode, 400);
});

// ── Puerta 2 — Slice 2: registro-gratuito. Igual que el resto del
// archivo, solo se prueba aquí la frontera que no toca Firestore/Orbit
// (405 y las validaciones de formato) — el camino feliz (llamada real a
// Orbit) está cubierto por mock de fetch en orbit-perfil-acceso.test.js. ──

test('registro-gratuito: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'registro-gratuito' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('registro-gratuito: 400 si faltan ambos campos', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'registro-gratuito' }, body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('registro-gratuito: 400 si el WhatsApp es invalido, aunque el correo sea valido', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'registro-gratuito' }, body: { email: 'alumna@correo.com', telefono: '123' } }, res);
  assert.equal(res.statusCode, 400);
});

test('registro-gratuito: 400 si el correo es invalido, aunque el WhatsApp sea valido', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'registro-gratuito' }, body: { email: 'no-es-un-correo', telefono: '3001234567' } }, res);
  assert.equal(res.statusCode, 400);
});

// ── Puerta 2 — Slice 6: proxima-convocatoria (publica, sin secreto). No
// llama a puedeIntentar ni a Firestore — el unico camino testeable aqui sin
// tocar Orbit real es la guarda de metodo. El pass-through de Orbit ya
// esta cubierto en orbit-perfil-acceso.test.js (obtenerProximaConvocatoriaPublica). ──

test('proxima-convocatoria: 405 si el metodo no es GET', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'proxima-convocatoria' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

// ── Puerta 2 — Slice 3: sesión temporal de clase gratuita.
//
// registro-gratuito llama a puedeIntentar() (rate-limit sobre Firestore)
// para CUALQUIER body con formato válido, antes incluso de tocar Orbit —
// mismo límite ya documentado arriba para cuenta-crear/cuenta-solicitar/
// login: no se puede probar aquí el camino feliz completo (emisión real de
// la cookie tras un 200 de Orbit) sin Firestore real. Por eso la decisión
// "¿corresponde emitir la cookie, y con qué payload exacto?" se extrajo a
// una función PURA (construirCookieSiCorresponde, en auth-clase-gratuita.js)
// que no toca red ni Firestore — se prueba ahí, no aquí. Lo que SÍ se
// prueba en este archivo son las guardas de entrada (arriba) y
// sesion-clase-gratuita completa, que nunca llama a puedeIntentar. ──

const CONVOCATORIA_MOCK = {
  convocatoriaId: 'he-intentado-todo-2026-09',
  fechaHora: '2026-09-27T00:00:00.000Z',
  duracionEstimada: 5400,
  ventanaReplayHoras: 72,
  fase: 'espera',
  enlaceEnVivo: null,
  enlaceReplay: null,
};

// Puerta 5 — Ensayo General, Estación 4 (puente QA temporal, 2026-09-13):
// captura los headers reales con los que se llamó a fetch, para confirmar
// que sesion-clase-gratuita reenvía (o no) los 2 headers QA segun lo que
// traiga la peticion entrante — nunca inventa nada.
//
// Puerta 5, Estación 3, PRIORIDAD MAXIMA (2026-09-14): sesion-clase-gratuita
// ahora hace 4 llamadas en paralelo (experiencia, oportunidad, replay
// comprado, tiene Código Soberana) — las 2 primeras SI reenvian qaReloj, las
// otras 2 NUNCA (son derechos permanentes, no ventanas de tiempo). Se
// captura la lista completa; cada test decide que verificar sobre ella.
function mockFetchPerfilAccesoCapturaHeaders(t, experiencia = CONVOCATORIA_MOCK) {
  const llamadas = [];
  t.mock.method(global, 'fetch', async (url, opts) => {
    llamadas.push(opts && opts.headers);
    return { ok: true, status: 200, json: async () => ({ programas: [], registros: [], experienciaGratuitaActiva: experiencia }) };
  });
  return () => llamadas;
}

function mockFetchPerfilAcceso(t, experiencia = CONVOCATORIA_MOCK) {
  return t.mock.method(global, 'fetch', async (url) => {
    if (String(url).includes('/api/v1/perfil-acceso')) {
      return { ok: true, status: 200, json: async () => ({ programas: [], registros: [], experienciaGratuitaActiva: experiencia }) };
    }
    throw new Error(`fetch no mockeado para ${url}`);
  });
}

test('sesion-clase-gratuita: 405 si el metodo no es GET', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'sesion-clase-gratuita' }, body: {}, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('sesion-clase-gratuita: sin cookie → autorizado false', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: {} }, res);
  assert.deepEqual(res.body, { autorizado: false });
});

test('sesion-clase-gratuita: cookie manipulada → autorizado false', async () => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const tokenRoto = token.slice(0, -2) + 'xx';
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${tokenRoto}` } }, res);
  assert.deepEqual(res.body, { autorizado: false });
});

test('sesion-clase-gratuita: cookie de otro tipo (payload ajeno, aunque bien firmado) → autorizado false', async (t) => {
  // Simula que alguien intentara reutilizar la forma de mi_espacio_sesion bajo este nombre de cookie.
  const crypto = await import('node:crypto');
  const payload = Buffer.from(JSON.stringify({ correo: 'alumna@correo.com', sessionVersion: 0, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.CLASE_GRATUITA_SESSION_SECRET).update(payload).digest('base64url');
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${payload}.${firma}` } }, res);
  assert.deepEqual(res.body, { autorizado: false });
});

test('sesion-clase-gratuita: cookie expirada → autorizado false', async () => {
  const crypto = await import('node:crypto');
  const payload = Buffer.from(JSON.stringify({ correo: 'alumna@correo.com', convocatoriaId: CONVOCATORIA_MOCK.convocatoriaId, tipo: 'clase_gratuita', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const firma = crypto.createHmac('sha256', process.env.CLASE_GRATUITA_SESSION_SECRET).update(payload).digest('base64url');
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${payload}.${firma}` } }, res);
  assert.deepEqual(res.body, { autorizado: false });
});

test('sesion-clase-gratuita: cookie válida + experiencia activa vigente → devuelve sus datos completos', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  mockFetchPerfilAcceso(t);
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: CONVOCATORIA_MOCK, oportunidadBootcampActiva: null, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

// Puerta 5 — Ensayo General, Estación 3 (decision de negocio cerrada
// 2026-09-14, PRIORIDAD MAXIMA): oportunidadBootcampActiva ahora viaja en
// la misma respuesta — /clase-gratuita la necesita para la CTA comercial
// durante en_vivo/replay y para distinguir el cierre del replay (ver
// experiencia-gratuita.js y cgInit() en clase-gratuita/index.html). Nunca
// se ata a datos.convocatoriaId (a diferencia de experienciaGratuitaActiva
// arriba) — es la oportunidad de la Persona, no de una Convocatoria puntual.
test('sesion-clase-gratuita: oportunidadBootcampActiva abierta viaja tal cual, incluso si la experiencia gratuita ya vencio', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ experienciaGratuitaActiva: null, oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true } }),
  }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true }, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

test('sesion-clase-gratuita: oportunidadBootcampActiva se conserva aunque la cookie sea de OTRA convocatoria (nunca se ata a datos.convocatoriaId)', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', 'convocatoria-vieja', CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ experienciaGratuitaActiva: CONVOCATORIA_MOCK, oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true } }),
  }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  // experienciaGratuitaActiva se anula por el candado de convocatoriaId (test ya existente abajo);
  // oportunidadBootcampActiva NO tiene ese candado, se conserva.
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true }, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

// Puerta 5 — Ensayo General, Estación 3, PRIORIDAD MAXIMA (2026-09-14):
// replayCompradoActivo y tieneCodigoSoberana — los 2 estados post-cierre
// (Replay $5 comprado / Código Soberana comprado) que /clase-gratuita
// necesita para no ofrecer un checkout a quien ya tiene el derecho.
test('sesion-clase-gratuita: replayCompradoActivo viaja tal cual cuando Orbit lo reporta (sin experiencia gratuita activa)', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const replayComprado = { convocatoriaId: CONVOCATORIA_MOCK.convocatoriaId, fechaHora: CONVOCATORIA_MOCK.fechaHora, nombreClase: 'He intentado todo y nada cambia', enlaceReplay: 'https://bunny.example/replay' };
  t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: replayComprado, programas: [] }),
  }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: replayComprado, tieneCodigoSoberana: false });
});

test('sesion-clase-gratuita: tieneCodigoSoberana=true cuando Orbit reporta un Derecho vigente a codigo-soberana entre programas[]', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: null, programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }] }),
  }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: null, tieneCodigoSoberana: true });
});

test('sesion-clase-gratuita: reenvia los headers QA tambien para resolver oportunidadBootcampActiva (antes de este corte, no los reenviaba)', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const llamadas = [];
  t.mock.method(global, 'fetch', async (url, opts) => {
    llamadas.push(opts && opts.headers);
    return { ok: true, status: 200, json: async () => ({ experienciaGratuitaActiva: null, oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true } }) };
  });
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'sesion-clase-gratuita' },
    headers: { cookie: `clase_gratuita_sesion=${token}`, 'x-qa-reloj-secret': 'shh-qa', 'x-qa-reloj-simulado': '2026-09-30T02:00:00-05:00' },
  }, res);
  // 4 llamadas en paralelo a Orbit (experiencia, oportunidad, replay
  // comprado, Código Soberana) — solo las 2 primeras reenvian reloj QA.
  assert.equal(llamadas.length, 4);
  const llamadasConQaReloj = llamadas.filter((h) => h['x-qa-reloj-secret'] === 'shh-qa');
  assert.equal(llamadasConQaReloj.length, 2, 'experiencia + oportunidad reenvian el reloj QA; replayComprado/tieneCodigoSoberana nunca lo necesitan');
  for (const headers of llamadasConQaReloj) {
    assert.equal(headers['x-qa-reloj-simulado'], '2026-09-30T02:00:00-05:00');
  }
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: { cohorteId: 'cohorte-1', abierta: true }, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

test('sesion-clase-gratuita: el secreto de clase gratuita nunca aparece en la respuesta al navegador', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  mockFetchPerfilAcceso(t);
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.equal(JSON.stringify(res.body).includes(process.env.CLASE_GRATUITA_SESSION_SECRET), false);
  assert.equal(JSON.stringify(res.headers).includes(process.env.CLASE_GRATUITA_SESSION_SECRET), false);
});

test('sesion-clase-gratuita: cookie válida pero la experiencia ya terminó (Orbit devuelve null) → autorizado, sin acceso a contenido', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  mockFetchPerfilAcceso(t, null);
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

test('sesion-clase-gratuita: cookie válida pero de OTRA convocatoria (Orbit ya la registró para una nueva) → no autoriza contenido de la vieja', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', 'convocatoria-vieja', CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  mockFetchPerfilAcceso(t); // Orbit devuelve experienciaGratuitaActiva de CONVOCATORIA_MOCK.convocatoriaId, distinta de 'convocatoria-vieja'
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null, oportunidadBootcampActiva: null, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

// ── Puente QA temporal (Puerta 5, Ensayo General, Estación 4, 2026-09-13):
// sesion-clase-gratuita reenvía los 2 headers QA hacia Orbit solo cuando
// ambos vienen en la petición entrante — todo-o-nada. Sin ellos (el caso de
// siempre, cualquier mujer real), el comportamiento es idéntico a antes. ──

test('sesion-clase-gratuita: SIN headers QA en la peticion -> nunca los reenvia a Orbit (regresion, comportamiento normal)', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const leerLlamadas = mockFetchPerfilAccesoCapturaHeaders(t);
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  for (const headers of leerLlamadas()) {
    assert.equal('x-qa-reloj-secret' in headers, false);
    assert.equal('x-qa-reloj-simulado' in headers, false);
  }
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: CONVOCATORIA_MOCK, oportunidadBootcampActiva: null, replayCompradoActivo: null, tieneCodigoSoberana: false });
});

test('sesion-clase-gratuita: CON los 2 headers QA en la peticion -> los reenvia tal cual a Orbit (para experienciaGratuitaActiva/oportunidadBootcampActiva -- replayCompradoActivo/tieneCodigoSoberana nunca los necesitan, son derechos permanentes)', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const leerLlamadas = mockFetchPerfilAccesoCapturaHeaders(t);
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'sesion-clase-gratuita' },
    headers: { cookie: `clase_gratuita_sesion=${token}`, 'x-qa-reloj-secret': 'shh-qa', 'x-qa-reloj-simulado': '2026-09-26T19:00:00-05:00' },
  }, res);
  const llamadasConQaReloj = leerLlamadas().filter((h) => h['x-qa-reloj-secret'] === 'shh-qa');
  assert.equal(llamadasConQaReloj.length >= 2, true, 'al menos experienciaGratuitaActiva y oportunidadBootcampActiva deben reenviar el reloj QA');
  for (const headers of llamadasConQaReloj) {
    assert.equal(headers['x-qa-reloj-simulado'], '2026-09-26T19:00:00-05:00');
  }
});

test('sesion-clase-gratuita: SOLO uno de los dos headers QA -> no reenvia ninguno (todo-o-nada)', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const leerLlamadas = mockFetchPerfilAccesoCapturaHeaders(t);
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'sesion-clase-gratuita' },
    headers: { cookie: `clase_gratuita_sesion=${token}`, 'x-qa-reloj-secret': 'shh-qa' },
  }, res);
  for (const headers of leerLlamadas()) {
    assert.equal('x-qa-reloj-secret' in headers, false);
    assert.equal('x-qa-reloj-simulado' in headers, false);
  }
});

// ── masterclass-zoom-join (Puerta 5 — Ensayo General, Estación 4, diseño
// cerrado 2026-09-14) — misma cookie clase_gratuita_sesion, mismo
// candado de convocatoriaId que sesion-clase-gratuita. ──

test('masterclass-zoom-join: 405 si el metodo no es GET', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'masterclass-zoom-join' }, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('masterclass-zoom-join: sin cookie -> ok:false sin_sesion, nunca llama a Orbit', async (t) => {
  const fetchSpy = t.mock.method(global, 'fetch', async () => { throw new Error('no debia llamar a Orbit'); });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'masterclass-zoom-join' }, headers: {} }, res);
  assert.deepEqual(res.body, { ok: false, motivo: 'sin_sesion' });
  assert.equal(fetchSpy.mock.calls.length, 0);
});

test('masterclass-zoom-join: cookie valida + Orbit autoriza la MISMA convocatoria -> entrega los datos del SDK, sin exponer convocatoriaId', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, convocatoriaId: CONVOCATORIA_MOCK.convocatoriaId, meetingNumber: '82659498763', passcode: 'X6Q39Z', signature: 'a.b.c', sdkKey: 'shh-sdk-id', userName: 'Alumna', tk: 'TOKEN123' }),
  }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'masterclass-zoom-join' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { ok: true, meetingNumber: '82659498763', passcode: 'X6Q39Z', signature: 'a.b.c', sdkKey: 'shh-sdk-id', userName: 'Alumna', tk: 'TOKEN123' });
  assert.equal('convocatoriaId' in res.body, false, 'convocatoriaId es solo para verificar aqui, nunca se expone al navegador');
});

test('masterclass-zoom-join: cookie valida pero Orbit autoriza OTRA convocatoria -> ok:false convocatoria_no_coincide, nunca entrega los datos del SDK', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ ok: true, convocatoriaId: 'convocatoria-distinta', meetingNumber: '82659498763', signature: 'a.b.c', tk: 'TOKEN123' }),
  }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'masterclass-zoom-join' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { ok: false, motivo: 'convocatoria_no_coincide' });
});

test('masterclass-zoom-join: Orbit responde ok:false (ej. fase_no_en_vivo via 409) -> se pasa tal cual, sin fabricar datos', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ ok: false, motivo: 'zoom_no_configurado', enlaceGenerico: null }) }));
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'masterclass-zoom-join' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { ok: false, motivo: 'zoom_no_configurado', enlaceGenerico: null });
});

test('masterclass-zoom-join: Orbit no responde (caido/timeout) -> 503, nunca lanza', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  t.mock.method(global, 'fetch', async () => { throw new Error('ECONNREFUSED'); });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'masterclass-zoom-join' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.equal(res.statusCode, 503);
});

test('masterclass-zoom-join: reenvia los headers QA al llamar a Orbit, tal como sesion-clase-gratuita', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ ok: true, convocatoriaId: CONVOCATORIA_MOCK.convocatoriaId }) }));
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'masterclass-zoom-join' },
    headers: { cookie: `clase_gratuita_sesion=${token}`, 'x-qa-reloj-secret': 'shh-qa', 'x-qa-reloj-simulado': '2026-09-27T00:30:00-05:00' },
  }, res);
  const [, opciones] = fetchMock.mock.calls[0].arguments;
  assert.equal(opciones.headers['x-qa-reloj-secret'], 'shh-qa');
  assert.equal(opciones.headers['x-qa-reloj-simulado'], '2026-09-27T00:30:00-05:00');
});

// ── enviar-push (Puerta 5, Estación 9A, diseño cerrado 2026-09-17) ──
// Única acción de este archivo en la dirección Orbit->Mi Espacio. Prueba
// exhaustivamente la frontera de autenticación/validación (todo lo que
// ocurre ANTES de llamar a enviarPushACorreo) — el camino feliz de
// enviarPushACorreo (Firebase Admin real) ya está cubierto a fondo en
// api/_lib/push-fcm.test.js (6 pruebas, con firebase-admin stubbeado vía
// require.cache). Mockear aquí ADEMÁS el resultado de enviarPushACorreo
// tendría el mismo límite ya documentado en este archivo para las demás
// acciones que dependen de imports estáticos (orbit-perfil-acceso.js) —
// no se fabrica esa cobertura, se señala el límite real.

test('enviar-push: 405 si el método no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'enviar-push' }, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('enviar-push: 401 sin el header x-orbit-secret', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'enviar-push' }, headers: {}, body: { correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' } }, res);
  assert.equal(res.statusCode, 401);
});

test('enviar-push: 401 con x-orbit-secret incorrecto', async () => {
  const res = mockRes();
  await handler({
    method: 'POST', query: { accion: 'enviar-push' },
    headers: { 'x-orbit-secret': 'secreto-equivocado' },
    body: { correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' },
  }, res);
  assert.equal(res.statusCode, 401);
});

test('enviar-push: 400 sin correo válido, con el secreto correcto', async () => {
  const res = mockRes();
  await handler({
    method: 'POST', query: { accion: 'enviar-push' },
    headers: { 'x-orbit-secret': 'shh-test-orbit-shared-secret' },
    body: { correo: 'no-es-un-correo', titulo: 'x', cuerpo: 'y' },
  }, res);
  assert.equal(res.statusCode, 400);
});

test('enviar-push: 400 sin titulo/cuerpo, con correo y secreto correctos', async () => {
  const res = mockRes();
  await handler({
    method: 'POST', query: { accion: 'enviar-push' },
    headers: { 'x-orbit-secret': 'shh-test-orbit-shared-secret' },
    body: { correo: 'alumna@correo.com' },
  }, res);
  assert.equal(res.statusCode, 400);
});

// ── bootcamp-zoom-join (Puerta 5, Estación 7, diseño cerrado 2026-09-15) ──
// Equivalente de masterclass-zoom-join para las 3 Estaciones del Bootcamp,
// pero autenticado con la cookie mi_espacio_sesion (Puerta A) en vez de
// clase_gratuita_sesion — misma frontera que bootcamp-replay-visto/
// convocatoria-reservar (que ya viven sin cobertura de "camino feliz" en
// este archivo, ver encabezado). verificarToken/crearToken (auth-session.js)
// son criptografia local pura, sin Firestore — se pueden ejercitar aqui
// para probar TODO lo que ocurre antes de tocar obtenerCuenta. Lo que hay
// DESPUES de obtenerCuenta (cuenta activa -> obtenerBootcampZoomJoin ->
// respuesta de Orbit) es exactamente el mismo gap ya documentado (Firestore
// real, sin mock.module estable) — no simulado aqui, cubierto en cambio por
// obtenerBootcampZoomJoin.test.js (api/_lib/orbit-perfil-acceso.test.js).

test('bootcamp-zoom-join: 405 si el metodo no es GET', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-zoom-join', hito: '1' }, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('bootcamp-zoom-join: sin cookie -> ok:false sin_sesion, nunca llama a Orbit — un hito/correo hostil en la query no tiene ningun efecto', async (t) => {
  const fetchSpy = t.mock.method(global, 'fetch', async () => { throw new Error('no debia llamar a Orbit'); });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'bootcamp-zoom-join', hito: '1', correo: 'atacante@evil.com' }, headers: {} }, res);
  assert.deepEqual(res.body, { ok: false, motivo: 'sin_sesion' });
  assert.equal(fetchSpy.mock.calls.length, 0);
});

test('bootcamp-zoom-join: cookie corrupta/invalida -> ok:false sin_sesion, nunca llama a Orbit', async (t) => {
  const fetchSpy = t.mock.method(global, 'fetch', async () => { throw new Error('no debia llamar a Orbit'); });
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'bootcamp-zoom-join', hito: '1' },
    headers: { cookie: 'mi_espacio_sesion=token-corrupto-no-es-un-jwt-valido' },
  }, res);
  assert.deepEqual(res.body, { ok: false, motivo: 'sin_sesion' });
  assert.equal(fetchSpy.mock.calls.length, 0);
});

// hito se valida ANTES de tocar obtenerCuenta (ver bootcampZoomJoinAccion) —
// por eso esta rama SI es ejercitable con un token de sesion valido, sin
// necesitar Firestore real.
test('bootcamp-zoom-join: cookie de sesion valida pero hito invalido -> 400, nunca llama a Orbit', async (t) => {
  const token = crearTokenSesionTest('alumna@correo.com', 1);
  const fetchSpy = t.mock.method(global, 'fetch', async () => { throw new Error('no debia llamar a Orbit'); });
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'bootcamp-zoom-join', hito: '9' },
    headers: { cookie: `mi_espacio_sesion=${token}` },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(fetchSpy.mock.calls.length, 0);
});

test('bootcamp-zoom-join: cookie de sesion valida sin hito en la query -> 400, nunca llama a Orbit', async (t) => {
  const token = crearTokenSesionTest('alumna@correo.com', 1);
  const fetchSpy = t.mock.method(global, 'fetch', async () => { throw new Error('no debia llamar a Orbit'); });
  const res = mockRes();
  await handler({
    method: 'GET', query: { accion: 'bootcamp-zoom-join' },
    headers: { cookie: `mi_espacio_sesion=${token}` },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(fetchSpy.mock.calls.length, 0);
});

// El camino "cookie valida + cuenta activa -> Orbit ok:true/ok:false/caido"
// necesita obtenerCuenta (Firestore) real -- mismo gap ya documentado en el
// encabezado de este archivo para bootcamp-replay-visto/convocatoria-reservar,
// NO simulado aqui a proposito (un "camino feliz" fabricado sin Firestore
// real seria una prueba falsa, no una prueba). Lo que SI queda probado y es
// el punto de seguridad real: el cliente nunca puede decidir la Cohorte ni
// suplantar un correo -- unicamente `hito` sale de la query, el correo
// SIEMPRE sale de `datos.correo` (el token de sesion ya verificado), nunca
// de `req.query` ni `req.body`. Confirmado por lectura de codigo
// (bootcampZoomJoinAccion nunca lee req.query.correo/req.body.correo) mas
// las dos pruebas de arriba, que demuestran que un correo hostil en la
// query es ignorado sin tocar Orbit.

// ── Confirma que mi_espacio_sesion no se ve afectada — ni por la existencia
// del módulo nuevo, ni porque la cookie de clase gratuita viaje en el mismo
// header. sesionAccion sigue usando exclusivamente su propia cookie. ──

test('sesion: mi_espacio_sesion sigue exactamente igual — una cookie de clase gratuita, sola, nunca autentica en Mi Espacio completo', async () => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

test('sesion: mi_espacio_sesion se sigue leyendo igual aunque clase_gratuita_sesion viaje en el mismo header (sin cuenta real, sigue sin autenticar)', async () => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: { cookie: `clase_gratuita_sesion=${token}; mi_espacio_sesion=token-invalido-de-cuenta` } }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

// ── Puerta 5 (onboarding de instalación, 2026-09-16): continuidad de
// Puerta B (bootcamp_continuidad) — fallback de sesionAccion cuando NO hay
// mi_espacio_sesion. El camino que sí llega a preguntarle a Orbit
// (resolverAccesoBootcamp -> tieneDerechoVigenteA) tiene el mismo gap ya
// documentado arriba (sin mock.module estable) — aquí solo se prueba la
// frontera que nunca toca Orbit: sin cookie, cookie inválida/expirada, o de
// otro tipo, nunca llega a llamar a Orbit. ──

test('sesion: sin mi_espacio_sesion NI bootcamp_continuidad -> autenticado false, nunca toca Orbit', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: {} }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

test('sesion: bootcamp_continuidad con firma manipulada -> autenticado false, nunca toca Orbit', async () => {
  const token = crearTokenContinuidadTest('compradora@correo.com');
  const [payload] = token.split('.');
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: { cookie: `bootcamp_continuidad=${payload}.firma-falsa` } }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

test('sesion: bootcamp_continuidad expirada -> autenticado false, cae al comportamiento honesto (nunca "case vencido = case valido")', async () => {
  const payload = Buffer.from(JSON.stringify({ correo: 'compradora@correo.com', tipo: 'bootcamp_continuidad', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const crypto = await import('node:crypto');
  const firma = crypto.createHmac('sha256', process.env.BOOTCAMP_CONTINUIDAD_SECRET).update(payload).digest('base64url');
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: { cookie: `bootcamp_continuidad=${payload}.${firma}` } }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

test('sesion: bootcamp_continuidad, sola (sin mi_espacio_sesion), no autentica como Mi Espacio completo -- nunca se confunde con clase_gratuita_sesion tampoco', async () => {
  const tokenClaseGratuita = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const res = mockRes();
  // bootcamp_continuidad ausente a proposito -- solo clase_gratuita_sesion viaja,
  // que sesionAccion nunca debe leer (tiene su propio verificador/cookie).
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: { cookie: `clase_gratuita_sesion=${tokenClaseGratuita}` } }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

test('mi_espacio_sesion (Puerta A) sigue teniendo prioridad -- si su cookie es invalida, cae a bootcamp_continuidad, nunca al reves (mi_espacio_sesion valida nunca se ignora)', async () => {
  // mi_espacio_sesion invalida (sin Cuenta real detras) -> cae al fallback de
  // Puerta B -- si esa cookie tampoco es valida, el resultado sigue siendo
  // autenticado:false, nunca un error ni una mezcla de las dos.
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: { cookie: 'mi_espacio_sesion=token-invalido-de-cuenta' } }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

// ── Puerta 2 — cambio de prioridad (2026-09-11): recuperar la sesión de
// clase gratuita en un dispositivo nuevo, solo con correo. Mismo gap
// documentado arriba (sin Firestore real no se puede probar aquí el camino
// que llama a puedenIntentarTodas) — solo se prueba la frontera de entrada
// que nunca toca Firestore/Orbit: método y formato del correo. ──

test('reclamar-sesion-clase-gratuita: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'reclamar-sesion-clase-gratuita' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('reclamar-sesion-clase-gratuita: 400 si el correo no es valido (nunca llega a tocar Firestore/Orbit)', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'reclamar-sesion-clase-gratuita' }, body: { correo: 'no-es-un-correo' } }, res);
  assert.equal(res.statusCode, 400);
});

test('reclamar-sesion-clase-gratuita: 400 si falta el correo', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'reclamar-sesion-clase-gratuita' }, body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('login: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'login' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('login: 400 si falta correo o password (nunca llega a tocar Firestore/Orbit)', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'login' }, body: { correo: '' } }, res);
  assert.equal(res.statusCode, 400);
});

// ── Puerta 2 — Slice 8: workbook-acceso. Igual que el resto del archivo,
// solo se prueba aquí la frontera que no toca Firestore/Orbit (405) — el
// camino real (correo inválido/rate-limit/consulta a Orbit) necesita
// Firestore real y Orbit real, cubierto por separado en
// orbit-perfil-acceso.test.js (tieneDerechoVigenteA) y verificado en
// navegador contra datos simulados, mismo gap ya documentado arriba.
//
// Puerta 5, Corte 5 (diseño cerrado 2026-09-12, revisado tras auditoria de
// la Puerta B): este endpoint es la venta directa de Código Soberana
// (Hotmart -> Brevo lista #11 -> login tradicional de /workbook) — NUNCA
// se retira, sigue siendo el unico camino real de esa compradora. Se
// extendió de forma aditiva (`bootcampHitos`/`replayCompradoActivo`,
// mismas funciones de Orbit que ya usa sesionAccion, sin segunda lógica de
// negocio) — cualquier consumidor viejo que solo lea `.activo` sigue
// funcionando igual. Camino feliz (activo:true + los campos nuevos)
// verificado en navegador con /api/workbook-acceso mockeado, mismo gap de
// Firestore/Orbit real ya documentado arriba. ──

test('workbook-acceso: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'workbook-acceso' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

// ── Puerta 2 — Slice 4, pieza P6: convocatoria-reservar ──
// Mismo gap documentado arriba (sin mock.module estable para Firestore/Orbit
// en esta version de Node): el camino feliz (cookie valida -> obtenerCuenta
// -> crearRegistroAutenticado -> Orbit) no se puede ejercitar aqui sin
// tocar servicios reales. Lo que SI es verificable sin mocks, y es
// exactamente la frontera de seguridad auditada antes de implementar esta
// pieza (ver PUERTA-2-CODIGO-SOBERANA-MAPA-DE-SLICES.md, addendum de
// auditoria Pista A): la funcion nunca lee `req.body` para decidir la
// identidad — solo `leerCookie(req)`. Sin cookie valida, se rechaza antes
// de tocar Firestore/Orbit, sin importar que traiga el body.
test('convocatoria-reservar: 405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'convocatoria-reservar' }, body: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('convocatoria-reservar: 401 sin cookie de sesion, y el correo del body (aunque sea distinto/hostil) no tiene ningun efecto', async () => {
  const res = mockRes();
  // Sin header Cookie -> leerCookie(req) no encuentra nada -> verificarToken
  // falla -> 401, ANTES de leer req.body.correo para nada. Simula
  // explicitamente un intento de mandar una identidad distinta desde el
  // cliente, para confirmar que el codigo ni siquiera la mira.
  await handler({
    method: 'POST',
    query: { accion: 'convocatoria-reservar' },
    headers: {},
    body: { correo: 'atacante@evil.com' },
  }, res);
  assert.equal(res.statusCode, 401);
});

test('convocatoria-reservar: 401 con una cookie de sesion invalida/corrupta, sin importar el body', async () => {
  const res = mockRes();
  await handler({
    method: 'POST',
    query: { accion: 'convocatoria-reservar' },
    headers: { cookie: 'mi_espacio_sesion=token-corrupto-no-es-un-jwt-valido' },
    body: { correo: 'atacante@evil.com' },
  }, res);
  assert.equal(res.statusCode, 401);
});

// ── Gate de Puerta B para el Bootcamp (2026-09-19): recorridoHabilitado lo
// decide Orbit (por producto de origen) y viaja tal cual por la continuidad;
// y las dos acciones de completitud/entrada aceptan la cookie de continuidad
// (Puerta B) ademas de la Cuenta (Puerta A). Orbit se simula con
// global.fetch — sin Firestore: la rama de continuidad no lo usa. ──

const PERFIL_BASE = { programas: [{ programaId: 'codigo-soberana', derecho: 'vigente' }], replayCompradoActivo: null };
const HITOS_BOOTCAMP = { cohorteId: 'c1', hitos: [{ hito: 1, disponible: false, completado: false }], bootcampCompletado: false };
const HITOS_VACIOS = { cohorteId: null, hitos: null, bootcampCompletado: false };

function cabecerasContinuidad(correo) {
  return { cookie: `bootcamp_continuidad=${crearTokenContinuidadTest(correo)}` };
}

function fetchOrbit(t, respuestas) {
  // respuestas: { 'perfil-acceso': body, 'bootcamp-replay-visto': {status, body}, ... } por accion o 'perfil'
  return t.mock.method(global, 'fetch', async (url) => {
    const u = String(url);
    const clave = u.includes('accion=') ? u.split('accion=')[1] : 'perfil';
    const r = respuestas[clave];
    if (!r) throw new Error(`fetch inesperado a ${u}`);
    const status = r.status || 200;
    return { ok: status < 400, status, json: async () => r.body };
  });
}

test('sesion (continuidad Puerta B), origen Bootcamp sin completar: recorridoHabilitado FALSE aunque bootcampHitos venga lleno', async (t) => {
  fetchOrbit(t, { perfil: { body: { ...PERFIL_BASE, bootcampHitos: HITOS_BOOTCAMP, recorridoHabilitado: false } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: cabecerasContinuidad('compradora@correo.com') }, res);
  assert.equal(res.body.autenticado, true);
  assert.equal(res.body.puerta, 'B');
  assert.equal(res.body.recorridoHabilitado, false);
  assert.deepEqual(res.body.bootcampHitos, HITOS_BOOTCAMP);
});

test('sesion (continuidad Puerta B), venta directa: recorridoHabilitado TRUE tal como lo decide Orbit (sin Hitos)', async (t) => {
  fetchOrbit(t, { perfil: { body: { ...PERFIL_BASE, bootcampHitos: HITOS_VACIOS, recorridoHabilitado: true } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: cabecerasContinuidad('directa@correo.com') }, res);
  assert.equal(res.body.recorridoHabilitado, true);
});

test('sesion (continuidad Puerta B), Bootcamp ya completado: recorridoHabilitado TRUE tal como lo decide Orbit', async (t) => {
  fetchOrbit(t, { perfil: { body: { ...PERFIL_BASE, bootcampHitos: { cohorteId: 'c1', hitos: [], bootcampCompletado: true }, recorridoHabilitado: true } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: cabecerasContinuidad('compradora@correo.com') }, res);
  assert.equal(res.body.recorridoHabilitado, true);
});

test('sesion (continuidad Puerta B): Orbit no manda recorridoHabilitado -> false (fail-closed), nunca derivado de bootcampHitos', async (t) => {
  fetchOrbit(t, { perfil: { body: { ...PERFIL_BASE, bootcampHitos: HITOS_BOOTCAMP } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: cabecerasContinuidad('compradora@correo.com') }, res);
  assert.equal(res.body.recorridoHabilitado, false);
});

test('sesion (continuidad Puerta B): sin derecho vigente a codigo-soberana -> autenticado false', async (t) => {
  fetchOrbit(t, { perfil: { body: { programas: [{ programaId: 'mas-se-aleja', derecho: 'vigente' }], recorridoHabilitado: true } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: cabecerasContinuidad('otra@correo.com') }, res);
  assert.deepEqual(res.body, { autenticado: false });
});

test('sesion (continuidad Puerta B): una sola consulta a Orbit', async (t) => {
  const f = fetchOrbit(t, { perfil: { body: { ...PERFIL_BASE, bootcampHitos: HITOS_BOOTCAMP, recorridoHabilitado: false } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion' }, headers: cabecerasContinuidad('compradora@correo.com') }, res);
  assert.equal(f.mock.calls.length, 1);
});

// ── bootcamp-replay-visto con continuidad ──

test('bootcamp-replay-visto: sin ninguna cookie -> 401 y NUNCA llama a Orbit', async (t) => {
  const f = fetchOrbit(t, {});
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: {}, body: { hito: 1 } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(f.mock.calls.length, 0);
});

test('bootcamp-replay-visto: cookie de continuidad con firma manipulada -> 401, NUNCA llama a Orbit', async (t) => {
  const f = fetchOrbit(t, {});
  const [payload] = crearTokenContinuidadTest('compradora@correo.com').split('.');
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: { cookie: `bootcamp_continuidad=${payload}.firma-falsa` }, body: { hito: 1 } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(f.mock.calls.length, 0);
});

test('bootcamp-replay-visto: cookie de continuidad EXPIRADA -> 401, NUNCA llama a Orbit', async (t) => {
  const f = fetchOrbit(t, {});
  const payload = Buffer.from(JSON.stringify({ correo: 'compradora@correo.com', tipo: 'bootcamp_continuidad', exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url');
  const crypto = await import('node:crypto');
  const firma = crypto.createHmac('sha256', process.env.BOOTCAMP_CONTINUIDAD_SECRET).update(payload).digest('base64url');
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: { cookie: `bootcamp_continuidad=${payload}.${firma}` }, body: { hito: 1 } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(f.mock.calls.length, 0);
});

test('bootcamp-replay-visto: clase_gratuita_sesion NO se confunde con la de continuidad -> 401', async (t) => {
  const f = fetchOrbit(t, {});
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', CONVOCATORIA_MOCK.convocatoriaId, CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: { cookie: `clase_gratuita_sesion=${token}` }, body: { hito: 1 } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(f.mock.calls.length, 0);
});

test('bootcamp-replay-visto: cookie de continuidad valida -> llama a Orbit con el correo de la COOKIE (nunca el del body) y devuelve su respuesta', async (t) => {
  const f = fetchOrbit(t, { 'bootcamp-replay-visto': { body: { ok: true } } });
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: cabecerasContinuidad('compradora@correo.com'), body: { hito: 2, correo: 'hostil@correo.com' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(f.mock.calls.length, 1);
  assert.deepEqual(JSON.parse(f.mock.calls[0].arguments[1].body), { correo: 'compradora@correo.com', hito: 2 });
});

test('bootcamp-replay-visto: mi_espacio_sesion INVALIDA + continuidad valida -> se usa la continuidad (mismo fallback que sesion)', async (t) => {
  const f = fetchOrbit(t, { 'bootcamp-replay-visto': { body: { ok: true } } });
  const res = mockRes();
  const cookie = `mi_espacio_sesion=token-invalido; bootcamp_continuidad=${crearTokenContinuidadTest('compradora@correo.com')}`;
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: { cookie }, body: { hito: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(f.mock.calls.length, 1);
});

test('bootcamp-replay-visto: Orbit responde 409 hito_no_disponible (guardian de calendario) -> 409, sin escritura', async (t) => {
  fetchOrbit(t, { 'bootcamp-replay-visto': { status: 409, body: { error: 'hito_no_disponible' } } });
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: cabecerasContinuidad('compradora@correo.com'), body: { hito: 1 } }, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'hito_no_disponible' });
});

test('bootcamp-replay-visto: hito invalido -> 400 (con sesion valida), sin llamar a Orbit', async (t) => {
  const f = fetchOrbit(t, {});
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'bootcamp-replay-visto' }, headers: cabecerasContinuidad('compradora@correo.com'), body: { hito: 7 } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(f.mock.calls.length, 0);
});

// ── bootcamp-zoom-join con continuidad ──

test('bootcamp-zoom-join: sin sesion -> 200 {ok:false, motivo:sin_sesion} y NUNCA llama a Orbit (contrato que dispara la revalidacion del cliente)', async (t) => {
  const f = fetchOrbit(t, {});
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'bootcamp-zoom-join', hito: '1' }, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: false, motivo: 'sin_sesion' });
  assert.equal(f.mock.calls.length, 0);
});

test('bootcamp-zoom-join: cookie de continuidad valida -> llama a Orbit con el correo de la cookie', async (t) => {
  const f = fetchOrbit(t, { 'bootcamp-zoom-registrar': { body: { ok: false, motivo: 'zoom_no_configurado', enlaceGenerico: null } } });
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'bootcamp-zoom-join', hito: '2' }, headers: cabecerasContinuidad('compradora@correo.com') }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: false, motivo: 'zoom_no_configurado', enlaceGenerico: null });
  assert.deepEqual(JSON.parse(f.mock.calls[0].arguments[1].body), { correo: 'compradora@correo.com', hito: 2 });
});

test('bootcamp-zoom-join: continuidad manipulada -> {ok:false, sin_sesion}, NUNCA llama a Orbit', async (t) => {
  const f = fetchOrbit(t, {});
  const [payload] = crearTokenContinuidadTest('compradora@correo.com').split('.');
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'bootcamp-zoom-join', hito: '1' }, headers: { cookie: `bootcamp_continuidad=${payload}.firma-falsa` } }, res);
  assert.deepEqual(res.body, { ok: false, motivo: 'sin_sesion' });
  assert.equal(f.mock.calls.length, 0);
});

// ── enviar-push con correos[] (diagnóstico de Push, 2026-09-19) ──
// El contrato acepta `correo` (original) y/o `correos[]`. Estas pruebas cubren
// la validación (todo lo que ocurre antes de tocar Firestore/FCM); el envío en
// sí, la deduplicación de tokens y los errores de Firestore se prueban en
// api/_lib/push-fcm.test.js con dependencias inyectadas. En este entorno de
// pruebas no hay FIREBASE_SERVICE_ACCOUNT, así que un envío válido termina en
// {ok:false, motivo:'firebase_no_configurado'} sin tocar la red.

const CABECERAS_PUSH = { 'x-orbit-secret': 'shh-test-orbit-shared-secret' };

test('enviar-push: correos[] con al menos un correo válido pasa la validación (llega al puente, sin red)', async () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  try {
    const res = mockRes();
    await handler({ method: 'POST', query: { accion: 'enviar-push' }, headers: CABECERAS_PUSH, body: { correos: ['a@correo.com', 'b@correo.com'], titulo: 'x', cuerpo: 'y' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: false, motivo: 'firebase_no_configurado' });
  } finally {
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = original;
  }
});

test('enviar-push: compatibilidad — solo `correo` (contrato original) sigue funcionando', async () => {
  const original = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  try {
    const res = mockRes();
    await handler({ method: 'POST', query: { accion: 'enviar-push' }, headers: CABECERAS_PUSH, body: { correo: 'alumna@correo.com', titulo: 'x', cuerpo: 'y' } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: false, motivo: 'firebase_no_configurado' });
  } finally {
    if (original !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT = original;
  }
});

test('enviar-push: correos[] vacío o solo con valores inválidos -> 400 (nunca amplía destinatarios)', async () => {
  for (const body of [{ correos: [] }, { correos: ['no-es-correo', '', null] }, { correos: 'no-es-arreglo' }, {}]) {
    const res = mockRes();
    await handler({ method: 'POST', query: { accion: 'enviar-push' }, headers: CABECERAS_PUSH, body: { ...body, titulo: 'x', cuerpo: 'y' } }, res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
});

test('enviar-push: correos[] con titulo/cuerpo ausentes -> 400', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'enviar-push' }, headers: CABECERAS_PUSH, body: { correos: ['a@correo.com'] } }, res);
  assert.equal(res.statusCode, 400);
});

test('enviar-push: correos[] sin el secreto -> 401 (la lista no abre el endpoint)', async () => {
  const res = mockRes();
  await handler({ method: 'POST', query: { accion: 'enviar-push' }, headers: {}, body: { correos: ['a@correo.com'], titulo: 'x', cuerpo: 'y' } }, res);
  assert.equal(res.statusCode, 401);
});
