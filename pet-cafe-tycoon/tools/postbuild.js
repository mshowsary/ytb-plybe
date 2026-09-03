import fs from 'node:fs'; import path from 'node:path';
const dist = path.resolve('dist');
const SDK = 'https://www.youtube.com/game_api/v1';
const FORBID = ['new WebAssembly', 'WebAssembly.instantiate', 'new Worker(', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'visibilitychange', 'navigator.language'];
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
const bad = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8'); const rel = path.relative(dist, f).split(path.sep).join('/');
  if (!/^[A-Za-z0-9_.\-\/]+$/.test(rel)) bad.push('bad filename ' + rel);
  for (const t of FORBID) if (s.includes(t)) bad.push(rel + ' contains ' + t);
  const urls = [...s.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[0]).filter(u => u !== SDK && !u.startsWith('http://www.w3.org/') && !u.startsWith('https://jcgt.org/'));
  if (urls.length) bad.push(rel + ' external urls ' + [...new Set(urls)].join(','));
  if (s.length > 30 * 1024 * 1024) bad.push(rel + ' over 30 MiB');
  if (s.length > 512 * 1024) console.warn('warn: ' + rel + ' is ' + (s.length / 1024 | 0) + ' KB (>512 KB SHOULD)');
}
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const ext = [...html.matchAll(/<script[^>]*src="(https?:[^"]+)"/g)].map(m => m[1]);
if (ext.length !== 1 || ext[0] !== SDK) bad.push('expected exactly one external script (the SDK), got ' + ext.join(','));
if (html.indexOf(SDK) > html.indexOf('type="module"')) bad.push('SDK script must come before game code');
if (bad.length) { console.error('POSTBUILD FAILED:\n' + bad.join('\n')); process.exit(1); }
const total = files.reduce((a, f) => a + fs.statSync(f).size, 0);
console.log('postbuild OK: ' + files.length + ' files, ' + (total / 1024 | 0) + ' KB total');
