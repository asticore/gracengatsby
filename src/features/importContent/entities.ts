/** Decodes HTML and XML character references such as &amp; &#8217; and &#x2014;. Unknown names are left as written. */

// Code points, not literal characters, so this source file stays plain ASCII.
const NAMED_CODES: Array<[string, number]> = [
  ['amp', 0x26],
  ['lt', 0x3c],
  ['gt', 0x3e],
  ['quot', 0x22],
  ['apos', 0x27],
  ['nbsp', 0xa0],
  ['copy', 0xa9],
  ['reg', 0xae],
  ['trade', 0x2122],
  ['hellip', 0x2026],
  ['mdash', 0x2014],
  ['ndash', 0x2013],
  ['lsquo', 0x2018],
  ['rsquo', 0x2019],
  ['ldquo', 0x201c],
  ['rdquo', 0x201d],
  ['bull', 0x2022],
  ['middot', 0xb7],
  ['euro', 0x20ac],
  ['pound', 0xa3],
  ['times', 0xd7],
  ['laquo', 0xab],
  ['raquo', 0xbb],
  ['eacute', 0xe9],
  ['egrave', 0xe8],
  ['agrave', 0xe0],
  ['ccedil', 0xe7],
  ['ouml', 0xf6],
  ['uuml', 0xfc],
  ['auml', 0xe4],
]

const NAMED = new Map<string, string>(NAMED_CODES.map(([name, code]) => [name, String.fromCodePoint(code)]))

export function decodeEntities(input: string): string {
  if (input.indexOf('&') === -1) return input
  return input.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match: string, body: string) => {
    if (body.charAt(0) === '#') {
      const hex = body.charAt(1) === 'x' || body.charAt(1) === 'X'
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED.get(body) ?? NAMED.get(body.toLowerCase()) ?? match
  })
}