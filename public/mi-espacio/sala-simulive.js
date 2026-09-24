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
    const $avisoReplay = contenedor.querySelector('[data-sala-replay-aviso]');
    const $chat = contenedor.querySelector('[data-sala-chat-lista]');
    const $presencia = contenedor.querySelector('[data-sala-presencia]');
    const $reacciones = contenedor.querySelector('[data-sala-reacciones]');
    const $overlay = contenedor.querySelector('[data-sala-overlay]');
    const $progreso = contenedor.querySelector('[data-sala-progreso]');
    const $chatForm = contenedor.querySelector('[data-sala-chat-form]');
    const $chatInput = contenedor.querySelector('[data-sala-chat-input]');
    const $botonesReaccion = contenedor.querySelectorAll('[data-sala-reaccion]');

    $botonesReaccion.forEach(function (btn) {
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
      if (res.status === 401) {
        if (typeof opciones.onNecesitaIdentidad === 'function') { opciones.onNecesitaIdentidad(); return; }
        throw new Error('sala-abrir respondió 401');
      }
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

    // ── salida en_vivo -> replay (diseño cerrado 2026-09-24) ──────────
    // Fuente de verdad: fechaHora + duracionSegundos (lo mismo que ya usa
    // calcularFaseSimulive en Orbit) — nunca el 'ended' del reproductor.
    // Un solo setTimeout hacia el instante exacto (mismo patrón que la
    // transición del countdown en experiencia-gratuita.js), con
    // visibilitychange/pageshow/focus como red de respaldo y 'ended' como
    // señal secundaria — todos llaman a la MISMA función idempotente.
    let salaSesionCerrada = false;
    let timerCierreSesion = null;
    let finSesionMs = null;

    function aplicarUiReplay() {
      if ($avisoReplay) $avisoReplay.style.display = 'block';
      // Deja de contar/mostrarse como "en vivo" — el numero ya no refleja
      // nada real una vez terminada la sesion.
      if ($presencia) $presencia.style.display = 'none';
      // Chat a solo lectura: los mensajes ya recibidos se quedan visibles,
      // simplemente no se puede seguir escribiendo.
      if ($chatInput) { $chatInput.disabled = true; $chatInput.placeholder = 'El chat ya cerró'; }
      if ($chatForm) $chatForm.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      // Reacciones nuevas dejan de tener sentido.
      $botonesReaccion.forEach(function (btn) { btn.disabled = true; });
      // La CTA (si ya apareció via el guion) permanece exactamente igual
      // — mostrarCTA() nunca la oculta, nada que hacer aquí.
      // El video NO se corta — sigue reproduciendose/termina solo.
    }

    function pasarAReplay() {
      if (salaSesionCerrada) return; // guard idempotente
      salaSesionCerrada = true;
      estado.fase = 'replay';
      if (timerCierreSesion) { clearTimeout(timerCierreSesion); timerCierreSesion = null; }
      aplicarUiReplay();
    }

    function programarCierreSesion(fechaHoraISO) {
      if (!fechaHoraISO) return; // Orbit viejo sin el campo -- sin transicion, mismo riesgo de siempre
      finSesionMs = new Date(fechaHoraISO).getTime() + estado.duracionSegundos * 1000;
      const demora = Math.max(finSesionMs - Date.now() + 300, 250);
      if (demora > 2147483647) return; // tope de setTimeout (~24 dias); las señales de respaldo cubren el resto
      timerCierreSesion = setTimeout(pasarAReplay, demora);
    }

    function revaluarSiYaTermino() {
      if (salaSesionCerrada || finSesionMs === null) return;
      if (Date.now() >= finSesionMs) pasarAReplay();
    }

    if (estado.fase === 'espera' || estado.fase === 'lobby') {
      $video.style.display = 'none';
      $espera.style.display = 'block';
      $espera.innerHTML = estado.fase === 'lobby'
        ? '<p class="sala-lobby-msg">Tu sesión está a punto de comenzar. Puedes quedarte aquí.</p>'
        : '<p class="sala-lobby-msg">Sesión programada. Vuelve un poco antes de la hora.</p>';
    } else if (estado.fase === 'replay') {
      // Representación propia desde el primer render — nunca la misma
      // pantalla que en_vivo (hallazgo de la auditoría 2026-09-24).
      $espera.style.display = 'none';
      if (apertura.videoUrl) { $video.style.display = 'block'; montarVideo($video, apertura.videoUrl, estado); }
      aplicarUiReplay();
    } else if (apertura.videoUrl) { // en_vivo
      $espera.style.display = 'none';
      $video.style.display = 'block';
      montarVideo($video, apertura.videoUrl, estado);
      estado.onFinDeSesion = pasarAReplay; // 'ended' del reproductor -> señal secundaria, ver montarVideo
      programarCierreSesion(apertura.fechaHora);
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
      contenedor.classList.add('sala-simulive--overlay-activo');

      function ocultar() {
        $overlay.style.display = 'none';
        contenedor.classList.remove('sala-simulive--overlay-activo');
      }
      // Si nadie responde, se oculta sola pasado el tiempo de la pregunta.
      // Si responde, se reemplaza por un cierre corto (abajo) para que no
      // se quede montada ahí una vez ya contestó.
      let temporizadorOcultar = setTimeout(ocultar, (p.duracion_visible_segundos || 15) * 1000 + 6000);

      $overlay.querySelectorAll('.sala-opcion').forEach(function (btn) {
        btn.addEventListener('click', function () {
          $overlay.querySelectorAll('.sala-opcion').forEach(function (b) { b.disabled = true; });
          btn.classList.add('sala-opcion--elegida');
          responder(evt.id, btn.dataset.opcion, $overlay.querySelector('[data-sala-poll-feedback]'));
          clearTimeout(temporizadorOcultar);
          temporizadorOcultar = setTimeout(ocultar, 3500);
        });
      });
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
      contenedor.classList.add('sala-simulive--overlay-activo');
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
      const etiqueta = msg.tipo === 'equipo' ? '<span class="sala-chat-etiqueta">' + (msg.programado ? 'Preguntas frecuentes' : 'Equipo') + '</span> ' : '';
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
      if (estado.pollActivo) { pollSala(); revaluarSiYaTermino(); }
    });
    window.addEventListener('pageshow', revaluarSiYaTermino);
    window.addEventListener('focus', revaluarSiYaTermino);
  }

  function renderShell() {
    return (
      '<div class="sala-simulive">' +
      '<div class="sala-video-box" data-sala-video style="display:none"></div>' +
      '<div class="sala-espera" data-sala-espera></div>' +
      '<p class="sala-replay-aviso" data-sala-replay-aviso style="display:none">Esta sesión ya terminó — esto es el replay.</p>' +
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
    iframe.src = videoUrl + (videoUrl.indexOf('?') === -1 ? '?' : '&') + 'autoplay=true&chromecast=false&disableAirPlay=true&showSpeed=false&showHeatmap=false&playsinline=true';
    iframe.setAttribute('allow', 'accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture');
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    // La barra de controles de Bunny vive pegada a su borde inferior y no
    // tiene parámetro para ocultarla del todo (confirmado contra su
    // documentación). Se estira el iframe más allá del contenedor y se fija
    // arriba (alignSelf) para que solo la franja de abajo —donde vive esa
    // barra— quede recortada por el overflow:hidden del contenedor.
    iframe.style.height = '112%';
    iframe.style.alignSelf = 'flex-start';
    $contenedor.innerHTML = '';
    $contenedor.appendChild(iframe);

    // Sin controles de reproducción (SIMULIVE.md §A): esta capa transparente
    // se pone encima del iframe y absorbe todo toque/clic — nunca llega a los
    // controles nativos de Bunny, así que nunca se puede pausar ni buscar. Un
    // toque sí reintenta player.play() (nunca pause), por si el autoplay con
    // sonido necesitó un gesto real del usuario para desbloquearse.
    const tapa = document.createElement('div');
    tapa.className = 'sala-video-tapa';
    tapa.addEventListener('click', function () {
      if (estado.player) { try { estado.player.play(); } catch (e) {} }
    });
    $contenedor.appendChild(tapa);

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
    // Señal secundaria de cierre (diseño 2026-09-24): nunca la autoridad
    // -- fechaHora+duracionSegundos ya decide el fin por su cuenta, esto
    // solo cubre el caso de que Bunny termine unos segundos antes/después
    // de esa marca. onFinDeSesion es idempotente (ver iniciarSalaSimulive).
    player.on('ended', function () {
      if (typeof estado.onFinDeSesion === 'function') estado.onFinDeSesion();
    });
  }

  window.iniciarSalaSimulive = iniciarSalaSimulive;
})();
