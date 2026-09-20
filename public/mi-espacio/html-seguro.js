// Orbit — Utilidades para pintar en HTML datos que NO controla el código
// (Seguridad, Fase 1 cliente, diseño cerrado 2026-09-20).
//
// Por qué existe: el PWA pintaba en innerHTML texto y enlaces que llegan de
// Firestore (feed de comunidad, sesiones en vivo) sin escapar ni validar. Como
// las escrituras a esas colecciones eran públicas, cualquiera podía inyectar
// código que se ejecutaba en el navegador de cada usuaria, o cambiar un enlace
// de Zoom/replay por uno malicioso. El nombre de la propia usuaria (Hotmart /
// Orbit) también entra en los posts automáticos, así que escapar es necesario
// aunque las reglas de Firestore se cierren.
//
// Tres funciones, sin dependencias:
//   escapeHtml(valor)  — texto seguro para contenido y atributos entre comillas.
//   urlSegura(valor)   — la URL normalizada si es https://, o '' si no lo es.
//   idSeguro(valor)    — el id si es [A-Za-z0-9_-] (ids de Firestore/Bunny), o ''.
// Nunca lanzan.

(function () {
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  function escapeHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/[&<>"'`]/g, function (c) { return ESCAPES[c]; });
  }

  // Solo https: — los enlaces de Zoom, Bunny y grabaciones son https. Rechaza
  // javascript:, data:, http:, rutas relativas o de protocolo (//host), vacíos y
  // cualquier valor que no sea texto. Devuelve la URL ya normalizada por el
  // parser del navegador (los caracteres peligrosos quedan codificados); el
  // llamador debe igualmente pasarla por escapeHtml() al ponerla en un atributo.
  function urlSegura(valor) {
    if (typeof valor !== 'string') return '';
    const texto = valor.trim();
    if (!texto) return '';
    try {
      const u = new URL(texto);
      if (u.protocol !== 'https:') return '';
      if (!u.hostname) return '';
      return u.href;
    } catch (e) {
      return '';
    }
  }

  // Ids de documentos de Firestore (20 letras/números) e ids de video de Bunny
  // (GUID con guiones). Cualquier otra cosa se descarta.
  function idSeguro(valor) {
    if (typeof valor !== 'string') return '';
    return /^[A-Za-z0-9_-]{1,128}$/.test(valor) ? valor : '';
  }

  const api = { escapeHtml: escapeHtml, urlSegura: urlSegura, idSeguro: idSeguro };
  if (typeof window !== 'undefined') window.htmlSeguro = api;
})();
