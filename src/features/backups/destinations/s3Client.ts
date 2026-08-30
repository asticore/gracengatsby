/**
 * A small S3-compatible object-store client, signed with AWS Signature Version
 * 4 using Web Crypto.
 *
 * One client covers both supported destinations. Cloudflare R2 speaks the S3
 * API at `https://<account>.r2.cloudflarestorage.com` with region `auto`, so
 * the only difference between "R2" and "S3" on the settings screen is which
 * endpoint and region get filled in. That is why there is no separate R2
 * adapter: a second implementation would be the same code with a different
 * hostname and twice the surface to get wrong.
 *
 * Signing is done by hand rather than with the AWS SDK for the same reason
 * features/email/providers/sesApi.ts does it by hand - the SDK expects Node's
 * crypto and stream internals, which Workers do not provide. The four chained
 * HMACs below are the same construction; changing the canonical request in any
 * way (header order, the signed-headers list, the payload hash) invalidates the
 * signature and the store answers 403.
 *
 * Bodies are signed as UNSIGNED-PAYLOAD. Hashing a body would mean holding all
 * of it in memory to hash it before sending it, which defeats the entire point
 * of streaming a multi-hundred-megabyte database dump out of a Worker capped at
 * 128 MB. UNSIGNED-PAYLOAD is permitted over HTTPS, which every endpoint here
 * is; the signature still covers the method, path, query and headers, so the
 * request cannot be redirected to another key or bucket in flight.
 */

export type S3Target = {
  /** Origin only, no trailing slash: `https://host`. */
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Key prefix inside the bucket, already normalised to no leading/trailing slash. */
  prefix: string
}

const encoder = new TextEncoder()
const SERVICE = 's3'
const UNSIGNED = 'UNSIGNED-PAYLOAD'

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const sha256Hex = async (value: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))

const hmac = async (key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value))
}

/**
 * S3 requires each path segment to be percent-encoded, but NOT the separating
 * slashes - and it wants the stricter RFC 3986 set, which `encodeURIComponent`
 * leaves four characters short of.
 */
const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/')

type SignedRequest = {
  method: string
  /** Absolute path beginning with `/`, already encoded. */
  path: string
  /** Query parameters; sorted and encoded here. */
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: BodyInit | null
}

/**
 * Builds and sends one signed request.
 *
 * `host` and `x-amz-content-sha256` are always signed because S3 rejects a
 * signature that omits them; `content-length` is deliberately NOT signed, since
 * the runtime sets it after this code runs and a mismatch would break the
 * signature rather than the request.
 */
async function signedFetch(target: S3Target, request: SignedRequest): Promise<Response> {
  const url = new URL(target.endpoint)
  const host = url.host

  const query = request.query ?? {}
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(query[name])}`)
    .join('&')

  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': UNSIGNED,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
  }

  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const signedHeaders = names.join(';')

  const canonicalRequest = [
    request.method,
    request.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    UNSIGNED,
  ].join('\n')

  const scope = `${dateStamp}/${target.region}/${SERVICE}/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`

  const dateKey = await hmac(encoder.encode(`AWS4${target.secretAccessKey}`), dateStamp)
  const regionKey = await hmac(dateKey, target.region)
  const serviceKey = await hmac(regionKey, SERVICE)
  const signingKey = await hmac(serviceKey, 'aws4_request')
  const signature = toHex(await hmac(signingKey, stringToSign))

  const sendHeaders = new Headers()
  for (const name of names) {
    if (name === 'host') continue // Set by the runtime; assigning it throws.
    sendHeaders.set(name, headers[name])
  }
  sendHeaders.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  )

  return fetch(`${url.origin}${request.path}${canonicalQuery ? `?${canonicalQuery}` : ''}`, {
    method: request.method,
    headers: sendHeaders,
    body: request.body ?? null,
  })
}

/** Turns a non-2xx into the store's own words, which is what an operator needs. */
export async function describeFailure(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1]
  const message = text.match(/<Message>([^<]+)<\/Message>/)?.[1]
  if (code || message) return `${code ?? 'Error'}: ${message ?? ''}`.trim()
  return `HTTP ${response.status}${text ? ` - ${text.slice(0, 300)}` : ''}`
}

/**
 * Minimal XML field extraction. A full parser is not available on Workers and
 * not worth shipping for four element names; the S3 list and multipart replies
 * are flat enough that this is exact rather than approximate.
 */
const between = (xml: string, tag: string): string[] =>
  Array.from(xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))).map((match) => match[1])

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

export type S3Object = { key: string; size: number }

export class S3Store {
  constructor(private readonly target: S3Target) {}

  /** Full object key for a path relative to the configured prefix. */
  keyFor(relative: string): string {
    return this.target.prefix ? `${this.target.prefix}/${relative}` : relative
  }

  private pathFor(relative: string): string {
    return `/${encodeKey(this.target.bucket)}/${encodeKey(this.keyFor(relative))}`
  }

  /** A single PUT. Use only where the whole body is already in memory. */
  async put(relative: string, body: BodyInit, contentType = 'application/octet-stream'): Promise<void> {
    const response = await signedFetch(this.target, {
      method: 'PUT',
      path: this.pathFor(relative),
      headers: { 'content-type': contentType },
      body,
    })
    if (!response.ok) throw new Error(`Could not write ${relative}: ${await describeFailure(response)}`)
    await response.body?.cancel()
  }

  async get(relative: string): Promise<Response> {
    const response = await signedFetch(this.target, { method: 'GET', path: this.pathFor(relative) })
    if (!response.ok) throw new Error(`Could not read ${relative}: ${await describeFailure(response)}`)
    return response
  }

  async exists(relative: string): Promise<boolean> {
    const response = await signedFetch(this.target, { method: 'HEAD', path: this.pathFor(relative) })
    await response.body?.cancel()
    return response.ok
  }

  async delete(relative: string): Promise<void> {
    const response = await signedFetch(this.target, { method: 'DELETE', path: this.pathFor(relative) })
    // 404 on delete is the desired end state, not a failure.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Could not delete ${relative}: ${await describeFailure(response)}`)
    }
    await response.body?.cancel()
  }

  /** Every object under a relative prefix, following continuation tokens. */
  async list(relativePrefix: string): Promise<S3Object[]> {
    const out: S3Object[] = []
    let token: string | undefined

    do {
      const response = await signedFetch(this.target, {
        method: 'GET',
        path: `/${encodeKey(this.target.bucket)}`,
        query: {
          'list-type': '2',
          prefix: this.keyFor(relativePrefix),
          'max-keys': '1000',
          ...(token ? { 'continuation-token': token } : {}),
        },
      })
      if (!response.ok) throw new Error(`Could not list backups: ${await describeFailure(response)}`)

      const xml = await response.text()
      for (const entry of between(xml, 'Contents')) {
        const key = decodeXml(between(entry, 'Key')[0] ?? '')
        if (!key) continue
        out.push({ key, size: Number(between(entry, 'Size')[0] ?? 0) })
      }
      token =
        between(xml, 'IsTruncated')[0] === 'true'
          ? decodeXml(between(xml, 'NextContinuationToken')[0] ?? '')
          : undefined
    } while (token)

    return out
  }

  /** Confirms the credentials and bucket before a run commits to anything. */
  async check(): Promise<void> {
    const response = await signedFetch(this.target, {
      method: 'GET',
      path: `/${encodeKey(this.target.bucket)}`,
      query: { 'list-type': '2', 'max-keys': '1' },
    })
    if (!response.ok) {
      throw new Error(`The destination refused the credentials: ${await describeFailure(response)}`)
    }
    await response.body?.cancel()
  }

  // --- Multipart --------------------------------------------------------

  async createMultipart(relative: string, contentType: string): Promise<string> {
    const response = await signedFetch(this.target, {
      method: 'POST',
      path: this.pathFor(relative),
      query: { uploads: '' },
      headers: { 'content-type': contentType },
    })
    if (!response.ok) throw new Error(`Could not start upload: ${await describeFailure(response)}`)
    const uploadId = decodeXml(between(await response.text(), 'UploadId')[0] ?? '')
    if (!uploadId) throw new Error('The destination started an upload but returned no upload id.')
    return uploadId
  }

  async uploadPart(relative: string, uploadId: string, partNumber: number, body: Uint8Array): Promise<string> {
    const response = await signedFetch(this.target, {
      method: 'PUT',
      path: this.pathFor(relative),
      query: { partNumber: String(partNumber), uploadId },
      body: body as BodyInit,
    })
    if (!response.ok) throw new Error(`Part ${partNumber} was refused: ${await describeFailure(response)}`)
    const etag = response.headers.get('etag')
    await response.body?.cancel()
    if (!etag) throw new Error(`Part ${partNumber} was accepted without an ETag, so it cannot be completed.`)
    return etag
  }

  async completeMultipart(relative: string, uploadId: string, etags: string[]): Promise<void> {
    const body = `<CompleteMultipartUpload>${etags
      .map((etag, index) => `<Part><PartNumber>${index + 1}</PartNumber><ETag>${etag}</ETag></Part>`)
      .join('')}</CompleteMultipartUpload>`

    const response = await signedFetch(this.target, {
      method: 'POST',
      path: this.pathFor(relative),
      query: { uploadId },
      headers: { 'content-type': 'application/xml' },
      body,
    })
    if (!response.ok) throw new Error(`Could not finish upload: ${await describeFailure(response)}`)

    // S3 can answer 200 and still report a failure in the body, because the
    // status goes out before the parts are assembled. Ignoring that is how a
    // backup ends up recorded as successful and unreadable.
    const xml = await response.text()
    if (xml.includes('<Error>')) {
      throw new Error(`Upload failed while assembling: ${between(xml, 'Message')[0] ?? 'no reason given'}`)
    }
  }

  async abortMultipart(relative: string, uploadId: string): Promise<void> {
    const response = await signedFetch(this.target, {
      method: 'DELETE',
      path: this.pathFor(relative),
      query: { uploadId },
    })
    await response.body?.cancel()
  }
}

/**
 * The write side used by the export: takes chunks of any size and turns them
 * into upload parts of a fixed size.
 *
 * This is what keeps the export inside the Worker's memory cap. Only one part
 * is ever held; everything before it has already gone to the destination and
 * been released. A backup smaller than one part skips multipart entirely and
 * goes as a single PUT, which avoids paying three round trips to store a few
 * kilobytes of settings.
 */
export class StreamingUpload {
  /** 8 MiB. Above S3's 5 MiB minimum, and 10,000 parts of it is 80 GB. */
  private static readonly PART_SIZE = 8 * 1024 * 1024

  private buffer: Uint8Array[] = []
  private buffered = 0
  private uploadId: string | null = null
  private etags: string[] = []
  private closed = false

  bytes = 0

  constructor(
    private readonly store: S3Store,
    private readonly relative: string,
    private readonly contentType = 'application/octet-stream',
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Write after the upload was closed.')
    if (chunk.byteLength === 0) return

    this.buffer.push(chunk)
    this.buffered += chunk.byteLength
    this.bytes += chunk.byteLength

    while (this.buffered >= StreamingUpload.PART_SIZE) {
      await this.flushPart(StreamingUpload.PART_SIZE)
    }
  }

  private take(size: number): Uint8Array {
    const out = new Uint8Array(size)
    let filled = 0
    while (filled < size) {
      const head = this.buffer[0]
      const need = size - filled
      if (head.byteLength <= need) {
        out.set(head, filled)
        filled += head.byteLength
        this.buffer.shift()
      } else {
        out.set(head.subarray(0, need), filled)
        this.buffer[0] = head.subarray(need)
        filled += need
      }
    }
    this.buffered -= size
    return out
  }

  private async flushPart(size: number): Promise<void> {
    if (!this.uploadId) {
      this.uploadId = await this.store.createMultipart(this.relative, this.contentType)
    }
    const part = this.take(size)
    this.etags.push(await this.store.uploadPart(this.relative, this.uploadId, this.etags.length + 1, part))
  }

  /** Finishes the object. Safe to call once; a second call is a no-op. */
  async close(): Promise<number> {
    if (this.closed) return this.bytes
    this.closed = true

    if (!this.uploadId) {
      await this.store.put(this.relative, this.take(this.buffered) as BodyInit, this.contentType)
      return this.bytes
    }

    if (this.buffered > 0) await this.flushPart(this.buffered)
    await this.store.completeMultipart(this.relative, this.uploadId, this.etags)
    return this.bytes
  }

  /**
   * Throws away a part-written object. Called on any failure mid-export so the
   * destination is not left holding an incomplete upload that still bills for
   * storage and looks, to a later `list`, like nothing happened.
   */
  async abort(): Promise<void> {
    this.closed = true
    this.buffer = []
    this.buffered = 0
    if (this.uploadId) await this.store.abortMultipart(this.relative, this.uploadId).catch(() => {})
  }
}
