// scripts/set-local-firebase-env.js — toma un archivo de clave de cuenta de servicio de Firebase
// descargado desde Firebase Console (Project Settings → Service Accounts → Generate new private
// key) y lo escribe como FIREBASE_SERVICE_ACCOUNT en .env.local, en una sola línea de JSON.
//
// Uso: node scripts/set-local-firebase-env.js "C:\ruta\al\archivo-descargado.json"
//
// Motivo: FIREBASE_SERVICE_ACCOUNT está marcada "Sensitive" en Vercel, así que `vercel env pull`
// nunca trae su valor real (solo un placeholder) — esta clave nueva es solo para pruebas locales,
// no reemplaza ni afecta la que ya usa producción (pueden coexistir varias claves activas).
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const rutaJson = process.argv[2];
if (!rutaJson) {
  console.error('Uso: node scripts/set-local-firebase-env.js "<ruta al json descargado>"');
  process.exit(1);
}

const contenido = JSON.parse(readFileSync(rutaJson, 'utf8')); // valida que sea JSON bien formado
const json = JSON.stringify(contenido);
if (json.includes("'")) {
  console.error('El JSON contiene una comilla simple — este método no la soporta, avisa antes de continuar.');
  process.exit(1);
}
// Comillas simples por fuera: el --env-file de Node no des-escapa \" dentro de comillas dobles,
// así que envolver en comillas dobles con escapes rompe el parseo. Con comillas simples no hace
// falta escapar nada, porque el JSON de adentro solo usa comillas dobles.
const linea = `FIREBASE_SERVICE_ACCOUNT='${json}'`;

const envPath = resolve('.env.local');
let envActual = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

const lineas = envActual.split(/\r?\n/).filter(l => l && !l.startsWith('FIREBASE_SERVICE_ACCOUNT='));
lineas.push(linea);

writeFileSync(envPath, lineas.join('\n') + '\n');
console.log('FIREBASE_SERVICE_ACCOUNT actualizado en .env.local (valor no impreso).');
