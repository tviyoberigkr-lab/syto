// Syto — сталий словник пояснень: скорочення, які редакції пишуть без розшифрування.
// Нащо: пояснення від ШІ приходять разом із перекладом, тому в новинах УКРАЇНСЬКИХ редакцій їх не було зовсім —
// а саме там трапляються «— NYT», «за даними AFP». Цей словник працює для всіх новин, нічого не коштує
// і нічого не вигадує: пояснення написані вручну (25.11.2026, прохання Романа).
// Правила для нових записів: пояснення — одне нейтральне речення, починається з терміна, без оцінок;
// загальновідомі скорочення (BBC, CNN, ООН, НАТО, ЄС, США, ЗСУ) не пояснюємо.
// CoLaba Production

export const MAX_STATIC = 2; // не більше двох сталих пояснень на один текст
export const MAX_GLOSS_TOTAL = 3; // разом із поясненнями від ШІ

/** Терміни шукаються з урахуванням регістру й меж слова, тож «AP» не спрацює всередині «APPLE». */
export const STATIC_GLOSS = [
  { w: 'NYT', e: 'NYT — скорочення від The New York Times, щоденної газети зі Сполучених Штатів.' },
  { w: 'WSJ', e: 'WSJ — скорочення від The Wall Street Journal, американської ділової газети.' },
  { w: 'WP', e: 'WP — скорочення від The Washington Post, щоденної газети зі Сполучених Штатів.' },
  { w: 'FT', e: 'FT — скорочення від Financial Times, британської ділової газети.' },
  { w: 'AFP', e: 'AFP — Agence France-Presse, французьке інформаційне агентство.' },
  { w: 'AP', e: 'AP — Associated Press, американське інформаційне агентство.' },
  { w: 'SCMP', e: 'SCMP — South China Morning Post, англомовна газета з Гонконгу.' },
  { w: 'DW', e: 'DW — Deutsche Welle, німецька міжнародна телерадіокомпанія.' },
  { w: 'NBC', e: 'NBC — американська телемережа й новинна служба.' },
  { w: 'CBS', e: 'CBS — американська телемережа й новинна служба.' },
  { w: 'Reuters', e: 'Reuters — британське інформаційне агентство, одне з найбільших у світі.' },
  { w: 'Bloomberg', e: 'Bloomberg — американське агентство ділових і фінансових новин.' },
  { w: 'Politico', e: 'Politico — американсько-європейське видання про політику.' },
  { w: 'Axios', e: 'Axios — американське новинне видання, відоме короткими матеріалами.' },
  { w: 'ВАКС', e: 'ВАКС — Вищий антикорупційний суд України.' },
  { w: 'БЕБ', e: 'БЕБ — Бюро економічної безпеки України.' },
  { w: 'МАГАТЕ', e: 'МАГАТЕ — Міжнародне агентство з атомної енергії при ООН.' },
  { w: 'ATACMS', e: 'ATACMS — американські тактичні балістичні ракети для пускових установок HIMARS і M270.' },
  // перший щотижневий прохід, 25.11.2026: найчастіші кандидати зі збору
  { w: 'НПЗ', e: 'НПЗ — нафтопереробний завод, підприємство, що переробляє нафту на пальне.' },
  { w: 'ОВА', e: 'ОВА — обласна військова адміністрація, обласна влада на час воєнного стану.' },
  { w: 'УЄФА', e: 'УЄФА — Союз європейських футбольних асоціацій, що проводить клубні турніри й чемпіонати Європи.' },
  { w: 'BYD', e: 'BYD — китайський виробник електромобілів і акумуляторів.' },
  { w: 'GTA', e: 'GTA — Grand Theft Auto, серія відеоігор компанії Rockstar Games.' },
];

const bounded = (w) => new RegExp('(?<![\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u');
const RE = new Map(STATIC_GLOSS.map((g) => [g.w, bounded(g.w)]));

/**
 * Збирає пояснення для тексту: спершу сталі зі словника (їх писала людина, тому вони головні), потім ті
 * пояснення ШІ, які не накладаються на вже взяті слова. Повертає масив [{w, e, s?}] — або порожній.
 * s: 1 означає «зі словника»: інтерфейс не підписує такі пояснення як машинні.
 */
export function withStaticGloss(text, aiGloss) {
  const t = String(text ?? '');
  const ai = Array.isArray(aiGloss) ? aiGloss.filter((g) => g && typeof g.w === 'string' && typeof g.e === 'string') : [];
  if (!t) return ai.slice(0, MAX_GLOSS_TOTAL);
  const out = [];
  for (const g of STATIC_GLOSS) {
    if (out.length >= MAX_STATIC) break;
    if (!RE.get(g.w).test(t)) continue;
    out.push({ ...g, s: 1 });
  }
  for (const g of ai) {
    if (out.length >= MAX_GLOSS_TOTAL) break;
    if (out.some((o) => o.w === g.w || o.w.includes(g.w) || g.w.includes(o.w))) continue; // словник має перевагу
    out.push(g);
  }
  return out;
}

// ---------- збір кандидатів у словник ----------
// Нащо: словник має рости сам по собі, а не тоді, коли хтось випадково помітить незрозуміле скорочення.
// Конвеєр кожного запуску рахує скорочення із заголовків, яких у словнику ще немає, і складає їх у
// data/abbr_candidates.json. Пояснення туди НЕ пишуться автоматично — їх щотижня додає Клод руками,
// щоб у постійний словник не потрапила вигадка моделі.
const KNOWN = new Set(STATIC_GLOSS.map((g) => g.w));
/** Скорочення, зрозумілі без пояснення: у кандидати не беремо. */
export const COMMON_ABBR = new Set((
  'BBC CNN BMW UN EU USA US UK NATO WHO NASA FBI CIA USD EUR GDP CEO IT AI VPN SMS GPS USB TV DNA PCR UFC NBA NFL NHL MLB UEFA FIFA ' +
  'ООН НАТО ЄС США СРСР СНД ЗСУ СБУ ГУР МВС МОЗ МЗС ДСНС ТЦК ППО РФ РБ КНР КНДР ОАЕ ЄСПЛ МВФ ВООЗ ДТП ЗМІ ІТ ШІ ВВП ПДВ ФОП ТОВ ЖКГ ЦРУ ФБР БПЛА ЗРК ГЕС АЕС ТЕС ЛЕП ' +
  'ОРДЛО ОТГ ЦНАП ЦПК НАБУ САП ДБР ЗНО НМТ УПЦ ПЦУ СІЗО ХАМАС БМВ'
).split(' '));

const ABBR_RE = /(?<![\p{L}\p{N}])(?:[A-Z][A-Z&-]{1,5}|[А-ЯЄІЇҐ][А-ЯЄІЇҐ-]{1,5})(?![\p{L}\p{N}])/gu;

/** Скорочення з одного тексту: лише ті, яких немає у словнику й у списку загальновідомих. */
export function abbrOf(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(ABBR_RE)) {
    const w = m[0].replace(/^[-]+|[-]+$/g, '');
    if (w.length < 2 || KNOWN.has(w) || COMMON_ABBR.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

export const CANDIDATE_KEEP_DAYS = 45; // кандидат, що не траплявся півтора місяця, випадає зі списку
export const CANDIDATE_LIMIT = 120;

/**
 * Оновлює список кандидатів. prev — вміст data/abbr_candidates.json (або {}), items — повідомлення випуску.
 * n — у скількох новинах ЦЬОГО випуску трапилося скорочення, peak — найбільше таке число за історію
 * (за ним і сортуємо). Накопичувальний лічильник тут не годиться: новини живуть у сховищі дві доби й
 * потрапляють у кілька випусків поспіль, тому сума за випусками завищувала б частоту в кілька разів.
 * Повертає { updated, items: [{ w, n, peak, firstSeen, lastSeen, sample }] }, найчастіші згори.
 */
export function mergeAbbrCandidates(prev, items, now = Date.now()) {
  const by = new Map();
  for (const c of prev?.items ?? []) {
    if (c && typeof c.w === 'string' && typeof c.lastSeen === 'number' && now - c.lastSeen <= CANDIDATE_KEEP_DAYS * 86400e3 && !KNOWN.has(c.w) && !COMMON_ABBR.has(c.w)) {
      by.set(c.w, { ...c, n: 0, peak: Number(c.peak) || Number(c.n) || 0 });
    }
  }
  const seenNow = new Set();
  for (const it of items ?? []) {
    const title = it?.titleUk || it?.title || '';
    for (const w of abbrOf(title)) {
      const key = w + '\u0000' + (it.id ?? title);
      if (seenNow.has(key)) continue;            // одна новина рахується один раз
      seenNow.add(key);
      const c = by.get(w);
      if (c) { c.n++; c.peak = Math.max(c.peak ?? 0, c.n); c.lastSeen = now; if (!c.sample) c.sample = title.slice(0, 120); }
      else by.set(w, { w, n: 1, peak: 1, firstSeen: now, lastSeen: now, sample: title.slice(0, 120) });
    }
  }
  const list = [...by.values()].sort((a, b) => (b.peak - a.peak) || (b.n - a.n) || a.w.localeCompare(b.w)).slice(0, CANDIDATE_LIMIT);
  return { updated: new Date(now).toISOString(), items: list };
}
