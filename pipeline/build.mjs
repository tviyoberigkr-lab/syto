// Syto — збирає стрічки, просіює і пише site/data/news.json.
// Запуск: node pipeline/build.mjs   (у GitHub Actions — автоматично)
// CoLaba Production
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, normalizeItems, assemble, WINDOW_HOURS } from './lib.mjs';
import { translateItems, pickProvider } from './translate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (compatible; SytoNewsBot/1.0; +https://tviyoberigkr-lab.github.io/syto/)';

async function fetchFeed(url, fetchImpl, timeoutMs, retryPauseMs = 0) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        redirect: 'follow', signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8e6) throw new Error('стрічка завелика');
      // кодування: із заголовка відповіді або з XML-декларації; за замовчуванням utf-8
      const head = buf.subarray(0, 200).toString('latin1');
      const enc = (res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] || head.match(/encoding=["']([\w-]+)["']/i)?.[1] || 'utf-8').toLowerCase();
      try { return new TextDecoder(enc).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
    } catch (e) { lastErr = e; if (attempt === 0 && retryPauseMs) await new Promise((r) => setTimeout(r, retryPauseMs)); }
  }
  throw lastErr;
}

export async function build({
  sourcesPath = resolve(ROOT, 'sources.json'),
  outPath = resolve(ROOT, 'site/data/news.json'),
  cachePath = resolve(ROOT, 'data/translations.json'),
  storePath = resolve(ROOT, 'data/items.json'),
  retryPauseMs = 5000,
  env = process.env, fetchImpl = fetch, now = Date.now(), timeoutMs = 20000, log = console.log,
} = {}) {
  const sources = JSON.parse(await readFile(sourcesPath, 'utf8')).sources.filter((s) => s.enabled !== false);
  const health = [];
  const all = [];
  const results = await Promise.allSettled(sources.map(async (s) => {
    const xml = await fetchFeed(s.feed, fetchImpl, timeoutMs, retryPauseMs);
    return normalizeItems(parseFeed(xml), s, now);
  }));
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') {
      all.push(...r.value.items);
      health.push({ id: s.id, name: s.name, ok: true, items: r.value.items.length, dropped: r.value.dropped });
    } else {
      health.push({ id: s.id, name: s.name, ok: false, items: 0, error: String(r.reason?.message ?? r.reason).slice(0, 140) });
    }
  });

  // однакове посилання з двох стрічок одного видання — один запис
  const byId = new Map();
  // Сховище повідомлень за останні 48 год: якщо стрічка цього разу не відповіла (Суспільне відмовляє
  // GitHub через раз) або вже витіснила запис новішими, він не зникає зі стрічки Syto.
  let kept = 0;
  try {
    const active = new Set(sources.map((s) => s.id));
    for (const it of JSON.parse(await readFile(storePath, 'utf8'))) {
      if (it && active.has(it.src) && typeof it.ts === 'number' && now - it.ts <= WINDOW_HOURS * 3600e3 && it.ts <= now) byId.set(it.id, it);
    }
    kept = byId.size;
  } catch { /* першого разу сховища ще немає */ }
  for (const it of all) byId.set(it.id, it); // свіже з мережі має перевагу
  const items = [...byId.values()];
  const storeSnapshot = JSON.stringify(items.map(({ id, title, url, ts, summary, src, lang }) => ({ id, title, url, ts, summary, src, lang })));

  let cache = {};
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')); } catch { /* першого разу кешу ще немає */ }
  const tr = await translateItems(items, cache, { provider: pickProvider(env), maxNew: env.TRANSLATE_MAX_NEW === undefined || env.TRANSLATE_MAX_NEW === '' ? 400 : Number(env.TRANSLATE_MAX_NEW), fetchImpl, now });
  for (const it of items) it.cmp = it.titleUk || it.title;

  const { tabs, stories } = assemble(items, sources, now);
  const okFeeds = health.filter((h) => h.ok).length;
  const data = {
    generatedAt: new Date(now).toISOString(),
    stats: { feedsOk: okFeeds, feedsTotal: sources.length, items: items.length, stories: stories.length, translation: { provider: tr.provider, translated: tr.translated, fromCache: tr.fromCache, failed: tr.failed, pending: tr.skipped } },
    sources: sources.map(({ id, name, type, lang, country, cat, trust, group }) => ({ id, name, type, lang, country, cat, trust, ...(group ? { group } : {}) })),
    health, tabs, stories,
  };

  // Запобіжник: якщо впали майже всі стрічки — не затираємо робочий файл порожнім.
  if (okFeeds < Math.max(1, Math.ceil(sources.length * 0.25))) {
    log(`ЗУПИНЕНО: працює лише ${okFeeds} з ${sources.length} стрічок — попередній news.json збережено.`);
    for (const h of health.filter((x) => !x.ok)) log(`  ✗ ${h.name}: ${h.error}`);
    return { written: false, data };
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath + '.tmp', JSON.stringify(data));
  await rename(outPath + '.tmp', outPath);
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache));
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, storeSnapshot);

  log(`Готово: ${stories.length} новин із ${items.length} повідомлень (свіжих із мережі ${all.length}, зі сховища ${kept}); стрічок працює ${okFeeds}/${sources.length}.`);
  log(`Переклад: ${tr.provider ?? 'вимкнено (немає ключа)'}; нових ${tr.translated}, з кешу ${tr.fromCache}, помилок ${tr.failed}, у черзі ${tr.skipped}.`);
  if (tr.usage.calls) log(`Токени перекладу (${tr.model}): запитів ${tr.usage.calls}, вхід ${tr.usage.input}, вихід ${tr.usage.output} (з них на міркування ${tr.usage.thinking}).`);
  if (tr.rejected) log(`  переклад: відхилено перевіркою правдоподібності ${tr.rejected} — лишились в оригіналі.`);
  for (const n of tr.notes) log(`  УВАГА: ${n}`);
  for (const e of tr.errors.slice(0, 3)) log(`  переклад: ${e}`);
  for (const h of health.filter((x) => !x.ok)) log(`  ✗ ${h.name}: ${h.error}`);
  return { written: true, data };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().then((r) => { if (!r.written) process.exitCode = 1; }).catch((e) => { console.error(e); process.exitCode = 1; });
}
