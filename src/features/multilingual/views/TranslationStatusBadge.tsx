import React from 'react'

import type { TranslationStatus } from '../translationStatus'

/** One status, as a coloured pill. The text carries the meaning; colour only reinforces it. */
const TONE: Record<TranslationStatus, string> = {
  missing: 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-600)]',
  machine_draft: 'border-[var(--theme-info-500,#3b82f6)] text-[var(--theme-info-500,#3b82f6)]',
  needs_review: 'border-[var(--theme-warning-500,#d97706)] text-[var(--theme-warning-500,#d97706)]',
  approved: 'border-[var(--theme-success-500,#16a34a)] text-[var(--theme-success-500,#16a34a)]',
}

export function TranslationStatusBadge({ status, label }: { status: TranslationStatus; label: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-[8px] py-[1px] text-[12px] font-medium ${TONE[status]}`}
      data-status={status}
    >
      {label}
    </span>
  )
}

/** The message a REST or bulk error carries, whichever shape it came back in. */
export function errorMessageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    if (typeof record.error === 'string') return record.error
    if (typeof record.message === 'string') return record.message
    const errors = record.errors
    if (Array.isArray(errors) && errors[0] && typeof (errors[0] as { message?: unknown }).message === 'string') {
      return (errors[0] as { message: string }).message
    }
  }
  return fallback
}
