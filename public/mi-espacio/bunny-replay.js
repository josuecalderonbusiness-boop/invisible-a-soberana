// Orbit — Replay de las Estaciones: vínculo con el reproductor de Bunny Stream
// (Puerta 5, corrección del listener, diseño cerrado 2026-09-19).
// Componente UNICO compartido por /workbook y /mi-espacio — nunca dos
// implementaciones (mismo patrón que zoom-embed.js).
//
// Por qué existe: el listener anterior esperaba un mensaje-objeto
// {event:'ended'} "nativo" del embed. Medido contra el embed real: Bunny habla
// el protocolo Player.js — mensajes en TEXTO JSON, y solo emite eventos
// (ready/play/pause/timeupdate/ended) a quien se SUSCRIBE con addEventListener.
// El listener viejo descartaba los textos y nunca se suscribía, así que el
// 'ended' jamás llegaba. Aquí se usa la librería oficial de Bunny, que
// resuelve el protocolo (formato, suscripción, handshake de 'ready'):
//   https://bunny.net/blog/introducing-player-js-support-for-bunny-stream-advanced-player-control-and-monitoring-api/
//
// Solo se escucha 'ended' (decisión cerrada: sin porcentaje visto — quien ve
// la clase en dos sesiones no debe quedar sin crédito). La confirmación real
// la decide Orbit (idempotente, exige acceso vigente y Estación disponible);
// este archivo solo avisa "el video llegó al final".
//
// Degradación segura: si la librería no carga, el video se sigue
// reproduciendo (es un iframe normal) y simplemente no hay confirmación
// automática — nunca lanza ni rompe la página.

(function () {
  const PLAYERJS_SRC = 'https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js';
  const ESPERA_READY_MS = 3000;

  let cargaLibPromise = null;

  function cargarPlayerJs() {
    if (window.playerjs && window.playerjs.Player) return Promise.resolve();
    if (!cargaLibPromise) {
      cargaLibPromise = new Promise(function (resolve, reject) {
        const el = document.createElement('script');
        el.src = PLAYERJS_SRC;
        el.async = true;
        el.dataset.bunnyPlayerjs = '1';
        el.onload = function () { resolve(); };
        el.onerror = function () {
          cargaLibPromise = null; // permite reintentar en un render posterior
          reject(new Error('No se pudo cargar ' + PLAYERJS_SRC));
        };
        document.head.appendChild(el);
      });
    }
    return cargaLibPromise;
  }

  // iframes ya vinculados: llamar dos veces con el mismo elemento nunca crea
  // dos suscripciones. Las tarjetas se reconstruyen (innerHTML) en cada
  // render, así que cada render produce iframes nuevos y se vinculan de nuevo.
  const yaVinculados = new WeakSet();

  /**
   * @param {HTMLIFrameElement} iframe - el embed de Bunny (player.mediadelivery.net).
   * @param {() => void} alTerminar - se llama cada vez que el video llega al final.
   * @returns {Promise<boolean>} true si quedó vinculado; false si no fue posible
   *   (sin iframe, ya vinculado, librería no disponible). Nunca lanza.
   */
  async function vincularReplayBunny(iframe, alTerminar) {
    if (!iframe || yaVinculados.has(iframe)) return false;
    yaVinculados.add(iframe);

    try {
      await cargarPlayerJs();
    } catch (e) {
      console.warn('vincularReplayBunny: la librería de Bunny no cargó — el replay se reproduce, sin confirmación automática', e && e.message);
      return false;
    }

    // La tarjeta pudo reconstruirse mientras cargaba la librería.
    if (iframe.isConnected === false) return false;

    try {
      const player = new window.playerjs.Player(iframe);
      player.on('ended', function () {
        try {
          alTerminar();
        } catch (e) {
          console.warn('vincularReplayBunny: alTerminar lanzó', e && e.message);
        }
      });

      // Las tarjetas se reconstruyen en cada render y este Player queda
      // escuchando 'message' para siempre (la librería no permite retirarlo).
      // Si su iframe ya no está en el DOM, un 'ready' del iframe nuevo (misma
      // URL) haría que intente enviarle mensajes a un elemento muerto y lanzaría
      // un TypeError sin capturar. Se le anula el envío en ese caso.
      if (typeof player.send === 'function') {
        const enviarOriginal = player.send;
        player.send = function () {
          if (iframe.isConnected === false) return false;
          return enviarOriginal.apply(player, arguments);
        };
      }

      // Recuperación de un 'ready' perdido (medido contra el embed real): el
      // reproductor avisa 'ready' UNA vez, cuando termina de cargar. Si la
      // librería llegó tarde y ese aviso ya pasó, el Player nunca se entera,
      // la suscripción a 'ended' queda en cola y el fin del video no se
      // detecta. Si tras unos segundos sigue sin haber 'ready', se recarga el
      // iframe UNA vez: el nuevo 'ready' sí lo recibe.
      setTimeout(function () {
        if (iframe.isConnected !== false && player.isReady === false) {
          try {
            iframe.src = iframe.src;
          } catch (e) {
            console.warn('vincularReplayBunny: no se pudo recargar el iframe', e && e.message);
          }
        }
      }, ESPERA_READY_MS);
      return true;
    } catch (e) {
      console.warn('vincularReplayBunny: no se pudo crear el Player', e && e.message);
      return false;
    }
  }

  window.vincularReplayBunny = vincularReplayBunny;
})();
