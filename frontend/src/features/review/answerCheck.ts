import type { QuestionType } from '../../types';

const KANJI_OR_LATIN_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff々a-zA-Z]/;
const LATIN_RE = /[a-zA-Z]/;
const LEADING_ARTICLE_RE = /^(?:to|a|an|the)\s+/i;

/** Fold full-width katakana (ァ..ヶ) to hiragana (ぁ..ゖ). Keeps 'ー' as is. */
export function katakanaToHiragana(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += text[i];
    }
  }
  return out;
}

/** NFKC, trim, lowercase, and convert katakana to hiragana. */
export function normalizeAnswer(text: string): string {
  const folded = text.normalize('NFKC').trim().toLowerCase();
  return katakanaToHiragana(folded);
}

/**
 * True when a reading answer has kanji or Latin letters in it.
 * Shown as "Please answer in kana" instead of marking the answer wrong.
 */
export function hasNonKanaForReading(text: string): boolean {
  const folded = text.normalize('NFKC').trim();
  return folded.length > 0 && KANJI_OR_LATIN_RE.test(folded);
}

/** Case-insensitive meaning with optional leading 'to '/'a '/'an '/'the ' stripped. */
export function normalizeMeaning(text: string): string {
  const collapsed = normalizeAnswer(text).replace(/\s+/g, ' ').trim();
  const stripped = collapsed.replace(LEADING_ARTICLE_RE, '').trim();
  return stripped || collapsed;
}

/** Grade a typed fill-in-the-blank answer against the exercise's acceptedAnswers. */
export function checkFillAnswer(
  answer: string,
  acceptedAnswers: string[],
  answerKind: 'kana' | 'meaning',
  questionType?: QuestionType,
): boolean {
  if (!answer || !answer.trim()) {
    return false;
  }
  if (questionType === 'fill_text_reading' && hasNonKanaForReading(answer)) {
    return false;
  }
  if (answerKind === 'meaning') {
    const given = normalizeMeaning(answer);
    return (
      given.length > 0 &&
      acceptedAnswers.some(a => normalizeMeaning(a) === given)
    );
  }
  const folded = answer.normalize('NFKC').trim();
  if (LATIN_RE.test(folded)) {
    return false;
  }
  const given = normalizeAnswer(folded);
  return (
    given.length > 0 &&
    acceptedAnswers.some(a => normalizeAnswer(a) === given)
  );
}


