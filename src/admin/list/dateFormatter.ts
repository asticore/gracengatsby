/**
 * Pure date formatting for list cells.
 * Deterministic and identical on server and client.
 * Uses fixed locale 'en-GB' with explicit timeZone to avoid hydration mismatches.
 */

/**
 * Format an ISO date string for list display.
 * Uses 'en-GB' locale with UTC timeZone for consistency between server and client.
 * Returns empty string for invalid/null/undefined input.
 *
 * Example: '2026-10-06T14:30:00.000Z' -> '06/10/2026, 14:30'
 */
export function formatDateCell(dateStr: unknown): string {
  if (dateStr === null || dateStr === undefined) {
    return ''
  }

  if (typeof dateStr !== 'string') {
    return ''
  }

  // Validate ISO date format (simple check)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    return ''
  }

  try {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) {
      return ''
    }

    // Fixed locale and timeZone for deterministic output
    return d.toLocaleString('en-GB', {
      dateStyle: 'short', // DD/MM/YYYY
      timeStyle: 'short', // HH:MM (24-hour)
      timeZone: 'UTC',
    })
  } catch {
    return ''
  }
}
