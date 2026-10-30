import { DELIVERY_RETENTION_DAYS, MAX_ATTEMPTS, MAX_PAYLOAD_BYTES, REQUEST_TIMEOUT_MS, RETRY_DELAYS_SECONDS, SIGNATURE_HEADER, SIGNATURE_TOLERANCE_SECONDS } from './core'
import { EVENT_FIELDS, WEBHOOK_EVENTS } from './events'

/**
 * The webhooks part of the developer guide. Written once here as Markdown and reused by the API
 * builder guide (src/features/apiBuilder/devguide.ts) and by the webhook-only download, so the
 * signing rules cannot drift between them. The verification examples match ./core.ts exactly:
 * the signed text is "<t>.<raw body>", the header is t=<unix>,v1=<hex>.
 */

const RETRY_LIST = RETRY_DELAYS_SECONDS.map((seconds) => (seconds < 3600 ? `${seconds / 60} minutes` : `${seconds / 3600} hours`)).join(', ')

const CODE = {
  js: `import { createHmac, timingSafeEqual } from 'node:crypto'

// rawBody: the request body exactly as received, as text, before any JSON parsing.
// headers: the request headers, with lower-case names.
export function verifyEngageWebhook(rawBody, headers, secret, toleranceSeconds = ${SIGNATURE_TOLERANCE_SECONDS}) {
  const match = /^t=(\\d+),v1=([0-9a-f]{64})$/.exec(headers['x-engage-signature'] ?? '')
  if (!match) return false
  const timestamp = Number(match[1])
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false
  const expected = createHmac('sha256', secret).update(\`\${timestamp}.\${rawBody}\`).digest('hex')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(match[2]))
}`,
  python: `import hashlib
import hmac
import re
import time


def verify_engage_webhook(raw_body: bytes, signature_header: str, secret: str, tolerance: int = ${SIGNATURE_TOLERANCE_SECONDS}) -> bool:
    """raw_body is the request body as bytes, before any JSON parsing."""
    match = re.fullmatch(r"t=(\\d+),v1=([0-9a-f]{64})", signature_header.strip())
    if not match:
        return False
    timestamp = int(match.group(1))
    if abs(time.time() - timestamp) > tolerance:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, match.group(2))`,
  php: `<?php

// $rawBody: the request body exactly as received (file_get_contents('php://input')).
// $signatureHeader: the value of the X-Engage-Signature header.
function verify_engage_webhook(string $rawBody, string $signatureHeader, string $secret, int $tolerance = ${SIGNATURE_TOLERANCE_SECONDS}): bool
{
    if (!preg_match('/^t=(\\d+),v1=([0-9a-f]{64})$/', trim($signatureHeader), $m)) {
        return false;
    }
    $timestamp = (int) $m[1];
    if (abs(time() - $timestamp) > $tolerance) {
        return false;
    }
    $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
    return hash_equals($expected, $m[2]);
}`,
}

/** The webhook section, Markdown. No secrets and no site-specific values: safe to publish. */
export function webhookSectionMarkdown(): string {
  const events = WEBHOOK_EVENTS.map((event) => `| \`${event}\` | ${EVENT_FIELDS[event].map((f) => `\`${f}\``).join(', ')} |`).join('\n')
  return `## Webhooks

Webhooks tell your system when something happens on the site. The site sends an HTTPS POST with a JSON body to the address you set for the webhook.

### Events

| Event | Fields in \`data\` |
| --- | --- |
${events}

A webhook can also send a sample delivery from the Test button. Its event is \`webhook.test\`.

### Request

Each delivery is a POST with these headers:

| Header | Meaning |
| --- | --- |
| \`Content-Type\` | \`application/json\` |
| \`X-Engage-Event\` | The event name, for example \`order.paid\`. |
| \`X-Engage-Delivery\` | A unique id for this delivery. The same id is sent on retries and replays. |
| \`${SIGNATURE_HEADER}\` | \`t=<unix seconds>,v1=<hex>\`, described below. |

The default body is:

\`\`\`json
{
  "event": "content.published",
  "id": "dlv_3f9c...",
  "occurredAt": "2026-10-30T09:15:00.000Z",
  "data": { "id": 12, "collection": "posts", "title": "Spring menu", "slug": "spring-menu", "status": "published" }
}
\`\`\`

A webhook may use its own payload template instead. Merge tags such as \`{{data.title}}\` are filled from the same values.

### Verify the signature

The signature is an HMAC-SHA256 of the text \`<t>.<raw body>\`, using the webhook's signing secret (shown once when it was created). Check it against the raw body, before parsing JSON, and reject timestamps more than ${SIGNATURE_TOLERANCE_SECONDS / 60} minutes away from your clock.

**JavaScript (Node 18 or later)**

\`\`\`js
${CODE.js}
\`\`\`

**Python 3**

\`\`\`python
${CODE.python}
\`\`\`

**PHP 8**

\`\`\`php
${CODE.php}
\`\`\`

### Responding

Answer with any 2xx status within ${REQUEST_TIMEOUT_MS / 1000} seconds. Anything else, a timeout, or a redirect counts as a failed attempt. Redirects are not followed.

### Retries and replays

A failed delivery is tried again after ${RETRY_LIST}, up to ${MAX_ATTEMPTS} attempts in all. Deliveries that still fail are kept in the delivery log, where an admin can replay them. A replay sends the same body and the same \`X-Engage-Delivery\` id under a new signature, so store the ids you have handled and skip repeats.

### Limits

- A body can be at most ${MAX_PAYLOAD_BYTES.toLocaleString('en-US')} bytes. A larger payload is not sent.
- Each webhook has a rate limit (deliveries a minute) set in the builder. Deliveries over the limit are logged as skipped.
- The delivery log keeps each entry for ${DELIVERY_RETENTION_DAYS} days.
`
}

/** The whole webhook guide as its own document (Markdown). */
export function buildWebhookGuideMarkdown(siteName: string, generatedAt: string): string {
  return `# ${siteName}: webhooks guide

Generated ${generatedAt}. This guide holds no signing secrets.

${webhookSectionMarkdown()}`
}

const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const inline = (value: string): string => escape(value).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

/**
 * Turns the webhook Markdown into HTML for the HTML guide. Covers exactly the constructs this file
 * writes: headings, paragraphs, lists, tables, and fenced code. Anything else passes through as text.
 */
export function markdownSectionToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i += 1
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`)
      continue
    }
    if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`)
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`)
    else if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`)
    else if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      i -= 1
      const cells = (row: string) => row.slice(1, -1).split('|').map((c) => c.trim())
      const body = rows.slice(2).map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
      out.push(`<table><thead><tr>${cells(rows[0]).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`)
    } else if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) items.push(`<li>${inline(lines[i++].slice(2))}</li>`)
      i -= 1
      out.push(`<ul>${items.join('')}</ul>`)
    } else if (line.trim() !== '') out.push(`<p>${inline(line)}</p>`)
    i += 1
  }
  return out.join('\n')
}
