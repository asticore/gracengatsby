/**
 * The analysis engine. Given a page's title, slug, meta fields, keyphrase and
 * content, it returns the SEO and readability checks with an overall score
 * for each. Pure: no I/O, no React, no database.
 */

import type { AnalysisInput, AnalysisResult, Check, Status } from './types'
import { countPhrase, hasAllWords, rawWords, words } from './keyphrase'
import { readabilityChecks } from './readability'

const TITLE_MIN = 30
const TITLE_MAX = 60
const META_MIN = 120
const META_MAX = 160
const TEXT_GOOD = 300
const TEXT_OK = 150
const DENSITY_MIN = 0.5
const DENSITY_MAX = 3

function check(id: string, label: string, status: Status, message: string): Check {
  return { id, label, status, message }
}

/** Overall status: bad if any check is bad, else ok if any is ok, else good. Info is ignored. */
export function scoreOf(checks: Check[]): Status {
  const scored = checks.filter((c) => c.status !== 'info')
  if (scored.length === 0) return 'info'
  if (scored.some((c) => c.status === 'bad')) return 'bad'
  if (scored.some((c) => c.status === 'ok')) return 'ok'
  return 'good'
}

/** The first non-empty paragraph of the text. */
function firstParagraph(text: string): string {
  return text.split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) ?? ''
}

function keyphraseChecks(input: AnalysisInput, phrase: string[], checks: Check[]): void {
  const title = input.metaTitle.trim() || input.title
  const titleHit = hasAllWords(words(title), phrase)
  checks.push(titleHit
    ? check('keyphrase-in-title', 'Keyphrase in title', 'good', 'The focus keyphrase appears in the page title.')
    : check('keyphrase-in-title', 'Keyphrase in title', 'bad', 'The focus keyphrase does not appear in the page title. Add it near the start.'))

  const metaHit = hasAllWords(words(input.metaDescription), phrase)
  checks.push(metaHit
    ? check('keyphrase-in-meta', 'Keyphrase in meta description', 'good', 'The focus keyphrase appears in the meta description.')
    : check('keyphrase-in-meta', 'Keyphrase in meta description', 'bad', 'The focus keyphrase does not appear in the meta description.'))

  const slugHit = hasAllWords(words(input.slug), phrase)
  checks.push(slugHit
    ? check('keyphrase-in-slug', 'Keyphrase in URL', 'good', 'The focus keyphrase appears in the web address.')
    : check('keyphrase-in-slug', 'Keyphrase in URL', 'bad', 'The focus keyphrase does not appear in the web address.'))

  const introHit = hasAllWords(words(firstParagraph(input.text)), phrase)
  checks.push(introHit
    ? check('keyphrase-in-intro', 'Keyphrase in introduction', 'good', 'The focus keyphrase appears in the first paragraph.')
    : check('keyphrase-in-intro', 'Keyphrase in introduction', 'bad', 'The focus keyphrase does not appear in the first paragraph. Use it early in the text.'))

  const subHit = input.headings.some((h) => (h.level === 2 || h.level === 3) && hasAllWords(words(h.text), phrase))
  checks.push(subHit
    ? check('keyphrase-in-subheading', 'Keyphrase in subheading', 'good', 'The focus keyphrase appears in a subheading.')
    : check('keyphrase-in-subheading', 'Keyphrase in subheading', 'ok', 'The focus keyphrase does not appear in any subheading (h2 or h3).'))

  const tokens = words(input.text)
  const occurrences = countPhrase(tokens, phrase)
  const density = tokens.length === 0 ? 0 : (occurrences * phrase.length / tokens.length) * 100
  const shown = density.toFixed(1)
  if (tokens.length === 0) {
    checks.push(check('keyphrase-density', 'Keyphrase density', 'ok', 'There is no text yet to measure the keyphrase density.'))
  } else if (density > DENSITY_MAX) {
    checks.push(check('keyphrase-density', 'Keyphrase density', 'bad', `The focus keyphrase makes up ${shown}% of the text. That is too often and may look like keyword stuffing. Aim for 0.5% to 3%.`))
  } else if (density < DENSITY_MIN) {
    checks.push(check('keyphrase-density', 'Keyphrase density', 'ok', `The focus keyphrase makes up ${shown}% of the text. Use it a little more often, aiming for 0.5% to 3%.`))
  } else {
    checks.push(check('keyphrase-density', 'Keyphrase density', 'good', `The focus keyphrase makes up ${shown}% of the text. Good.`))
  }
}

function imageKeyphraseCheck(input: AnalysisInput, phrase: string[], checks: Check[]): void {
  if (input.images.length === 0) {
    checks.push(check('keyphrase-in-alt', 'Keyphrase in image alt text', 'info', 'There are no images to check.'))
    return
  }
  const hit = input.images.some((img) => hasAllWords(words(img.alt), phrase))
  checks.push(hit
    ? check('keyphrase-in-alt', 'Keyphrase in image alt text', 'good', 'The focus keyphrase appears in an image description.')
    : check('keyphrase-in-alt', 'Keyphrase in image alt text', 'ok', 'The focus keyphrase does not appear in any image description (alt text).'))
}

function lengthChecks(input: AnalysisInput, checks: Check[]): void {
  const count = rawWords(input.text).length
  if (count >= TEXT_GOOD) {
    checks.push(check('text-length', 'Text length', 'good', `The text has ${count} words. Good.`))
  } else if (count >= TEXT_OK) {
    checks.push(check('text-length', 'Text length', 'ok', `The text has ${count} words. Aim for at least ${TEXT_GOOD}.`))
  } else {
    checks.push(check('text-length', 'Text length', 'bad', `The text has ${count} words. Write at least ${TEXT_OK}, ideally ${TEXT_GOOD} or more.`))
  }

  const title = (input.metaTitle.trim() || input.title).trim()
  const titleLength = title.length
  if (titleLength === 0) {
    checks.push(check('title-length', 'Title length', 'bad', 'The page has no title.'))
  } else if (titleLength >= TITLE_MIN && titleLength <= TITLE_MAX) {
    checks.push(check('title-length', 'Title length', 'good', `The title is ${titleLength} characters. Good.`))
  } else {
    checks.push(check('title-length', 'Title length', 'ok', `The title is ${titleLength} characters. Aim for ${TITLE_MIN} to ${TITLE_MAX}.`))
  }

  const metaLength = input.metaDescription.trim().length
  if (metaLength === 0) {
    checks.push(check('meta-length', 'Meta description length', 'bad', 'There is no meta description. Search results will show a piece of the page instead.'))
  } else if (metaLength >= META_MIN && metaLength <= META_MAX) {
    checks.push(check('meta-length', 'Meta description length', 'good', `The meta description is ${metaLength} characters. Good.`))
  } else {
    checks.push(check('meta-length', 'Meta description length', 'ok', `The meta description is ${metaLength} characters. Aim for ${META_MIN} to ${META_MAX}.`))
  }
}

function linkChecks(input: AnalysisInput, checks: Check[]): void {
  const internal = input.links.filter((l) => l.internal).length
  const external = input.links.length - internal
  checks.push(internal > 0
    ? check('internal-links', 'Internal links', 'good', `The page links to ${internal} other page(s) on this site.`)
    : check('internal-links', 'Internal links', 'ok', 'The page does not link to any other page on this site. Add a link or two.'))
  checks.push(external > 0
    ? check('outbound-links', 'Outbound links', 'good', `The page links to ${external} other website(s).`)
    : check('outbound-links', 'Outbound links', 'info', 'The page does not link to any other website. This is optional.'))
}

function imageAltCheck(input: AnalysisInput, checks: Check[]): void {
  if (input.images.length === 0) {
    checks.push(check('image-alt', 'Image alt text', 'info', 'There are no images on the page.'))
    return
  }
  const missing = input.images.filter((img) => img.alt.trim() === '').length
  checks.push(missing === 0
    ? check('image-alt', 'Image alt text', 'good', 'Every image has alt text.')
    : check('image-alt', 'Image alt text', 'ok', `${missing} image(s) have no alt text. Describe each one for screen readers and search.`))
}

/** The SEO checks. Keyphrase checks are left out when no keyphrase is set. */
export function seoChecks(input: AnalysisInput): Check[] {
  const phrase = words(input.keyphrase ?? '')
  const checks: Check[] = []
  const hasPhrase = phrase.length > 0
  checks.push(hasPhrase
    ? check('keyphrase-set', 'Focus keyphrase set', 'good', 'A focus keyphrase is set.')
    : check('keyphrase-set', 'Focus keyphrase set', 'bad', 'Set a focus keyphrase so the checks can see how well the page matches it.'))
  if (hasPhrase) {
    keyphraseChecks(input, phrase, checks)
    imageKeyphraseCheck(input, phrase, checks)
  }
  lengthChecks(input, checks)
  linkChecks(input, checks)
  imageAltCheck(input, checks)
  return checks
}

/** Runs every SEO and readability check on one page. Pure. */
export function analyze(input: AnalysisInput): AnalysisResult {
  const seo = seoChecks(input)
  const readability = readabilityChecks(input.text, input.headings)
  return {
    seo,
    readability,
    seoScore: scoreOf(seo),
    readabilityScore: scoreOf(readability),
  }
}
