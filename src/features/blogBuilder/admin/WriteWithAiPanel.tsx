'use client'

import { useEffect, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { BlogWizard } from './BlogWizard'
import { fetchBlogStatus, type BlogStatus, type BlogUsage } from './api'
import './blog-builder.css'

/**
 * "Write with AI" on the Blog list. Rendered through the posts collection's
 * admin.components.beforeList. It shows nothing when the admin cannot create posts
 * (the status call answers 403) or when the page cannot reach the builder.
 */
export function WriteWithAiPanel() {
  const t = useAdminT()
  const [status, setStatus] = useState<BlogStatus | null>(null)
  const [usage, setUsage] = useState<BlogUsage | null>(null)
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetchBlogStatus(ctrl.signal)
      .then((next) => {
        setStatus(next)
        setUsage(next.usage)
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setHidden(true)
      })
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (hidden || !status) return null

  const canUseAi = status.providers.claude || status.providers.openai

  return (
    <div className="blog-ai__launch">
      <button
        type="button"
        className="btn btn--primary"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t('blog.ai.open')}
      </button>
      {open ? (
        <div className="blog-ai__overlay">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="blog-ai-title"
            className="blog-ai__dialog"
          >
            <h2 id="blog-ai-title">{t('blog.ai.dialogTitle')}</h2>
            <p className="blog-ai__intro">{t('blog.ai.intro')}</p>
            <BlogWizard
              canUseAi={canUseAi}
              usage={usage}
              onUsage={setUsage}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
