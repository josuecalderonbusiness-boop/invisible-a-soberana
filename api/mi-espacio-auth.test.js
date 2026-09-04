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
const { default: handler } = await import('./mi-espacio-auth.js');

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
