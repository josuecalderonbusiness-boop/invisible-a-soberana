// api/sala-simulive-sync.test.js — decisión de sincronización video <-> sesión
// de la sala SIMULIVE en vivo (public/mi-espacio/sala-simulive.js).
//
// El componente es JS de cliente sin bundler, así que la decisión se
// extrajo como función PURA (sin DOM ni red) y se prueba aquí cargando el
// archivo real en un contexto `vm` con stubs mínimos — nunca una copia de la
// lógica. Los parámetros salen de una medición real en un Android (Chrome
// pausa al salir, reanuda solo al volver en la posición vieja; desfase normal
// en sincronía ~0,8 s; el reproductor responde en <100 ms).
//
// Ejecutar SOLO este archivo: `node --test api/sala-simulive-sync.test.js`
// (nunca `node --test` a secas en este repo: ejecuta scripts con efectos reales).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RUTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mi-espacio', 'sala-simulive.js');
const CODIGO = fs.readFileSync(RUTA, 'utf8');

const contexto = { window: {}, document: {}, console };
vm.createContext(contexto);
vm.runInContext(CODIGO, contexto);
const sala = contexto.window.iniciarSalaSimulive;
const decidir = sala.decidirSincronizacion;
const P = sala.parametrosSincronizacion;

test('parámetros iniciales acordados (3 s / 8 s / 250 ms)', () => {
  assert.equal(P.SYNC_TOLERANCIA_SEGUNDOS, 3);
  assert.equal(P.SYNC_AVISO_SEGUNDOS, 8);
  assert.equal(P.SYNC_ESPERA_REGRESO_MS, 250);
});

test('diferencia < 3 s: alineado, no se toca (incluye el desfase normal medido de ~0,8 s)', () => {
  for (const [real, esperado] of [[100, 100], [99.2, 100], [100.8, 100], [97.01, 100], [102.99, 100]]) {
    for (const origen of ['play', 'regreso', 'deriva']) {
      const d = decidir(real, esperado, origen);
      assert.equal(d.corregir, false, `real=${real} esperado=${esperado} origen=${origen}`);
      assert.equal(d.aviso, false);
    }
  }
});

test('diferencia >= 3 s: se corrige (el límite exacto de 3 s ya corrige)', () => {
  for (const origen of ['play', 'regreso', 'deriva']) {
    assert.equal(decidir(97, 100, origen).corregir, true, `3 s exactos, ${origen}`);
    assert.equal(decidir(60, 100, origen).corregir, true, `40 s, ${origen}`);
  }
});

test('la diferencia es en valor absoluto: un video ADELANTADO también se corrige', () => {
  assert.equal(decidir(120, 100, 'regreso').corregir, true);
  assert.equal(decidir(103, 100, 'deriva').corregir, true);
});

test('aviso "Volviste a la sesión": solo al volver y solo si el salto es > 8 s (8 s exactos no)', () => {
  assert.equal(decidir(92, 100, 'regreso').aviso, false, '8 s exactos: corrige pero sin aviso');
  assert.equal(decidir(92, 100, 'regreso').corregir, true);
  assert.equal(decidir(91.99, 100, 'regreso').aviso, true);
  assert.equal(decidir(50, 100, 'regreso').aviso, true);
  assert.equal(decidir(95, 100, 'regreso').aviso, false, 'salto pequeño: silencioso');
});

test('el play y la deriva NUNCA avisan, por grande que sea el salto', () => {
  assert.equal(decidir(10, 100, 'play').aviso, false);
  assert.equal(decidir(10, 100, 'play').corregir, true);
  assert.equal(decidir(10, 100, 'deriva').aviso, false);
  assert.equal(decidir(10, 100, 'deriva').corregir, true);
});

test('sin respuesta del reproductor: solo el REGRESO asume el peor caso; play y deriva esperan al siguiente ciclo', () => {
  for (const sinDato of [null, undefined, NaN, Infinity, '12', {}]) {
    const r = decidir(sinDato, 100, 'regreso');
    assert.equal(r.corregir, true);
    assert.equal(r.aviso, true);
    for (const origen of ['play', 'deriva']) {
      const o = decidir(sinDato, 100, origen);
      assert.equal(o.corregir, false, `${String(sinDato)} en ${origen}`);
      assert.equal(o.aviso, false);
    }
  }
});

test('escenarios medidos en el Android real: desfases 8,6 / 14,6 / 21,5 s al volver', () => {
  // ausencias de la medición: el video quedó donde se pausó, la sesión avanzó
  assert.deepEqual([decidir(58.0, 66.6, 'regreso').corregir, decidir(58.0, 66.6, 'regreso').aviso], [true, true]);
  assert.deepEqual([decidir(59.8, 74.4, 'regreso').corregir, decidir(59.8, 74.4, 'regreso').aviso], [true, true]);
  assert.deepEqual([decidir(28.8, 50.3, 'regreso').corregir, decidir(28.8, 50.3, 'regreso').aviso], [true, true]);
  // y una ausencia breve (2,2 s) con el video casi al día: silencio total
  assert.deepEqual([decidir(29.0, 30.4, 'regreso').corregir, decidir(29.0, 30.4, 'regreso').aviso], [false, false]);
});

test('guarda estructural: un único lugar (además del ready inicial) mueve el currentTime — nada de dos mecanismos peleando', () => {
  const usos = CODIGO.split('\n').filter((l) => /\.setCurrentTime\(/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(usos.length, 2, `esperaba 2 (ready + sincronizarVideoConSesion), encontré ${usos.length}:\n${usos.join('\n')}`);
});

test('guarda estructural: la sincronización no llama play() por su cuenta y pageshow no la dispara', () => {
  const cuerpo = CODIGO.slice(CODIGO.indexOf('function sincronizarVideoConSesion'), CODIGO.indexOf('// ── corrección de deriva del video'));
  assert.ok(cuerpo.length > 200, 'no se encontró el cuerpo de sincronizarVideoConSesion');
  assert.ok(!/\.play\(\)/.test(cuerpo), 'sincronizarVideoConSesion/alRegresar no deben llamar play()');
  assert.ok(/addEventListener\('pageshow', revaluarSiYaTermino\)/.test(CODIGO), 'pageshow solo revalúa el fin de sesión');
});
