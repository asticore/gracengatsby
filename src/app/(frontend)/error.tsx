'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { sendClientErrorReport } from '@/features/errors/clientReport'

/**
 * Shown when a page on the public site fails while it is being drawn. The
 * error is reported to the error log once per failure, and the visitor gets a
 * plain message with a way to try again.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    void sendClientErrorReport({
      message: error.message || 'Unknown error',
      digest: error.digest,
      stack: error.stack,
      path: window.location.pathname,
    })
  }, [error])

  return (
    <section className="mx-auto max-w-[var(--max-width)] px-6 py-24 text-center" aria-labelledby="error-heading">
      <h1 id="error-heading" className="text-4xl text-[var(--color-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
        Something went wrong
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-[var(--color-ink)] opacity-80">
        This page could not be shown. Trying again often works. The site owner has been told about the problem.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-6">
        <button type="button" className="btn btn--primary" onClick={() => reset()}>
          Try again
        </button>
        <Link className="text-[var(--color-ink)] underline underline-offset-4" href="/">
          Go to the home page
        </Link>
      </div>
    </section>
  )
}