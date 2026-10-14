/**
 * Readability checks: reading ease, sentence and paragraph length, subheadings,
 * passive voice and transition words. Pure, no I/O.
 */

import type { Check, Status } from './types'
import { rawWords } from './keyphrase'

const TRANSITIONS = [
  'however', 'therefore', 'furthermore', 'moreover', 'additionally', 'also', 'besides',
  'consequently', 'thus', 'hence', 'meanwhile', 'finally', 'first', 'second', 'third',
  'next', 'then', 'lastly', 'subsequently', 'instead', 'likewise', 'similarly',
  'conversely', 'nevertheless', 'nonetheless', 'still', 'in addition', 'for example',
  'for instance', 'in contrast', 'on the other hand', 'as a result', 'in conclusion',
  'in summary', 'to sum up', 'that is', 'in other words', 'above all', 'especially',
  'indeed', 'in fact', 'of course', 'otherwise', 'specifically', 'another', 'because',
  'since', 'although', 'while', 'though', 'even so', 'as well as', 'after all',
  'at the same time', 'in particular', 'overall', 'ultimately', 'eventually',
  'first of all', 'to begin with', 'for this reason', 'by contrast', 'in short',
  'as a consequence', 'in the end', 'on the contrary', 'that said',
]

const TRANSITION_PATTERN = new RegExp(
  '\\b(?:' + TRANSITIONS.map((phrase) => phrase.replace(/ /g, '\\s+')).join('|') + ')\\b',
  'i',
)

const PASSIVE_PATTERN = /\b(?:is|are|was|were|been|being)\s+\w+(?:ed|en)\b/i

const MAX_PARAGRAPH_WORDS = 150
const MAX_SENTENCE_WORDS = 25
const SUBHEADING_WORDS = 300

/** Splits text into sentences at ., ! or ? followed by a space, and at line breaks. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/** Estimated syllables in one English word. Never less than one. */
export function syllables(word: string): number {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!letters) return 0
  let groups = letters.match(/[aeiouy]+/g)?.length ?? 0
  if (letters.endsWith('e') && !letters.endsWith('le') && groups > 1) groups -= 1
  return Math.max(1, groups)
}

/** Flesch reading ease: higher is easier. Standard formula with a syllable estimate. */
export function fleschScore(words: string[], sentenceCount: number): number {
  const wordCount = words.length
  const syllableCount = words.reduce((sum, word) => sum + syllables(word), 0)
  const perSentence = wordCount / sentenceCount
  const perWord = syllableCount / wordCount
  return 206.835 - 1.015 * perSentence - 84.6 * perWord
}

function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

function check(id: string, label: string, status: Status, message: string): Check {
  return { id, label, status, message }
}

function fleschCheck(score: number): Check {
  const rounded = Math.round(score)
  if (score >= 60) return check('flesch', 'Reading ease', 'good', `Reading ease score is ${rounded}. Easy to read.`)
  if (score >= 50) return check('flesch', 'Reading ease', 'ok', `Reading ease score is ${rounded}. Fairly easy to read. Shorter sentences and simpler words would help.`)
  return check('flesch', 'Reading ease', 'bad', `Reading ease score is ${rounded}. Hard to read. Use shorter sentences and simpler words.`)
}

/** Readability checks for the text and its headings. */
export function readabilityChecks(text: string, headings: { level: number; text: string }[]): Check[] {
  const sentences = splitSentences(text)
  if (sentences.length === 0 || rawWords(text).length === 0) {
    return [check('readability-text', 'Text to measure', 'info', 'Add text to see readability checks.')]
  }

  const sentenceWords = sentences.map((sentence) => rawWords(sentence).length)
  const totalWords = sentenceWords.reduce((sum, n) => sum + n, 0)
  const words = rawWords(text)
  const sentenceCount = sentences.length
  const checks: Check[] = [fleschCheck(fleschScore(words, sentenceCount))]

  const average = Math.round(totalWords / sentenceCount)
  checks.push(average <= 20
    ? check('avg-sentence-length', 'Average sentence length', 'good', `Sentences average ${average} words. Good.`)
    : check('avg-sentence-length', 'Average sentence length', 'ok', `Sentences average ${average} words. Aim for 20 words or fewer.`))

  const longShare = share(sentenceWords.filter((n) => n > MAX_SENTENCE_WORDS).length, sentenceCount)
  checks.push(longShare <= 25
    ? check('long-sentences', 'Long sentences', 'good', `${longShare}% of sentences are long. Good.`)
    : check('long-sentences', 'Long sentences', 'ok', `${longShare}% of sentences have more than ${MAX_SENTENCE_WORDS} words. Try to keep this under 25%.`))

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const longParagraphs = paragraphs.filter((p) => rawWords(p).length > MAX_PARAGRAPH_WORDS).length
  checks.push(longParagraphs === 0
    ? check('paragraph-length', 'Paragraph length', 'good', 'No paragraph is too long.')
    : check('paragraph-length', 'Paragraph length', 'ok', `${longParagraphs} paragraph(s) are longer than ${MAX_PARAGRAPH_WORDS} words. Split them up.`))

  const noSubheadings = words.length > SUBHEADING_WORDS && headings.length === 0
  checks.push(noSubheadings
    ? check('subheadings', 'Subheadings', 'bad', `This text is over ${SUBHEADING_WORDS} words with no subheadings. Add some to break it up.`)
    : check('subheadings', 'Subheadings', 'good', 'Subheadings break up the text.'))

  const passiveShare = share(sentences.filter((s) => PASSIVE_PATTERN.test(s)).length, sentenceCount)
  checks.push(passiveShare <= 10
    ? check('passive-voice', 'Passive voice', 'good', `${passiveShare}% of sentences use passive voice. Good.`)
    : check('passive-voice', 'Passive voice', 'ok', `${passiveShare}% of sentences use passive voice. Try to keep this under 10%.`))

  const transitionShare = share(sentences.filter((s) => TRANSITION_PATTERN.test(s)).length, sentenceCount)
  checks.push(transitionShare >= 30
    ? check('transition-words', 'Transition words', 'good', `${transitionShare}% of sentences use a transition word. Good.`)
    : check('transition-words', 'Transition words', 'ok', `${transitionShare}% of sentences use a transition word. Aim for at least 30%.`))

  return checks
}
