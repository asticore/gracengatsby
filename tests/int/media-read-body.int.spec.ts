// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { readLimitedForm } from '@/features/media/readBody'

const MB = 1024 * 1024

function chunkedRequest(bytes: number, headers: Record<string, string> = {}): Request {
  const form = new FormData()
  form.append('file', new File([new Uint8Array(bytes)], 'a.bin', { type: 'application/octet-stream' }))
  // Re-encode the multipart body so it can be sent without a Content-Length.
  return new Request('http://localhost/x', { method: 'POST', body: form, headers })
}

describe('readLimitedForm', () => {
  it('refuses on a declared Content-Length over the limit', async () => {
    const r = await readLimitedForm(chunkedRequest(10, { 'content-length': String(500 * MB) }), 1 * MB)
    expect('response' in r && r.response.status).toBe(413)
  })

  it('refuses an oversized body that declares no Content-Length (stream cut off at the limit)', async () => {
    const source = chunkedRequest(3 * MB)
    expect(source.headers.get('content-length')).toBeNull()
    const r = await readLimitedForm(source, 1 * MB)
    expect('response' in r && r.response.status).toBe(413)
  })

  it('accepts a small body without Content-Length and returns the form', async () => {
    const r = await readLimitedForm(chunkedRequest(100), 1 * MB)
    expect('form' in r).toBe(true)
    if ('form' in r) expect((r.form.get('file') as File).size).toBe(100)
  })

  it('answers 400 for a missing body', async () => {
    const r = await readLimitedForm(new Request('http://localhost/x', { method: 'POST' }), 1 * MB)
    expect('response' in r && r.response.status).toBe(400)
  })
})
