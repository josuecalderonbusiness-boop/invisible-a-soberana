/**
 * Fix mojibake: UTF-8 bytes were mis-read as Windows-1252 and re-saved as UTF-8.
 * This reverses that process (handles single and double corruption).
 */
const fs = require('fs');

// Windows-1252 special range 0x80-0x9F -> Unicode codepoints
const WIN1252 = {
  0x80:0x20AC, 0x82:0x201A, 0x83:0x0192, 0x84:0x201E, 0x85:0x2026,
  0x86:0x2020, 0x87:0x2021, 0x88:0x02C6, 0x89:0x2030, 0x8A:0x0160,
  0x8B:0x2039, 0x8C:0x0152, 0x8E:0x017D, 0x91:0x2018, 0x92:0x2019,
  0x93:0x201C, 0x94:0x201D, 0x95:0x2022, 0x96:0x2013, 0x97:0x2014,
  0x98:0x02DC, 0x99:0x2122, 0x9A:0x0161, 0x9B:0x203A, 0x9C:0x0153,
  0x9E:0x017E, 0x9F:0x0178
};

// Reverse: Unicode codepoint -> Windows-1252 byte
const WIN1252_REV = {};
for (const [b, u] of Object.entries(WIN1252)) WIN1252_REV[u] = parseInt(b);

// Convert a string to Windows-1252 bytes (returns null if any char is unmappable)
function toBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code in WIN1252_REV) {
      bytes.push(WIN1252_REV[code]);
    } else if (code <= 0xFF) {
      bytes.push(code);
    } else {
      return null;
    }
  }
  return Buffer.from(bytes);
}

// Try to un-mojibake a string once
function tryFix(str) {
  const bytes = toBytes(str);
  if (!bytes) return null;
  const decoded = bytes.toString('utf8');
  if (decoded.includes('\uFFFD')) return null;
  return decoded;
}

let content = fs.readFileSync('public/workbook/index.html', 'utf8');
let result = '';
let total = 0;
let i = 0;

while (i < content.length) {
  const code = content.charCodeAt(i);

  if (code > 0x7F) {
    // Collect contiguous non-ASCII chars that can map to Win-1252 bytes
    let j = i;
    let seq = '';
    while (j < content.length) {
      const c = content.charCodeAt(j);
      if (c <= 0x7F) break;
      if (c > 0xFF && !(c in WIN1252_REV)) break;
      seq += content[j];
      j++;
    }

    if (seq.length >= 2) {
      let fixed = tryFix(seq);
      if (fixed !== null && fixed !== seq) {
        // Try a second pass (double-corrupted sequences)
        const fixed2 = tryFix(fixed);
        if (fixed2 !== null && fixed2 !== fixed) fixed = fixed2;

        const before = [...seq].filter(c => c.charCodeAt(0) > 0x7F).length;
        const after  = [...fixed].filter(c => c.charCodeAt(0) > 0x7F).length;

        if (after < before) {
          result += fixed;
          total += before - after;
          i = j;
          continue;
        }
      }
    }
  }

  result += content[i];
  i++;
}

fs.writeFileSync('public/workbook/index.html', result, 'utf8');
console.log('Total chars fixed:', total);
