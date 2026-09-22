// Orbit — Sala SIMULIVE (motor real, docs/v2/SIMULIVE.md). Componente
// reutilizable: recibe un convocatoriaId (demo hoy, real mañana) y monta la
// experiencia completa. Ninguna página que lo use necesita reconstruirlo.
//
// Los tres relojes (SIMULIVE.md §A.1), estrictos:
//   1. Reloj de acceso: lo resuelve Orbit en sala-abrir (fase).
//   2. Reloj de reproducción: se ancla UNA VEZ al abrir + corrección de
//      deriva periódica — NUNCA depende del poll de abajo.
//   3. Reloj de guion: descargado completo al abrir, tick local de 1s.
// Capa 4, asíncrona y secundaria: poll de sala-estado cada 3-5s — puede
// fallar sin que el video ni el guion se vean afectados.
//
// Necesita más control sobre Player.js del que expone bunny-replay.js
// (ready + setCurrentTime + lectura periódica de posición, no solo
// 'ended'), así que cae su propio loader — mismo patrón, con más alcance.

(function () {
  const PLAYERJS_SRC = 'https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js';
  const POLL_INTERVALO_MS = 4000;
  const DERIVA_CORRECCION_MS = 30000;
  const DERIVA_UMBRAL_SEGUNDOS = 3;

  let cargaLibPromise = null;
  function cargarPlayerJs() {
    if (window.playerjs && window.playerjs.Player) return Promise.resolve();
    if (!cargaLibPromise) {
      cargaLibPromise = new Promise(function (resolve, reject) {
        const el = document.createElement('script');
        el.src = PLAYERJS_SRC;
        el.async = true;
        el.onload = function () { resolve(); };
        el.onerror = function () {
          cargaLibPromise = null;
          reject(new Error('No se pudo cargar Player.js'));
        };
        document.head.appendChild(el);
      });
    }
    return cargaLibPromise;
  }

  function esc(s) {
    return (window.htmlSeguro && window.htmlSeguro.escapeHtml) ? window.htmlSeguro.escapeHtml(s) : String(s || '');
  }
  function urlSegura(s) {
    return (window.htmlSeguro && window.htmlSeguro.urlSegura) ? window.htmlSeguro.urlSegura(s) : '';
  }

  /**
   * @param {Object} opciones
   * @param {string} opciones.contenedorId - id de un elemento vacío donde se monta toda la sala.
   * @param {string} opciones.convocatoriaId
   * @param {string} [opciones.escenarioQA] - etiqueta de escenario (§ demo), nunca un secreto.
   */
  async function iniciarSalaSimulive(opciones) {
    const contenedor = document.getElementById(opciones.contenedorId);
    if (!contenedor) { console.error('iniciarSalaSimulive: contenedor no encontrado'); return; }

    const estado = {
      convocatoriaId: opciones.convocatoriaId,
      escenarioQA: opciones.escenarioQA || null,
      fase: null,
      posicionAlAbrir: 0,
      relojLocalAlAbrirMs: 0,
      duracionSegundos: 3600,
      eventoSesion: [],
      disparados: new Set(),
      cursorChat: null,
      mensajes: [],
      player: null,
      tickId: null,
      pollId: null,
      pollActivo: true,
      pollEnCurso: false,
    };

    contenedor.innerHTML = renderShell();
    const $video = contenedor.querySelector('[data-sala-video]');
    const $espera = contenedor.querySelector('[data-sala-espera]');
    const $chat = contenedor.querySelector('[data-sala-chat-lista]');
    const $presencia = contenedor.querySelector('[data-sala-presencia]');
    const $reacciones = contenedor.querySelector('[data-sala-reacciones]');
    const $overlay = contenedor.querySelector('[data-sala-overlay]');
    const $progreso = contenedor.querySelector('[data-sala-progreso]');
    const $chatForm = contenedor.querySelector('[data-sala-chat-form]');
    const $chatInput = contenedor.querySelector('[data-sala-chat-input]');

    contenedor.querySelectorAll('[data-sala-reaccion]').forEach(function (btn) {
      btn.addEventListener('click', function () { reaccionar(btn.dataset.salaReaccion); });
    });
    if ($chatForm) {
      $chatForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        const texto = ($chatInput.value || '').trim();
        if (!texto) return;
        enviarChat(texto);
        $chatInput.value = '';
      });
    }

    // ── abrir sala (reloj de acceso + reloj de reproducción + guion) ──
    let apertura;
    try {
      const body = { convocatoriaId: estado.convocatoriaId };
      if (estado.escenarioQA) body.escenarioQA = estado.escenarioQA;
      const res = await fetch('/api/sala-abrir', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('sala-abrir respondió ' + res.status);
      apertura = await res.json();
    } catch (e) {
      $espera.innerHTML = '<p class="sala-error">No pudimos abrir la sala. Intenta de nuevo en un momento.</p>';
      console.error('iniciarSalaSimulive: sala-abrir falló', e && e.message);
      return;
    }

    estado.fase = apertura.fase;
    estado.posicionAlAbrir = apertura.posicionInicialSegundos || 0;
    estado.relojLocalAlAbrirMs = Date.now();
    estado.duracionSegundos = apertura.duracionSegundos || 3600;
    estado.eventoSesion = apertura.eventoSesion || [];
    contenedor.dataset.tema = apertura.temaVisual || 'dia';

    if (estado.fase === 'espera' || estado.fase === 'lobby') {
      $video.style.display = 'none';
      $espera.style.display = 'block';
      $espera.innerHTML = estado.fase === 'lobby'
        ? '<p class="sala-lobby-msg">Tu sesión está a punto de comenzar. Puedes quedarte aquí.</p>'
        : '<p class="sala-lobby-msg">Sesión programada. Vuelve un poco antes de la hora.</p>';
    } else if (apertura.videoUrl) {
      $espera.style.display = 'none';
      $video.style.display = 'block';
      montarVideo($video, apertura.videoUrl, estado);
    }

    function posicionActual() {
      const transcurridoMs = Date.now() - estado.relojLocalAlAbrirMs;
      return estado.posicionAlAbrir + transcurridoMs / 1000;
    }

    function actualizarProgreso() {
      if (!$progreso) return;
      const pct = Math.max(0, Math.min(100, (posicionActual() / estado.duracionSegundos) * 100));
      $progreso.style.width = pct + '%';
    }

    // ── reloj de guion: tick local de 1s, nunca depende del poll ──
    function tickGuion() {
      actualizarProgreso();
      if (estado.fase !== 'en_vivo') return;
      const pos = posicionActual();
      estado.eventoSesion.forEach(function (evt) {
        if (estado.disparados.has(evt.id || evt.offsetSegundos + ':' + evt.orden)) return;
        if (evt.offsetSegundos > pos) return;
        estado.disparados.add(evt.id || evt.offsetSegundos + ':' + evt.orden);
        dispararEvento(evt);
      });
    }
    estado.tickId = setInterval(tickGuion, 1000);
    tickGuion();

    function dispararEvento(evt) {
      if (evt.tipo === 'mensaje_equipo') {
        agregarMensaje({ tipo: 'equipo', autorNombre: (evt.payload && evt.payload.autor) || 'Equipo', texto: (evt.payload && evt.payload.texto) || '', programado: true });
      } else if (evt.tipo === 'pregunta') {
        mostrarPregunta(evt);
      } else if (evt.tipo === 'apertura_cta') {
        mostrarCTA(evt.payload || {});
      }
    }

    function mostrarPregunta(evt) {
      const p = evt.payload || {};
      const opciones = (p.opciones || []).map(function (o) {
        return '<button class="sala-opcion" data-opcion="' + esc(o.id) + '">' + esc(o.texto) + '</button>';
      }).join('');
      $overlay.innerHTML =
        '<div class="sala-poll">' +
        '<p class="sala-poll-texto">' + esc(p.texto) + '</p>' +
        '<div class="sala-poll-opciones">' + opciones + '</div>' +
        '<p class="sala-poll-feedback" data-sala-poll-feedback style="display:none"></p>' +
        '</div>';
      $overlay.style.display = 'flex';
      $overlay.querySelectorAll('.sala-opcion').forEach(function (btn) {
        btn.addEventListener('click', function () {
          $overlay.querySelectorAll('.sala-opcion').forEach(function (b) { b.disabled = true; });
          btn.classList.add('sala-opcion--elegida');
          responder(evt.id, btn.dataset.opcion, $overlay.querySelector('[data-sala-poll-feedback]'));
        });
      });
      const duracionVisible = (p.duracion_visible_segundos || 15) * 1000;
      setTimeout(function () { $overlay.style.display = 'none'; }, duracionVisible + 6000); // margen para ver el feedback tras responder
    }

    function mostrarCTA(payload) {
      $overlay.innerHTML =
        '<div class="sala-cta-capa">' +
        '<p class="sala-cta-titular">' + esc(payload.titular || '') + '</p>' +
        '<p class="sala-cta-subtitular">' + esc(payload.subtitular || '') + '</p>' +
        '<a class="sala-cta-boton" href="' + urlSegura(payload.url_destino) + '" target="_blank" rel="noopener">' + esc(payload.texto_boton || 'Continuar') + '</a>' +
        '</div>';
      $overlay.style.display = 'flex';
      $overlay.classList.add('sala-overlay--cta');
    }

    // ── acciones: optimistas, nunca bloquean la UI esperando red ──
    async function responder(eventoId, opcionId, $feedback) {
      if ($feedback) { $feedback.style.display = 'block'; $feedback.textContent = 'Registrando tu respuesta…'; }
      try {
        const res = await fetch('/api/sala-responder', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ convocatoriaId: estado.convocatoriaId, eventoId, opcionId }),
        });
        const data = await res.json();
        if ($feedback) {
          $feedback.textContent = data.conteoOpcionPropia > 1
            ? 'Otras mujeres que están aquí contigo también eligieron esto.'
            : 'Gracias por responder.';
        }
      } catch (e) {
        if ($feedback) $feedback.textContent = 'Tu respuesta quedó registrada localmente — reintentando…';
        console.warn('responder: falló, se reintentará en el próximo poll', e && e.message);
      }
    }

    async function enviarChat(texto) {
      agregarMensaje({ tipo: 'participante', autorNombre: 'Tú', texto, propio: true });
      try {
        const res = await fetch('/api/sala-chat-enviar', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ convocatoriaId: estado.convocatoriaId, texto }),
        });
        if (!res.ok) {
          const data = await res.json().catch(function () { return {}; });
          if (data.error === 'mensaje_muy_seguido') console.warn('enviarChat: mensaje muy seguido, se ignora');
        }
      } catch (e) {
        console.warn('enviarChat: falló', e && e.message);
      }
    }

    async function reaccionar(tipo) {
      animarReaccionLocal(tipo);
      try {
        await fetch('/api/sala-reaccionar', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ convocatoriaId: estado.convocatoriaId, tipo }),
        });
      } catch (e) {
        console.warn('reaccionar: falló', e && e.message);
      }
    }

    function animarReaccionLocal(tipo) {
      if (!$reacciones) return;
      const iconos = { corazon: '❤️', brillo: '✨', aplauso: '🙌' };
      const span = document.createElement('span');
      span.className = 'sala-reaccion-flotante';
      span.textContent = iconos[tipo] || '❤️';
      span.style.left = (40 + Math.random() * 20) + '%';
      $reacciones.appendChild(span);
      setTimeout(function () { span.remove(); }, 2200);
    }

    function agregarMensaje(msg) {
      estado.mensajes.push(msg);
      if (!$chat) return;
      const etiqueta = msg.tipo === 'equipo' ? '<span class="sala-chat-etiqueta">' + (msg.programado ? 'Preguntas frecuentes' : 'Equipo') + '</span>' : '';
      const div = document.createElement('div');
      div.className = 'sala-chat-msg sala-chat-msg--' + msg.tipo;
      div.innerHTML = '<strong>' + esc(msg.autorNombre) + '</strong> ' + etiqueta + '<span>' + esc(msg.texto) + '</span>';
      $chat.appendChild(div);
      $chat.scrollTop = $chat.scrollHeight;
    }

    // ── corrección de deriva del video, independiente del poll ──
    setInterval(function () {
      if (!estado.player || estado.fase !== 'en_vivo') return;
      estado.player.getCurrentTime(function (segundosReales) {
        const esperado = posicionActual();
        if (Math.abs(segundosReales - esperado) > DERIVA_UMBRAL_SEGUNDOS) {
          estado.player.setCurrentTime(esperado);
        }
      });
    }, DERIVA_CORRECCION_MS);

    // ── poll de estado de sala: capa secundaria, pausada en pestaña oculta ──
    async function pollSala() {
      if (!estado.pollActivo || estado.pollEnCurso) return;
      estado.pollEnCurso = true;
      try {
        const qs = new URLSearchParams({ convocatoriaId: estado.convocatoriaId });
        if (estado.cursorChat) qs.set('desde', estado.cursorChat);
        const res = await fetch('/api/sala-estado?' + qs.toString(), { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          estado.cursorChat = data.cursor;
          if ($presencia) $presencia.textContent = '👥 ' + (data.presencia && data.presencia.conectadas || 0) + ' mujeres están aquí contigo';
          (data.chatNuevo || []).forEach(function (m) {
            if (m.tipo === 'participante' && m.autorNombre === 'Tú') return; // ya la pintamos optimista
            agregarMensaje({ tipo: m.tipo, autorNombre: m.autorNombre, texto: m.texto });
          });
        }
      } catch (e) {
        console.warn('pollSala: falló este ciclo, se reintenta en el siguiente', e && e.message);
      } finally {
        estado.pollEnCurso = false;
      }
    }
    estado.pollId = setInterval(pollSala, POLL_INTERVALO_MS);
    pollSala();

    document.addEventListener('visibilitychange', function () {
      estado.pollActivo = document.visibilityState === 'visible';
      if (estado.pollActivo) pollSala();
    });
  }

  function renderShell() {
    return (
      '<div class="sala-simulive">' +
      '<div class="sala-video-box" data-sala-video style="display:none"></div>' +
      '<div class="sala-espera" data-sala-espera></div>' +
      '<div class="sala-progreso-track"><div class="sala-progreso" data-sala-progreso></div></div>' +
      '<div class="sala-presencia" data-sala-presencia>👥 —</div>' +
      '<div class="sala-chat" data-sala-chat-lista></div>' +
      '<form class="sala-chat-form" data-sala-chat-form>' +
      '<input class="sala-chat-input" data-sala-chat-input type="text" maxlength="500" placeholder="Escribe algo…" />' +
      '<button type="submit">Enviar</button>' +
      '</form>' +
      '<div class="sala-reacciones-botones">' +
      '<button data-sala-reaccion="corazon">❤️</button>' +
      '<button data-sala-reaccion="brillo">✨</button>' +
      '<button data-sala-reaccion="aplauso">🙌</button>' +
      '</div>' +
      '<div class="sala-reacciones-flotantes" data-sala-reacciones></div>' +
      '<div class="sala-overlay" data-sala-overlay style="display:none"></div>' +
      '</div>'
    );
  }

  async function montarVideo($contenedor, videoUrl, estado) {
    const iframe = document.createElement('iframe');
    iframe.src = videoUrl;
    iframe.setAttribute('allow', 'accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    $contenedor.innerHTML = '';
    $contenedor.appendChild(iframe);

    try {
      await cargarPlayerJs();
    } catch (e) {
      console.warn('montarVideo: Player.js no cargó — el video se reproduce igual, sin ajuste de posición', e && e.message);
      return;
    }
    if (iframe.isConnected === false) return;

    const player = new window.playerjs.Player(iframe);
    estado.player = player;
    player.on('ready', function () {
      const posicionAlListo = estado.posicionAlAbrir + (Date.now() - estado.relojLocalAlAbrirMs) / 1000;
      player.setCurrentTime(Math.max(0, posicionAlListo));
      player.play();
    });
  }

  window.iniciarSalaSimulive = iniciarSalaSimulive;
})();
