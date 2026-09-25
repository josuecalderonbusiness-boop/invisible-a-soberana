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
      derivaId: null,
    };

    // Esqueleto neutro: solo el contenedor de video (nodo PERSISTENTE — el
    // iframe vive aquí y nunca se mueve, porque mover un iframe en el DOM
    // lo recarga y el video volvería a 0) y el de espera/errores. Lo demás
    // se agrega según la fase: renderShellEnVivo() o renderShellReplay().
    contenedor.innerHTML = renderEsqueleto();
    const $sala = contenedor.querySelector('.sala-simulive');
    const $video = contenedor.querySelector('[data-sala-video]');
    const $espera = contenedor.querySelector('[data-sala-espera]');

    // Nodos exclusivos de en_vivo: null hasta montarShellEnVivo(), y de
    // vuelta a null cuando convertirAShellReplay() los elimina del DOM.
    let $chat = null;
    let $presencia = null;
    let $reacciones = null;
    let $overlay = null;
    let $progreso = null;
    let $chatForm = null;
    let $chatInput = null;

    function montarShellEnVivo() {
      $sala.dataset.modo = 'en_vivo';
      $sala.insertAdjacentHTML('beforeend', renderShellEnVivo());
      $chat = contenedor.querySelector('[data-sala-chat-lista]');
      $presencia = contenedor.querySelector('[data-sala-presencia]');
      $reacciones = contenedor.querySelector('[data-sala-reacciones]');
      $overlay = contenedor.querySelector('[data-sala-overlay]');
      $progreso = contenedor.querySelector('[data-sala-progreso]');
      $chatForm = contenedor.querySelector('[data-sala-chat-form]');
      $chatInput = contenedor.querySelector('[data-sala-chat-input]');

      contenedor.querySelectorAll('[data-sala-reaccion]').forEach(function (btn) {
        btn.addEventListener('click', function () { reaccionar(btn.dataset.salaReaccion); });
      });
      $chatForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        const texto = ($chatInput.value || '').trim();
        if (!texto) return;
        enviarChat(texto);
        $chatInput.value = '';
      });
    }

    // CTA comercial del replay: sale del mismo evento apertura_cta que ya
    // llega en eventoSesion (sin tocar Orbit ni el modelo de datos). Copy
    // definitivo PENDIENTE (decisión 2026-09-25): mientras tanto solo el
    // botón, sin el titular/subtitular de la dramaturgia del final en vivo.
    // DEUDA REGISTRADA (D2, 2026-09-25): esta CTA aún no respeta el estado
    // de acceso vigente (a quien ya compró Código Soberana no se le debería
    // ofrecer). Debe resolverse antes de considerarla definitiva —
    // sala-abrir no entrega esa señal hoy y este slice no toca Orbit.
    function montarShellReplay() {
      $sala.dataset.modo = 'replay';
      const evt = (estado.eventoSesion || []).find(function (e) { return e.tipo === 'apertura_cta'; });
      $sala.insertAdjacentHTML('beforeend', renderShellReplay(evt && evt.payload));
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

    // Rediseño del replay (diseño cerrado 2026-09-25): en_vivo y replay son
    // dos experiencias distintas sobre el mismo motor, no una sala en vivo
    // con piezas apagadas. Al terminar la sesión se ELIMINAN del DOM los
    // nodos exclusivos de en_vivo y se pasa al shell de replay — pero el
    // contenedor del video y su iframe NO se tocan de lugar: cambiar su
    // configuración (quitar la tapa, iframe de 112% a 100%) no lo recarga;
    // moverlo en el DOM sí, y el video volvería al minuto 0.
    function detenerMaquinariaEnVivo() {
      if (estado.tickId) { clearInterval(estado.tickId); estado.tickId = null; }
      if (estado.pollId) { clearInterval(estado.pollId); estado.pollId = null; }
      if (estado.derivaId) { clearInterval(estado.derivaId); estado.derivaId = null; }
      estado.pollActivo = false;
    }

    function convertirAShellReplay() {
      detenerMaquinariaEnVivo();
      contenedor.querySelectorAll('[data-sala-solo-vivo]').forEach(function (n) { n.remove(); });
      $chat = $presencia = $reacciones = $overlay = $progreso = $chatForm = $chatInput = null;
      contenedor.classList.remove('sala-simulive--overlay-activo');
      montarShellReplay();
      const iframe = $video.querySelector('iframe');
      if (iframe) ajustarIframeAReplay(iframe);
      const tapa = $video.querySelector('.sala-video-tapa');
      if (tapa) tapa.remove();
    }

    function pasarAReplay() {
      if (salaSesionCerrada) return; // guard idempotente
      salaSesionCerrada = true;
      estado.fase = 'replay';
      if (timerCierreSesion) { clearTimeout(timerCierreSesion); timerCierreSesion = null; }
      convertirAShellReplay();
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

    if (estado.fase === 'replay') {
      // Shell propio desde el primer render: reproductor normal, nunca un
      // DOM de en_vivo (ni oculto). Sin reloj de sesión, sin poll, sin guion.
      salaSesionCerrada = true;
      $espera.style.display = 'none';
      montarShellReplay();
      if (apertura.videoUrl) { $video.style.display = 'block'; montarVideo($video, apertura.videoUrl, estado, 'replay'); }
      return;
    }

    montarShellEnVivo();
    if (estado.fase === 'espera' || estado.fase === 'lobby') {
      $video.style.display = 'none';
      $espera.style.display = 'block';
      $espera.innerHTML = estado.fase === 'lobby'
        ? '<p class="sala-lobby-msg">Tu sesión está a punto de comenzar. Puedes quedarte aquí.</p>'
        : '<p class="sala-lobby-msg">Sesión programada. Vuelve un poco antes de la hora.</p>';
    } else if (apertura.videoUrl) { // en_vivo
      $espera.style.display = 'none';
      $video.style.display = 'block';
      montarVideo($video, apertura.videoUrl, estado, 'en_vivo');
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
      if (!$overlay) return; // la sala ya pasó a replay
      // Referencia local: $overlay pasa a null cuando la sala se convierte a
      // replay, y los temporizadores/clics de abajo pueden llegar después.
      const $overlay_ = $overlay;
      const p = evt.payload || {};
      const opciones = (p.opciones || []).map(function (o) {
        return '<button class="sala-opcion" data-opcion="' + esc(o.id) + '">' + esc(o.texto) + '</button>';
      }).join('');
      $overlay_.innerHTML =
        '<div class="sala-poll">' +
        '<p class="sala-poll-texto">' + esc(p.texto) + '</p>' +
        '<div class="sala-poll-opciones">' + opciones + '</div>' +
        '<p class="sala-poll-feedback" data-sala-poll-feedback style="display:none"></p>' +
        '</div>';
      $overlay_.style.display = 'flex';
      contenedor.classList.add('sala-simulive--overlay-activo');

      function ocultar() {
        $overlay_.style.display = 'none';
        contenedor.classList.remove('sala-simulive--overlay-activo');
      }
      // Si nadie responde, se oculta sola pasado el tiempo de la pregunta.
      // Si responde, se reemplaza por un cierre corto (abajo) para que no
      // se quede montada ahí una vez ya contestó.
      let temporizadorOcultar = setTimeout(ocultar, (p.duracion_visible_segundos || 15) * 1000 + 6000);

      $overlay_.querySelectorAll('.sala-opcion').forEach(function (btn) {
        btn.addEventListener('click', function () {
          $overlay_.querySelectorAll('.sala-opcion').forEach(function (b) { b.disabled = true; });
          btn.classList.add('sala-opcion--elegida');
          responder(evt.id, btn.dataset.opcion, $overlay_.querySelector('[data-sala-poll-feedback]'));
          clearTimeout(temporizadorOcultar);
          temporizadorOcultar = setTimeout(ocultar, 3500);
        });
      });
    }

    function mostrarCTA(payload) {
      if (!$overlay) return; // la sala ya pasó a replay: su CTA vive debajo del reproductor
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
    estado.derivaId = setInterval(function () {
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
      if (salaSesionCerrada) return; // en replay no hay poll que reanudar
      estado.pollActivo = document.visibilityState === 'visible';
      if (estado.pollActivo) { pollSala(); revaluarSiYaTermino(); }
    });
    window.addEventListener('pageshow', revaluarSiYaTermino);
    window.addEventListener('focus', revaluarSiYaTermino);
  }

  // Esqueleto común. El contenedor de video es el nodo persistente: existe
  // igual en en_vivo y en replay, y nunca se mueve ni se reemplaza (ver
  // convertirAShellReplay).
  function renderEsqueleto() {
    return (
      '<div class="sala-simulive" data-modo="carga">' +
      '<div class="sala-video-box" data-sala-video style="display:none"></div>' +
      '<div class="sala-espera" data-sala-espera></div>' +
      '</div>'
    );
  }

  // Piezas exclusivas de la experiencia en vivo. Todas llevan
  // data-sala-solo-vivo: al terminar la sesión se ELIMINAN del DOM (no se
  // ocultan) — la sala en vivo y el replay son dos experiencias distintas.
  function renderShellEnVivo() {
    return (
      '<div class="sala-progreso-track" data-sala-solo-vivo><div class="sala-progreso" data-sala-progreso></div></div>' +
      '<div class="sala-presencia" data-sala-presencia data-sala-solo-vivo>👥 —</div>' +
      '<div class="sala-chat" data-sala-chat-lista data-sala-solo-vivo></div>' +
      '<form class="sala-chat-form" data-sala-chat-form data-sala-solo-vivo>' +
      '<input class="sala-chat-input" data-sala-chat-input type="text" maxlength="500" placeholder="Escribe algo…" />' +
      '<button type="submit">Enviar</button>' +
      '</form>' +
      '<div class="sala-reacciones-botones" data-sala-solo-vivo>' +
      '<button data-sala-reaccion="corazon">❤️</button>' +
      '<button data-sala-reaccion="brillo">✨</button>' +
      '<button data-sala-reaccion="aplauso">🙌</button>' +
      '</div>' +
      '<div class="sala-reacciones-flotantes" data-sala-reacciones data-sala-solo-vivo></div>' +
      '<div class="sala-overlay" data-sala-overlay data-sala-solo-vivo style="display:none"></div>'
    );
  }

  // Replay: reproductor normal + una sola CTA debajo. Sin chat, presencia,
  // reacciones, preguntas, poll ni barra de progreso por reloj de sesión.
  // Si no hay CTA configurada (o su URL no es segura), no se dibuja nada —
  // nunca se inventa un destino.
  function renderShellReplay(ctaPayload) {
    const p = ctaPayload || {};
    const url = urlSegura(p.url_destino);
    if (!url) return '';
    return (
      '<div class="sala-replay-cta" data-sala-replay-cta>' +
      '<a class="sala-cta-boton" href="' + url + '" target="_blank" rel="noopener">' + esc(p.texto_boton || 'Continuar') + '</a>' +
      '</div>'
    );
  }

  // Iframe en modo replay: altura completa (sin el recorte de la barra de
  // Bunny) y posicionado dentro del contenedor 16:9. Solo cambia estilos —
  // no toca src ni lo mueve del DOM, así que NO se recarga y conserva su
  // posición de reproducción.
  function ajustarIframeAReplay(iframe) {
    iframe.style.height = '100%';
    iframe.style.alignSelf = '';
  }

  async function montarVideo($contenedor, videoUrl, estado, modo) {
    const esReplay = modo === 'replay';
    const iframe = document.createElement('iframe');
    // autoplay solo en vivo: el replay es play manual. allowfullscreen y
    // allow=fullscreen se ponen SIEMPRE (también en vivo, donde es inofensivo
    // porque no hay barra visible): agregarlos después de cargado el iframe
    // podría no tener efecto sin recargarlo, y la transición en_vivo ->
    // replay no debe recargarlo.
    iframe.src = videoUrl + (videoUrl.indexOf('?') === -1 ? '?' : '&') + 'autoplay=' + (esReplay ? 'false' : 'true') + '&chromecast=false&disableAirPlay=true&showSpeed=false&showHeatmap=false&playsinline=true';
    iframe.setAttribute('allow', 'accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    $contenedor.innerHTML = '';
    $contenedor.appendChild(iframe);

    // Replay: reproductor normal, sin tapa, sin recorte, sin Player.js
    // (no hay reloj de sesión que sincronizar — el reproductor manda).
    if (esReplay) { ajustarIframeAReplay(iframe); return; }

    // La barra de controles de Bunny vive pegada a su borde inferior y no
    // tiene parámetro para ocultarla del todo (confirmado contra su
    // documentación). Se estira el iframe más allá del contenedor y se fija
    // arriba (alignSelf) para que solo la franja de abajo —donde vive esa
    // barra— quede recortada por el overflow:hidden del contenedor.
    iframe.style.height = '112%';
    iframe.style.alignSelf = 'flex-start';

    // Sin controles de reproducción en vivo (SIMULIVE.md §A): esta capa
    // transparente se pone encima del iframe y absorbe todo toque/clic —
    // nunca llega a los controles nativos de Bunny, así que nunca se puede
    // pausar ni buscar. Un toque sí reintenta player.play() (nunca pause),
    // por si el autoplay con sonido necesitó un gesto real del usuario para
    // desbloquearse. Se retira al pasar a replay (convertirAShellReplay).
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
      if (estado.fase === 'replay') return; // ya es un reproductor normal: nunca forzar posición ni play
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
