// api/_lib/programa.test.js — prueba pura de autenticado(), la única función
// de este módulo que no depende de Firestore/Google credentials.
// resolverEdicion()/obtenerEstado() requieren un token real de Firestore
// (googleapis.GoogleAuth) y no se cubren aquí: mockear ese flujo sin tocar
// la red exigiría inyectar el proveedor de token, cambio no hecho todavía.
// Gap de cobertura documentado, no simulado.

import test from 'node:test';
import assert from 'node:assert/strict';
import { autenticado } from './programa.js';

test('autenticado: false si ORBIT_SHARED_SECRET no esta configurado', () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  delete process.env.ORBIT_SHARED_SECRET;
  assert.equal(autenticado({ headers: { 'x-orbit-secret': 'lo-que-sea' } }), false);
  if (original !== undefined) process.env.ORBIT_SHARED_SECRET = original;
});

test('autenticado: false si el header no coincide', () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  process.env.ORBIT_SHARED_SECRET = 'correcto';
  assert.equal(autenticado({ headers: { 'x-orbit-secret': 'incorrecto' } }), false);
  process.env.ORBIT_SHARED_SECRET = original;
});

test('autenticado: true si el header coincide exactamente', () => {
  const original = process.env.ORBIT_SHARED_SECRET;
  process.env.ORBIT_SHARED_SECRET = 'correcto';
  assert.equal(autenticado({ headers: { 'x-orbit-secret': 'correcto' } }), true);
  process.env.ORBIT_SHARED_SECRET = original;
});
