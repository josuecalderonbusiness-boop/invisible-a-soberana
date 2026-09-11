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
const { default: handler } = await import('./mi-espacio-auth.js');
const { crearToken: crearTokenClaseGratuitaTest } = await import('./_lib/auth-clase-gratuita.js');

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
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: CONVOCATORIA_MOCK });
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
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null });
});

test('sesion-clase-gratuita: cookie válida pero de OTRA convocatoria (Orbit ya la registró para una nueva) → no autoriza contenido de la vieja', async (t) => {
  const token = crearTokenClaseGratuitaTest('alumna@correo.com', 'convocatoria-vieja', CONVOCATORIA_MOCK.fechaHora, CONVOCATORIA_MOCK.ventanaReplayHoras);
  mockFetchPerfilAcceso(t); // Orbit devuelve experienciaGratuitaActiva de CONVOCATORIA_MOCK.convocatoriaId, distinta de 'convocatoria-vieja'
  const res = mockRes();
  await handler({ method: 'GET', query: { accion: 'sesion-clase-gratuita' }, headers: { cookie: `clase_gratuita_sesion=${token}` } }, res);
  assert.deepEqual(res.body, { autorizado: true, experienciaGratuitaActiva: null });
});

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
// navegador contra datos simulados, mismo gap ya documentado arriba. ──

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
