import type { BackupSettings } from '../types'

import { S3Store, type S3Target } from './s3Client'

export { S3Store, StreamingUpload, describeFailure, type S3Object, type S3Target } from './s3Client'

/**
 * Turns the Destination group on the settings screen into something that can
 * actually be written to, or an explicit refusal.
 *
 * The refusal matters more than the success case. Cloudflare Workers can open
 * outbound HTTP(S) connections and nothing else - there is no raw TCP socket
 * available to a Worker in this runtime, and both FTP and SFTP need one (FTP
 * needs two: a control connection and a data connection, on separate ports).
 * There is no shim, no polyfill and no library that changes this; the protocols
 * simply cannot be spoken from here.
 *
 * So `resolveDestination` returns an error naming the reason rather than an
 * adapter that quietly does nothing. An adapter that no-ops would report every
 * backup as successful and produce nothing to restore from, which is the single
 * worst failure a backup system can have: it is indistinguishable from working
 * right up until the day it matters.
 *
 * If FTP or SFTP is genuinely needed, the backup has to be driven from a
 * machine that has TCP - a scheduled job on a VPS calling the same guarded
 * export endpoints - and the two options should come off this screen.
 */

/**
 * Flat rather than a discriminated union: this project compiles with
 * `strictNullChecks` off, which switches off narrowing by a literal
 * discriminant, so a union here would make `error` unreachable at every call
 * site. `store` is present exactly when `ok` is true.
 */
export type ResolvedDestination = {
  ok: boolean
  store?: S3Store
  label?: string
  error?: string
  /** True when the provider cannot work here at all, as opposed to being unconfigured. */
  unsupported?: boolean
}

/** Strips leading and trailing slashes so keys never double up separators. */
const normalisePrefix = (value: string | undefined): string =>
  (value ?? '').trim().replace(/^\/+|\/+$/g, '')

export function resolveDestination(settings: BackupSettings): ResolvedDestination {
  const destination = settings.destination

  if (destination.provider === 'ftp' || destination.provider === 'sftp') {
    const name = destination.provider.toUpperCase()
    return {
      ok: false,
      unsupported: true,
      error:
        `${name} cannot be used from this site. Cloudflare Workers can only make HTTP requests - ` +
        `${name} needs a direct network connection, which is not available here. Choose Cloudflare R2 ` +
        `or Amazon S3 instead, or run backups from a machine of your own.`,
    }
  }

  const missing: string[] = []
  const bucket = (destination.bucket ?? '').trim()
  const accessKeyId = (destination.accessKeyId ?? '').trim()
  const secretAccessKey = (destination.secretAccessKey ?? '').trim()

  if (!bucket) missing.push('bucket')
  if (!accessKeyId) missing.push('access key ID')
  if (!secretAccessKey) missing.push('secret access key')

  let endpoint: string
  let region: string
  let label: string

  if (destination.provider === 'r2') {
    const accountId = (destination.accountId ?? '').trim()
    if (!accountId) missing.push('account ID')
    // R2 has one region for signing purposes; the bucket's real location is not
    // part of the endpoint, so there is nothing for the operator to get wrong.
    region = 'auto'
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`
    label = `R2 ${bucket}`
  } else {
    region = (destination.region ?? '').trim()
    if (!region) missing.push('region')
    endpoint = `https://s3.${region}.amazonaws.com`
    label = `S3 ${bucket} (${region})`
  }

  if (missing.length > 0) {
    return {
      ok: false,
      unsupported: false,
      error: `The destination is not filled in yet - still missing: ${missing.join(', ')}.`,
    }
  }

  const target: S3Target = {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: normalisePrefix(destination.path),
  }

  return { ok: true, store: new S3Store(target), label }
}
