// public/mi-espacio/programa-autorizacion.test.js — pruebas puras del
// cliente de sesión (cacheo en sessionStorage), corriendo en Node con un
// shim mínimo de window/sessionStorage/fetch — sin tocar la red real.
//
// El módulo se importa UNA sola vez (window/sessionStorage/fetch se leen
// como globals en cada llamada, no se capturan al cargar el módulo), y cada
// prueba resetea los shims en vez de reimportar — reimportar con query
// strings de cache-busting no se re-ejecutó de forma confiable en este
// entorno.

import test from 'node:test';
import assert from 'node:assert/strict';

global.window = {};
await import('./programa-autorizacion.js');
const { verificarAutorizacion, limpiarAutorizacion } = window.OrbitAutorizacion;

function instalarShims(fetchImpl) {
  const store = new Map();
  global.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  global.fetch = fetchImpl;
  return store;
}

test('verificarAutorizacion: PERMITIR se cachea y la segunda llamada no vuelve a pedir red', async () => {
  let llamadasFetch = 0;
  instalarShims(async () => {
    llamadasFetch += 1;
    return { json: async () => ({ resultado: 'PERMITIR' }) };
  });

  const r1 = await verificarAutorizacion('persona-1', 'mas-se-aleja');
  const r2 = await verificarAutorizacion('persona-1', 'mas-se-aleja');

  assert.deepEqual(r1, { resultado: 'PERMITIR' });
  assert.deepEqual(r2, { resultado: 'PERMITIR' });
  assert.equal(llamadasFetch, 1, 'la segunda llamada debia usar el cache de sesion');
});

test('verificarAutorizacion: NO_VERIFICADO nunca se cachea, siempre reintenta', async () => {
  let llamadasFetch = 0;
  instalarShims(async () => {
    llamadasFetch += 1;
    return { json: async () => ({ resultado: 'NO_VERIFICADO', motivo: 'timeout' }) };
  });

  await verificarAutorizacion('persona-1', 'mas-se-aleja');
  await verificarAutorizacion('persona-1', 'mas-se-aleja');

  assert.equal(llamadasFetch, 2, 'NO_VERIFICADO nunca debe quedar pegado en cache');
});

test('verificarAutorizacion: la clave de cache separa por programa_id, DENEGAR de un programa no contamina otro', async () => {
  instalarShims(async (url) => {
    const esOtroPrograma = url.includes('programa_id=otro-programa');
    return { json: async () => ({ resultado: esOtroPrograma ? 'PERMITIR' : 'DENEGAR' }) };
  });

  const rMasSeAleja = await verificarAutorizacion('persona-1', 'mas-se-aleja');
  const rOtro = await verificarAutorizacion('persona-1', 'otro-programa');

  assert.equal(rMasSeAleja.resultado, 'DENEGAR');
  assert.equal(rOtro.resultado, 'PERMITIR');
});

test('limpiarAutorizacion: borra solo la clave de ese persona_id + programa_id', async () => {
  instalarShims(async () => ({ json: async () => ({ resultado: 'PERMITIR' }) }));

  await verificarAutorizacion('persona-1', 'mas-se-aleja');
  assert.equal(sessionStorage.getItem('orbit_autorizacion__persona-1__mas-se-aleja') !== null, true);

  limpiarAutorizacion('persona-1', 'mas-se-aleja');
  assert.equal(sessionStorage.getItem('orbit_autorizacion__persona-1__mas-se-aleja'), null);
});
