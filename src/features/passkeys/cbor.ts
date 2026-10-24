/**
 * A deliberately small CBOR (RFC 8949) decoder: exactly what WebAuthn attestation
 * objects and COSE keys use. Definite lengths only, no floats, no tags. Anything
 * else throws, and the caller turns a throw into a refusal. Input size and nesting
 * are capped so a hostile payload cannot spend the request budget.
 */

const MAX_DEPTH = 8
const MAX_ITEMS = 256

export type CborValue = number | string | boolean | null | Uint8Array | CborValue[] | Map<CborValue, CborValue>

export class CborError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CborError'
  }
}

export type CborDecoded = { value: CborValue; end: number }

export function decodeCborAt(bytes: Uint8Array, start = 0): CborDecoded {
  let offset = start
  let items = 0

  const need = (count: number) => {
    if (offset + count > bytes.length) throw new CborError('truncated')
  }

  const readArgument = (info: number): number => {
    if (info < 24) return info
    if (info === 24) {
      need(1)
      const value = bytes[offset]
      offset += 1
      return value
    }
    if (info === 25) {
      need(2)
      const value = (bytes[offset] << 8) | bytes[offset + 1]
      offset += 2
      return value
    }
    if (info === 26) {
      need(4)
      const value = ((bytes[offset] << 24) >>> 0) + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
      offset += 4
      return value
    }
    throw new CborError('unsupported length encoding')
  }

  const readItem = (depth: number): CborValue => {
    if (depth > MAX_DEPTH) throw new CborError('too deep')
    if (++items > MAX_ITEMS) throw new CborError('too many items')
    need(1)
    const initial = bytes[offset]
    offset += 1
    const major = initial >> 5
    const info = initial & 0x1f

    switch (major) {
      case 0:
        return readArgument(info)
      case 1:
        return -1 - readArgument(info)
      case 2:
      case 3: {
        const length = readArgument(info)
        need(length)
        const slice = bytes.subarray(offset, offset + length)
        offset += length
        return major === 2 ? new Uint8Array(slice) : new TextDecoder('utf-8', { fatal: true }).decode(slice)
      }
      case 4: {
        const length = readArgument(info)
        const list: CborValue[] = []
        for (let i = 0; i < length; i += 1) list.push(readItem(depth + 1))
        return list
      }
      case 5: {
        const length = readArgument(info)
        const map = new Map<CborValue, CborValue>()
        for (let i = 0; i < length; i += 1) {
          const key = readItem(depth + 1)
          if (typeof key !== 'string' && typeof key !== 'number') throw new CborError('unsupported map key')
          if (map.has(key)) throw new CborError('duplicate map key')
          map.set(key, readItem(depth + 1))
        }
        return map
      }
      case 7:
        if (info === 20) return false
        if (info === 21) return true
        if (info === 22) return null
        throw new CborError('unsupported simple value')
      default:
        throw new CborError('unsupported major type')
    }
  }

  const value = readItem(0)
  return { value, end: offset }
}

/** Decodes one complete CBOR item that must fill the whole input. */
export function decodeCbor(bytes: Uint8Array): CborValue {
  const { value, end } = decodeCborAt(bytes, 0)
  if (end !== bytes.length) throw new CborError('trailing bytes')
  return value
}
