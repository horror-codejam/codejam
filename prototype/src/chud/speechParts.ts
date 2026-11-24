import { LONG_LINE_WORDS, wordCount } from "./lines";

export function namedSpeechParts(template: string): [string, string] | undefined {
  // A complete sentence before or after the name, or a pause before a name between commas.
  for (const match of template.matchAll(/[.!?]\s+(?=\p{L}|\{n\})|,(?= \{n\}, )/gu)) {
    const at = match.index + match[0].length;
    const first = template.slice(0, at).trim();
    const rest = template.slice(at).trim();
    if (match[0] === "," && first.split(/\s+/).length < 4) continue;
    if (first.includes("{n}") !== rest.includes("{n}")) return [first, rest];
  }
  return undefined;
}

export function liveSpeechParts(text: string): [string, string] | undefined {
  const words = wordCount(text);
  if (words <= LONG_LINE_WORDS) return undefined;
  const sentences = /[.!?]\s+(?=\p{L}|["“])/gu;
  const clauses = /[;:]\s+|[,\u2014]\s+(?=(?:so|because|though|since|while|unless)\b|(?:and|but|yet)\s+(?:I|you|we|they|he|she|it|there|this|that)\b)/gi;
  for (const boundaries of [sentences, clauses]) {
    for (const match of text.matchAll(boundaries)) {
      const at = match.index + match[0].length;
      const first = text.slice(0, at).trim();
      const rest = text.slice(at).trim();
      if (/\b(?:[A-Z]|Mr|Mrs|Ms|Dr|St|etc|vs)\.$/i.test(first)) continue;
      const firstWords = wordCount(first);
      if (firstWords >= 3 && firstWords <= words * 2 / 3) return [first, rest];
    }
  }
  return undefined;
}
