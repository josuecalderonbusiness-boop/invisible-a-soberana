// api/sala-simulive-guion.test.js — guion DERIVADO de la sala SIMULIVE en vivo
// (Bloque B, 2026-09-25: eventos vencidos). Carga el archivo REAL del cliente
// (public/mi-espacio/sala-simulive.js) en un contexto `vm` y prueba sus
// decisiones PURAS: estadoDelGuion (qué corresponde mostrar en una posición)
// y decidirOverlay (qué hacer con la pantalla, incluido el reconocimiento de
// 3,5 s tras responder). Nunca una copia de la lógica.
//
// Ejecutar SOLO este archivo: `node --test api/sala-simulive-guion.test.js`
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
// Las funciones corren en otro contexto (vm): sus objetos tienen otro Object.prototype y
// deepEqual estricto los rechazaria aunque sean identicos. Se comparan como datos planos.
const plano = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const { estadoDelGuion, decidirOverlay: decidirOverlayCtx, parametrosGuion } = sala;
const decidirOverlay = (...args) => plano(decidirOverlayCtx(...args));

// Guion de referencia (el mismo del diseño): mensaje de equipo en 1:00, P1 en
// 5:00 (dura 10 s), P2 en 10:00 (dura 12 s), CTA en 55:00, sesión de 60 min.
const OPC = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const FAQ = { id: 'faq', offsetSegundos: 60, orden: 0, tipo: 'mensaje_equipo', payload: { autor: 'Equipo', texto: 'FAQ' } };
const P1 = { id: 'p1', offsetSegundos: 300, orden: 0, tipo: 'pregunta', payload: { texto: 'P1', opciones: OPC, duracion_visible_segundos: 10 } };
const P2 = { id: 'p2', offsetSegundos: 600, orden: 0, tipo: 'pregunta', payload: { texto: 'P2', opciones: OPC, duracion_visible_segundos: 12 } };
const CTA = { id: 'cta', offsetSegundos: 3300, orden: 0, tipo: 'apertura_cta', payload: { titular: 'Puertas abiertas', texto_boton: 'ACCEDER', url_destino: 'https://x.test' } };
const GUION = [FAQ, P1, P2, CTA];

const ids = (lista) => lista.map((e) => e.id);
const resumen = (pos, respondidas, guion) => {
  const g = estadoDelGuion(guion || GUION, pos, respondidas || {});
  return { mensajes: ids(g.mensajes), pregunta: g.preguntaVigente ? g.preguntaVigente.evento.id : null, restante: g.preguntaVigente ? Math.round(g.preguntaVigente.restanteSegundos * 1000) / 1000 : null, cta: g.ctaAbierta ? g.ctaAbierta.id : null };
};

test('parametros acordados: reconocimiento 3,5 s y default de 15 s (solo respaldo: Orbit ya normaliza)', () => {
  assert.equal(parametrosGuion.RECONOCIMIENTO_MS, 3500);
  assert.equal(parametrosGuion.DURACION_VISIBLE_POR_DEFECTO_SEGUNDOS, 15);
});

// ── CLIENTE: los casos aprobados ───────────────────────────────────────

test('caso 1 — entra en 0:00: nada todavia; a 1:00 el mensaje; a 5:00 la pregunta completa', () => {
  assert.deepEqual(resumen(0), { mensajes: [], pregunta: null, restante: null, cta: null });
  assert.deepEqual(resumen(59.9), { mensajes: [], pregunta: null, restante: null, cta: null });
  assert.deepEqual(resumen(60), { mensajes: ['faq'], pregunta: null, restante: null, cta: null });
  assert.deepEqual(resumen(300), { mensajes: ['faq'], pregunta: 'p1', restante: 10, cta: null });
});

test('caso 2 — entra en 4:59: historial si; la pregunta aun no; un segundo despues aparece COMPLETA, como en vivo', () => {
  assert.deepEqual(resumen(299), { mensajes: ['faq'], pregunta: null, restante: null, cta: null });
  assert.deepEqual(resumen(300), { mensajes: ['faq'], pregunta: 'p1', restante: 10, cta: null });
});

test('caso 3 — entra en 5:05: la pregunta VIGENTE con 5 s restantes', () => {
  assert.deepEqual(resumen(305), { mensajes: ['faq'], pregunta: 'p1', restante: 5, cta: null });
  assert.equal(resumen(309.999).pregunta, 'p1');
});

test('caso 4 — entra en 5:11: la pregunta VENCIO, no aparece retroactivamente (ni en ningun momento posterior)', () => {
  for (const pos of [310, 311, 400, 599, 3000, 3299, 3400, 3599]) {
    assert.equal(resumen(pos).pregunta === 'p1', false, `pos=${pos}`);
  }
  assert.deepEqual(resumen(311), { mensajes: ['faq'], pregunta: null, restante: null, cta: null });
});

test('caso 5 — entra despues de la CTA: historial + CTA visible; ninguna pregunta vencida; la CTA no depende de haber "presenciado" el evento', () => {
  assert.deepEqual(resumen(3400), { mensajes: ['faq'], pregunta: null, restante: null, cta: 'cta' });
  assert.deepEqual(resumen(3299), { mensajes: ['faq'], pregunta: null, restante: null, cta: null });
  assert.deepEqual(resumen(3300), { mensajes: ['faq'], pregunta: null, restante: null, cta: 'cta' });
  assert.equal(resumen(3599).cta, 'cta', 'sigue abierta hasta el final de en_vivo');
});

test('caso 6 — vuelve durante P1 (sale 4:50, vuelve 5:06): P1 con 4 s restantes si no la respondio; si ya la respondio, no', () => {
  assert.deepEqual(resumen(306), { mensajes: ['faq'], pregunta: 'p1', restante: 4, cta: null });
  assert.equal(resumen(306, { p1: 'a' }).pregunta, null);
});

test('caso 7 — vuelve despues de P1 (5:20): no aparece; el historial intacto', () => {
  assert.deepEqual(resumen(320), { mensajes: ['faq'], pregunta: null, restante: null, cta: null });
});

test('caso 8 — vuelve despues de la CTA (56:40): la CTA sigue abierta; ninguna pregunta', () => {
  assert.deepEqual(resumen(3400), { mensajes: ['faq'], pregunta: null, restante: null, cta: 'cta' });
});

test('caso 9 — recarga: el estado se DERIVA (guion + reloj + respondidas del servidor), sin nada guardado en el navegador', () => {
  assert.equal(resumen(306).pregunta, 'p1', '9a: sin responder -> vigente con 4 s');
  assert.equal(resumen(306, { p1: 'c' }).pregunta, null, '9b: ya respondida (Orbit la devuelve en sala-abrir) -> no reaparece');
  assert.deepEqual(resumen(3400), { mensajes: ['faq'], pregunta: null, restante: null, cta: 'cta' });
  assert.deepEqual(resumen(310.5), { mensajes: ['faq'], pregunta: null, restante: null, cta: null });
  // `respondidas` llega como objeto {evento: opcion}; tambien se acepta Set o arreglo
  assert.equal(estadoDelGuion(GUION, 306, new Set(['p1'])).preguntaVigente, null);
  assert.equal(estadoDelGuion(GUION, 306, ['p1']).preguntaVigente, null);
  assert.equal(estadoDelGuion(GUION, 306, undefined).preguntaVigente.evento.id, 'p1');
});

test('caso 10 — replay: el motor no aplica (la sala ni llama al reconciliador fuera de en_vivo); aqui solo se confirma que P2 tambien respeta su ventana', () => {
  assert.equal(resumen(600).pregunta, 'p2');
  assert.equal(resumen(611.999).pregunta, 'p2');
  assert.equal(resumen(612).pregunta, null);
});

test('historial: los mensajes de equipo con momento <= posicion salen en orden y sin duplicar', () => {
  const g = [
    { id: 'm2', offsetSegundos: 120, orden: 0, tipo: 'mensaje_equipo', payload: {} },
    { id: 'm1', offsetSegundos: 60, orden: 1, tipo: 'mensaje_equipo', payload: {} },
    { id: 'm0', offsetSegundos: 60, orden: 0, tipo: 'mensaje_equipo', payload: {} },
    { id: 'm9', offsetSegundos: 900, orden: 0, tipo: 'mensaje_equipo', payload: {} },
  ];
  assert.deepEqual(ids(estadoDelGuion(g, 200, {}).mensajes), ['m0', 'm1', 'm2']);
});

// ── decisiones de politica ────────────────────────────────────────────

test('sin duracion configurada la pregunta dura 15 s EXACTOS (no 21: el cliente ya no suma nada)', () => {
  const sinDuracion = { id: 'pz', offsetSegundos: 100, orden: 0, tipo: 'pregunta', payload: { texto: 'q', opciones: OPC } };
  assert.equal(estadoDelGuion([sinDuracion], 114.999, {}).preguntaVigente.evento.id, 'pz');
  assert.equal(estadoDelGuion([sinDuracion], 115, {}).preguntaVigente, null);
});

test('la duracion configurada es la duracion REAL: 10 s -> vigente hasta 309,999; a 310 ya no', () => {
  assert.equal(resumen(309.999).pregunta, 'p1');
  assert.equal(resumen(310).pregunta, null);
});

test('varias CTA: siempre la ULTIMA con momento <= posicion (40:00, 50:00, 55:00)', () => {
  const c40 = { id: 'c40', offsetSegundos: 2400, orden: 0, tipo: 'apertura_cta', payload: {} };
  const c50 = { id: 'c50', offsetSegundos: 3000, orden: 0, tipo: 'apertura_cta', payload: {} };
  const c55 = { id: 'c55', offsetSegundos: 3300, orden: 0, tipo: 'apertura_cta', payload: {} };
  const g = [c55, c40, c50]; // fuera de orden a proposito
  assert.equal(estadoDelGuion(g, 2399, {}).ctaAbierta, null);
  assert.equal(estadoDelGuion(g, 2400, {}).ctaAbierta.id, 'c40');
  assert.equal(estadoDelGuion(g, 3120, {}).ctaAbierta.id, 'c50', 'a las 52:00 -> la de 50:00');
  assert.equal(estadoDelGuion(g, 3360, {}).ctaAbierta.id, 'c55', 'a las 56:00 -> la de 55:00');
});

test('preguntas con ventanas solapadas: se muestra la mas reciente (regla determinista)', () => {
  const a = { id: 'a', offsetSegundos: 100, orden: 0, tipo: 'pregunta', payload: { opciones: OPC, duracion_visible_segundos: 30 } };
  const b = { id: 'b', offsetSegundos: 110, orden: 0, tipo: 'pregunta', payload: { opciones: OPC, duracion_visible_segundos: 10 } };
  assert.equal(estadoDelGuion([a, b], 105, {}).preguntaVigente.evento.id, 'a');
  assert.equal(estadoDelGuion([a, b], 115, {}).preguntaVigente.evento.id, 'b');
  assert.equal(estadoDelGuion([a, b], 121, {}).preguntaVigente.evento.id, 'a', 'b ya vencio; a sigue vigente');
  assert.equal(estadoDelGuion([a, b], 115, { b: 'x' }).preguntaVigente.evento.id, 'a', 'si b ya se respondio, cae a a');
});

test('eventos malformados (sin momento, nulos) se ignoran sin romper el guion', () => {
  const g = [null, undefined, { id: 'x', tipo: 'pregunta' }, { id: 'y', offsetSegundos: 'no', tipo: 'pregunta' }, P1];
  assert.equal(estadoDelGuion(g, 305, {}).preguntaVigente.evento.id, 'p1');
  assert.deepEqual(plano(estadoDelGuion(null, 305, {})), { mensajes: [], preguntaVigente: null, ctaAbierta: null });
});

// ── decidirOverlay: prioridad pregunta -> CTA -> nada ─────────────────

const VACIO = { tipo: null, id: null, hasta: 0 };
const decidir = (pos, actual, ahoraMs, respondidas, guion) => decidirOverlay(estadoDelGuion(guion || GUION, pos, respondidas || {}), actual || VACIO, ahoraMs || 0);

test('overlay: sin nada que mostrar -> mantener; con pregunta -> mostrarla; la misma pregunta en el siguiente tick -> mantener (no se re-dibuja)', () => {
  assert.deepEqual(decidir(100), { accion: 'mantener' });
  const d = decidir(301);
  assert.equal(d.accion, 'mostrar_pregunta');
  assert.equal(d.evento.id, 'p1');
  assert.deepEqual(decidir(302, { tipo: 'pregunta', id: 'p1', hasta: 0 }), { accion: 'mantener' });
});

test('overlay: al vencer la pregunta sin CTA abierta -> ocultar; con CTA abierta -> la CTA REAPARECE sola', () => {
  assert.deepEqual(decidir(311, { tipo: 'pregunta', id: 'p1', hasta: 0 }), { accion: 'ocultar' });
  const conCta = [P1, { id: 'cta0', offsetSegundos: 290, orden: 0, tipo: 'apertura_cta', payload: {} }];
  const d = decidir(311, { tipo: 'pregunta', id: 'p1', hasta: 0 }, 0, {}, conCta);
  assert.equal(d.accion, 'mostrar_cta');
  assert.equal(d.evento.id, 'cta0');
});

test('overlay: prioridad — una pregunta vigente PASA POR ENCIMA de la CTA abierta; al terminar, la CTA vuelve', () => {
  const g = [{ id: 'cta0', offsetSegundos: 290, orden: 0, tipo: 'apertura_cta', payload: {} }, P1];
  assert.equal(decidir(295, VACIO, 0, {}, g).accion, 'mostrar_cta');
  assert.equal(decidir(301, { tipo: 'cta', id: 'cta0', hasta: 0 }, 0, {}, g).accion, 'mostrar_pregunta');
  assert.equal(decidir(311, { tipo: 'pregunta', id: 'p1', hasta: 0 }, 0, {}, g).accion, 'mostrar_cta');
  assert.deepEqual(decidir(320, { tipo: 'cta', id: 'cta0', hasta: 0 }, 0, {}, g), { accion: 'mantener' });
});

// ── CASO OBLIGATORIO: pregunta -> respuesta -> reconocimiento 3,5 s -> tick ──

test('reconocimiento: durante 3,5 s NADIE lo pisa (ni la ventana que se cierra, ni la CTA, ni un tick); al terminar manda el estado derivado', () => {
  const T = 1000000; // instante (ms) en que se toco la opcion
  const actual = { tipo: 'reconocimiento', id: 'p1', hasta: T + 3500 };
  // pregunta ya respondida (excluida) y con ventana ABIERTA aun: aun asi el reconocimiento se mantiene
  assert.deepEqual(decidir(302, actual, T + 500, { p1: 'a' }), { accion: 'mantener' });
  assert.deepEqual(decidir(304, actual, T + 2400, { p1: 'a' }), { accion: 'mantener' });
  assert.deepEqual(decidir(305.5, actual, T + 3499, { p1: 'a' }), { accion: 'mantener' }, 'un ms antes del final: sigue');
  // pasa la ventana de la pregunta MIENTRAS se muestra el reconocimiento: tampoco lo pisa
  assert.deepEqual(decidir(311, actual, T + 3000, { p1: 'a' }), { accion: 'mantener' });
  // con CTA abierta durante el reconocimiento: la CTA NO lo tapa
  const conCta = [P1, { id: 'cta0', offsetSegundos: 290, orden: 0, tipo: 'apertura_cta', payload: {} }];
  assert.deepEqual(decidir(303, actual, T + 1000, { p1: 'a' }, conCta), { accion: 'mantener' });
  // exactamente al terminar: sin CTA -> ocultar; con CTA abierta -> la CTA reaparece
  assert.deepEqual(decidir(306, actual, T + 3500, { p1: 'a' }), { accion: 'ocultar' });
  assert.equal(decidir(306, actual, T + 3500, { p1: 'a' }, conCta).accion, 'mostrar_cta');
});

test('reconocimiento: simulacion segundo a segundo de pregunta -> respuesta -> reconocimiento -> tick, con CTA abierta antes (la secuencia completa)', () => {
  const g = [{ id: 'cta0', offsetSegundos: 290, orden: 0, tipo: 'apertura_cta', payload: {} }, P1];
  const respondidas = new Set();
  let actual = { ...VACIO };
  const linea = [];
  // aplica las acciones EXACTAMENTE como lo hace el reconciliador del componente
  const aplicar = (d) => {
    if (d.accion === 'ocultar') actual = { ...VACIO };
    else if (d.accion === 'mostrar_pregunta') actual = { tipo: 'pregunta', id: d.evento.id, hasta: 0 };
    else if (d.accion === 'mostrar_cta') actual = { tipo: 'cta', id: d.evento.id, hasta: 0 };
  };
  let ahora = 5000000;
  for (let pos = 289; pos <= 320; pos++) {
    ahora += 1000;
    if (pos === 302) { // ella toca una opcion: se marca respondida y arranca el reconocimiento de 3,5 s
      respondidas.add('p1');
      actual = { tipo: 'reconocimiento', id: 'p1', hasta: ahora + parametrosGuion.RECONOCIMIENTO_MS };
    }
    aplicar(decidir(pos, actual, ahora, respondidas, g));
    linea.push(`${pos}:${actual.tipo}`);
  }
  const tipoEn = (pos) => linea.find((x) => x.startsWith(`${pos}:`)).split(':')[1];
  assert.equal(tipoEn(289), 'null', 'antes de la CTA no hay nada');
  assert.equal(tipoEn(290), 'cta', 'la CTA abre en su momento');
  assert.equal(tipoEn(299), 'cta');
  assert.equal(tipoEn(300), 'pregunta', 'la pregunta pasa por encima de la CTA');
  assert.equal(tipoEn(301), 'pregunta');
  assert.equal(tipoEn(302), 'reconocimiento', 'al responder: reconocimiento');
  assert.equal(tipoEn(303), 'reconocimiento');
  assert.equal(tipoEn(304), 'reconocimiento');
  assert.equal(tipoEn(305), 'reconocimiento', '3 s despues sigue (aun dentro de los 3,5 s)');
  assert.equal(tipoEn(306), 'cta', 'a los 4 s (>3,5) el reconocimiento termina y la CTA REAPARECE sola');
  for (let pos = 306; pos <= 320; pos++) assert.equal(tipoEn(pos), 'cta', `pos=${pos}: la CTA se queda`);
  assert.equal(linea.filter((x) => x.endsWith(':reconocimiento')).length, 4, 'el reconocimiento se vio en 4 ticks (302-305), sin cortes ni parpadeos');
});

// ── guardas estructurales del componente ───────────────────────────

test('guarda estructural: sin +6 s, sin localStorage/sessionStorage, sin el viejo "disparados" ni un temporizador por evento', () => {
  assert.ok(!/\+ 6000/.test(CODIGO), 'ya no se suman 6 s a la duracion de la pregunta');
  assert.ok(!/localStorage|sessionStorage/.test(CODIGO), 'el estado no se guarda en el navegador');
  assert.ok(!/disparados|dispararEvento|mostrarPregunta\(|mostrarCTA\(|tickGuion/.test(CODIGO), 'ya no hay disparo de eventos');
  const ini = CODIGO.indexOf('function ocultarOverlay');
  const fin = CODIGO.indexOf('async function responder');
  assert.ok(ini > 0 && fin > ini, 'no se encontro el reconciliador');
  const region = CODIGO.slice(ini, fin);
  assert.equal((region.match(/setTimeout\(/g) || []).length, 1, 'un unico ciclo (alineado a la sesion) — ningun temporizador por evento');
  assert.ok(/programarTick/.test(region));
});
