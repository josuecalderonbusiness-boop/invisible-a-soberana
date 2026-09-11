// api/whatsapp.test.js — PRIMERA suite de pruebas de este archivo (no
// existían tests aquí antes). Puerta 2 — Slice 7e (relay selectivo
// Legacy->Orbit, 2026-09-10, ver auditoría del mismo día): acotada
// exclusivamente a lo que este cambio introduce — el guard de
// interceptación del botón VER_MI_CLASE y su regresión — NO pretende
// cubrir retroactivamente el resto del funnel (Código Soberana / Workshop
// / 7D / Masterclass), que sigue sin tests propios y queda fuera de
// alcance de este cambio.
//
// global.fetch se stubbea con node:test mock — nunca toca Sheets, Meta ni
// Orbit reales. SHEETS_WEBHOOK_URL se deja SIN configurar a propósito:
// verificarDuplicado()/buscarContacto()/guardarEnSheets() ya tienen su
// propio camino corto (`if (!url) return`) para ese caso, así que no hace
// falta mockear esa integración para probar el guard nuevo.
//
// MI_ESPACIO_ORBIT_SECRET se fija ANTES del import (mismo motivo que
// api/_lib/orbit-perfil-acceso.test.js: con `import` estático los imports
// se resuelven antes de que corra cualquier línea de este archivo).

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MI_ESPACIO_ORBIT_SECRET = process.env.MI_ESPACIO_ORBIT_SECRET || 'shh-mi-espacio';
delete process.env.SHEETS_WEBHOOK_URL;

const handler = (await import('./whatsapp.js')).default;

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}

function mensajeBoton({ payload = 'VER_MI_CLASE', texto = 'Ver mi clase', from = '573001112222', wamid = 'wamid.1' } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messages: [{ id: wamid, from, type: 'button', timestamp: '1700000000', button: { payload, text: texto } }] } }] }],
  };
}

// ── 1) VER_MI_CLASE: se relayea a Orbit y nunca entra a manejarBoton() ──

test('VER_MI_CLASE: se relayea a Orbit (con el secreto correcto) y NUNCA consulta Sheets (prueba de que no entró a manejarBoton()/buscarContacto)', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async (url) => {
    if (String(url).includes('script.google.com') || String(url).includes('sheets')) {
      throw new Error('no debía consultar Sheets para VER_MI_CLASE — eso solo pasa dentro de manejarBoton()');
    }
    return { ok: true, json: async () => ({ ok: true }) };
  });

  const res = mockRes();
  await handler({ method: 'POST', body: mensajeBoton() }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(fetchMock.mock.calls.length, 1); // única llamada: el relay a Orbit
  const [url, opciones] = fetchMock.mock.calls[0].arguments;
  assert.match(url, /\/api\/v1\/perfil-acceso\?accion=whatsapp-relay-ver-mi-clase$/);
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers['x-mi-espacio-secret'], 'shh-mi-espacio');
  assert.equal('X-Hub-Signature-256' in opciones.headers, false); // nunca comparte el secreto de Meta

  const cuerpoEnviado = JSON.parse(opciones.body);
  assert.equal(cuerpoEnviado.telefono, '573001112222');
  assert.equal(cuerpoEnviado.wamid, 'wamid.1');
  assert.equal(cuerpoEnviado.payload, 'VER_MI_CLASE');
});

// ── 2) Botón existente: sigue exactamente por el flujo Legacy ──

test('botón existente (comunidad_si) sigue exactamente por el flujo Legacy — el relay a Orbit NUNCA se invoca', async (t) => {
  const llamadas = [];
  t.mock.method(global, 'fetch', async (url) => {
    llamadas.push(String(url));
    return { ok: true, json: async () => ({}) };
  });

  const res = mockRes();
  await handler({ method: 'POST', body: mensajeBoton({ payload: 'comunidad_si', texto: '' }) }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(!llamadas.some((u) => u.includes('accion=whatsapp-relay-ver-mi-clase')), 'el relay nunca debe invocarse para un botón que no es VER_MI_CLASE');
});

// ── 3) Orbit caído: Legacy responde 200 igual, nunca se rompe ──

test('Orbit caído (error de red/timeout) en VER_MI_CLASE — Legacy responde 200 igual, nunca lanza', async (t) => {
  t.mock.method(global, 'fetch', async () => { throw new Error('ECONNREFUSED'); });

  const res = mockRes();
  await handler({ method: 'POST', body: mensajeBoton({ wamid: 'wamid.orbit-caido' }) }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('Orbit responde 500 en VER_MI_CLASE — Legacy responde 200 igual, nunca lanza', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 500, json: async () => ({ error: 'Error interno' }) }));

  const res = mockRes();
  await handler({ method: 'POST', body: mensajeBoton({ wamid: 'wamid.orbit-500' }) }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

// ── Payload fuera de alcance: no debe afectar al legacy ni tocar Orbit ──

test('payload sin messages / objeto distinto de whatsapp_business_account -> 200, nunca toca fetch (ni Orbit ni Sheets)', async (t) => {
  const fetchMock = t.mock.method(global, 'fetch', async () => { throw new Error('no debía tocar la red'); });

  const res1 = mockRes();
  await handler({ method: 'POST', body: { object: 'otra_cosa' } }, res1);
  assert.equal(res1.statusCode, 200);

  const res2 = mockRes();
  await handler({ method: 'POST', body: { object: 'whatsapp_business_account', entry: [{ changes: [{ value: {} }] }] } }, res2);
  assert.equal(res2.statusCode, 200);

  assert.equal(fetchMock.mock.calls.length, 0);
});

// ── Puente Orbit → Legacy (2026-09-11): accion 'orbit-enviar-meta' ──
// Unico punto por el que Orbit puede disparar un envio real de WhatsApp —
// reenvia el payload tal cual a Meta con las credenciales que YA existen
// aqui, nunca las expone, nunca decide QUE se manda (eso lo decide Orbit).

test('orbit-enviar-meta: sin el secreto correcto -> 401, nunca toca la red', async (t) => {
  process.env.ORBIT_SHARED_SECRET = 'secreto-real';
  const fetchMock = t.mock.method(global, 'fetch', async () => { throw new Error('no debía tocar la red'); });
  const res = mockRes();
  await handler({ method: 'POST', body: { accion: 'orbit-enviar-meta', payload: { to: '573001112222' } }, headers: { 'x-orbit-secret': 'secreto-equivocado' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(fetchMock.mock.calls.length, 0);
  delete process.env.ORBIT_SHARED_SECRET;
});

test('orbit-enviar-meta: sin ORBIT_SHARED_SECRET configurado en Legacy -> 401, nunca toca la red', async (t) => {
  delete process.env.ORBIT_SHARED_SECRET;
  const fetchMock = t.mock.method(global, 'fetch', async () => { throw new Error('no debía tocar la red'); });
  const res = mockRes();
  await handler({ method: 'POST', body: { accion: 'orbit-enviar-meta', payload: { to: '573001112222' } }, headers: { 'x-orbit-secret': 'lo-que-sea' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('orbit-enviar-meta: con el secreto correcto, reenvia el payload TAL CUAL a Meta y devuelve la respuesta cruda sin interpretar', async (t) => {
  process.env.ORBIT_SHARED_SECRET = 'secreto-real';
  const payloadOrbit = {
    messaging_product: 'whatsapp', to: '573001112222', type: 'template',
    template: { name: 'confirmacion_registro_clase_gratuita', language: { code: 'es_MX' }, components: [] },
  };
  const fetchMock = t.mock.method(global, 'fetch', async (url, opciones) => {
    assert.deepEqual(JSON.parse(opciones.body), payloadOrbit);
    return { status: 200, json: async () => ({ messages: [{ id: 'wamid.REAL123' }] }) };
  });
  const res = mockRes();
  await handler({ method: 'POST', body: { accion: 'orbit-enviar-meta', payload: payloadOrbit }, headers: { 'x-orbit-secret': 'secreto-real' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { httpStatus: 200, body: { messages: [{ id: 'wamid.REAL123' }] } });
  assert.equal(fetchMock.mock.calls.length, 1);
  delete process.env.ORBIT_SHARED_SECRET;
});

test('orbit-enviar-meta: sin payload -> 400, nunca toca la red', async (t) => {
  process.env.ORBIT_SHARED_SECRET = 'secreto-real';
  const fetchMock = t.mock.method(global, 'fetch', async () => { throw new Error('no debía tocar la red'); });
  const res = mockRes();
  await handler({ method: 'POST', body: { accion: 'orbit-enviar-meta' }, headers: { 'x-orbit-secret': 'secreto-real' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(fetchMock.mock.calls.length, 0);
  delete process.env.ORBIT_SHARED_SECRET;
});

test('orbit-enviar-meta: Meta caida (error de red) -> 200 con sinRespuesta:true, nunca lanza', async (t) => {
  process.env.ORBIT_SHARED_SECRET = 'secreto-real';
  t.mock.method(global, 'fetch', async () => { throw new Error('ECONNREFUSED'); });
  const res = mockRes();
  await handler({ method: 'POST', body: { accion: 'orbit-enviar-meta', payload: { to: '573001112222' } }, headers: { 'x-orbit-secret': 'secreto-real' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sinRespuesta, true);
  delete process.env.ORBIT_SHARED_SECRET;
});
