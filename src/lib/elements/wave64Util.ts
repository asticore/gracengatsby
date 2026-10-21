/** Wave 64 pure helpers: a tiny code tokenizer and playlist line parsing. ASCII only, no dependencies. */

export type Tok = { t: 'kw' | 'str' | 'com' | 'num' | 'plain'; v: string }
export const LANGS = ['js', 'ts', 'json', 'html', 'css', 'bash', 'python'] as const
export type Lang = (typeof LANGS)[number]

const JS_KW = 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of null undefined true false this interface type enum implements public private readonly'
const KW: Record<Lang, string> = {
  js: JS_KW, ts: JS_KW, json: 'true false null', html: '',
  css: '', bash: 'if then else elif fi for do done while case esac function in echo cd export sudo',
  python: 'def class return if elif else for while in not and or is import from as with try except finally raise lambda None True False pass yield async await',
}
const COMMENT: Record<Lang, RegExp | null> = {
  js: /^(\/\/[^\n]*|\/\*[\s\S]*?(\*\/|$))/, ts: /^(\/\/[^\n]*|\/\*[\s\S]*?(\*\/|$))/, json: null,
  html: /^<!--[\s\S]*?(-->|$)/, css: /^\/\*[\s\S]*?(\*\/|$)/, bash: /^#[^\n]*/, python: /^#[^\n]*/,
}
const STR = /^("(\\.|[^"\\\n])*"?|'(\\.|[^'\\\n])*'?|`(\\.|[^`\\])*`?)/
const NUM = /^\d+(\.\d+)?/
const WORD = /^[A-Za-z_$][\w$-]*/

/** Splits code into coloured runs. Every character of the input appears in exactly one run, in order. */
export function tokenize(code: string, lang: string): Tok[] {
  const l: Lang = (LANGS as readonly string[]).includes(lang) ? (lang as Lang) : 'js'
  const kws = new Set(KW[l].split(' ').filter(Boolean))
  const out: Tok[] = []
  const push = (t: Tok['t'], v: string) => {
    const last = out[out.length - 1]
    if (last && last.t === t) last.v += v
    else out.push({ t, v })
  }
  let rest = code.slice(0, 50000)
  while (rest) {
    let m: RegExpExecArray | null
    if (l === 'html' && (m = /^<\/?[A-Za-z][\w-]*/.exec(rest))) push('kw', m[0])
    else if ((m = COMMENT[l]?.exec(rest) ?? null)) push('com', m[0])
    else if ((m = STR.exec(rest))) push('str', m[0])
    else if ((m = NUM.exec(rest))) push('num', m[0])
    else if ((m = WORD.exec(rest))) push(kws.has(m[0]) ? 'kw' : 'plain', m[0])
    else push('plain', rest[0] as string)
    rest = rest.slice(m ? m[0].length : 1)
  }
  return out
}

export type PlaylistItem = { src: string; kind: 'youtube' | 'vimeo' | 'file'; title: string }

/** One "url | title" per line. parse is injected (parseVideoUrl) so this stays pure. Bad lines are dropped. */
export function parsePlaylist(
  raw: string,
  parse: (u: string) => { kind: 'youtube' | 'vimeo' | 'file'; src: string } | null,
): PlaylistItem[] {
  const items: PlaylistItem[] = []
  for (const line of raw.split(/\r?\n/).slice(0, 50)) {
    const i = line.indexOf(' | ')
    const url = (i < 0 ? line : line.slice(0, i)).trim()
    const src = url ? parse(url) : null
    if (!src) continue
    items.push({ ...src, title: (i < 0 ? '' : line.slice(i + 3)).trim() || `Video ${items.length + 1}` })
  }
  return items
}
