/**
 * Product review rules. Pure, no I/O: validation, spam trapping and the rating summary.
 */

export const REVIEW_HONEYPOT_FIELD = 'website'
export const REVIEW_STATUSES = ['pending', 'approved', 'spam'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** Reviews a single client may submit per minute (on top of the site-wide API limit). */
export const REVIEW_RATE_LIMIT_PER_MINUTE = 3

export type ReviewInput = { product?: unknown; name?: unknown; email?: unknown; rating?: unknown; text?: unknown; [REVIEW_HONEYPOT_FIELD]?: unknown }

export type CleanReview = { product: number; name: string; email: string; rating: number; text: string }

export type ReviewCheck =
  | { ok: true; review: CleanReview }
  | { ok: false; spam: true }
  | { ok: false; spam: false; errors: Record<string, string> }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** A filled honeypot means a bot: the caller answers as if it worked and stores nothing. */
export function checkReview(input: ReviewInput): ReviewCheck {
  if (typeof input[REVIEW_HONEYPOT_FIELD] === 'string' && (input[REVIEW_HONEYPOT_FIELD] as string).trim() !== '') return { ok: false, spam: true }
  const errors: Record<string, string> = {}
  const product = Number(input.product)
  if (!Number.isInteger(product) || product < 1) errors.product = 'Unknown product.'
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name || name.length > 80) errors.name = 'Enter your name (80 characters at most).'
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 200) errors.email = 'Enter a valid email address.'
  const rating = Number(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Choose a rating from 1 to 5.'
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text.length < 3 || text.length > 4000) errors.text = 'Write a review of 3 to 4000 characters.'
  if (Object.keys(errors).length > 0) return { ok: false, spam: false, errors }
  return { ok: true, review: { product, name, email, rating, text } }
}

export type RatingSummary = { average: number | null; count: number }

/** Average (one decimal) and count over approved reviews only. */
export function summariseRatings(reviews: Array<{ rating?: number | null; status?: string | null }>): RatingSummary {
  const approved = reviews.filter((review) => review.status === 'approved' && typeof review.rating === 'number')
  if (approved.length === 0) return { average: null, count: 0 }
  const sum = approved.reduce((total, review) => total + (review.rating as number), 0)
  return { average: Math.round((sum / approved.length) * 10) / 10, count: approved.length }
}

/** schema.org aggregateRating, or null when there is nothing to report. */
export function aggregateRatingJsonLd(summary: RatingSummary): Record<string, unknown> | null {
  if (!summary.average || summary.count < 1) return null
  return { '@type': 'AggregateRating', ratingValue: summary.average, reviewCount: summary.count, bestRating: 5, worstRating: 1 }
}
