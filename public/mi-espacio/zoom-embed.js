// Orbit — Zoom embebido (Puerta 5, Estación 7, diseño cerrado 2026-09-15)
// Componente UNICO reutilizado por /clase-gratuita (Masterclass) y
// /workbook (las 3 Estaciones del Bootcamp) — nunca 4 implementaciones
// distintas. Cada página solo decide QUÉ endpoint llamar (obtenerJoinInfo)
// y dónde montar el embed (contenedorId); este archivo no sabe cuál de
// los 4 eventos es. Mismo patrón ya validado en el prototipo aislado
// masterclass-zoom-join-test (2026-09-14): ZoomMtgEmbedded.createClient()
// -> client.init() -> client.join({signature, sdkKey, meetingNumber,
// password, userName, tk}).
//
// Degradación segura (diseño cerrado): cualquier fallo — respuesta
// ok:false de Orbit, o el propio client.join() lanzando — llama a
// onFallback(motivo, enlaceGenerico) y nunca deja el embed a medio
// cargar. La página decide qué hacer con el enlace genérico (normalmente,
// abrirlo en pestaña nueva) — este archivo nunca navega por su cuenta ni
// muestra ningún mensaje técnico a la mujer.

(function () {
  const ZOOM_SDK_VERSION = '3.9.0';
  const ZOOM_SDK_SCRIPTS = [
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/react.min.js`,
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/react-dom.min.js`,
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/redux.min.js`,
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/redux-thunk.min.js`,
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/lib/vendor/lodash.min.js`,
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/zoom-meeting-embedded-${ZOOM_SDK_VERSION}.min.js`,
  ];
  const ZOOM_SDK_STYLES = [
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/css/bootstrap.css`,
    `https://source.zoom.us/${ZOOM_SDK_VERSION}/css/react-select.css`,
  ];

  let cargaSdkPromise = null;

  // Puerta 5, Estación 7 (ciclo de vida del embed, diseño cerrado
  // 2026-09-15): referencia al UNICO cliente Zoom activo en toda la pagina
  // — nunca hay dos sesiones embebidas simultaneas (una mujer no puede
  // estar en dos reuniones a la vez), asi que un solo puntero de modulo
  // basta. Centralizado aqui a proposito: ni /clase-gratuita ni /workbook
  // saben como se cierra un cliente de Zoom, solo saben CUANDO deben
  // pedirselo a este archivo (antes de reconstruir su DOM).
  let clienteZoomActivo = null;

  // Cierra (client.leave()) la sesion activa, si existe, antes de que la
  // pagina reconstruya el DOM que la contiene (Masterclass: transicion
  // en_vivo -> replay; Bootcamp: renderBootcampHitosBlock() se vuelve a
  // ejecutar). Tolerante por diseño: sin cliente activo, no hace nada;
  // si leave() lanza (conexion ya caida, DOM ya removido, lo que sea), se
  // registra en consola y se sigue — nunca bloquea ni rompe la
  // reconstruccion del DOM que la llamo. Idempotente: llamarla varias
  // veces seguidas (o sin sesion activa) es siempre seguro.
  async function cerrarZoomEmbebidoActivo() {
    if (!clienteZoomActivo) return;
    const cliente = clienteZoomActivo;
    clienteZoomActivo = null; // se limpia ANTES de intentar leave() -- una falla de leave() nunca deja el puntero apuntando a un cliente ya descartado
    try {
      await cliente.leave();
    } catch (e) {
      console.warn('cerrarZoomEmbebidoActivo: leave() fallo (tolerado, el cliente se descarta igual)', e && e.message);
    }
  }

  function cargarScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-zoom-sdk="' + src + '"]')) return resolve();
      const el = document.createElement('script');
      el.src = src;
      el.dataset.zoomSdk = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(el);
    });
  }

  function cargarEstilo(href) {
    if (document.querySelector('link[data-zoom-sdk="' + href + '"]')) return;
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    el.dataset.zoomSdk = href;
    document.head.appendChild(el);
  }

  // Los scripts del SDK dependen unos de otros en orden — se cargan
  // secuencialmente, nunca en paralelo (Promise.all rompería el orden de
  // ejecución que el SDK de Zoom exige).
  async function cargarZoomSdk() {
    if (window.ZoomMtgEmbedded) return;
    if (!cargaSdkPromise) {
      cargaSdkPromise = (async () => {
        ZOOM_SDK_STYLES.forEach(cargarEstilo);
        for (const src of ZOOM_SDK_SCRIPTS) {
          await cargarScript(src);
        }
      })();
    }
    await cargaSdkPromise;
  }

  /**
   * @param {Object} opciones
   * @param {() => Promise<Object>} opciones.obtenerJoinInfo - llama al proxy
   *   correspondiente (masterclass-zoom-join o bootcamp-zoom-join?hito=N) y
   *   devuelve la respuesta cruda de Orbit, tal cual.
   * @param {string} opciones.contenedorId - id del elemento donde el SDK
   *   monta su UI (debe existir en el DOM antes de llamar).
   * @param {(motivo: string, enlaceGenerico: string|null) => void} opciones.onFallback -
   *   llamado en cualquier fallo. Nunca se le muestra a la mujer un mensaje
   *   técnico — la página decide qué hacer (normalmente, ofrecer
   *   enlaceGenerico como enlace externo). `identificacionAutomatica` NUNCA
   *   altera este camino ni el de éxito — es un detalle de diagnóstico que
   *   vive solo en los logs de Orbit, nunca en la experiencia.
   * @param {() => void} [opciones.onExito] - llamado una vez que
   *   client.join() resuelve con éxito (ej. para ocultar un spinner).
   * @param {string|null} [opciones.enlaceGenericoRespaldo] - enlace externo
   *   que la página ya conoce de antemano (ej. exp.enlaceEnVivo), usado
   *   solo si Orbit respondió ok:true pero el propio client.join() falla
   *   del lado del navegador (Orbit no manda enlaceGenerico en ese caso,
   *   porque desde su punto de vista todo salió bien).
   */
  async function abrirZoomEmbebido({ obtenerJoinInfo, contenedorId, onFallback, onExito, enlaceGenericoRespaldo }) {
    let data;
    try {
      data = await obtenerJoinInfo();
    } catch (e) {
      onFallback('no_disponible', enlaceGenericoRespaldo || null);
      return;
    }
    if (!data || data.ok !== true) {
      onFallback((data && data.motivo) || 'desconocido', (data && data.enlaceGenerico) || enlaceGenericoRespaldo || null);
      return;
    }

    try {
      await cargarZoomSdk();
    } catch (e) {
      onFallback('sdk_no_cargo', enlaceGenericoRespaldo || null);
      return;
    }

    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) {
      onFallback('contenedor_no_encontrado', enlaceGenericoRespaldo || null);
      return;
    }

    // Antes de abrir una sesion nueva, cierra cualquier sesion previa que
    // haya quedado activa (defensivo — el llamador deberia haber invocado
    // cerrarZoomEmbebidoActivo() el mismo antes de reconstruir su DOM, pero
    // esto evita dos clientes vivos si alguna pagina olvida hacerlo).
    await cerrarZoomEmbebidoActivo();

    try {
      const client = ZoomMtgEmbedded.createClient();
      await client.init({ zoomAppRoot: contenedor, language: 'es-ES', patchJsMedia: true });
      await client.join({
        signature: data.signature,
        sdkKey: data.sdkKey,
        meetingNumber: data.meetingNumber,
        password: data.passcode || undefined,
        userName: data.userName,
        tk: data.tk || undefined,
      });
      clienteZoomActivo = client;
      if (onExito) onExito();
    } catch (e) {
      console.warn('abrirZoomEmbebido: fallo al unirse via Meeting SDK', e && e.message);
      onFallback('join_fallo', enlaceGenericoRespaldo || null);
    }
  }

  window.abrirZoomEmbebido = abrirZoomEmbebido;
  window.cerrarZoomEmbebidoActivo = cerrarZoomEmbebidoActivo;
})();
