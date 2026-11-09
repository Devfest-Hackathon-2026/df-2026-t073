/**
 * Splits Japanese text into pieces that can wrap, with a reading over each
 * kanji group, e.g. 何かお探しですか + なにかおさがしですか gives
 * 何(なに) か お 探(さが) し で す か.
 */

export interface RubyUnit {
  base: string;
  /** Reading shown over this piece; only set on kanji. */
  ruby?: string;
}

/** Pieces kept together on one line. */
export type RubyGroup = RubyUnit[];

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
/**
 * Text that reads as written: kana, and punctuation that isn't read aloud.
 * Everything else (kanji, letters, digits, symbols like / or %) has its
 * reading spelled out in the reading.
 */
const READS_AS_WRITTEN =
  /[ぁ-ゖゝゞァ-ヴヷ-ヺー-ヾｦ-ﾟ、。，．！？!?「」『』【】（）()〔〕〈〉《》・：；…〜～\s]/;
const ALNUM = /[0-9A-Za-z０-９Ａ-Ｚａ-ｚ]/;
/** Characters that may not start a line (Japanese line-break rules). */
const NO_LINE_START = new Set(
  '、。，．,.！？!?）)」』】〕〉》ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵ・：；:;…〜～'.split(
    '',
  ),
);
/** Characters that may not end a line. */
const NO_LINE_END = new Set('（(「『【〔〈《'.split(''));

/** Katakana to hiragana, full-width ASCII to ASCII, no spaces. */
function normalize(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch)) {
      continue;
    } else if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code - 0x60);
    } else if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCharCode(code - 0xfee0);
    } else {
      out += ch;
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Kanji get a reading, kana read as written; digits, letters and symbols never get furigana. */
type RunKind = 'kanji' | 'kana' | 'digits' | 'other';

interface Run {
  text: string;
  kind: RunKind;
}

function kindOf(ch: string): RunKind {
  if (KANJI.test(ch)) {
    return 'kanji';
  }
  if (/[0-9０-９]/.test(ch)) {
    return 'digits';
  }
  return READS_AS_WRITTEN.test(ch) ? 'kana' : 'other';
}

function runs(text: string): Run[] {
  const out: Run[] = [];
  for (const ch of text) {
    const kind = kindOf(ch);
    const last = out[out.length - 1];
    if (last && last.kind === kind) {
      last.text += ch;
    } else {
      out.push({ text: ch, kind });
    }
  }
  return out;
}

const ONES = [
  '',
  'いち',
  'に',
  'さん',
  'よん|し|よ',
  'ご',
  'ろく',
  'なな|しち',
  'はち',
  'きゅう|く',
];
/** Before counters: 1本 いっぽん, 6本 ろっぽん, 8本 はっぽん. */
const ONES_SHORT = ['', 'いっ', '', '', '', '', 'ろっ', '', 'はっ', ''];
const TENS = [
  '',
  'じゅう|じゅっ',
  'にじゅう',
  'さんじゅう',
  'よんじゅう',
  'ごじゅう',
  'ろくじゅう',
  'ななじゅう|しちじゅう',
  'はちじゅう',
  'きゅうじゅう',
];
const HUNDREDS = [
  '',
  'ひゃく',
  'にひゃく',
  'さんびゃく',
  'よんひゃく',
  'ごひゃく',
  'ろっぴゃく',
  'ななひゃく',
  'はっぴゃく',
  'きゅうひゃく',
];
const THOUSANDS = [
  '',
  'せん|いっせん',
  'にせん',
  'さんぜん',
  'よんせん',
  'ごせん',
  'ろくせん',
  'ななせん',
  'はっせん',
  'きゅうせん',
];

/** Ways to read a number up to 9999 aloud, e.g. 53 → ごじゅうさん. */
function numberReadings(digits: string): string[] {
  if (!/^(0|[1-9]\d{0,3})$/.test(digits)) {
    return [];
  }
  if (digits === '0') {
    return ['ぜろ', 'れい'];
  }
  const places = [THOUSANDS, HUNDREDS, TENS, ONES].slice(4 - digits.length);
  let out = [''];
  [...digits].forEach((d, i) => {
    const n = Number(d);
    let options = places[i][n].split('|');
    if (places[i] === ONES && ONES_SHORT[n]) {
      options = [...options, ONES_SHORT[n]];
    }
    out = out.flatMap(prefix => options.map(o => prefix + o));
  });
  // Longest first, so the regex tries the full reading before a shorter one.
  return out.filter(Boolean).sort((a, b) => b.length - a.length);
}

/** How letters, units and symbols are read aloud. Keys are lower case. */
const SPOKEN: Record<string, string[]> = {
  kcal: ['きろかろりー'],
  cal: ['かろりー'],
  km: ['きろめーとる', 'きろ'],
  kg: ['きろぐらむ', 'きろ'],
  cm: ['せんちめーとる', 'せんち'],
  mm: ['みりめーとる', 'みり'],
  mg: ['みりぐらむ'],
  ml: ['みりりっとる'],
  kw: ['きろわっと'],
  wifi: ['わいふぁい'],
  atm: ['えーてぃーえむ'],
  g: ['ぐらむ', 'じー'],
  l: ['りっとる', 'える'],
  m: ['めーとる', 'えむ'],
  w: ['わっと', 'だぶりゅー'],
  a: ['えー', 'あんぺあ'],
  b: ['びー'],
  c: ['しー', 'ど'],
  d: ['でぃー'],
  e: ['いー'],
  f: ['えふ'],
  h: ['えいち', 'えっち'],
  i: ['あい'],
  j: ['じぇー', 'じぇい'],
  k: ['けー', 'けい'],
  n: ['えぬ'],
  o: ['おー'],
  p: ['ぴー'],
  q: ['きゅー'],
  r: ['あーる'],
  s: ['えす'],
  t: ['てぃー'],
  u: ['ゆー'],
  v: ['ぶい', 'ゔぃー'],
  x: ['えっくす'],
  y: ['わい'],
  z: ['ぜっと', 'ずぃー'],
  '/': ['ぱー', 'すらっしゅ', ''],
  '%': ['ぱーせんと'],
  '℃': ['ど'],
  '°': ['ど'],
  '¥': ['えん'],
  $: ['どる'],
  '&': ['あんど'],
  '+': ['ぷらす'],
  '-': ['まいなす', 'はいふん', ''],
  '.': ['てん', ''],
  ',': [''],
  '~': ['から', ''],
};
const SPOKEN_KEYS = Object.keys(SPOKEN).sort((a, b) => b.length - a.length);

/**
 * A regex for the ways letters, units and symbols can be read aloud, e.g.
 * mg/L → みりぐらむぱーりっとる. Null when some part isn't known.
 */
function spokenSymbols(written: string): string | null {
  const text = written.toLowerCase();
  if (text.length > 16) {
    return null;
  }
  const memo = new Map<number, string | null>();
  const from = (i: number): string | null => {
    if (i === text.length) {
      return '';
    }
    if (memo.has(i)) {
      return memo.get(i)!;
    }
    const options: string[] = [];
    for (const key of SPOKEN_KEYS) {
      if (text.startsWith(key, i)) {
        const rest = from(i + key.length);
        if (rest !== null) {
          const said = SPOKEN[key].map(escapeRegExp).join('|');
          options.push(`(?:${said})${rest}`);
        }
      }
    }
    const out = options.length ? `(?:${options.join('|')})` : null;
    memo.set(i, out);
    return out;
  };
  return from(0);
}

/** A regex for how digits, letters or symbols are read aloud, if known. */
function spoken(run: Run): string | null {
  const written = normalize(run.text);
  if (run.kind === 'digits') {
    const numbers = numberReadings(written).map(escapeRegExp);
    return numbers.length ? `(?:${numbers.join('|')})` : null;
  }
  return run.kind === 'other' ? spokenSymbols(written) : null;
}

type Mode = {
  kanjiGreedy: boolean;
  otherGreedy: boolean;
  strictNumbers: boolean;
};

function pattern(parts: Run[], mode: Mode): RegExp {
  const kanji = mode.kanjiGreedy ? '(.+)' : '(.+?)';
  const any = mode.otherGreedy ? '.+' : '.+?';
  const body = parts
    .map(p => {
      if (p.kind === 'kanji') {
        return kanji;
      }
      const written = normalize(p.text);
      if (p.kind === 'kana') {
        return escapeRegExp(written);
      }
      const said = spoken(p);
      if (mode.strictNumbers && said) {
        return said;
      }
      return said ? `(?:${said}|${any})` : `(?:${any})`;
    })
    .join('');
  return new RegExp(`^${body}$`);
}

/**
 * Matches the reading against the text: kana in the text must appear in the
 * reading as-is, and whatever sits between them is the kanji's reading.
 * Only kanji get furigana, never digits or letters. Returns null when the
 * reading doesn't line up with the text.
 */
export function alignReading(text: string, reading: string): RubyUnit[] | null {
  const parts = runs(text);
  const said = normalize(reading);
  const match = (mode: Mode) => {
    try {
      return said.match(pattern(parts, mode));
    } catch {
      return null;
    }
  };

  let found: RegExpMatchArray | null = null;
  let checks: (RegExpMatchArray | null)[] = [];
  let strict = true;
  for (const strictNumbers of [true, false]) {
    strict = strictNumbers;
    found = match({ kanjiGreedy: false, otherGreedy: false, strictNumbers });
    if (found) {
      // Next to digits or letters, the split can be ambiguous: only trust a
      // kanji's reading if pulling the boundary either way gives the same.
      checks = [
        match({ kanjiGreedy: true, otherGreedy: false, strictNumbers }),
        match({ kanjiGreedy: false, otherGreedy: true, strictNumbers }),
      ];
      break;
    }
  }
  if (!found) {
    return null;
  }

  const units: RubyUnit[] = [];
  let group = 1;
  parts.forEach((part, i) => {
    if (part.kind === 'kanji') {
      const ruby = found![group];
      // Digits and letters only pin down the split when their reading matched exactly.
      const unclear = (p?: Run) =>
        (p?.kind === 'other' || p?.kind === 'digits') &&
        (!strict || !spoken(p));
      const nextToOther = unclear(parts[i - 1]) || unclear(parts[i + 1]);
      const sure = !nextToOther || checks.every(m => m && m[group] === ruby);
      group++;
      units.push(sure ? { base: part.text, ruby } : { base: part.text });
    } else if (part.kind === 'other' || part.kind === 'digits') {
      // Digits, letters and symbols stay whole and never get furigana.
      units.push({ base: part.text });
    } else {
      // One piece per character so kana can wrap anywhere.
      for (const ch of part.text) {
        units.push({ base: ch });
      }
    }
  });
  return units;
}

/**
 * Groups pieces so lines never start with 。、？ or small kana, never end
 * with an opening bracket, and words in Latin letters stay whole.
 */
export function groupUnits(units: RubyUnit[]): RubyGroup[] {
  const groups: RubyGroup[] = [];
  let glueNext = false;
  for (const unit of units) {
    const last = groups[groups.length - 1];
    const lastUnit = last?.[last.length - 1];
    const glue =
      last &&
      (glueNext ||
        (!unit.ruby && NO_LINE_START.has(unit.base)) ||
        (!unit.ruby &&
          !lastUnit?.ruby &&
          ALNUM.test(unit.base) &&
          ALNUM.test(lastUnit?.base.slice(-1) ?? '')));
    if (glue) {
      last.push(unit);
    } else {
      groups.push([unit]);
    }
    glueNext = !unit.ruby && NO_LINE_END.has(unit.base);
  }
  return groups;
}
