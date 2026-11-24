// Syto — чисті функції конвеєра (без мережі й диска, щоб їх можна було тестувати).
// CoLaba Production
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';

export const WINDOW_HOURS = 48;        // новини старші за це не показуємо
export const FAKES_WINDOW_HOURS = 168;  // спростування виходять рідше й лишаються актуальними довше — тиждень
export const windowFor = (source) => (source?.cat === 'fakes' ? FAKES_WINDOW_HOURS : WINDOW_HOURS);
export const CLUSTER_GAP_HOURS = 36;   // максимум між двома повідомленнями про одну подію
export const SIM_THRESHOLD = 0.5;      // поріг схожості заголовків
export const PER_FEED_LIMIT = 30;      // беремо не більше N найсвіжіших з кожної стрічки
export const MAX_RAW_ITEMS = 300;      // більше сирих записів з однієї стрічки не розбираємо
export const PER_TAB_LIMIT = 80;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  // Сутності (&amp; &#8217; …) розкодовуємо самі в cleanText/decodeEntities: вбудований
  // розбір має ліміт 1000 сутностей на документ і падав на великих стрічках (NV, The Guardian).
  processEntities: false,
  htmlEntities: false,
});

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return text(node['#text'] ?? node['__cdata'] ?? '');
  return '';
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

// Очищення працює за лінійний час. Попередні вирази (<script[\s\S]*?…>) були квадратичними:
// один запис на сотні кілобайт із «<» зупиняв усю збірку (аудит безпеки 21.11).
const MAX_RAW = 20000; // сирий текст одного поля; далі однаково ріжемо до 220/240 знаків
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
function dropBlocks(s, tag) {
  const low = s.toLowerCase();
  let out = '', pos = 0;
  for (;;) {
    const a = low.indexOf('<' + tag, pos);
    if (a < 0) break;
    const b = low.indexOf('</' + tag, a);
    out += s.slice(pos, a) + ' ';
    if (b < 0) { pos = s.length; break; }
    pos = b;
  }
  return out + s.slice(pos);
}
const stripTags = (s) => s.replace(/<[^<>]*>/g, ' ');

// Рекламні вставки, які деякі видання кладуть прямо в опис новини.
const PROMO = /\b(?:Get|Sign up for) our [\w\s-]{0,40}?\b(?:email|newsletter)\b[^.…]{0,120}?\b(?:daily news podcast|podcast|newsletter)\b\.?/gi;

export function cleanText(s, max = 0) {
  let t = String(s ?? '').slice(0, MAX_RAW);
  t = stripTags(dropBlocks(dropBlocks(t, 'script'), 'style'));
  t = stripTags(dropBlocks(decodeEntities(decodeEntities(t)), 'script')); // теги, що були закодовані сутностями
  t = t.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(PROMO, ' ').replace(/\s+/g, ' ').trim(); // рекламні вставки видань (The Guardian тощо)
  if (max && t.length > max) {
    t = t.slice(0, max);
    const cut = t.lastIndexOf(' ');
    t = (cut > max * 0.6 ? t.slice(0, cut) : t).replace(/[,;:.\-–—\s]+$/, '') + '…';
  }
  return t;
}
function safeCp(n) {
  try { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' '; } catch { return ' '; }
}

export function safeUrl(u) {
  try {
    const raw = decodeEntities(String(u ?? '').slice(0, 4000)).trim();
    if (raw.length > 2000) return '';                                        // наддовга адреса
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';                             // https://bbc.com@evil.example/ — підміна
    return url.toString();
  } catch { return ''; }
}

function atomLink(entry) {
  const links = arr(entry.link);
  const pick = links.find((l) => typeof l === 'object' && (l['@_rel'] ?? 'alternate') === 'alternate') ?? links[0];
  if (pick == null) return '';
  return typeof pick === 'string' ? pick : pick['@_href'] ?? text(pick);
}

/** Розбирає RSS 2.0, Atom і RDF. Повертає сирі записи {title, link, summary, date}. */
export function parseFeed(xml) {
  const doc = parser.parse(String(xml));
  let raw = [];
  if (doc?.rss?.channel) {
    raw = arr(doc.rss.channel.item).map((i) => ({
      title: text(i.title), link: text(i.link) || text(i.guid),
      summary: text(i.description), date: text(i.pubDate) || text(i['dc:date']),
    }));
  } else if (doc?.feed) {
    raw = arr(doc.feed.entry).map((e) => ({
      title: text(e.title), link: atomLink(e),
      summary: text(e.summary) || text(e.content), date: text(e.published) || text(e.updated),
    }));
  } else if (doc?.['rdf:RDF']) {
    raw = arr(doc['rdf:RDF'].item).map((i) => ({
      title: text(i.title), link: text(i.link),
      summary: text(i.description), date: text(i['dc:date']) || text(i.pubDate),
    }));
  } else {
    throw new Error('Невідомий формат стрічки (не RSS/Atom/RDF)');
  }
  return raw;
}

/** Нормалізує записи однієї стрічки: чистить, відкидає биті, старі й із майбутнього. */
export function normalizeItems(raw, source, now = Date.now()) {
  const out = [];
  let dropped = 0;
  for (const r of raw.slice(0, MAX_RAW_ITEMS)) {
    const title = cleanText(r.title, 220);
    const url = safeUrl(r.link);
    const ts = Date.parse(r.date);
    const age = (now - ts) / 3600e3;
    if (!title || title.length < 8 || !url || !Number.isFinite(ts) || age > windowFor(source) || age < -1) { dropped++; continue; }
    out.push({
      id: createHash('sha1').update(url).digest('hex').slice(0, 12),
      title, url, ts: Math.min(ts, now),
      summary: cleanText(r.summary, 240),
      src: source.id, lang: source.lang,
    });
  }
  out.sort((a, b) => b.ts - a.ts);
  return { items: out.slice(0, PER_FEED_LIMIT), dropped };
}

// ---------- схожість заголовків ----------
const STOP = new Set(('і й та в у на з із зі до по за від для про що як це не але чи або а при під над між через після перед також вже ще буде були було був є його її їх який яка які яке ' +
  'и в во на с со к по за от для о об что как это не но или а при под над между через после перед также уже еще будет были было был его ее их который которая которые ' +
  'the a an of in on at to for and or but is are was were be been has have had with by from as that this it its not after before over into than says said say new').split(' '));

export function stems(title) {
  const words = String(title).toLowerCase().replace(/[’'`ʼ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const set = new Set();
  for (const w of words) {
    if (STOP.has(w)) continue;
    if (/^\d+$/.test(w)) { set.add(w); continue; }
    if (w.length < 3) continue;
    set.add(w.length > 5 ? w.slice(0, 5) : w);
  }
  return set;
}

export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// ---------- крикливі заголовки ----------
const CLICKBAIT = [
  /шок(?:ува|ую|ова|\b)/i, /сенсаці/i, /ви не повірите/i, /вы не поверите/i, /терміново[!:]/i, /срочно[!:]/i,
  /!{2,}/, /\?!/, /ось що (?:сталося|буде)/i, /вот что (?:случилось|будет)/i, /you won'?t believe/i, /shocking/i,
  /цього ніхто не чекав/i, /розірвал[аио] мережу/i, /взорвал[аио]? сеть/i,
];
export function isClickbait(title) {
  const t = String(title);
  if (CLICKBAIT.some((re) => re.test(t))) return true;
  const letters = t.replace(/[^\p{L}]/gu, '');
  const upper = letters.replace(/[^\p{Lu}]/gu, '');
  return letters.length >= 20 && upper.length / letters.length > 0.6;
}

// ---------- технології та ШІ ----------
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const TECH_RE = new RegExp(
  '(?:штучн\\S* інтелект|искусственн\\S* интеллект|artificial intelligence|нейромереж|нейросет|chatgpt|openai|anthropic|deepmind|nvidia|' +
  'чат-?бот|chatbot|робототехн|humanoid|квантов|quantum|semiconductor|напівпровідник|полупроводник|кібер|cyber|стартап|startup|' +
  B + '(?:ШІ|ИИ|AI|LLM|claude|gemini|robots?|чип(?:и|ів|ов|а)?)' + E + ')', 'iu');
export const isTech = (title) => TECH_RE.test(String(title));

// ---------- «Україна» чи «Світ»: за ЗМІСТОМ новини, а не за тим, яке видання її написало ----------
// Правило Романа (23.11.2026): у розділі «Україна» — новини про Україну, у «Світі» — решта світу.
// Порядок рішення (topicOf):
//   1) ознака України в ЗАГОЛОВКУ (країна, міста, області, фронт, українські органи влади й посадовці) → «Україна»;
//   2) ознака України лише в описі, а в заголовку немає іншої країни → «Україна»
//      (опис «…виступив у Києві» робить новину українською; згадка України в описі новини про Фінляндію — ні);
//   3) ознака іншої країни чи міжнародної структури → «Світ»;
//   4) новину дали ЛИШЕ українськомовні видання — внутрішня новина без назви країни («Уряд підвищив…») → «Україна»;
//      якщо її підхопили іноземні редакції (Meduza, BBC, …) без жодної ознаки України — вона про світ (Тайсон Ф'юрі);
//   5) решта → «Світ».
// Кличко свідомо не в списку: «бій із Володимиром Кличком» — новина про боксера-іноземця, а мер Кличко
// і так приходить із «Києвом» у тексті.
// Шукаємо в заголовках і коротких описах усіх повідомлень кластера — в оригіналі й у перекладі.
const w = (alts) => B + '(?:' + alts + ')';
// Без урахування регістру: основи, які не збігаються зі звичайними словами.
const UA_CI = new RegExp(w(
  'україн|ukrain|украин|київ|києв|kyiv|kiev|киев|харків|харков|kharkiv|харьков|одес|odesa|odessa|' +
  'львів|львов[іау]|lviv|дніпр|dnipro|днепр|запоріж|запорож|zaporiz|херсон|kherson|миколаїв|миколаєв|mykolaiv|' +
  'чернігів|чернігов|chernihiv|полтав|poltava|житомир|zhytomyr|вінниц|vinnyts|черкас|кропивницьк|хмельниччин|хмельницьк(?:ій|ого|ому)? област|' +
  'тернопіл|франківськ|ужгород|чернівц|луцьк|донецьк|донеччин|donetsk|луганськ|луганщин|luhansk|маріупол|mariupol|бахмут|bakhmut|' +
  'покровськ|pokrovsk|краматорськ|слов.янськ|костянтинівк|гуляйпол|куп.янськ|kupiansk|ірпін|бровар(?:и|ах|ів)' + E + '|біл(?:а|ої|ій|у) церкв|' +
  'крим(?:у|ом|і|ськ\\p{L}*)?' + E + '|crimea|крым(?![\\p{L}])|крымск|севастопол|донбас|donbas|' +
  'київщин|харківщин|одещин|сумщин|сумськ|чернігівщин|полтавщин|житомирщин|вінниччин|черкащин|кіровоградщин|рівненщин|волин|' +
  'тернопільщин|львівщин|закарпатт|буковин|прикарпатт|миколаївщин|херсонщин|запоріжж|дніпропетровщин|дніпровщин|слобожанщин|' +
  'зеленськ|зеленск|zelensk|сирськ|syrskyi|буданов|budanov|свириденк|svyrydenko|шмигал|стефанчук|сибіг|sybiha|умєров|umerov|' +
  'єрмак|yermak|арахамі|залужн|zaluzhn|порошенк|poroshenko|' +
  'сил(?:и|ам|ами|ах)? оборони|верховн\\p{L}* рад|нардеп|кабмін|нацбанк|міноборон\\p{L}* україн|укрзалізниц|нафтогаз|укренерго|енергоатом|' +
  'deepstate|гривн|окупант|обмін\\p{L}* полонен|шахед|shahed|росіяни (?:атакувал|вдарил)|' +
  'удар(?:у|и|ів|ом|ами)? (?:рф|росії)|атак(?:а|у|и|ою|ами)? (?:рф|росії)|рф атакувал|росія атакувал|росія вдарил|рф вдарил|' +
  '\\p{L}+(?:ському|цькому|івському) напрямку'), 'iu');
// З урахуванням регістру: абревіатури й назви, що в нижньому регістрі — звичайні слова (ізюм, буча, сап).
const UA_CS = new RegExp(w('ЗСУ|ВСУ|СБУ|ГУР|ДШВ|НАБУ|САП|ВАКС|ДБР|НАЗК|ОГП|ТЦК|ТСК|НБУ|ДСНС|ОВА|ОДА|МВА|КМВА|Ізюм|Буч[аіу]|Офіс\\p{L}* (?:президента|генпрокурора)') + E, 'u');
export const isAboutUkraine = (text) => UA_CI.test(String(text)) || UA_CS.test(String(text));

// Ознаки решти світу: країни, столиці, міжнародні структури, відомі лідери, найбільші іноземні компанії.
const WORLD_CI = new RegExp(w(
  'сша|америк|usa|вашингтон|трамп|байден|білий дім|білого дому|конгрес|сенат|демократ(?:и|ів|ам|ами)' + E + '|республіканц|палат\\p{L}* представників|' +
  'росі|россия|росій|российск|кремл|путін|путин|москв|москов|білорус|беларус|лукашенк|' +
  'китай|китаю|китає|китайськ|пекін|сі цзіньпін|тайван|гонконг|япон|корея|корей|кндр|індія|індій|пакистан|' +
  'ізраїл|израил|сектор\\p{L}* газ|палестин|хамас|іран|ирак|ірак|сирі[яїю]|сирійськ|ліван|туреччин|ердоган|саудів|катар|оае|ємен|' +
  'британ|лондон|англі|стармер|франці|францу|париж|макрон|німеччин|німецьк|берлін|мерц|італі|італій|рим[іу]?' + E + '|іспані|португал|' +
  'польщ|польськ|варшав|чехі|чеськ|словаччин|словацьк|угорщин|угорськ|орбан|румуні|молдов|балті|литв|латві|естоні|фінлянд|швеці|норвег|данія|данськ|' +
  'нідерланд|бельгі|австрі|швейцарі|греці|кіпр|сербі|грузі|вірмен|азербайдж|казахстан|таджикистан|узбекистан|киргиз|туркменістан|' +
  'канад|мексик|бразил|аргентин|венесуел|куб[аиі]|африк|єгипт|судан|нігері|ефіопі|австралі|нова зеланді|' +
  'європ|євросоюз|єврокоміс|(?:єс|нато|оон|g7|g20)' + E + '|' +
  '(?:nvidia|openai|google|apple|microsoft|meta|amazon|tesla)' + E + '|ілон\\p{L}* маск'), 'iu');
export const mentionsWorld = (text) => WORLD_CI.test(String(text));

/** 'ukraine' або 'world' для новини з кількох повідомлень. */
export function topicOf(msgs) {
  const join = (keys) => msgs.flatMap((m) => keys.map((k) => m[k])).filter(Boolean).join(' \n ');
  const titles = join(['title', 'titleUk']);
  const summaries = join(['summary', 'summaryUk']);
  if (isAboutUkraine(titles)) return 'ukraine';
  if (isAboutUkraine(summaries) && !mentionsWorld(titles)) return 'ukraine';
  if (mentionsWorld(titles + ' \n ' + summaries)) return 'world';
  const news = msgs.filter((m) => !m.source || m.source.cat !== 'tech');
  if (news.length && news.every((m) => m.lang === 'uk')) return 'ukraine';
  return 'world';
}

// ---------- кластеризація ----------
const INDEPENDENT_TYPES = new Set(['independent', 'public', 'exile']);

/**
 * Групує повідомлення про одну подію. items мають поле cmp — заголовок для порівняння
 * (український переклад, якщо він є, інакше оригінал).
 */
export function clusterItems(items) {
  const sorted = [...items].sort((a, b) => a.ts - b.ts);
  const clusters = [];
  for (const it of sorted) {
    const st = stems(it.cmp ?? it.title);
    let best = null, bestSim = 0;
    for (const c of clusters) {
      if (it.ts - c.lastTs > CLUSTER_GAP_HOURS * 3600e3) continue;
      if (c.members.some((m) => m.item.src === it.src)) continue; // одне джерело не підтверджує саме себе
      let s = 0;
      for (const m of c.members) s = Math.max(s, similarity(st, m.st));
      if (s > bestSim) { bestSim = s; best = c; }
    }
    if (best && bestSim >= SIM_THRESHOLD) {
      best.members.push({ item: it, st });
      best.lastTs = Math.max(best.lastTs, it.ts);
    } else {
      clusters.push({ members: [{ item: it, st }], lastTs: it.ts });
    }
  }
  return clusters.map((c) => c.members.map((m) => m.item));
}

/**
 * Пояснення термінів для картки: лише для перекладених текстів, які справді показуються.
 * Повертає {title?, summary?} або undefined, щоб у news.json поле було тільки там, де є терміни.
 */
function glossFor(titleGloss, summaryGloss) {
  const g = {};
  if (titleGloss?.length) g.title = titleGloss;
  if (summaryGloss?.length) g.summary = summaryGloss;
  return g.title || g.summary ? g : undefined;
}

/** Перетворює групу повідомлень на картку новини зі статусом підтвердження та оцінкою. */
export function buildStory(members, srcMap, now = Date.now()) {
  const withSrc = members.map((m) => ({ ...m, source: srcMap.get(m.src) })).filter((m) => m.source);
  // головне повідомлення: спершу незалежні, потім вищий рівень довіри, потім українською, потім раніше
  const lead = [...withSrc].sort((a, b) =>
    (INDEPENDENT_TYPES.has(b.source.type) - INDEPENDENT_TYPES.has(a.source.type)) ||
    (b.source.trust - a.source.trust) ||
    ((b.lang === 'uk') - (a.lang === 'uk')) ||
    (a.ts - b.ts))[0];
  // Підтвердження рахуються за редакційними групами: «Українська правда» + «Європейська правда» — це одне джерело, не два.
  const independent = new Set(withSrc.filter((m) => INDEPENDENT_TYPES.has(m.source.type)).map((m) => m.source.group || m.src));
  const stateOnly = independent.size === 0;
  const status = stateOnly ? 'state' : independent.size >= 2 ? 'confirmed' : 'single';
  const firstTs = Math.min(...withSrc.map((m) => m.ts));
  const lastTs = Math.max(...withSrc.map((m) => m.ts));
  const title = lead.titleUk || lead.title;
  const clickbait = isClickbait(lead.title);
  // «Україна» / «Світ» — за змістом (topicOf), а не за категорією видання; кожна новина рівно в одному з двох розділів.
  const srcCats = new Set(withSrc.map((m) => m.source.cat));
  const cats = new Set([...srcCats].filter((c) => c !== 'ukraine' && c !== 'world'));
  const topic = topicOf(withSrc);
  if (topic === 'ukraine' || srcCats.has('ukraine') || srcCats.has('world')) cats.add(topic);
  if (withSrc.some((m) => isTech(m.title) || (m.titleUk && isTech(m.titleUk)))) cats.add('tech');
  const ageH = Math.max(0, (now - lastTs) / 3600e3);
  const trustMax = Math.max(...withSrc.map((m) => m.source.trust));
  const score = Math.round(
    (status === 'confirmed' ? 30 + 8 * (Math.min(independent.size, 5) - 2) : 0) +
    trustMax * 5 - ageH * 1.5 - (clickbait ? 15 : 0) - (stateOnly ? 10 : 0));
  const gloss = glossFor(lead.titleUk && lead.titleGloss, lead.lang !== 'uk' && lead.summaryUk && lead.summaryGloss);
  return {
    id: lead.id, title,
    summary: lead.lang === 'uk' ? lead.summary : (lead.summaryUk || ''),
    ...(gloss ? { gloss } : {}),
    url: lead.url, ts: firstTs, lastTs,
    status, confirmations: independent.size, clickbait,
    translated: !!lead.titleUk,
    cats: [...cats], score,
    sources: withSrc.sort((a, b) => a.ts - b.ts).map((m) => ({
      id: m.src, name: m.source.name, type: m.source.type, lang: m.lang,
      url: m.url, title: m.title, ts: m.ts,
    })),
  };
}

export function assemble(items, sources, now = Date.now()) {
  const srcMap = new Map(sources.map((s) => [s.id, s]));
  const facts = items.filter((i) => srcMap.get(i.src)?.type === 'factcheck');
  const news = items.filter((i) => srcMap.get(i.src) && srcMap.get(i.src).type !== 'factcheck');
  const stories = clusterItems(news).map((g) => buildStory(g, srcMap, now));
  stories.sort((a, b) => b.score - a.score || b.lastTs - a.lastTs);
  const tabs = { ukraine: [], world: [], tech: [], fakes: [] };
  for (const s of stories) {
    for (const c of ['ukraine', 'world', 'tech']) {
      if (s.cats.includes(c) && tabs[c].length < PER_TAB_LIMIT) tabs[c].push(s.id);
    }
  }
  const fakeStories = facts.sort((a, b) => b.ts - a.ts).slice(0, PER_TAB_LIMIT).map((f) => {
    const s = srcMap.get(f.src);
    const gloss = glossFor(f.titleUk && f.titleGloss);
    return {
      id: f.id, title: f.titleUk || f.title, summary: f.summary, ...(gloss ? { gloss } : {}), url: f.url, ts: f.ts, lastTs: f.ts,
      status: 'factcheck', confirmations: 0, clickbait: false, translated: !!f.titleUk, cats: ['fakes'], score: 0,
      sources: [{ id: s.id, name: s.name, type: s.type, lang: f.lang, url: f.url, title: f.title, ts: f.ts }],
    };
  });
  tabs.fakes = fakeStories.map((f) => f.id);
  const used = new Set([...tabs.ukraine, ...tabs.world, ...tabs.tech]);
  return { tabs, stories: [...stories.filter((s) => used.has(s.id)), ...fakeStories] };
}
