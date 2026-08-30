/**
 * The calculation language for form fields.
 *
 * A hand-written tokeniser and recursive-descent parser. `eval` and
 * `new Function` are deliberately not used: a formula is authored in the admin
 * area but evaluated in every visitor's browser and again on the server, so a
 * formula is untrusted input at the point it runs. Either of those two would
 * hand whoever can edit a form arbitrary code execution in a visitor's session
 * and in the request handler, and `new Function` is refused outright by the
 * Workers runtime anyway.
 *
 * The grammar is the smallest thing that covers "add up these fields":
 *
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | '%') unary)*
 *   unary      := ('-' | '+')? primary
 *   primary    := number | reference | '(' expression ')'
 *   reference  := '{' name '}' | identifier
 *
 * No functions, no comparisons, no assignment, no property access, no strings.
 * Adding any of those means extending the parser on purpose rather than
 * inheriting the whole of JavaScript by accident.
 *
 * Parsing is separate from evaluation so a formula can be checked when it is
 * saved and evaluated many times per keystroke afterwards.
 */

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; name: string }
  | { kind: 'unary'; op: '-' | '+'; operand: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%'; left: Node; right: Node }

export type ParseResult = { ok: true; node: Node; refs: string[] } | { ok: false; error: string }

type Token =
  | { type: 'number'; value: number; pos: number }
  | { type: 'ref'; name: string; pos: number }
  | { type: 'op'; value: string; pos: number }

const OPERATORS = new Set(['+', '-', '*', '/', '%', '(', ')'])

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9'

/** Bare references: what a field `name` is allowed to look like. */
const isIdentStart = (ch: string): boolean =>
  (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'

const isIdentPart = (ch: string): boolean => isIdentStart(ch) || isDigit(ch)

class ExpressionError extends Error {}

function tokenise(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }

    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i })
      i += 1
      continue
    }

    if (isDigit(ch) || (ch === '.' && isDigit(input[i + 1]))) {
      const start = i
      let seenDot = false
      while (i < input.length && (isDigit(input[i]) || (input[i] === '.' && !seenDot))) {
        if (input[i] === '.') seenDot = true
        i += 1
      }
      tokens.push({ type: 'number', value: Number(input.slice(start, i)), pos: start })
      continue
    }

    // Braced references let a field name contain anything except a brace,
    // which matters because names come from a text box in the admin area.
    if (ch === '{') {
      const end = input.indexOf('}', i + 1)
      if (end === -1) throw new ExpressionError(`Unclosed "{" at position ${i + 1}.`)
      const name = input.slice(i + 1, end).trim()
      if (!name) throw new ExpressionError(`Empty field reference at position ${i + 1}.`)
      tokens.push({ type: 'ref', name, pos: i })
      i = end + 1
      continue
    }

    if (isIdentStart(ch)) {
      const start = i
      while (i < input.length && isIdentPart(input[i])) i += 1
      tokens.push({ type: 'ref', name: input.slice(start, i), pos: start })
      continue
    }

    throw new ExpressionError(`"${ch}" cannot be used in a calculation (position ${i + 1}).`)
  }

  return tokens
}

class Parser {
  private pos = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.expression()
    if (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos]
      throw new ExpressionError(`Unexpected "${describe(token)}" at position ${token.pos + 1}.`)
    }
    return node
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private takeOp(...values: string[]): string | null {
    const token = this.peek()
    if (token && token.type === 'op' && values.includes(token.value)) {
      this.pos += 1
      return token.value
    }
    return null
  }

  private expression(): Node {
    let left = this.term()
    for (;;) {
      const op = this.takeOp('+', '-')
      if (!op) return left
      left = { kind: 'binary', op: op as '+' | '-', left, right: this.term() }
    }
  }

  private term(): Node {
    let left = this.unary()
    for (;;) {
      const op = this.takeOp('*', '/', '%')
      if (!op) return left
      left = { kind: 'binary', op: op as '*' | '/' | '%', left, right: this.unary() }
    }
  }

  private unary(): Node {
    const op = this.takeOp('-', '+')
    if (op) return { kind: 'unary', op: op as '-' | '+', operand: this.unary() }
    return this.primary()
  }

  private primary(): Node {
    const token = this.peek()
    if (!token) throw new ExpressionError('The formula ends before it is finished.')

    if (token.type === 'number') {
      this.pos += 1
      return { kind: 'number', value: token.value }
    }

    if (token.type === 'ref') {
      this.pos += 1
      return { kind: 'ref', name: token.name }
    }

    if (token.value === '(') {
      this.pos += 1
      const inner = this.expression()
      if (!this.takeOp(')')) throw new ExpressionError(`Missing ")" after position ${token.pos + 1}.`)
      return inner
    }

    throw new ExpressionError(`Unexpected "${describe(token)}" at position ${token.pos + 1}.`)
  }
}

const describe = (token: Token): string =>
  token.type === 'number' ? String(token.value) : token.type === 'ref' ? token.name : token.value

const collectRefs = (node: Node, into: Set<string>): void => {
  switch (node.kind) {
    case 'ref':
      into.add(node.name)
      break
    case 'unary':
      collectRefs(node.operand, into)
      break
    case 'binary':
      collectRefs(node.left, into)
      collectRefs(node.right, into)
      break
    default:
      break
  }
}

/** Parses a formula. Never throws - a bad formula is a content mistake, not a crash. */
export function parseFormula(formula: string): ParseResult {
  const source = typeof formula === 'string' ? formula.trim() : ''
  if (!source) return { ok: false, error: 'The formula is empty.' }

  try {
    const node = new Parser(tokenise(source)).parse()
    const refs = new Set<string>()
    collectRefs(node, refs)
    return { ok: true, node, refs: [...refs] }
  } catch (error) {
    return { ok: false, error: error instanceof ExpressionError ? error.message : 'The formula could not be read.' }
  }
}

/**
 * Turns whatever a field holds into a number.
 *
 * A blank field is 0 rather than an error: half-filled forms are the normal
 * case while someone is typing, and a running total that vanishes the moment a
 * field is cleared is worse than one that treats blank as nothing. Currency
 * symbols and thousands separators are stripped because people paste them in.
 */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'boolean') return value ? 1 : 0
  if (Array.isArray(value)) return value.length
  if (typeof value !== 'string') return 0

  const cleaned = value.replace(/[^0-9.+-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

const walk = (node: Node, values: Record<string, unknown>): number => {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'ref':
      return toNumber(values[node.name])
    case 'unary':
      return node.op === '-' ? -walk(node.operand, values) : walk(node.operand, values)
    case 'binary': {
      const left = walk(node.left, values)
      const right = walk(node.right, values)
      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        // Dividing by an empty field is the single most likely mistake in a
        // real form, so it yields 0 rather than Infinity or NaN - both of which
        // would be shown to a visitor as a total.
        case '/':
          return right === 0 ? 0 : left / right
        case '%':
          return right === 0 ? 0 : left % right
        default:
          return 0
      }
    }
    default:
      return 0
  }
}

/** Evaluates a parsed formula. Non-finite results collapse to 0 for the same reason. */
export function evaluateNode(node: Node, values: Record<string, unknown>): number {
  const result = walk(node, values)
  return Number.isFinite(result) ? result : 0
}

/** Parse-and-evaluate in one go, for callers that run a formula once. */
export function evaluateFormula(formula: string, values: Record<string, unknown>): number {
  const parsed = parseFormula(formula)
  return parsed.ok ? evaluateNode(parsed.node, values) : 0
}

/** Rounds for display without the floating-point noise of `toFixed` alone. */
export function roundTo(value: number, decimalPlaces = 2): number {
  const places = Math.max(0, Math.min(6, Math.trunc(decimalPlaces || 0)))
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}
