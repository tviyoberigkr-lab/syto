// Syto — інтерфейс. Дані зі стрічок вставляються лише як текст (textContent), ніколи як HTML.
// CoLaba Production
(function () {
  'use strict';
  var TABS = {
    ukraine: { title: 'Україна', hint: 'Головне з українських редакцій. Вище — те, що підтвердили кілька незалежних джерел.' },
    world: { title: 'Світ', hint: 'Топові світові новини від міжнародних редакцій.' },
    tech: { title: 'Технології та ШІ', hint: 'Розвиток технологій і продуктів штучного інтелекту.' },
    fakes: { title: 'Фейки', hint: 'Що спростували фактчекери. Побачили таке в соцмережах — не поширюйте.' },
    method: { title: 'Як це працює' }
  };
  var TYPE_LABEL = {
    independent: 'незалежне ЗМІ', public: 'суспільний мовник', state: 'державне ЗМІ',
    exile: 'незалежне ЗМІ у вигнанні', factcheck: 'фактчекери'
  };
  var LANG_LABEL = { uk: 'українською', en: 'англійською', ru: 'російською' };
  var REFRESH_MS = 10 * 60 * 1000;

  var $ = function (id) { return document.getElementById(id); };
  var state = { data: null, tab: 'ukraine', filter: 'all', offline: false, loadedAt: 0 };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(href, text, cls) {
    var a = el('a', cls, text);
    if (/^https?:\/\//i.test(String(href))) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function plural(n, one, few, many) {
    var d = n % 10, h = n % 100;
    if (d === 1 && h !== 11) return one;
    if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
    return many;
  }
  function ago(ts, now) {
    var m = Math.max(0, Math.round((now - ts) / 60000));
    if (m < 1) return 'щойно';
    if (m < 60) return m + ' хв тому';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' год тому';
    var d = Math.round(h / 24);
    return d + ' ' + plural(d, 'день', 'дні', 'днів') + ' тому';
  }
  function clock(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var today = new Date().toDateString() === d.toDateString();
    var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return today ? hm : ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + hm;
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { /* сховище може бути недоступне — працюємо без нього */ }
    return null;
  }

  // ---------- терміни з поясненнями ----------
  var OPEN_Q = '«"„“', CLOSE_Q = '»"“”';
  var glossSeq = 0;

  /** Ділить текст на шматки: {text} і {term, expl, quoted}. Шукає кожен термін один раз, без накладань. */
  function segments(text, gloss) {
    var found = [];
    (gloss || []).forEach(function (g) {
      if (!g || typeof g.w !== 'string' || typeof g.e !== 'string' || !g.w) return;
      var i = text.indexOf(g.w);
      if (i < 0) return;
      var a = i, b = i + g.w.length;
      // термін уже в лапках — забираємо їх у кнопку, щоб не подвоювати і щоб лапки теж були сині
      var quoted = a > 0 && b < text.length && OPEN_Q.indexOf(text.charAt(a - 1)) >= 0 && CLOSE_Q.indexOf(text.charAt(b)) >= 0;
      if (quoted) { a--; b++; }
      if (found.some(function (f) { return a < f.b && b > f.a; })) return;
      found.push({ a: a, b: b, expl: g.e, quoted: quoted });
    });
    found.sort(function (x, y) { return x.a - y.a; });
    var out = [], pos = 0;
    found.forEach(function (f) {
      if (f.a > pos) out.push({ text: text.slice(pos, f.a) });
      var t = text.slice(f.a, f.b);
      out.push({ term: f.quoted ? t : '«' + t + '»', expl: f.expl });
      pos = f.b;
    });
    if (pos < text.length) out.push({ text: text.slice(pos) });
    return out;
  }

  /**
   * Наповнює parent текстом із кнопками-термінами. Звичайні шматки — посилання (якщо href) або текст.
   * Повертає блок пояснення (схований) або null, якщо термінів немає.
   * Кнопка не вкладена в <a>: заголовок складається з кількох посилань і кнопок між ними.
   */
  function fillWithTerms(parent, text, gloss, href) {
    var segs = segments(text, gloss);
    var box = null;
    segs.forEach(function (sg) {
      if (sg.term == null) { parent.appendChild(href ? link(href, sg.text) : document.createTextNode(sg.text)); return; }
      if (!box) {
        box = el('p', 'gloss');
        box.id = 'gloss-' + (++glossSeq);
        box.hidden = true;
        box.setAttribute('aria-live', 'polite');
      }
      var btn = el('button', 'term', sg.term);
      btn.type = 'button';
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', box.id);
      btn.setAttribute('data-expl', sg.expl);
      parent.appendChild(btn);
    });
    return box;
  }

  /** Клік по терміну: показує пояснення під текстом; повторний клік або інший термін — закриває/перемикає. */
  function onTermClick(e) {
    var btn = e.target.closest ? e.target.closest('.term') : null;
    if (!btn) return;
    e.preventDefault();
    var cardEl = btn.closest('.card');
    var wasOpen = btn.getAttribute('aria-expanded') === 'true';
    Array.prototype.forEach.call(cardEl.querySelectorAll('.term[aria-expanded="true"]'), function (b) { b.setAttribute('aria-expanded', 'false'); });
    Array.prototype.forEach.call(cardEl.querySelectorAll('.gloss'), function (g) { g.hidden = true; g.textContent = ''; });
    if (wasOpen) return;
    var box = document.getElementById(btn.getAttribute('aria-controls'));
    if (!box) return;
    btn.setAttribute('aria-expanded', 'true');
    box.textContent = btn.getAttribute('data-expl');
    box.hidden = false;
  }

  function badge(story) {
    var n = story.confirmations;
    if (story.status === 'confirmed') return el('span', 'badge b-confirmed', '✔ Підтверджено · ' + n + ' ' + plural(n, 'незалежне джерело', 'незалежні джерела', 'незалежних джерел'));
    if (story.status === 'single') return el('span', 'badge b-single', '● Одне джерело');
    if (story.status === 'state') return el('span', 'badge b-state', '▲ Лише державне ЗМІ');
    return el('span', 'badge b-factcheck', '✖ Спростування');
  }

  function card(story, now) {
    var li = el('li', 'card');
    var badges = el('div', 'badges');
    badges.appendChild(badge(story));
    if (story.clickbait) badges.appendChild(el('span', 'badge b-loud', 'Крикливий заголовок'));
    li.appendChild(badges);
    var gl = story.gloss || {};
    var h = el('h3');
    var hBox = fillWithTerms(h, story.title, gl.title, story.url);
    li.appendChild(h);
    if (hBox) li.appendChild(hBox);
    if (story.summary) {
      var sum = el('p', 'sum');
      var sBox = fillWithTerms(sum, story.summary, gl.summary, null);
      li.appendChild(sum);
      if (sBox) li.appendChild(sBox);
    }
    var names = [];
    story.sources.forEach(function (s) { if (names.indexOf(s.name) < 0) names.push(s.name); });
    var shown = names.slice(0, 2).join(', ') + (names.length > 2 ? ' та ще ' + (names.length - 2) : '');
    li.appendChild(el('p', 'meta', shown + ' · ' + ago(story.lastTs || story.ts, now) + (story.translated ? ' · переклад ШІ' : '')));

    var det = el('details');
    det.appendChild(el('summary', null, story.sources.length > 1 ? 'Хто про це пише (' + story.sources.length + ')' : 'Першоджерело'));
    var ul = el('ul', 'srcs');
    story.sources.forEach(function (s) {
      var item = el('li');
      var who = el('span', 'who', s.name + ' ');
      who.appendChild(el('span', 'kind', '· ' + (TYPE_LABEL[s.type] || s.type) + ' · ' + (LANG_LABEL[s.lang] || s.lang)));
      item.appendChild(who);
      item.appendChild(link(s.url, s.title));
      ul.appendChild(item);
    });
    det.appendChild(ul);
    li.appendChild(det);
    return li;
  }

  function renderFeed() {
    var d = state.data, tab = state.tab, now = Date.now();
    $('view-title').textContent = TABS[tab].title;
    $('view-hint').textContent = TABS[tab].hint;
    $('filters').hidden = tab === 'fakes';
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) {
      c.setAttribute('aria-pressed', String(c.getAttribute('data-filter') === state.filter));
    });
    var list = $('list'), empty = $('empty');
    list.textContent = '';
    if (!d) { empty.hidden = false; empty.textContent = state.failed ? 'Не вдалося завантажити новини. Перевірте інтернет і натисніть «Оновити» вгорі.' : 'Завантажую новини…'; return; }
    var byId = {};
    d.stories.forEach(function (s) { byId[s.id] = s; });
    var items = (d.tabs[tab] || []).map(function (id) { return byId[id]; }).filter(Boolean);
    if (tab !== 'fakes' && state.filter === 'confirmed') items = items.filter(function (s) { return s.status === 'confirmed'; });
    var frag = document.createDocumentFragment();
    items.forEach(function (s) { frag.appendChild(card(s, now)); });
    list.appendChild(frag);
    empty.hidden = items.length > 0;
    if (!items.length) empty.textContent = state.filter === 'confirmed' && tab !== 'fakes'
      ? 'Зараз немає новин, підтверджених кількома джерелами. Натисніть «Усі новини».'
      : 'Тут поки порожньо. Новини оновлюються чотири рази на день.';
  }

  function renderMethod() {
    var d = state.data, v = $('method-view');
    v.textContent = '';
    var box = el('div', 'method');
    box.appendChild(el('h2', null, 'Як працює Syto'));
    box.appendChild(el('p', null, 'Syto не вирішує за вас, що є правдою, — жодна програма цього не вміє. Воно робить чесніше: бере новини лише з відкритого списку редакцій і показує, скільки незалежних джерел повідомили про ту саму подію.'));

    box.appendChild(el('h3', null, 'Що означають позначки'));
    var lg = el('ul', 'legend');
    [['b-confirmed', '✔ Підтверджено', 'Про подію незалежно повідомили щонайменше дві редакції. Це найнадійніші новини.'],
     ['b-single', '● Одне джерело', 'Поки пише лише одна редакція. Може бути правдою, але варто дочекатися підтвердження.'],
     ['b-state', '▲ Лише державне ЗМІ', 'Повідомляє тільки державне видання. Це офіційна позиція влади, а не незалежна перевірка.'],
     ['b-loud', 'Крикливий заголовок', 'Заголовок тисне на емоції. Такі новини Syto опускає нижче.'],
     ['b-factcheck', '✖ Спростування', 'Фактчекери перевірили поширене твердження і пояснили, що з ним не так.'],
     ['term-sample', '«синє слово»', 'Сленг або вузький термін. Натисніть на нього — під текстом з’явиться коротке пояснення (його пише ШІ разом із перекладом, тому є лише в новинах іноземних редакцій).']
    ].forEach(function (r) {
      var li = el('li');
      var sp = el('span'); sp.appendChild(el('span', r[0] === 'term-sample' ? r[0] : 'badge ' + r[0], r[1]));
      li.appendChild(sp); li.appendChild(el('span', null, r[2]));
      lg.appendChild(li);
    });
    box.appendChild(lg);

    box.appendChild(el('h3', null, 'Як відбувається просіювання'));
    var ol = el('ol');
    ['Чотири рази на день (до 8:00, 12:00, 16:00 і 20:00 за Києвом) Syto забирає свіжі заголовки зі стрічок усіх редакцій зі списку нижче.',
     'Відкидає старше за дві доби, дублікати й записи з битими посиланнями.',
     'Іноземні заголовки перекладає українською (переклад робить ШІ; оригінал завжди видно в картці).',
     'Групує повідомлення про одну подію і рахує, скільки незалежних редакцій її підтвердили. Державні ЗМІ в цей рахунок не йдуть.',
     'Вище ставить підтверджене і свіже, нижче — крикливе та одиночне.'
    ].forEach(function (t) { ol.appendChild(el('li', null, t)); });
    box.appendChild(ol);

    box.appendChild(el('h3', null, 'Чого Syto не вміє'));
    var no = el('ul');
    ['Не перевіряє факти саме — спирається на репутацію редакцій і збіг незалежних повідомлень.',
     'Кілька редакцій можуть помилитися одночасно, якщо переказують одне першоджерело.',
     'Автоматичний переклад заголовка може бути неточним — відкрийте оригінал, якщо важливо.',
     'Групування автоматичне: іноді дві різні події зліплюються або одна розпадається на дві картки.'
    ].forEach(function (t) { no.appendChild(el('li', null, t)); });
    box.appendChild(no);

    if (d) {
      box.appendChild(el('h3', null, 'Стан зараз'));
      var st = el('div', 'stat');
      [[d.stats.stories, 'новин у стрічці'], [d.stats.feedsOk + ' / ' + d.stats.feedsTotal, 'джерел на зв’язку'], [clock(d.generatedAt), 'останнє оновлення']].forEach(function (r) {
        var c = el('div'); c.appendChild(el('b', null, String(r[0]))); c.appendChild(el('span', null, r[1])); st.appendChild(c);
      });
      box.appendChild(st);

      box.appendChild(el('h3', null, 'Джерела'));
      box.appendChild(el('p', 'hint', 'Зелена крапка — стрічка відповіла під час останнього оновлення, червона — ні.'));
      var health = {};
      (d.health || []).forEach(function (h) { health[h.id] = h; });
      [['ukraine', 'Україна'], ['world', 'Світ'], ['tech', 'Технології та ШІ'], ['fakes', 'Фактчекери']].forEach(function (g) {
        var rows = d.sources.filter(function (s) { return s.cat === g[0]; });
        if (!rows.length) return;
        box.appendChild(el('p', 'group', g[1]));
        var ul = el('ul', 'srctable');
        rows.forEach(function (s) {
          var li = el('li');
          var ok = health[s.id] && health[s.id].ok;
          var dot = el('span', 'dot' + (ok ? '' : ' bad'));
          dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', ok ? 'на зв’язку' : 'не відповідає');
          li.appendChild(dot);
          var t = el('div'); t.appendChild(el('span', null, s.name));
          t.appendChild(el('small', null, (TYPE_LABEL[s.type] || s.type) + ' · ' + (LANG_LABEL[s.lang] || s.lang) + (ok ? '' : ' · зараз не відповідає')));
          li.appendChild(t); ul.appendChild(li);
        });
        box.appendChild(ul);
      });
    }
    v.appendChild(box);
  }

  function renderNotice() {
    var d = state.data, n = $('notice'), msg = '';
    if (d && d.demo) msg = 'ДЕМО-РЕЖИМ: джерела й новини тут вигадані — це показ того, як працює застосунок.';
    else if (state.offline && d) msg = 'Немає зв’язку — показую новини, збережені ' + clock(d.generatedAt) + '.';
    else if (d && Date.now() - Date.parse(d.generatedAt) > 12 * 3600e3) msg = 'Увага: новини давно не оновлювалися (востаннє ' + clock(d.generatedAt) + ').';
    n.hidden = !msg; n.textContent = msg;
    $('updated').textContent = d ? clock(d.generatedAt) : '…';
  }

  function render() {
    var isMethod = state.tab === 'method';
    $('feed-view').hidden = isMethod;
    $('method-view').hidden = !isMethod;
    Array.prototype.forEach.call(document.querySelectorAll('.tabs a'), function (a) {
      if (a.getAttribute('data-tab') === state.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = TABS[state.tab].title + ' — Syto';
    renderNotice();
    if (isMethod) renderMethod(); else renderFeed();
  }

  function valid(d) {
    return d && Array.isArray(d.stories) && d.tabs && d.stats && Array.isArray(d.sources);
  }

  function load() {
    if (window.__SYTO_DATA__) { state.data = window.__SYTO_DATA__; state.loadedAt = Date.now(); render(); return Promise.resolve(); }
    var btn = $('refresh');
    btn.classList.add('busy');
    return fetch('data/news.json', { cache: 'no-store' })
      .then(function (r) {
        state.offline = r.headers.get('x-syto-offline') === '1';
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!valid(d)) throw new Error('bad data');
        state.data = d; state.failed = false; state.loadedAt = Date.now();
      })
      .catch(function () { state.failed = !state.data; state.offline = !!state.data; })
      .then(function () { btn.classList.remove('busy'); render(); });
  }

  function route() {
    var h = (location.hash || '').replace('#', '');
    state.tab = TABS[h] ? h : 'ukraine';
    render();
    window.scrollTo(0, 0);
  }

  state.filter = store('syto-filter') === 'confirmed' ? 'confirmed' : 'all';
  $('filters').addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('.chip') : null;
    if (!c) return;
    state.filter = c.getAttribute('data-filter');
    store('syto-filter', state.filter);
    renderFeed();
  });
  $('refresh').addEventListener('click', function () { load(); });
  $('list').addEventListener('click', onTermClick);
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - state.loadedAt > REFRESH_MS) load();
  });
  setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);

  if ('serviceWorker' in navigator && !window.__SYTO_DATA__) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* не критично */ }
  }
  route();
  load();
})();
