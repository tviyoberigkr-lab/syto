// Syto — переклад заголовків українською через AI з кешем (кожен заголовок перекладається один раз).
// Працює лише коли заданий ключ. Без ключа конвеєр просто лишає оригінали.
// CoLaba Production
import { createHash } from 'node:crypto';

export const BATCH = 25;
const CONCURRENCY = 4;
const CACHE_DAYS = 10;

const key = (text) => createHash('sha1').update(text).digest('hex').slice(0, 16);

const PROMPT = (titles) =>
  'Ти — редактор української служби новин. Переклади українською мовою заголовки та короткі описи новин (кожен рядок масиву — окремий текст).\n' +
  'Правила:\n' +
  '1. Передавай ЗМІСТ, а не слова: текст має звучати так, як його написав би український журналіст. Жодної кальки.\n' +
  '2. Нічого не додавай і не прибирай: факти, цифри, імена, ступінь упевненості («може», «за даними», «ймовірно») — як в оригіналі.\n' +
  '3. Не пом’якшуй і не підсилюй тон. Не додавай оцінок.\n' +
  '4. Терміни та ідіоми перекладай за значенням. Якщо усталеного українського відповідника немає — коротко поясни суть. ' +
  'Приклади: «canary tokens / canaries» у кібербезпеці — «секрети-приманки» (не «канарки»); «plants» про дані — «підкидає», «розміщує» (не «засаджує»); ' +
  '«supply chain» — «ланцюг постачання»; «zero-day» — «вразливість нульового дня»; «whistleblower» — «викривач»; «breaking» — «терміново».\n' +
  '5. Власні назви — за чинним українським правописом; назви компаній і продуктів латинкою не перекладай (OpenAI, Claude, Gemini).\n' +
  '7. Не вгадуй стать людини: якщо в оригіналі її не видно (officer, chief, minister без імені), вживай загальну форму посади («директор», «керівник»), а не фемінітив.\n' +
  '6. Якщо заголовок неможливо зрозуміти без контексту — переклади якнайближче до тексту, нічого не вигадуй.\n' +
  'Поверни ТІЛЬКИ JSON-масив рядків тієї самої довжини й у тому ж порядку, без пояснень.\n\n' +
  JSON.stringify(titles);

export function parseReply(textReply, expected) {
  const m = String(textReply).match(/\[[\s\S]*\]/);
  if (!m) throw new Error('у відповіді немає JSON-масиву');
  const out = JSON.parse(m[0]);
  if (!Array.isArray(out) || out.length !== expected || out.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new Error(`очікував ${expected} рядків, отримав ${Array.isArray(out) ? out.length : 'не масив'}`);
  }
  return out.map((x) => x.trim().slice(0, 400));
}

async function callAnthropic(titles, { apiKey, model, fetchImpl, usage }) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: 'user', content: PROMPT(titles) }] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const j = await res.json();
  if (usage) { usage.calls++; usage.input += j?.usage?.input_tokens ?? 0; usage.output += j?.usage?.output_tokens ?? 0; }
  return j?.content?.map((c) => c.text ?? '').join('') ?? '';
}

async function callGemini(titles, { apiKey, model, fetchImpl, usage }) {
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(titles) }] }], generationConfig: { responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const j = await res.json();
  if (usage) { usage.calls++; usage.input += j?.usageMetadata?.promptTokenCount ?? 0; usage.output += j?.usageMetadata?.candidatesTokenCount ?? 0; }
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

export function pickProvider(env) {
  if (env.GEMINI_API_KEY) return { name: 'gemini', apiKey: env.GEMINI_API_KEY, model: env.TRANSLATE_MODEL || 'gemini-3.1-flash-lite', call: callGemini };
  if (env.ANTHROPIC_API_KEY) return { name: 'anthropic', apiKey: env.ANTHROPIC_API_KEY, model: env.TRANSLATE_MODEL || 'claude-haiku-5-5', call: callAnthropic };
  return null;
}

/**
 * Додає items[i].titleUk для неукраїнських заголовків.
 * cache: { [hash]: { t: переклад, ts: коли } } — змінюється на місці.
 * Повертає статистику. Помилка одного пакета не валить збірку: ці заголовки лишаються в оригіналі до наступного запуску.
 */
export async function translateItems(items, cache, { provider, maxNew = 400, fetchImpl = fetch, now = Date.now() } = {}) {
  const stats = { provider: provider?.name ?? null, model: provider?.model ?? null, fromCache: 0, translated: 0, failed: 0, skipped: 0, errors: [], usage: { calls: 0, input: 0, output: 0 } };
  const foreign = items.filter((i) => i.lang !== 'uk');
  // перекладаємо заголовок і короткий опис; спершу всі заголовки, потім описи — щоб при ліміті заголовки не лишалися без перекладу
  const fields = [['title', 'titleUk'], ['summary', 'summaryUk']];
  const todo = [];
  const seen = new Set();
  const apply = (count) => {
    for (const [src, dst] of fields) for (const it of foreign) {
      const text = it[src];
      if (!text || it[dst]) continue;
      const k = key(text);
      if (cache[k]) { it[dst] = cache[k].t; if (now - cache[k].ts > 86400e3) cache[k].ts = now; if (count) stats.fromCache++; }
      else if (count && !seen.has(k)) { seen.add(k); todo.push(text); }
    }
  };
  apply(true);
  if (provider) {
    const queue = todo.slice(0, maxNew);
    stats.skipped = todo.length - queue.length;
    const batches = [];
    for (let i = 0; i < queue.length; i += BATCH) batches.push(queue.slice(i, i + BATCH));
    // по 4 пакети одночасно: перший «наздоганяльний» запуск ішов 5,5 хв послідовно
    // Якщо пакет не вдався — ділимо навпіл і пробуємо частинами, щоб один «незручний» текст
    // не блокував решту 24. Текст, що не вдався й наодинці, лишається в оригіналі до наступного запуску.
    const run = async (batch) => {
      try {
        const reply = await provider.call(batch, { apiKey: provider.apiKey, model: provider.model, fetchImpl, usage: stats.usage });
        const out = parseReply(reply, batch.length);
        // o — оригінал: потрібен, щоб перевіряти якість перекладу проти джерела
        batch.forEach((t, j) => { cache[key(t)] = { t: out[j], o: t, ts: now }; });
        stats.translated += batch.length;
      } catch (e) {
        if (batch.length > 1 && !/HTTP (401|403|429|5\d\d)/.test(String(e.message))) {
          const mid = Math.ceil(batch.length / 2);
          await run(batch.slice(0, mid));
          await run(batch.slice(mid));
        } else {
          stats.failed += batch.length;
          stats.errors.push(String(e.message ?? e).slice(0, 160));
        }
      }
    };
    const worker = async () => { for (let batch; (batch = batches.shift());) await run(batch); };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    apply(false);
  } else {
    stats.skipped = todo.length;
  }
  for (const k of Object.keys(cache)) if (now - cache[k].ts > CACHE_DAYS * 86400e3) delete cache[k];
  return stats;
}
