// UX 2026-09-20 (punto 5 aprobado): /instalar/ es un paso corto de instalar la app, no una segunda
// pantalla de bienvenida. Se prueba el HTML real y su script real (DOM simulado, sin navegador).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const HTML = fs.readFileSync(new URL('../../public/instalar/index.html', import.meta.url), 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('<script>') + 8, HTML.indexOf('</script>'));
const CUERPO = HTML.slice(HTML.indexOf('<body>'));

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.0',
};

// Página simulada: solo lo que el script real toca.
function cargar({ ua, standalone = false }) {
  const elementos = new Map();
  const el = (id) => {
    if (!elementos.has(id)) {
      elementos.set(id, {
        id, style: {}, textContent: '', innerHTML: '',
        classList: { add() {}, remove() {} },
        appendChild() {},
        querySelector() { return { innerHTML: '' }; },
      });
    }
    return elementos.get(id);
  };
  const escuchas = {};
  const temporizadores = [];
  const toasts = [];
  const ctx = vm.createContext({
    Math, console: { log() {}, warn() {} },
    navigator: { userAgent: ua, standalone: standalone || undefined },
    document: {
      getElementById: (id) => el(id),
      createElement: () => ({ style: {}, className: '' }),
    },
    window: {
      matchMedia: () => ({ matches: standalone }),
      addEventListener(ev, fn) { escuchas[ev] = fn; },
    },
    setTimeout(fn, ms) { temporizadores.push({ fn, ms }); return temporizadores.length; },
  });
  vm.runInContext(SCRIPT, ctx);
  const original = ctx.showToast;
  ctx.showToast = (m) => { toasts.push(m); original(m); };
  return {
    ctx, el, toasts, temporizadores,
    abrirPagina() { escuchas.DOMContentLoaded(); },
    llegaElAvisoNativo(resultado = 'dismissed') {
      const evento = {
        preventDefault() {},
        prompt() { this.pedido = true; },
        userChoice: Promise.resolve({ outcome: resultado }),
      };
      escuchas.beforeinstallprompt(evento);
      return evento;
    },
    seInstala() { escuchas.appinstalled(); },
    pasaronTresSegundos() { temporizadores.filter((t) => t.ms === 3000).forEach((t) => t.fn()); },
  };
}

// ── Estructura y textos ──────────────────────────────────────────────────────────────────────────

test('"Ahora no, continuar →" queda justo debajo del botón principal y ANTES de los beneficios', () => {
  const iBoton = CUERPO.indexOf('id="btn-install"');
  const iAbrir = CUERPO.indexOf('id="btn-abrir"');
  const iAhoraNo = CUERPO.indexOf('id="continuar-sin-instalar"');
  const iBeneficios = CUERPO.indexOf('class="benefits"');
  assert.ok(iBoton > 0 && iAbrir > iBoton && iAhoraNo > iAbrir, 'orden: botón → abrir → ahora no');
  assert.ok(iAhoraNo < iBeneficios, 'el camino de salida se ve sin bajar hasta los beneficios');
  assert.match(CUERPO, /id="continuar-sin-instalar"[^>]*>Ahora no, continuar →<\/a>/);
});

test('"Ahora no" es legible: 14 px y contraste alto (no el gris casi invisible de antes)', () => {
  const etiqueta = CUERPO.match(/<a [^>]*id="continuar-sin-instalar"[^>]*>/)[0];
  assert.match(etiqueta, /font-size:\s*14px/);
  const alfa = Number(etiqueta.match(/color:\s*rgba\(249,244,236,\s*([\d.]+)\)/)[1]);
  assert.ok(alfa >= 0.7, `contraste suficiente (alfa ${alfa})`);
  assert.match(etiqueta, /padding:\s*12px/, 'zona de toque cómoda');
});

test('la tarjeta de notificaciones ya no existe en /instalar/ (se ofrece dentro de la app)', () => {
  assert.doesNotMatch(HTML, /notif-step|btn-notif|notif-hint|requestNotifPermission|Activa las notificaciones/);
  assert.doesNotMatch(SCRIPT, /Notification|requestPermission/, 'esta página no pide permiso alguno');
});

test('textos viejos fuera: nada de "regístrate", "trabajar el proceso", "Tu herramienta personal", "sin internet"', () => {
  assert.doesNotMatch(HTML, /regístrate|registrate/i);
  assert.doesNotMatch(HTML, /trabajar el proceso|Tu herramienta personal|Instala tu Herramienta/);
  assert.doesNotMatch(HTML, /sin internet|sin conexión|offline/i, 'no se promete funcionamiento sin internet');
});

test('el último paso de iPhone y de Android manda a abrir la app instalada', () => {
  const pasos = [...HTML.matchAll(/<div class="step-text">Abre <strong>Código Soberana<\/strong> desde tu pantalla de inicio\.<\/div>/g)];
  assert.equal(pasos.length, 2, 'uno en iOS y otro en Android');
});

test('sigue apuntando a /workbook y usa el manifest de la app', () => {
  assert.match(HTML, /rel="manifest" href="\/workbook\/manifest\.json"/);
  assert.match(HTML, /id="btn-abrir" href="\/workbook"/);
  assert.match(HTML, /href="\/workbook" id="continuar-sin-instalar"/);
});

// ── Comportamiento ───────────────────────────────────────────────────────────────────────────────

test('Android con aviso nativo: botón visible, "Ahora no" visible, sin pasos manuales', () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  p.llegaElAvisoNativo();
  assert.equal(p.el('btn-install').style.display, 'flex');
  assert.notEqual(p.el('continuar-sin-instalar').style.display, 'none');
  assert.notEqual(p.el('android-steps').style.display, 'flex');
});

test('Android: si descarta el aviso nativo, el botón NO queda inerte: aparecen los pasos a mano', async () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  const evento = p.llegaElAvisoNativo('dismissed');
  await p.ctx.handleInstall();
  assert.equal(evento.pedido, true, 'se mostró el aviso nativo una vez');
  assert.equal(p.el('android-steps').style.display, 'flex', 'ahora ve cómo hacerlo a mano');
  assert.equal(p.el('btn-install').style.display, 'none');
  assert.match(p.el('install-title').textContent, /Android/);
  assert.ok(p.toasts.some((t) => /a mano/.test(t)), 'se le explica qué pasó');
  assert.notEqual(p.el('continuar-sin-instalar').style.display, 'none', '"Ahora no" sigue disponible');
});

test('Android: si acepta, no se muestran pasos manuales', async () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  p.llegaElAvisoNativo('accepted');
  await p.ctx.handleInstall();
  assert.notEqual(p.el('android-steps').style.display, 'flex');
  assert.ok(p.toasts.includes('Instalando...'));
});

test('Android: pulsar el botón antes de que llegue el aviso nativo muestra los pasos, no no-hace-nada', async () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  await p.ctx.handleInstall();
  assert.equal(p.el('android-steps').style.display, 'flex');
});

test('Android sin aviso nativo tras 3 s: pasos manuales', () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  p.pasaronTresSegundos();
  assert.equal(p.el('android-steps').style.display, 'flex');
  assert.equal(p.el('btn-install').style.display, 'none');
});

test('Android: si el aviso nativo llega antes de los 3 s, los pasos manuales no aparecen', () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  p.llegaElAvisoNativo();
  p.pasaronTresSegundos();
  assert.notEqual(p.el('android-steps').style.display, 'flex');
});

test('iPhone Safari: pasos de iOS y "Ahora no" visible', () => {
  const p = cargar({ ua: UA.ios });
  p.abrirPagina();
  assert.equal(p.el('ios-steps').style.display, 'flex');
  assert.notEqual(p.el('continuar-sin-instalar').style.display, 'none');
});

test('iPhone con otro navegador y navegador dentro de otra app: aviso de abrir en el navegador, con salida', () => {
  for (const ua of [UA.iosChrome, UA.instagram]) {
    const p = cargar({ ua });
    p.abrirPagina();
    assert.equal(p.el('inapp-warning').style.display, 'block');
    assert.notEqual(p.el('continuar-sin-instalar').style.display, 'none');
  }
});

test('app ya instalada (standalone): "Abrir Código Soberana", sin invitar a instalar y sin "Ahora no"', () => {
  const p = cargar({ ua: UA.android, standalone: true });
  p.abrirPagina();
  assert.equal(p.el('btn-abrir').style.display, 'flex');
  assert.equal(p.el('btn-install').style.display, 'none');
  assert.equal(p.el('continuar-sin-instalar').style.display, 'none');
});

test('al terminar de instalar: aparece "Abrir Código Soberana" y ya no hay tarjeta de notificaciones', () => {
  const p = cargar({ ua: UA.android });
  p.abrirPagina();
  p.llegaElAvisoNativo('accepted');
  p.seInstala();
  assert.equal(p.el('btn-abrir').style.display, 'flex');
  assert.equal(p.el('btn-install').style.display, 'none');
  assert.equal(p.el('install-title').textContent, 'Instalación completa');
});
