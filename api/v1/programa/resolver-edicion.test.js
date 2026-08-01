// api/v1/programa/resolver-edicion.test.js — pruebas de las guardas del
// handler de Conversación 1 (DR-006/DR-007) que no requieren Firestore:
// método, autenticación y parámetro requerido. El camino feliz (llamar a
// resolverEdicion() de verdad) necesita credenciales de Firestore reales y
// no se cubre aquí — node:test no tiene mock.module estable en esta
// versión de Node para interceptar el import de ../../../_lib/programa.js
// sin tocarlo. Ver auditoría: gap documentado, no simulado.

import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './[programa_id]/resolver-edicion.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('405 si el metodo no es POST', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('401 si falta o esta mal el secreto compartido', async () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  process.env.ORBIT_SHARED_SECRET = 'shh';
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, query: { programa_id: 'mas-se-aleja' } }, res);
  assert.equal(res.statusCode, 401);
  process.env.ORBIT_SHARED_SECRET = original;
});

test('400 si falta programa_id', async () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  process.env.ORBIT_SHARED_SECRET = 'shh';
  const res = mockRes();
  await handler({ method: 'POST', headers: { 'x-orbit-secret': 'shh' }, query: {} }, res);
  assert.equal(res.statusCode, 400);
  process.env.ORBIT_SHARED_SECRET = original;
});
