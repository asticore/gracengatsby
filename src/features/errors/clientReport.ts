/**
 * The shape of an error report sent from the browser, and the browser-side
 * sender. Shared by the error page (src/app/(frontend)/error.tsx) and the
 * endpoint that stores it (src/app/(engage)/api/log-client-error/route.ts), so
 * both agree on the limits. Plain TypeScript with no server imports, so the
 * browser bundle can use it.
 */

export const CLIENT_REPORT_MAX_BYTES = 4096
export const CLIENT_REPORT_PATH = '/api/log-client-error'

const MESSAGE_CAP = 1000
const STACK_CAP = 1000
const DIGEST_CAP = 100
const PATH_CAP = 300

export type ClientErrorReport = {
  message: string
  digest?: string
  stack?: string
  path?: string
}

export type ClientReportCheck = { ok: true; value: ClientErrorReport } | { ok: false; reason: string }

const ALLOWED_KEYS = new Set(['message', 'digest', 'stack', 'path'])

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.slice(0, max)
}

/**
 * Checks a parsed JSON body. Unknown keys are refused rather than ignored, so
 * a client cannot slip extra data into the log. Paths keep only the pathname.
 */
export function checkClientReport(raw: unknown): ClientReportCheck {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'The report must be an object.' }
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, reason: `Unknown field: ${key.slice(0, 40)}` }
  }
  const message = text(record.message, MESSAGE_CAP)
  if (!message || !message.trim()) return { ok: false, reason: 'The message is missing.' }

  const path = text(record.path, PATH_CAP)
  return {
    ok: true,
    value: {
      message,
      digest: text(record.digest, DIGEST_CAP),
      stack: text(record.stack, STACK_CAP),
      path: path ? path.split('?')[0].split('#')[0] : undefined,
    },
  }
}

/** Sends one report to the server. Fire and forget: never throws, never shows anything to the visitor. */
export async function sendClientErrorReport(report: ClientErrorReport): Promise<void> {
  try {
    const check = checkClientReport(report)
    if (!check.ok) return
    await fetch(CLIENT_REPORT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(check.value),
      keepalive: true,
      credentials: 'same-origin',
    })
  } catch {
    // Reporting is best effort. A visitor who cannot reach the server still sees the error page.
  }
}
