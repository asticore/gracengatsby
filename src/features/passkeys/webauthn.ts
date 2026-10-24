import { decodeCbor, decodeCborAt, type CborValue } from './cbor'
import { bytesEqual, concatBytes, sha256, textEqual, toBase64Url, utf8 } from './encoding'

/**
 * The WebAuthn checks that do not depend on storage: client data, authenticator
 * data, the COSE public key, and the signature. Attestation is 'none' only: the
 * site does not ask for, or trust, a manufacturer statement. Web Crypto throughout.
 *
 * Algorithms: ES256 (COSE -7, P-256 keys, DER signatures) and RS256 (COSE -257,
 * PKCS#1 v1.5). Anything else is refused at registration.
 */

export const FLAG_UP = 0x01
export const FLAG_UV = 0x04
export const FLAG_BE = 0x08
export const FLAG_BS = 0x10
export const FLAG_AT = 0x40

export type ClientData = { type: string; challenge: string; origin: string; crossOrigin?: boolean }

export type ParsedAuthData = {
  rpIdHash: Uint8Array
  flags: number
  signCount: number
  /** Present only in registration (flag AT). */
  aaguid?: Uint8Array
  credentialId?: Uint8Array
  /** The COSE_Key bytes exactly as the authenticator sent them. */
  credentialPublicKey?: Uint8Array
}

export type Algorithm = 'ES256' | 'RS256'

export class WebAuthnError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebAuthnError'
  }
}

/** Parses clientDataJSON and checks the type, the challenge and the origin, exactly as the spec orders them. */
export function parseClientData(
  clientDataJSON: Uint8Array,
  expected: { type: 'webauthn.create' | 'webauthn.get'; challenge: string; origin: string },
): ClientData {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clientDataJSON)) as Record<string, unknown>
  } catch {
    throw new WebAuthnError('client data is not JSON')
  }
  const data: ClientData = {
    type: String(parsed.type ?? ''),
    challenge: String(parsed.challenge ?? ''),
    origin: String(parsed.origin ?? ''),
    crossOrigin: parsed.crossOrigin === undefined ? undefined : parsed.crossOrigin === true,
  }
  if (data.type !== expected.type) throw new WebAuthnError('wrong ceremony type')
  if (!textEqual(data.challenge, expected.challenge)) throw new WebAuthnError('challenge mismatch')
  if (!textEqual(data.origin, expected.origin)) throw new WebAuthnError('origin mismatch')
  if (data.crossOrigin) throw new WebAuthnError('cross-origin ceremony refused')
  return data
}

/** Splits authenticatorData. Registration carries attested credential data (flag AT); sign-in never does. */
export function parseAuthData(bytes: Uint8Array): ParsedAuthData {
  if (bytes.length < 37) throw new WebAuthnError('authenticator data too short')
  const rpIdHash = bytes.slice(0, 32)
  const flags = bytes[32]
  const signCount = ((bytes[33] << 24) >>> 0) + ((bytes[34] << 16) | (bytes[35] << 8) | bytes[36])
  const out: ParsedAuthData = { rpIdHash, flags, signCount }
  if (flags & FLAG_AT) {
    if (bytes.length < 55) throw new WebAuthnError('attested credential data too short')
    const credentialLength = (bytes[53] << 8) | bytes[54]
    const credentialStart = 55
    if (bytes.length < credentialStart + credentialLength) throw new WebAuthnError('credential id truncated')
    out.aaguid = bytes.slice(37, 53)
    out.credentialId = bytes.slice(credentialStart, credentialStart + credentialLength)
    const keyStart = credentialStart + credentialLength
    const { end } = decodeCborAt(bytes, keyStart)
    out.credentialPublicKey = bytes.slice(keyStart, end)
  }
  return out
}

export const requireUserPresence = (flags: number): void => {
  if (!(flags & FLAG_UP)) throw new WebAuthnError('user presence not asserted')
}

export const userVerified = (flags: number): boolean => (flags & FLAG_UV) !== 0

export async function checkRpId(rpIdHash: Uint8Array, rpId: string): Promise<void> {
  const expected = await sha256(utf8(rpId))
  if (!bytesEqual(rpIdHash, expected)) throw new WebAuthnError('rpId mismatch')
}

export type CoseKey = { algorithm: Algorithm; key: CryptoKey }

/** Turns COSE_Key bytes into a Web Crypto public key. Only the two supported shapes are accepted. */
export async function importCoseKey(coseBytes: Uint8Array): Promise<CoseKey> {
  const map = decodeCbor(coseBytes)
  if (!(map instanceof Map)) throw new WebAuthnError('public key is not a COSE map')
  const kty = map.get(1)
  const alg = map.get(3)
  if (kty === 2 && alg === -7) {
    if (map.get(-1) !== 1) throw new WebAuthnError('only P-256 is supported')
    const x = map.get(-2)
    const y = map.get(-3)
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
      throw new WebAuthnError('bad EC point')
    }
    const raw = concatBytes(new Uint8Array([0x04]), x, y)
    const key = await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
    return { algorithm: 'ES256', key }
  }
  if (kty === 3 && alg === -257) {
    const n = map.get(-1)
    const e = map.get(-2)
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256) throw new WebAuthnError('bad RSA key')
    const jwk = { kty: 'RSA', n: toBase64Url(n), e: toBase64Url(e), alg: 'RS256', ext: true }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify'])
    return { algorithm: 'RS256', key }
  }
  throw new WebAuthnError('unsupported public key algorithm')
}

/** ECDSA signatures arrive as ASN.1 DER; Web Crypto wants the raw r||s pair. */
export function derToRawEcdsa(der: Uint8Array): Uint8Array {
  let pos = 0
  const readLength = (): number => {
    const first = der[pos++]
    if (first === undefined) throw new WebAuthnError('bad signature')
    if (first < 0x80) return first
    const count = first & 0x7f
    if (count === 0 || count > 2) throw new WebAuthnError('bad signature')
    let length = 0
    for (let i = 0; i < count; i += 1) length = (length << 8) | der[pos++]
    return length
  }
  const readInteger = (): Uint8Array => {
    if (der[pos++] !== 0x02) throw new WebAuthnError('bad signature')
    const length = readLength()
    let value = der.subarray(pos, pos + length)
    pos += length
    while (value.length > 1 && value[0] === 0) value = value.subarray(1)
    if (value.length > 32) throw new WebAuthnError('bad signature')
    const padded = new Uint8Array(32)
    padded.set(value, 32 - value.length)
    return padded
  }
  if (der[pos++] !== 0x30) throw new WebAuthnError('bad signature')
  readLength()
  const r = readInteger()
  const s = readInteger()
  if (pos !== der.length) throw new WebAuthnError('bad signature')
  return concatBytes(r, s)
}

/** Verifies `signature` over authenticatorData || SHA-256(clientDataJSON), the input every WebAuthn assertion signs. */
export async function verifyAssertionSignature(
  cose: CoseKey,
  signature: Uint8Array,
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
): Promise<boolean> {
  const signed = concatBytes(authenticatorData, await sha256(clientDataJSON))
  if (cose.algorithm === 'ES256') {
    let raw: Uint8Array
    try {
      raw = derToRawEcdsa(signature)
    } catch {
      return false
    }
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cose.key, raw as Uint8Array<ArrayBuffer>, signed)
  }
  return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, cose.key, signature as Uint8Array<ArrayBuffer>, signed)
}

export const decodeAttestationObject = (bytes: Uint8Array): { fmt: string; authData: Uint8Array } => {
  const map = decodeCbor(bytes)
  if (!(map instanceof Map)) throw new WebAuthnError('attestation object is not a map')
  const fmt = map.get('fmt')
  const authData = map.get('authData')
  const attStmt = map.get('attStmt')
  if (typeof fmt !== 'string' || !(authData instanceof Uint8Array)) throw new WebAuthnError('attestation object incomplete')
  if (attStmt instanceof Map && attStmt.size > 0) throw new WebAuthnError('attestation statements are not accepted')
  return { fmt, authData }
}

export type { CborValue }
