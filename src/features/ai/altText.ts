/**
 * Alt text for a picture, written by a vision model.
 *
 * Alt text is read aloud to screen reader users and indexed by search engines,
 * so the prompt asks for what matters in the picture, in plain words, with no
 * "image of" preamble. The result is cleaned and capped before it is saved.
 */

import { callAi, type AiImage } from './client'
import type { AiProvider } from './models'

export const ALT_TEXT_MAX_LENGTH = 120

export const ALT_TEXT_PROMPT =
  'Write alt text for this picture for a screen reader user. One short sentence of at most 120 characters that says what matters in the picture. Do not start with "Image of" or "Photo of", do not use quotation marks, and do not add a full stop after a fragment. Reply with the alt text only.'

/**
 * Tidies a model reply into alt text: one line, no wrapping quotes, no preamble,
 * and never longer than the limit (cut at a word boundary).
 */
const QUOTES = /^["'“‘`]+|["'”’`]+$/g

export function cleanAltText(raw: string): string {
  let text = raw.replace(/\s+/g, ' ').trim().replace(QUOTES, '').trim()
  text = text.replace(/^alt text\s*[:-]\s*/i, '')
  text = text.replace(/^(image|photo|picture) of\s+/i, '').replace(QUOTES, '').trim()
  if (text.length > ALT_TEXT_MAX_LENGTH) {
    const cut = text.slice(0, ALT_TEXT_MAX_LENGTH)
    const lastSpace = cut.lastIndexOf(' ')
    text = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, '')
  }
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Asks the chosen provider for alt text for one picture. */
export async function generateAltText(
  provider: AiProvider,
  image: AiImage,
  apiKey: string,
  fetchImpl?: typeof fetch,
): Promise<string> {
  const raw = await callAi({ provider, prompt: ALT_TEXT_PROMPT, image, maxTokens: 120 }, { apiKey, fetch: fetchImpl })
  const text = cleanAltText(raw)
  if (!text) throw new Error('The model returned an empty description.')
  return text
}
