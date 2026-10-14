import React from 'react'

/**
 * The screen visitors see while maintenance mode is on. Plain markup, styled by the theme variables the
 * root layout already sets, so it follows light and dark mode with no CSS of its own.
 */
export function MaintenanceScreen({ headline, message }: { headline: string; message: string }) {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-[var(--max-width)] flex-col items-center justify-center px-6 py-24 text-center" aria-labelledby="maintenance-heading">
      <h1 id="maintenance-heading" className="text-4xl text-[var(--color-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
        {headline}
      </h1>
      {message && <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-[var(--color-ink)] opacity-80">{message}</p>}
    </section>
  )
}
