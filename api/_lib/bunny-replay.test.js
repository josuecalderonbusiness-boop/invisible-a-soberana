// api/_lib/bunny-replay.test.js — pruebas de public/mi-espacio/bunny-replay.js
// (vínculo con el reproductor de Bunny vía Player.js, 2026-09-19).
// El componente es un script de navegador (IIFE que cuelga
// window.vincularReplayBunny), así que se evalúa dentro de un contexto `vm`
// con un window/document falsos — sin red, sin Bunny real. La prueba contra
// el embed real (Masterclass 749915) se hace aparte, en navegador.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const CODIGO = fs.readFileSync(new URL('../../public/mi-espacio/bunny-replay.js', import.meta.url), 'utf8');

// Crea un "navegador" nuevo por prueba (el módulo guarda estado: promesa de
// carga y WeakSet de iframes).
function crearEntorno({ libYaCargada = false } = {}) {
  const scriptsAgregados = [];
  const players = [];
  const window = {};

  const timers = [];

  class PlayerFalso {
    constructor(iframe) {
      if (window.__playerLanza) throw new Error('boom');
      this.iframe = iframe;
      this.eventos = {};
      this.isReady = false; // como la librería real: false hasta recibir 'ready'
      players.push(this);
    }
    on(evento, cb) { this.eventos[evento] = cb; }
  }

  if (libYaCargada) window.playerjs = { Player: PlayerFalso };

  const document = {
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (el) => { scriptsAgregados.push(el); } },
  };
  const consola = { warn: () => {} };
  const contexto = vm.createContext({ window, document, console: consola, Promise, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; } });
  vm.runInContext(CODIGO, contexto);

  return {
    window,
    scriptsAgregados,
    players,
    timers,
    // simula que el <script> de Bunny terminó de cargar (deja playerjs disponible)
    cargarLibrerias: (i = 0) => { window.playerjs = { Player: PlayerFalso }; scriptsAgregados[i].onload(); },
    fallarCarga: (i = 0) => scriptsAgregados[i].onerror(),
    iframe: (extra = {}) => ({ isConnected: true, ...extra }),
  };
}

test('expone window.vincularReplayBunny', () => {
  const e = crearEntorno();
  assert.equal(typeof e.window.vincularReplayBunny, 'function');
});

test('sin la librería cargada: la pide UNA vez desde el CDN oficial de Bunny (versión fija) y, al cargar, se suscribe a "ended"', async () => {
  const e = crearEntorno();
  const iframe = e.iframe();
  let terminados = 0;
  const promesa = e.window.vincularReplayBunny(iframe, () => { terminados++; });

  assert.equal(e.scriptsAgregados.length, 1);
  assert.equal(e.scriptsAgregados[0].src, 'https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js');
  assert.equal(e.players.length, 0, 'sin librería aún no hay Player');

  e.cargarLibrerias();
  assert.equal(await promesa, true);
  assert.equal(e.players.length, 1);
  assert.equal(e.players[0].iframe, iframe);
  assert.deepEqual(Object.keys(e.players[0].eventos), ['ended'], 'solo se escucha "ended" — nada de timeupdate ni porcentaje visto');

  e.players[0].eventos.ended();
  assert.equal(terminados, 1);
});

test('con la librería ya cargada: no vuelve a pedir el script', async () => {
  const e = crearEntorno({ libYaCargada: true });
  assert.equal(await e.window.vincularReplayBunny(e.iframe(), () => {}), true);
  assert.equal(e.scriptsAgregados.length, 0);
  assert.equal(e.players.length, 1);
});

test('varios iframes a la vez comparten UNA sola carga de la librería y cada uno recibe su propio Player y su propio callback', async () => {
  const e = crearEntorno();
  const llamados = [];
  const p1 = e.window.vincularReplayBunny(e.iframe({ hito: 1 }), () => llamados.push(1));
  const p2 = e.window.vincularReplayBunny(e.iframe({ hito: 2 }), () => llamados.push(2));
  const p3 = e.window.vincularReplayBunny(e.iframe({ hito: 3 }), () => llamados.push(3));
  assert.equal(e.scriptsAgregados.length, 1);

  e.cargarLibrerias();
  assert.deepEqual(await Promise.all([p1, p2, p3]), [true, true, true]);
  assert.equal(e.players.length, 3);

  e.players[1].eventos.ended(); // termina el video de la Estación 2 -> no confirma la 1 ni la 3
  assert.deepEqual(llamados, [2]);
});

test('idempotente: vincular dos veces el MISMO iframe crea un solo Player (no duplica la suscripción)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  const iframe = e.iframe();
  assert.equal(await e.window.vincularReplayBunny(iframe, () => {}), true);
  assert.equal(await e.window.vincularReplayBunny(iframe, () => {}), false);
  assert.equal(e.players.length, 1);
});

test('un iframe NUEVO (la tarjeta se reconstruyó en otro render) sí se vincula', async () => {
  const e = crearEntorno({ libYaCargada: true });
  await e.window.vincularReplayBunny(e.iframe(), () => {});
  await e.window.vincularReplayBunny(e.iframe(), () => {});
  assert.equal(e.players.length, 2);
});

test('si la librería NO carga: devuelve false sin lanzar (el replay se reproduce, sin confirmación) y un render posterior reintenta la carga', async () => {
  const e = crearEntorno();
  const promesa = e.window.vincularReplayBunny(e.iframe(), () => {});
  e.fallarCarga(0);
  assert.equal(await promesa, false);
  assert.equal(e.players.length, 0);

  // siguiente render, iframe nuevo: vuelve a intentar (segundo <script>)
  const promesa2 = e.window.vincularReplayBunny(e.iframe(), () => {});
  assert.equal(e.scriptsAgregados.length, 2, 'reintenta la carga');
  e.cargarLibrerias(1);
  assert.equal(await promesa2, true);
});

test('si la tarjeta se reconstruyó mientras cargaba la librería (iframe ya no está en el DOM): no crea Player', async () => {
  const e = crearEntorno();
  const iframe = e.iframe();
  const promesa = e.window.vincularReplayBunny(iframe, () => {});
  iframe.isConnected = false;
  e.cargarLibrerias();
  assert.equal(await promesa, false);
  assert.equal(e.players.length, 0);
});

test('sin iframe -> false, nunca lanza', async () => {
  const e = crearEntorno({ libYaCargada: true });
  assert.equal(await e.window.vincularReplayBunny(null, () => {}), false);
  assert.equal(await e.window.vincularReplayBunny(undefined, () => {}), false);
});

test('si crear el Player lanza: false, nunca propaga el error a la página', async () => {
  const e = crearEntorno({ libYaCargada: true });
  e.window.__playerLanza = true;
  assert.equal(await e.window.vincularReplayBunny(e.iframe(), () => {}), false);
});

test('si el callback lanza al terminar el video: no propaga (no rompe el reproductor ni la página)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  await e.window.vincularReplayBunny(e.iframe(), () => { throw new Error('fallo del callback'); });
  assert.doesNotThrow(() => e.players[0].eventos.ended());
});

test('"ended" repetido (rebobinar y volver a ver): cada fin llama al callback — la idempotencia la aplica quien confirma (Orbit / wbConfirmarHitoVisto)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  let n = 0;
  await e.window.vincularReplayBunny(e.iframe(), () => { n++; });
  e.players[0].eventos.ended();
  e.players[0].eventos.ended();
  assert.equal(n, 2);
});

// ── 'ready' perdido: si la librería llegó tarde y el reproductor ya había avisado
// 'ready', el Player nunca se entera. Recuperación: recargar el iframe UNA vez. ──

test('si tras 3 s el Player NO recibió "ready": recarga el iframe UNA vez (el nuevo ready sí lo recibe)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  const iframe = e.iframe({ src: 'https://player.mediadelivery.net/embed/757424/abc' });
  let asignaciones = 0;
  let srcActual = iframe.src;
  Object.defineProperty(iframe, 'src', { get: () => srcActual, set: (v) => { asignaciones++; srcActual = v; } });

  await e.window.vincularReplayBunny(iframe, () => {});
  assert.equal(e.timers.length, 1);
  assert.equal(e.timers[0].ms, 3000);
  assert.equal(asignaciones, 0, 'no recarga de inmediato');

  e.timers[0].fn(); // pasan los 3 s sin 'ready'
  assert.equal(asignaciones, 1);
  assert.equal(srcActual, 'https://player.mediadelivery.net/embed/757424/abc', 'misma URL, solo se vuelve a cargar');
});

test('si el Player SÍ recibió "ready" antes de los 3 s: no recarga (no interrumpe el video)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  const iframe = e.iframe({ src: 'https://player.mediadelivery.net/embed/757424/abc' });
  let asignaciones = 0;
  Object.defineProperty(iframe, 'src', { get: () => 'x', set: () => { asignaciones++; } });
  await e.window.vincularReplayBunny(iframe, () => {});
  e.players[0].isReady = true;
  e.timers[0].fn();
  assert.equal(asignaciones, 0);
});

test('si la tarjeta ya no está en el DOM a los 3 s: no toca el iframe', async () => {
  const e = crearEntorno({ libYaCargada: true });
  const iframe = e.iframe();
  let asignaciones = 0;
  Object.defineProperty(iframe, 'src', { get: () => 'x', set: () => { asignaciones++; } });
  await e.window.vincularReplayBunny(iframe, () => {});
  iframe.isConnected = false;
  e.timers[0].fn();
  assert.equal(asignaciones, 0);
});

test('la recuperación no depende de internos de la librería: si el Player no expone isReady, no recarga', async () => {
  const e = crearEntorno({ libYaCargada: true });
  const iframe = e.iframe();
  let asignaciones = 0;
  Object.defineProperty(iframe, 'src', { get: () => 'x', set: () => { asignaciones++; } });
  await e.window.vincularReplayBunny(iframe, () => {});
  delete e.players[0].isReady;
  e.timers[0].fn();
  assert.equal(asignaciones, 0);
});

// ── Player de un iframe que ya no existe (la tarjeta se reconstruyó) ──

test('un Player cuyo iframe ya no está en el DOM no envía mensajes (evita TypeError sin capturar al llegar el "ready" del iframe nuevo)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  const enviados = [];
  e.window.playerjs.Player.prototype.send = function (m) { enviados.push(m); return true; };
  const iframe = e.iframe();
  await e.window.vincularReplayBunny(iframe, () => {});

  assert.equal(e.players[0].send({ method: 'addEventListener' }), true, 'con el iframe vivo, envía normal');
  iframe.isConnected = false;
  assert.equal(e.players[0].send({ method: 'addEventListener' }), false, 'con el iframe muerto, no envía');
  assert.equal(enviados.length, 1);
});

test('si la librería no expone send, no rompe (no depende de internos)', async () => {
  const e = crearEntorno({ libYaCargada: true });
  await assert.doesNotReject(e.window.vincularReplayBunny(e.iframe(), () => {}));
});
