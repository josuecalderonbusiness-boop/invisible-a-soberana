// api/v1/autorizar-programa.test.js — pruebas puras del proxy de
// Conversación 3 (DR-006/DR-007). No depende de Firestore ni de Orbit real:
// global.fetch se reemplaza siempre, igual que en las pruebas de orbit-mc
// (lib/whatsapp.test.js allá, mismo criterio aquí).

import test from 'node:test';
import assert from 'node:assert/strict';

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

async function freshHandler(env) {
  const original = { ...process.env };
  Object.assign(process.env, { ORBIT_BASE_URL: undefined, ORBIT_SHARED_SECRET: undefined, ...env });
  const mod = await import(`./autorizar-programa.js?t=${Date.now()}-${Math.random()}`);
  process.env = original;
  return mod.default;
}

test('405 si el metodo no es GET', async () => {
  const handler = await freshHandler({});
  const res = mockRes();
  await handler({ method: 'POST', query: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('200 OPTIONS (preflight CORS)', async () => {
  const handler = await freshHandler({});
  const res = mockRes();
  await handler({ method: 'OPTIONS', query: {} }, res);
  assert.equal(res.statusCode, 200);
});

test('400 si falta persona_id o programa_id', async () => {
  const handler = await freshHandler({});
  const res = mockRes();
  await handler({ method: 'GET', query: { persona_id: 'p1' } }, res);
  assert.equal(res.statusCode, 400);
});

test('NO_VERIFICADO si faltan ORBIT_BASE_URL/ORBIT_SHARED_SECRET, nunca DENEGAR', async () => {
  const handler = await freshHandler({});
  const res = mockRes();
  await handler({ method: 'GET', query: { persona_id: 'p1', programa_id: 'mas-se-aleja' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.resultado, 'NO_VERIFICADO');
});

test('llama a la URL correcta de Orbit con el secreto por header, y pasa PERMITIR/DENEGAR tal cual', async () => {
  const originalFetch = global.fetch;
  let peticion = null;
  global.fetch = async (url, opts) => {
    peticion = { url, opts };
    return { ok: true, json: async () => ({ resultado: 'PERMITIR' }) };
  };
  try {
    const handler = await freshHandler({ ORBIT_BASE_URL: 'https://orbit.test', ORBIT_SHARED_SECRET: 'shh' });
    const res = mockRes();
    await handler({ method: 'GET', query: { persona_id: 'p1', programa_id: 'mas-se-aleja' } }, res);
    assert.equal(peticion.url, 'https://orbit.test/api/v1/programa/mas-se-aleja/autorizacion/p1');
    assert.equal(peticion.opts.headers['x-orbit-secret'], 'shh');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { resultado: 'PERMITIR' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Orbit responde no-ok -> NO_VERIFICADO, nunca DENEGAR', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });
  try {
    const handler = await freshHandler({ ORBIT_BASE_URL: 'https://orbit.test', ORBIT_SHARED_SECRET: 'shh' });
    const res = mockRes();
    await handler({ method: 'GET', query: { persona_id: 'p1', programa_id: 'mas-se-aleja' } }, res);
    assert.equal(res.body.resultado, 'NO_VERIFICADO');
    assert.match(res.body.motivo, /orbit_respondio_503/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('respuesta inesperada de Orbit -> NO_VERIFICADO, nunca se traduce a DENEGAR', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ resultado: 'ALGO_RARO' }) });
  try {
    const handler = await freshHandler({ ORBIT_BASE_URL: 'https://orbit.test', ORBIT_SHARED_SECRET: 'shh' });
    const res = mockRes();
    await handler({ method: 'GET', query: { persona_id: 'p1', programa_id: 'mas-se-aleja' } }, res);
    assert.deepEqual(res.body, { resultado: 'NO_VERIFICADO', motivo: 'respuesta_inesperada' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('timeout de red -> NO_VERIFICADO con motivo timeout', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => new Promise((_, reject) => {
    opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  try {
    const handler = await freshHandler({ ORBIT_BASE_URL: 'https://orbit.test', ORBIT_SHARED_SECRET: 'shh' });
    const res = mockRes();
    await handler({ method: 'GET', query: { persona_id: 'p1', programa_id: 'mas-se-aleja' } }, res);
    assert.equal(res.body.resultado, 'NO_VERIFICADO');
    assert.equal(res.body.motivo, 'timeout');
  } finally {
    global.fetch = originalFetch;
  }
});
