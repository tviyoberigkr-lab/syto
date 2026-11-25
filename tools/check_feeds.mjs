// Syto — перевірка стрічок: чи відповідає адреса, чи це RSS/Atom/RDF, скільки записів і яка дата найсвіжішого.
// Запуск: node tools/check_feeds.mjs [адреса …]      — перевірити вказані адреси;
//         node tools/check_feeds.mjs                  — усі стрічки з sources.json (і вимкнені теж) плюс tools/feed_candidates.txt.
// У GitHub Actions — workflow «Перевірка стрічок» (кнопка Run workflow): важливо перевіряти саме звідти, бо деякі сайти
// відмовляють запитам із GitHub (403), хоча з комп'ютера відкриваються. Нічого не записує, лише друкує таблицю.
// CoLaba Production
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, cleanText } from '../pipeline/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (compatible; SytoNewsBot/1.0; +https://tviyoberigkr-lab.github.io/syto/)';

async function check(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const ms = Date.now() - t0;
    if (!res.ok) return { url, ok: false, why: `HTTP ${res.status}`, ms };
    const xml = await res.text();
    let raw;
    try { raw = parseFeed(xml); } catch (e) { return { url, ok: false, why: `не стрічка: ${e.message} (${res.headers.get('content-type') ?? '?'})`, ms }; }
    const dates = raw.map((r) => Date.parse(r.date)).filter(Number.isFinite);
    const newest = dates.length ? new Date(Math.max(...dates)) : null;
    const ageH = newest ? Math.round((Date.now() - newest) / 3600e3) : null;
    const fresh = ageH !== null && ageH <= 72;
    return { url, ok: fresh, why: fresh ? '' : newest ? `найсвіжіший запис ${ageH} год тому` : 'у записах немає дат', items: raw.length, newest: newest?.toISOString().slice(0, 16), ms, sample: raw.slice(0, 3).map((r) => cleanText(r.title, 80)).join(' ⟋ ') };
  } catch (e) {
    return { url, ok: false, why: String(e?.cause?.code ?? e.message).slice(0, 80), ms: Date.now() - t0 };
  }
}

const urls = process.argv.slice(2);
if (!urls.length) {
  const src = JSON.parse(await readFile(resolve(ROOT, 'sources.json'), 'utf8')).sources;
  for (const s of src) urls.push(s.feed);
  try {
    for (const line of (await readFile(resolve(ROOT, 'tools/feed_candidates.txt'), 'utf8')).split('\n')) {
      const u = line.trim();
      if (u && !u.startsWith('#') && !urls.includes(u)) urls.push(u);
    }
  } catch { /* файла кандидатів може не бути */ }
}
const results = await Promise.all(urls.map(check));
let okN = 0;
for (const r of results) {
  if (r.ok) okN++;
  console.log(`${r.ok ? '✔' : '✗'} ${r.url}\n    ${r.ok ? `${r.items} записів, найсвіжіший ${r.newest}, ${r.ms} мс — ${r.sample}` : r.why + ` (${r.ms} мс)`}`);
}
console.log(`\nПрацює ${okN} з ${results.length}.`);
