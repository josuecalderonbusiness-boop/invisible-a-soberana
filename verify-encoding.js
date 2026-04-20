const fs = require('fs');
const c = fs.readFileSync('public/workbook/index.html', 'utf8');

const bad = [
  '\u00C3\u00B3', // Ã³
  '\u00C3\u00A1', // Ã¡
  '\u00C3\u00A9', // Ã©
  '\u00C3\u00B1', // Ã±
  '\u00C3\u00AD', // Ã­
  '\u00C3\u0192\u00C2', // ÃƒÂ (double-corrupted prefix)
  '\u00E2\u20AC',       // â€ (corrupted em-dash prefix)
];

let found = 0;
for (const b of bad) {
  let count = 0, idx = 0;
  while ((idx = c.indexOf(b, idx)) !== -1) { count++; idx++; }
  if (count) { console.log('QUEDAN ' + count + 'x:', JSON.stringify(b)); found++; }
}
if (!found) console.log('Sin mojibake detectado.');

const m = c.match(/[\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u2014\u2013\u201C\u201D\u2018\u2019\u00B7\u00BF\u00A1]/g) || [];
console.log('Muestra correctos:', [...new Set(m)].join(' '));

const t = c.match(/<title>[^<]+/);
if (t) console.log('Titulo:', t[0]);

// Show a sentence with Sesion
const idx = c.indexOf('Sesi');
if (idx >= 0) console.log('Contexto:', c.slice(idx, idx + 20));
