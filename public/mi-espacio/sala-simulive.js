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

  // Sincronización video <-> sesión (2026-09-25). UNA sola función
  // (sincronizarVideoConSesion) es la única que toca el currentTime del video
  // en vivo; la invocan tres momentos: la entrada, el regreso a la página y el
  // corrector periódico de deriva. Parámetros INICIALES, medidos en un Android
  // real (Chrome pausa el video al salir y lo reanuda solo al volver, pero en
  // la posición vieja: el desfase crece con el tiempo fuera). Se dejan aquí,
  // nombrados, para poder ajustarlos tras verlo en uso.
  const SYNC_ESPERA_REGRESO_MS = 250;   // tras volver: dejar que el navegador/Bunny reanuden solos
  const SYNC_ESPERA_PLAY_MS = 500;      // tras un play: dejar asentar el arranque antes de comparar
  const SYNC_TOLERANCIA_SEGUNDOS = 3;   // menos que esto: alineado, no se toca (el desfase normal medido fue ~0,8 s)
  const SYNC_AVISO_SEGUNDOS = 8;        // más que esto, al volver: aviso "Volviste a la sesión"
  const SYNC_RESPUESTA_MAX_MS = 1500;   // techo de espera al reproductor (respondió en <100 ms en la medición)
  const SYNC_ASENTAR_MS = 1000;         // tras un salto, no volver a leer/corregir hasta que asiente
  const SYNC_CONTINUAR_ESPERA_MS = 1000; // tras corregir: si sigue pausado, pista para continuar
  const AVISO_REINCORPORACION_MS = 2800;

  // Decisión pura (sin DOM ni red, probada aparte): dada la posición REAL del
  // reproductor y la de la SESIÓN, ¿hay que corregir y avisar?
  //   origen: 'play' | 'regreso' | 'deriva'
  //   - sin respuesta del reproductor: solo el regreso asume el peor caso
  //     (corrige y avisa); la entrada y la deriva simplemente esperan al
  //     siguiente ciclo, como siempre.
  //   - diferencia < tolerancia: no se toca. >= tolerancia: se corrige.
  //   - el aviso solo existe al VOLVER, y solo si el salto pasa de SYNC_AVISO_SEGUNDOS.
  function decidirSincronizacion(segundosReales, esperado, origen) {
    const sinDato = segundosReales === null || segundosReales === undefined || typeof segundosReales !== 'number' || !isFinite(segundosReales);
    if (sinDato) {
      if (origen !== 'regreso') return { corregir: false, aviso: false, diferencia: null };
      return { corregir: true, aviso: true, diferencia: Infinity };
    }
    const diferencia = Math.abs(segundosReales - esperado);
    const corregir = diferencia >= SYNC_TOLERANCIA_SEGUNDOS;
    return { corregir, aviso: corregir && origen === 'regreso' && diferencia > SYNC_AVISO_SEGUNDOS, diferencia };
  }

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
      regresoTimer: null,      // espera de SYNC_ESPERA_REGRESO_MS (deduplica visibilitychange + focus)
      sincronizando: false,    // una sola lectura/corrección a la vez: nada se pisa
      playTimer: null,         // debounce de los 'play' seguidos que emite Bunny
      avisoTimer: null,
      continuarTimer: null,
    };

    // Esqueleto neutro: solo el contenedor de video (nodo PERSISTENTE — el
    // iframe vive aquí y nunca se mueve, porque mover un iframe en el DOM
    // lo recarga y el video volvería a 0) y el de espera/errores. Lo demás
    // se agrega según la fase: renderShellEnVivo() o renderShellReplay().
    // inline (2026-09-25): la sala se monta DENTRO de otra página (la tarjeta
    // de /clase-gratuita) y solo para replay — sin altura de pantalla
    // completa ni fondo propio, y sin ninguna UI de en vivo. Si Orbit dice
    // que la fase ya no es replay, o algo falla, avisa a la página anfitriona
    // (onNoDisponible) en vez de dibujar una sala dentro de su tarjeta.
    const inline = opciones.inline === true;
    function noDisponibleInline(motivo) {
      if (typeof opciones.onNoDisponible === 'function') opciones.onNoDisponible(motivo);
    }
    contenedor.innerHTML = renderEsqueleto(inline);
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
    let $avisoReincorporacion = null;
    let $avisoContinuar = null;

    function montarShellEnVivo() {
      $sala.dataset.modo = 'en_vivo';
      $sala.insertAdjacentHTML('beforeend', renderShellEnVivo());
      $avisoReincorporacion = contenedor.querySelector('[data-sala-reincorporacion-aviso]');
      $avisoContinuar = contenedor.querySelector('[data-sala-continuar-aviso]');
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

    // Play/Pausa EXTERNO del replay (2026-09-25): la barra de Bunny vive
    // dentro de su iframe (no se puede rediseñar y se esconde mientras
    // reproduce), así que el play/pausa tiene su propio botón grande, fuera
    // del iframe y siempre visible. Habla con el MISMO reproductor por
    // Player.js; Bunny conserva línea de tiempo, volumen, ajustes y pantalla
    // completa. Al vivir fuera del iframe nunca interfiere con los toques
    // dentro del video. Idempotente: se conecta una sola vez.
    function quitarControlReplay() {
      const c = contenedor.querySelector('[data-sala-replay-controles]');
      if (c) c.remove();
    }

    function conectarControlReplay() {
      const $toggle = contenedor.querySelector('[data-sala-replay-toggle]');
      const player = estado.player;
      if (!$toggle || $toggle.dataset.conectado === '1') return;
      if (!player) { quitarControlReplay(); return; } // sin Player.js: quedan los controles de Bunny
      $toggle.dataset.conectado = '1';
      estado.controlReplayListo = true;

      function pintar(reproduciendo) {
        $toggle.dataset.estado = reproduciendo ? 'reproduciendo' : 'pausado';
        $toggle.setAttribute('aria-label', reproduciendo ? 'Pausar' : 'Reproducir');
        $toggle.innerHTML = reproduciendo ? ICONO_PAUSA : ICONO_PLAY;
      }
      player.on('play', function () { pintar(true); });
      player.on('pause', function () { pintar(false); });
      player.on('ended', function () { pintar(false); });
      // Estado real al conectar: en replay directo arranca en pausa; tras
      // la transición desde en vivo el video ya está reproduciendo.
      player.getPaused(function (enPausa) { pintar(!enPausa); });

      $toggle.addEventListener('click', function () {
        // Se consulta el estado real en cada toque, no un valor recordado:
        // si el usuario pausó desde la barra de Bunny, esto no se desincroniza.
        player.getPaused(function (enPausa) {
          if (enPausa) player.play(); else player.pause();
        });
      });
      $toggle.disabled = false;
    }
    estado.alListoReplay = conectarControlReplay;

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
      console.error('iniciarSalaSimulive: sala-abrir falló', e && e.message);
      if (inline) { noDisponibleInline('error'); return; }
      $espera.innerHTML = '<p class="sala-error">No pudimos abrir la sala. Intenta de nuevo en un momento.</p>';
      return;
    }

    if (inline && (apertura.fase !== 'replay' || !apertura.videoUrl)) {
      noDisponibleInline(apertura.fase);
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
      if (estado.regresoTimer) { clearTimeout(estado.regresoTimer); estado.regresoTimer = null; }
      if (estado.avisoTimer) { clearTimeout(estado.avisoTimer); estado.avisoTimer = null; }
      if (estado.continuarTimer) { clearTimeout(estado.continuarTimer); estado.continuarTimer = null; }
      if (estado.playTimer) { clearTimeout(estado.playTimer); estado.playTimer = null; }
      estado.pollActivo = false;
    }

    function convertirAShellReplay() {
      detenerMaquinariaEnVivo();
      contenedor.querySelectorAll('[data-sala-solo-vivo]').forEach(function (n) { n.remove(); });
      $chat = $presencia = $reacciones = $overlay = $progreso = $chatForm = $chatInput = null;
      $avisoReincorporacion = $avisoContinuar = null;
      contenedor.classList.remove('sala-simulive--overlay-activo');
      montarShellReplay();
      conectarControlReplay(); // el reproductor de en vivo ya existe y sigue vivo
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

    // ── sincronización video <-> sesión (2026-09-25) ────────────────────
    // La sesión manda, el video se sincroniza con ella. Nunca se asume dónde
    // está el video: se lee del reproductor. UNA sola función toca el
    // currentTime, invocada desde tres momentos (así nunca hay dos
    // mecanismos peleando por la posición):
    //   'play'    — el video empezó/reanudó (entrada con el autoplay bloqueado,
    //               toque tras la pista, reanudación automática): arranca desde
    //               donde se detuvo y la sesión ya iba adelante;
    //   'regreso' — la usuaria volvió a la página (Android pausa al salir y
    //               reanuda solo, pero en la posición vieja); es el ÚNICO que
    //               puede mostrar el aviso "Volviste a la sesión";
    //   'deriva'  — el corrector periódico de siempre (cada 30 s).
    // Sin play() automático: el navegador ya reanuda solo; si tras corregir
    // sigue pausado, una pista discreta invita a tocar (la tapa ya reenvía ese
    // toque a play()). Solo mientras la fase es en_vivo.
    function mostrarAvisoReincorporacion() {
      if (!$avisoReincorporacion) return;
      $avisoReincorporacion.style.display = 'block';
      if (estado.avisoTimer) clearTimeout(estado.avisoTimer);
      estado.avisoTimer = setTimeout(function () {
        estado.avisoTimer = null;
        if ($avisoReincorporacion) $avisoReincorporacion.style.display = 'none';
      }, AVISO_REINCORPORACION_MS);
    }

    function mostrarPistaContinuar() { if ($avisoContinuar) $avisoContinuar.style.display = 'block'; }
    function ocultarPistaContinuar() { if ($avisoContinuar) $avisoContinuar.style.display = 'none'; }

    // Tras corregir (o tras volver): un video en vivo pausado nunca es lo
    // esperado. Si sigue pausado pasado un momento, pista para continuar.
    function verificarContinuidad() {
      if (estado.continuarTimer) clearTimeout(estado.continuarTimer);
      estado.continuarTimer = setTimeout(function () {
        estado.continuarTimer = null;
        if (!estado.player || estado.fase !== 'en_vivo') return;
        try {
          estado.player.getPaused(function (enPausa) {
            if (estado.fase !== 'en_vivo') return;
            if (enPausa) mostrarPistaContinuar(); else ocultarPistaContinuar();
          });
        } catch (e) {}
      }, SYNC_CONTINUAR_ESPERA_MS);
    }

    function sincronizarVideoConSesion(origen) {
      if (!estado.player || estado.fase !== 'en_vivo' || salaSesionCerrada) return;
      if (estado.sincronizando) return; // una a la vez: un salto en curso ya se está asentando
      estado.sincronizando = true;
      let resuelto = false;
      function resolver(segundosReales) {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(timeoutId);
        if (estado.fase !== 'en_vivo') { estado.sincronizando = false; return; }
        const decision = decidirSincronizacion(segundosReales, posicionActual(), origen);
        if (!decision.corregir) {
          estado.sincronizando = false;
          if (origen === 'regreso') verificarContinuidad(); // alineado, pero ¿volvió a reproducirse?
          return;
        }
        try { estado.player.setCurrentTime(posicionActual()); } catch (e) {}
        if (decision.aviso) mostrarAvisoReincorporacion();
        if (origen === 'regreso') verificarContinuidad();
        // El salto tarda en asentarse: hasta entonces ninguna otra lectura
        // (ni el corrector de 30 s) vuelve a mover el video.
        setTimeout(function () { estado.sincronizando = false; }, SYNC_ASENTAR_MS);
      }
      const timeoutId = setTimeout(function () { resolver(null); }, SYNC_RESPUESTA_MAX_MS);
      try {
        estado.player.getCurrentTime(resolver);
      } catch (e) { resolver(null); }
    }

    // Regreso a la página: visibilitychange y focus llegan pegados — una sola
    // sincronización, tras una breve espera (deja que el navegador reanude).
    // Primero se comprueba si la sesión ya terminó (-> replay): nunca compite.
    function alRegresar() {
      revaluarSiYaTermino();
      if (salaSesionCerrada || estado.fase !== 'en_vivo') return;
      if (estado.regresoTimer) return;
      estado.regresoTimer = setTimeout(function () {
        estado.regresoTimer = null;
        if (document.visibilityState !== 'visible') return;
        sincronizarVideoConSesion('regreso');
      }, SYNC_ESPERA_REGRESO_MS);
    }

    // Cada 'play' del video (la entrada con el autoplay bloqueado, la
    // reanudación por un toque tras la pista, la reanudación automática al
    // volver): el video arranca desde donde se detuvo, y la sesión siguió
    // avanzando. Se sincroniza tras una breve espera. Bunny emite varios
    // 'play' seguidos por reanudación -> un solo temporizador (debounce);
    // y si el regreso o el corrector ya están asentando un salto, la
    // función única simplemente no hace nada (una lectura a la vez).
    // Alineado -> no toca nada, así que un play "normal" no cuesta un salto.
    estado.alReproducirEnVivo = function () {
      ocultarPistaContinuar();
      if (estado.playTimer) return;
      estado.playTimer = setTimeout(function () {
        estado.playTimer = null;
        sincronizarVideoConSesion('play');
      }, SYNC_ESPERA_PLAY_MS);
    };

    // ── corrección de deriva del video, independiente del poll ──
    // Mismo mecanismo (la única función de arriba), en silencio.
    estado.derivaId = setInterval(function () { sincronizarVideoConSesion('deriva'); }, DERIVA_CORRECCION_MS);

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
      if (estado.pollActivo) { pollSala(); alRegresar(); }
    });
    // pageshow NO dispara sincronización: en una medición real solo llegó al
    // cargar, nunca al cambiar de app. Sigue comprobando si la sesión terminó.
    window.addEventListener('pageshow', revaluarSiYaTermino);
    window.addEventListener('focus', alRegresar);
  }

  // Esqueleto común. El contenedor de video es el nodo persistente: existe
  // igual en en_vivo y en replay, y nunca se mueve ni se reemplaza (ver
  // convertirAShellReplay).
  function renderEsqueleto(inline) {
    return (
      '<div class="sala-simulive" data-modo="carga"' + (inline ? ' data-inline="true"' : '') + '>' +
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
      '<p class="sala-reincorporacion-aviso" data-sala-reincorporacion-aviso data-sala-solo-vivo style="display:none">Volviste a la sesión 💛 · Te llevamos al punto en el que estamos.</p>' +
      '<p class="sala-continuar-aviso" data-sala-continuar-aviso data-sala-solo-vivo style="display:none">Toca el video para continuar ▶</p>' +
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
  const ICONO_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const ICONO_PAUSA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>';

  function renderShellReplay(ctaPayload) {
    const p = ctaPayload || {};
    const url = urlSegura(p.url_destino);
    // Botón externo de play/pausa: nace deshabilitado hasta que el
    // reproductor está listo (ver conectarControlReplay).
    const control = (
      '<div class="sala-replay-controles" data-sala-replay-controles>' +
      '<button type="button" class="sala-replay-toggle" data-sala-replay-toggle data-estado="pausado" aria-label="Reproducir" disabled>' + ICONO_PLAY + '</button>' +
      '</div>'
    );
    const cta = url ? (
      '<div class="sala-replay-cta" data-sala-replay-cta>' +
      '<a class="sala-cta-boton" href="' + url + '" target="_blank" rel="noopener">' + esc(p.texto_boton || 'Continuar') + '</a>' +
      '</div>'
    ) : '';
    return control + cta;
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
    if (esReplay) {
      ajustarIframeAReplay(iframe);
      // Solo para el botón externo de play/pausa. Si Player.js no carga o
      // nunca da 'ready', el botón se retira y quedan los controles de
      // Bunny — nunca un botón muerto a la vista.
      const $sala = $contenedor.closest('.sala-simulive');
      const quitar = function () {
        const c = $sala && $sala.querySelector('[data-sala-replay-controles]');
        if (c) c.remove();
      };
      try {
        await cargarPlayerJs();
      } catch (e) {
        console.warn('montarVideo: Player.js no cargó — replay sin botón externo', e && e.message);
        quitar();
        return;
      }
      if (iframe.isConnected === false) return;
      const playerReplay = new window.playerjs.Player(iframe);
      estado.player = playerReplay;
      playerReplay.on('ready', function () {
        if (typeof estado.alListoReplay === 'function') estado.alListoReplay();
      });
      setTimeout(function () { if (!estado.controlReplayListo) quitar(); }, 8000);
      return;
    }

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
    // Sincronización video <-> sesión (ver sincronizarVideoConSesion): cada
    // 'play' avisa a la sala, que decide si es el primero (entrada) o solo
    // oculta la pista de continuar.
    player.on('play', function () {
      if (typeof estado.alReproducirEnVivo === 'function') estado.alReproducirEnVivo();
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
  // Solo para la prueba automática de la decisión pura (sin DOM ni red).
  iniciarSalaSimulive.decidirSincronizacion = decidirSincronizacion;
  iniciarSalaSimulive.parametrosSincronizacion = {
    SYNC_ESPERA_REGRESO_MS, SYNC_ESPERA_PLAY_MS, SYNC_TOLERANCIA_SEGUNDOS,
    SYNC_AVISO_SEGUNDOS, SYNC_RESPUESTA_MAX_MS, SYNC_ASENTAR_MS, SYNC_CONTINUAR_ESPERA_MS,
  };
})();
