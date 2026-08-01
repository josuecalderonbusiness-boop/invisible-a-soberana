// api/v1/edicion/estado.test.js — pruebas de las guardas del handler de
// Conversación 2 (DR-006/DR-007) que no requieren Firestore. Mismo criterio
// que resolver-edicion.test.js: el camino feliz no se simula, se documenta
// como gap de cobertura hasta que exista un mecanismo de inyección para
// ../../../_lib/programa.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './[edicion_id]/estado.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('405 si el metodo no es GET', async () => {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('401 si falta o esta mal el secreto compartido', async () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  process.env.ORBIT_SHARED_SECRET = 'shh';
  const res = mockRes();
  await handler({ method: 'GET', headers: {}, query: { edicion_id: 'ED-2026-08' } }, res);
  assert.equal(res.statusCode, 401);
  process.env.ORBIT_SHARED_SECRET = original;
});

test('400 si falta edicion_id', async () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  process.env.ORBIT_SHARED_SECRET = 'shh';
  const res = mockRes();
  await handler({ method: 'GET', headers: { 'x-orbit-secret': 'shh' }, query: {} }, res);
  assert.equal(res.statusCode, 400);
  process.env.ORBIT_SHARED_SECRET = original;
});
