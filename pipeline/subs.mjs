// Syto — підкатегорії (рубрики) новин у розділах «Україна» і «Світ». Чисті функції, без мережі.
// Рішення Романа (25.11.2026): «Україна» — війна, політика, економіка, суспільство, спорт, ІТ та ШІ, авто,
// трохи сміху, сад і город; «Світ» — те саме без «ІТ та ШІ» і «саду» (техно — окремий розділ).
// Як визначається рубрика (subOf у lib.mjs): тематична стрічка видання → мітка ШІ → правила за словами → «суспільство».
// CoLaba Production

/** Коди рубрик і їхні назви. Порядок — порядок кнопок у застосунку. */
export const SUBS = {
  war: 'Війна',
  politics: 'Політика',
  economy: 'Економіка',
  society: 'Суспільство',
  sport: 'Спорт',
  tech: 'ІТ та ШІ',
  auto: 'Авто',
  fun: 'Трохи сміху',
  garden: 'Сад і город',
};
export const SUB_CODES = Object.keys(SUBS);
/** Які рубрики показує кожен розділ. Новина з рубрикою поза цим списком видно лише в «Усе». */
export const TAB_SUBS = {
  ukraine: ['war', 'politics', 'economy', 'society', 'sport', 'tech', 'auto', 'fun', 'garden'],
  world: ['war', 'politics', 'economy', 'society', 'sport', 'auto', 'fun'],
};
export const DEFAULT_SUB = 'society';
export const isSub = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(SUBS, c);

// ---------- правила за словами (запасний спосіб, коли мітки ШІ немає) ----------
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const w = (alts) => new RegExp(B + '(?:' + alts + ')', 'iu');

const RULES = [
  ['war', w(
    'війн|войн|war' + E + '|warfare|фронт|front line|frontline|бойов|боев|combat|обстріл|обстрел|shelling|удар(?:у|и|ів|ом|ами|ів)?' + E + '|strike(?:s)?' + E + '|airstrike|' +
    'ракет|missile|дрон|drone|шахед|shahed|бпла|uav|ппо|air defen[cs]e|зсу|всу|армі|army|troops|військ|войск|military|солдат|soldier|' +
    'окупан|оккупан|occupation|наступ|offensive|оборон|defen[cs]e minist|мобілізац|мобилизац|mobili[sz]ation|полон|prisoner(?:s)? of war|' +
    'загинул|погиб|killed|поранен|ранен|wounded|вибух|взрыв|explosion|тривог|ceasefire|перемир|переговор(?:и|ів|ах)? про мир|peace talks|' +
    'нато' + E + '|nato' + E + '|танк|tank(?:s)?' + E + '|артилер|artiller|бригад|brigade|генштаб|сирськ|syrsky|' +
    'сектор\\p{L}* газ|gaza|хамас|hamas|хезболл|hezbollah|ідф|idf' + E + '|цахал')],
  ['sport', w(
    'спорт|sport|футбол|football|soccer|матч|match' + E + '|гол' + E + '|goal|чемпіон|чемпион|champion|ліг[аи]' + E + '|league|' +
    'турнір|турнир|tournament|олімпі|olympi|кубок|cup' + E + '|тренер|coach|гравц|player|збірн|сборн|national team|' +
    'бокс|boxing|тенніс|tennis|баскетбол|basketball|хокей|hockey|волейбол|volleyball|шахи|chess|біатлон|biathlon|атлет|athlet|' +
    'марафон|marathon|плаван|swimm|фехтуван|fencing|формул[аи].1|formula 1|f1' + E + '|nba|nfl|nhl|uefa|уєфа|фіфа|fifa|' +
    'динамо|шахтар|usyk|усик|ломаченк|lomachenko|медал|medal|рекорд світу|world record|' +
    'півфінал|фінал' + E + '|final' + E + '|semi-final|playoff|плей-оф|трансфер|transfer' + E + '|стадіон|stadium')],
  ['auto', w(
    'авто' + E + '|автомобіл|автомобил|автопром|автоіндустр|car' + E + '|cars' + E + '|vehicle|електромобіл|электромобил|' +
    'ev' + E + '|evs' + E + '|electric vehicle|tesla|toyota|volkswagen|bmw|mercedes|audi|renault|hyundai|kia' + E + '|ford' + E + '|' +
    'byd' + E + '|nissan|honda|porsche|ferrari|skoda|peugeot|dacia|volvo|водій|водител|driver(?:s)?' + E + '|' +
    'дтп' + E + '|road accident|зарядн\\p{L}* станц|charging station|пальн|бензин|petrol|gasoline|дизел|diesel|' +
    'розмитнен|растаможк|автосалон|автозавод|кросовер|crossover|suv' + E + '|седан|sedan|пікап|pickup|гібрид|hybrid|' +
    'автопілот|autopilot|self-driving|безпілотн\\p{L}* авто|робота?таксі|robotaxi|waymo|шин(?:и|ами)?' + E + '|tyres?|tires?')],
  ['garden', w(
    'сад(?:у|ом|и|ів)?' + E + '|садівни|город(?:і|у|ом)?' + E + '|городни|дач(?:а|і|у|ник)|грядк|розсад|рассад|насінн|семен(?:а|и)' + E + '|' +
    'добрив|удобрен|компост|теплиц|парник|врожай на|садж|саженц|обрізк|обрезк|щеплен|прививк|' +
    'помідор|томат|огірк|огурц|картопл|картофел|цибул|часник|капуст|морква|буряк|полуниц|суниц|малин|смородин|яблун|груш|' +
    'виноград|вишн|черешн|слив' + E + '|кущ(?:і|ів)?' + E + '|газон|квітник|троянд|тюльпан|шкідник|вредител|попелиц|колорадськ|' +
    'прополк|мульч|полив' + E + '|поливан|консерв(?:ац|уван)|закрутк|заготовк|посів|посадк')],
  ['politics', w(
    'президент|president|прем.?єр|премьер|prime minister|міністр|министр|minister|уряд|правительств|government|парламент|parliament|' +
    'верховн\\p{L}* рад|нардеп|депутат|mp' + E + '|lawmaker|senat|сенат|congress|конгрес|вибор|выбор|election|голосуван|vote|' +
    'парті|парти|party' + E + '|коаліц|coalition|опозиц|opposition|закон(?:у|и|ів|ом|опроєкт|опроект)?' + E + '|bill' + E + '|законопро|' +
    'санкці|санкци|sanction|дипломат|diplomat|посол|ambassador|мзс|foreign minist|саміт|summit|євросоюз|єс' + E + '|eu' + E + '|' +
    'єврокоміс|european commission|оон' + E + '|un' + E + '|united nations|зеленськ|zelensk|трамп|trump|путін|путин|putin|' +
    'кремл|kremlin|білий дім|white house|корупц|коррупц|corruption|набу|сап' + E + '|суд' + E + '|court' + E + '|прокурор|prosecutor|' +
    'референдум|referendum|імпічмент|impeachment|відставк|отставк|resign|призначен|appointed|указ' + E + '|decree')],
  ['economy', w(
    'економік|экономик|econom|бізнес|бизнес|business|гривн|hryvnia|долар|доллар|dollar|євро' + E + '|euro' + E + '|курс (?:валют|долар|євро)|' +
    'нацбанк|нбу' + E + '|central bank|фед' + E + '|fed' + E + '|інфляц|инфляц|inflation|ціни|цены|prices?' + E + '|тариф|tariff|' +
    'податк|налог|tax' + E + '|taxes|бюджет|budget|мвф|imf' + E + '|світов\\p{L}* банк|world bank|кредит|loan|іпотек|mortgage|' +
    'зарплат|salary|wages|пенсі|pension|ринок|market' + E + '|markets|акці[їй]' + E + '|stocks?' + E + '|shares' + E + '|біржа|' +
    'інвест|invest|експорт|export|імпорт|import|торгівл|trade' + E + '|компані|company|корпорац|corporat|банк(?:и|ів|у|ом)?' + E + '|bank(?:s)?' + E + '|' +
    'газ(?:у|ом)?' + E + '|нафт|oil' + E + '|енерг|energy|електроенерг|electricity|тариф|зерн|grain|врожа|harvest|агро|agri')],
  // «Трохи сміху» правилами не визначається — лише тематичні стрічки курйозів або мітка ШІ:
  // слово «сміх» у заголовку майже ніколи не означає веселу новину.
];

/**
 * Рубрика за словами в тексті (заголовки й описи кластера, оригінал і переклад).
 * Повертає код або null, якщо жодне правило не спрацювало. Порядок правил має значення: війна — перша
 * («удар по Харкову» — війна, а не політика); вузькі теми (спорт, авто, сад) — перед широкими (політика, економіка),
 * бо «Tesla знизила ціни» — про авто, хоч і про ціни.
 */
export function subByRules(text) {
  const t = String(text ?? '');
  for (const [code, re] of RULES) if (re.test(t)) return code;
  return null;
}
