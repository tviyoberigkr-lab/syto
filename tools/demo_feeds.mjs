// Демонстраційні стрічки з ВИГАДАНИМИ джерелами й подіями — для тестів і прототипу.
// Жодна з цих «новин» не є справжньою.
// CoLaba Production
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const demoSources = [
  { id: 'd-a', name: 'Демо-видання А', feed: 'https://demo.invalid/a.rss', lang: 'uk', country: 'UA', cat: 'ukraine', type: 'independent', trust: 3 },
  { id: 'd-b', name: 'Демо-видання Б', feed: 'https://demo.invalid/b.atom', lang: 'uk', country: 'UA', cat: 'ukraine', type: 'independent', trust: 3 },
  { id: 'd-pub', name: 'Демо-суспільний мовник', feed: 'https://demo.invalid/pub.rdf', lang: 'uk', country: 'UA', cat: 'ukraine', type: 'public', trust: 3 },
  { id: 'd-state', name: 'Демо-держагентство', feed: 'https://demo.invalid/state.rss', lang: 'uk', country: 'UA', cat: 'ukraine', type: 'state', trust: 2 },
  { id: 'd-w1', name: 'Demo World Daily', feed: 'https://demo.invalid/w1.rss', lang: 'en', country: 'GB', cat: 'world', type: 'independent', trust: 3 },
  { id: 'd-w2', name: 'Demo Global Post', feed: 'https://demo.invalid/w2.rss', lang: 'en', country: 'US', cat: 'world', type: 'independent', trust: 3 },
  { id: 'd-ex', name: 'Демо-видання у вигнанні', feed: 'https://demo.invalid/ex.rss', lang: 'ru', country: 'RU', cat: 'world', type: 'exile', trust: 2 },
  { id: 'd-wire', name: 'Demo State Wire', feed: 'https://demo.invalid/wire.rss', lang: 'en', country: 'CN', cat: 'world', type: 'state', trust: 1 },
  { id: 'd-tech', name: 'Demo Tech Review', feed: 'https://demo.invalid/tech.rss', lang: 'en', country: 'US', cat: 'tech', type: 'independent', trust: 3 },
  { id: 'd-tech2', name: 'Демо-техно', feed: 'https://demo.invalid/tech2.rss', lang: 'uk', country: 'UA', cat: 'tech', type: 'independent', trust: 2 },
  // тематична стрічка: рубрика береться з джерела, а іноземні описи в таких стрічках не перекладаються (titleOnly)
  { id: 'd-sport', name: 'Demo Sports Wire', feed: 'https://demo.invalid/sport.rss', lang: 'en', country: 'GB', cat: 'world', sub: 'sport', type: 'independent', trust: 2 },
  { id: 'd-garden', name: 'Демо-садиба', feed: 'https://demo.invalid/garden.rss', lang: 'uk', country: 'UA', cat: 'ukraine', sub: 'garden', type: 'independent', trust: 2 },
  { id: 'd-fc', name: 'Демо-фактчек', feed: 'https://demo.invalid/fc.rss', lang: 'uk', country: 'UA', cat: 'fakes', type: 'factcheck', trust: 3 },
  { id: 'd-broken', name: 'Демо: зламана стрічка', feed: 'https://demo.invalid/broken.rss', lang: 'uk', country: 'UA', cat: 'ukraine', type: 'independent', trust: 2 },
  { id: 'd-down', name: 'Демо: сайт лежить', feed: 'https://demo.invalid/down.rss', lang: 'uk', country: 'UA', cat: 'ukraine', type: 'independent', trust: 2 },
];

// Рубрики, які тестовий «класифікатор» дає українським заголовкам (решта — society).
export const demoClasses = {
  'Демо: в області запрацював новий маршрут приміської електрички': 'economy',
  'Демо: школи області переходять на новий розклад дзвінків': 'society',
};

// Словник для тестового «перекладача» (справжній переклад робить AI за ключем).
export const demoTranslations = {
  'Demo: island nation opens new undersea cable link': 'Демо: острівна держава відкрила нову підводну кабельну лінію',
  'Demo: new undersea cable link opens for island nation': 'Демо: нова підводна кабельна лінія відкрита для острівної держави',
  'Demo summary: the cable doubles internet capacity.': 'Демо-опис: кабель подвоює пропускну здатність інтернету.',
  'Demo: regional summit ends with trade agreement': 'Демо: регіональний саміт завершився торговельною угодою',
  'Демо: в городе Н открыли восстановленный мост через реку': 'Демо: у місті Н відкрили відбудований міст через річку',
  'Мост в Киевской области был разрушен в 2022 году.': 'Міст на Київщині зруйнували у 2022 році.',
  'Демо: независимые журналисты опубликовали расследование о закупках': 'Демо: незалежні журналісти оприлюднили розслідування про закупівлі',
  'Demo wire: officials praise record harvest figures': 'Демо: чиновники хвалять рекордні показники врожаю',
  'Demo lab unveils open AI model for weather forecasting': 'Демо: лабораторія представила відкриту модель ШІ для прогнозу погоди',
  'Demo: quantum chip sets new stability record': 'Демо: квантовий чип встановив новий рекорд стабільності',
  'Demo Sports: city club wins the cup final after extra time': 'Демо-спорт: міський клуб виграв фінал кубка в додатковий час',
  // Новий формат відповіді: переклад + терміни з поясненнями. Перший — термін уже в лапках (лапки не подвоюються),
  // другий — без лапок (інтерфейс додасть їх сам).
  'Demo: researcher plants 2 million canary tokens in AI supply chain': {
    t: 'Демо: дослідник підкинув у ланцюг постачання ШІ 2 мільйони «секретів-приманок»',
    g: [{ w: 'секретів-приманок', e: 'Секрети-приманки — мічені фальшиві дані, які підкидають у систему, щоб виявити витік.' }],
  },
  'Demo summary: the method can reveal a supply chain attack before it spreads.': {
    t: 'Демо-опис: так можна помітити атаку на ланцюг постачання ще до її поширення.',
    g: [{ w: 'атаку на ланцюг постачання', e: 'Атака на ланцюг постачання — злам не самої цілі, а сторонніх програм чи сервісів, якими вона користується.' }],
  },
};

const rss = (items, now) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>demo</title>${items.map((i) =>
  `<item><title>${i.rawTitle ?? esc(i.t)}</title><link>${esc(i.l)}</link><description><![CDATA[${i.d ?? ''}]]></description><pubDate>${new Date(now - i.h * 3600e3).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;

const atom = (items, now) => `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>demo</title>${items.map((i) =>
  `<entry><title type="html">${esc(i.t)}</title><link rel="alternate" href="${esc(i.l)}"/><link rel="self" href="https://demo.invalid/self"/><summary>${esc(i.d ?? '')}</summary><updated>${new Date(now - i.h * 3600e3).toISOString()}</updated></entry>`).join('')}</feed>`;

const rdf = (items, now) => `<?xml version="1.0" encoding="UTF-8"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns="http://purl.org/rss/1.0/"><channel><title>demo</title></channel>${items.map((i) =>
  `<item><title>${esc(i.t)}</title><link>${esc(i.l)}</link><description>${esc(i.d ?? '')}</description><dc:date>${new Date(now - i.h * 3600e3).toISOString()}</dc:date></item>`).join('')}</rdf:RDF>`;

/** Повертає Map: адреса стрічки -> {status, body(Buffer), contentType}. */
export function demoFeeds(now = Date.now()) {
  const u = (p) => `https://demo.invalid/news/${p}`;
  const m = new Map();
  const put = (url, body, contentType = 'application/rss+xml; charset=utf-8', status = 200) => m.set(url, { status, body: Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'), contentType });

  put('https://demo.invalid/a.rss', rss([
    { t: 'Демо: у місті Н відкрили відбудований міст через річку', l: u('a1'), h: 2, d: '<p>Рух мостом <b>відновили</b> для легкових авто й автобусів. Це вигадана новина для показу.</p>' },
    { t: 'Демо: в області запрацював новий маршрут приміської електрички', l: u('a2'), h: 5, d: 'Поїзд курсуватиме чотири рази на день. Це вигадана новина для показу.' },
    { t: 'Демо: стара новина, якої не має бути у стрічці', l: u('a-old'), h: 90 },
    { t: 'Демо: новина з небезпечним посиланням', l: 'javascript:alert(1)', h: 1 },
    { rawTitle: 'Демо: заголовок із &lt;script&gt;alert(1)&lt;/script&gt; тегом усередині тексту', t: '', l: u('a-xss'), h: 7, d: '<img src=x onerror=alert(1)>Текст опису без тегів.' },
  ], now));

  put('https://demo.invalid/b.atom', atom([
    { t: 'Демо: відбудований міст через річку відкрили у місті Н', l: u('b1'), h: 1.5, d: 'Міст був закритий на ремонт. Це вигадана новина для показу.' },
    { t: 'Демо: школи області переходять на новий розклад дзвінків', l: u('b2'), h: 3, d: 'Зміни діятимуть із наступного тижня. Це вигадана новина для показу.' },
    { t: 'ШОК!!! Ви не повірите, що сталося на центральному ринку', l: u('b3'), h: 4, d: 'Це вигаданий приклад крикливого заголовка.' },
  ], now), 'application/atom+xml; charset=utf-8');

  put('https://demo.invalid/pub.rdf', rdf([
    { t: 'Демо: у місті Н після ремонту відкрили міст через річку', l: u('p1'), h: 1, d: 'Суспільний мовник побував на відкритті. Це вигадана новина для показу.' },
    { t: 'Демо: в області стартував сезон збору врожаю яблук', l: u('p2'), h: 8, d: 'Аграрії очікують середній урожай. Це вигадана новина для показу.' },
  ], now));

  // стрічка в кодуванні windows-1251 — перевіряємо, що кирилиця не перетворюється на кракозябри
  const w1251 = rss([
    { t: 'Демо: держагентство повідомляє про новий графік роботи ЦНАПів', l: u('s1'), h: 2.5, d: 'Офіційне повідомлення. Це вигадана новина для показу.' },
  ], now).replace('encoding="UTF-8"', 'encoding="windows-1251"');
  put('https://demo.invalid/state.rss', encode1251(w1251), 'text/xml');

  put('https://demo.invalid/w1.rss', rss([
    { t: 'Demo: island nation opens new undersea cable link', l: u('w1a'), h: 3, d: 'Demo summary: the cable doubles internet capacity.' },
    { t: 'Demo: regional summit ends with trade agreement', l: u('w1b'), h: 6 },
  ], now));
  put('https://demo.invalid/w2.rss', rss([
    { t: 'Demo: new undersea cable link opens for island nation', l: u('w2a'), h: 2 },
  ], now));
  put('https://demo.invalid/ex.rss', rss([
    // справжні редакції називають місце: інакше іноземне видання не відрізнити від новини про світ
    { t: 'Демо: в городе Н открыли восстановленный мост через реку', l: u('ex1'), h: 1.2, d: 'Мост в Киевской области был разрушен в 2022 году.' },
    { t: 'Демо: независимые журналисты опубликовали расследование о закупках', l: u('ex2'), h: 9 },
  ], now));
  put('https://demo.invalid/wire.rss', rss([
    { t: 'Demo wire: officials praise record harvest figures', l: u('wire1'), h: 4 },
  ], now));
  put('https://demo.invalid/tech.rss', rss([
    { t: 'Demo lab unveils open AI model for weather forecasting', l: u('t1'), h: 2 },
    { t: 'Demo: quantum chip sets new stability record', l: u('t2'), h: 10 },
    { t: 'Demo: researcher plants 2 million canary tokens in AI supply chain', l: u('t3'), h: 3, d: 'Demo summary: the method can reveal a supply chain attack before it spreads.' },
  ], now));
  put('https://demo.invalid/tech2.rss', rss([
    { t: 'Демо: лабораторія представила відкриту модель ШІ для прогнозу погоди', l: u('t2a'), h: 1.8, d: 'Модель доступна дослідникам безкоштовно. Це вигадана новина для показу.' },
  ], now));
  put('https://demo.invalid/sport.rss', rss([
    { t: 'Demo Sports: city club wins the cup final after extra time', l: u('sp1'), h: 2, d: 'Demo summary: the match went to extra time after a late equaliser.' },
  ], now));
  // садова стрічка пише рідко: запис десятиденної давнини має лишатися у стрічці (вікно 30 днів)
  put('https://demo.invalid/garden.rss', rss([
    { t: 'Демо: коли садити часник під зиму — поради городникам', l: u('g1'), h: 240, d: 'Оптимальний строк — за три тижні до морозів. Це вигадана новина для показу.' },
  ], now));
  put('https://demo.invalid/fc.rss', rss([
    { t: 'Демо-фейк: у місті Н нібито закрили всі школи. Це неправда', l: u('fc1'), h: 3, d: 'Фактчекери перевірили повідомлення з соцмереж: школи працюють. Це вигаданий приклад спростування.' },
    { t: 'Демо-маніпуляція: фото «затопленого мосту» зроблене в іншій країні', l: u('fc2'), h: 12, d: 'Знімок поширюють без контексту. Це вигаданий приклад спростування.' },
  ], now));
  put('https://demo.invalid/broken.rss', '<rss><channel><item><title>обірваний', 'application/rss+xml');
  put('https://demo.invalid/down.rss', 'Server error', 'text/plain', 500);
  return m;
}

function encode1251(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x350);
    else out.push({ 0x404: 0xaa, 0x454: 0xba, 0x406: 0xb2, 0x456: 0xb3, 0x407: 0xaf, 0x457: 0xbf, 0x490: 0xa5, 0x491: 0xb4, 0x401: 0xa8, 0x451: 0xb8, 0xab: 0xab, 0xbb: 0xbb, 0x2014: 0x97 }[c] ?? 0x3f);
  }
  return Buffer.from(out);
}

/** Підробний fetch для тестів і прототипу: віддає демо-стрічки й «перекладає» за словником.
 *  Елемент словника — рядок або {t, g} (переклад із термінами), як у справжній відповіді моделі. */
export function demoFetch(now = Date.now(), { translatorFails = false, failFeeds = [] } = {}) {
  const feeds = demoFeeds(now);
  const calls = { feeds: 0, translate: 0, classify: 0 };
  const impl = async (url, opts = {}) => {
    url = String(url);
    if (url.includes('anthropic.com') || url.includes('googleapis.com')) {
      if (translatorFails) { calls.translate++; return new Response('overloaded', { status: 529 }); }
      const body = JSON.parse(opts.body);
      const system = body.system ?? body.systemInstruction?.parts?.[0]?.text ?? '';
      const prompt = body.messages?.[0]?.content ?? body.contents?.[0]?.parts?.[0]?.text;
      const titles = JSON.parse(prompt.slice(prompt.indexOf('<texts>') + 7, prompt.lastIndexOf('</texts>')));
      // Класифікатор рубрик (українські заголовки) відрізняється системним промптом: відповідь — лише коди.
      const isClassify = system.includes('JSON-масив кодів');
      calls[isClassify ? 'classify' : 'translate']++;
      const out = isClassify
        ? JSON.stringify(titles.map((t) => demoClasses[t] ?? 'society'))
        : JSON.stringify(titles.map((t) => demoTranslations[t] ?? `[uk] ${t}`));
      const payload = url.includes('anthropic.com') ? { content: [{ type: 'text', text: 'Ось переклад:\n' + out }] } : { candidates: [{ content: { parts: [{ text: out }] } }] };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    calls.feeds++;
    if (failFeeds.includes(url)) return new Response('Forbidden', { status: 403 });
    const f = feeds.get(url);
    if (!f) throw new Error('getaddrinfo ENOTFOUND');
    return new Response(f.body, { status: f.status, headers: { 'content-type': f.contentType } });
  };
  impl.calls = calls;
  return impl;
}
