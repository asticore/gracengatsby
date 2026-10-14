/**
 * Word handling for the analysis: splitting text into words, a simple stemmer
 * so "dogs" and "dog" match, and phrase matching. Pure, no I/O.
 */

/** The words of a text, lower-cased, with punctuation dropped. Not stemmed. */
export function rawWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** A very small stemmer: strips common plural and verb endings. */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2)
  if (word.length > 4 && /(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/** Stemmed words, ready for matching a keyphrase against. */
export function words(text: string): string[] {
  return rawWords(text).map(stem)
}

/** True when every word of the phrase appears somewhere in the tokens. */
export function hasAllWords(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false
  const seen = new Set(tokens)
  return phrase.every((word) => seen.has(word))
}

/** How many times the phrase appears as a run of consecutive words. */
export function countPhrase(tokens: string[], phrase: string[]): number {
  if (phrase.length === 0) return 0
  let count = 0
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((word, j) => tokens[i + j] === word)) count++
  }
  return count
}
