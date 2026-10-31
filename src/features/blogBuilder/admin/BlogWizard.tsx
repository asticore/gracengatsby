'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { adminCollectionPath } from '@/admin/adminPaths'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
import {
  BLOG_LENGTH_WORDS,
  parseKeywords,
  type BlogLength,
  type BlogMeta,
  type BlogOutlineItem,
  type BlogTone,
} from '../request'

import { BlogBuilderError, postBlogStep, type BlogStepBody, type BlogUsage } from './api'

type Step = 'brief' | 'titles' | 'outline' | 'write' | 'details' | 'done'
const STEP_ORDER: Step[] = ['brief', 'titles', 'outline', 'write', 'details']

const TONES: BlogTone[] = [
  'friendly',
  'professional',
  'warm',
  'playful',
  'authoritative',
  'inspirational',
]
const TONE_KEY: Record<BlogTone, UiStringKey> = {
  friendly: 'blog.ai.tone.friendly',
  professional: 'blog.ai.tone.professional',
  warm: 'blog.ai.tone.warm',
  playful: 'blog.ai.tone.playful',
  authoritative: 'blog.ai.tone.authoritative',
  inspirational: 'blog.ai.tone.inspirational',
}
const LENGTH_KEY: Record<BlogLength, UiStringKey> = {
  short: 'blog.ai.length.short',
  medium: 'blog.ai.length.medium',
  long: 'blog.ai.length.long',
}

type Props = {
  canUseAi: boolean
  usage: BlogUsage | null
  onUsage: (usage: BlogUsage | null) => void
  onClose: () => void
}

const usd = (value: number): string => `$${value.toFixed(2)}`

/** The guided flow: brief, title, outline, sections, details, then a saved draft. Nothing is published here. */
export function BlogWizard({ canUseAi, usage, onUsage, onClose }: Props) {
  const t = useAdminT()
  const [step, setStep] = useState<Step>('brief')
  const [topic, setTopic] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState<BlogTone>('friendly')
  const [length, setLength] = useState<BlogLength>('medium')
  const [keywords, setKeywords] = useState('')
  const [callToAction, setCallToAction] = useState('')
  const [titles, setTitles] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [outline, setOutline] = useState<BlogOutlineItem[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [meta, setMeta] = useState({
    metaTitle: '',
    metaDescription: '',
    slug: '',
    tags: '',
    category: '',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; slug: string } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
    }
  }, [])

  const brief = () => ({
    topic: topic.trim(),
    audience: audience.trim(),
    tone,
    length,
    keywords: parseKeywords(keywords),
    callToAction: callToAction.trim(),
  })

  /** One AI step. Shows the progress count, records the usage, and reports errors in the dialog. */
  const run = async <T,>(
    label: string,
    body: BlogStepBody,
    pick: (data: Record<string, unknown>) => T,
  ): Promise<T | null> => {
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setBusy(label)
    setProgress(0)
    setError(null)
    try {
      const data = await postBlogStep(body, {
        signal: ctrl.signal,
        onProgress: (chars) => mounted.current && setProgress(chars),
      })
      if (!mounted.current) return null
      if (data.usage && typeof data.usage === 'object') onUsage(data.usage as BlogUsage)
      return pick(data)
    } catch (caught) {
      if (!mounted.current || ctrl.signal.aborted) return null
      setError(caught instanceof BlogBuilderError ? caught.message : t('blog.ai.failed'))
      return null
    } finally {
      if (mounted.current) {
        setBusy(null)
        setProgress(null)
      }
    }
  }

  const goTitles = async () => {
    if (!topic.trim()) return setError(t('blog.ai.topicRequired'))
    setStep('titles')
    const found = await run(
      'titles',
      { action: 'titles', brief: brief() },
      (d) => d.titles as string[],
    )
    if (found?.length) {
      setTitles(found)
      setTitle(found[0])
    }
  }

  const goOutline = async () => {
    if (!title.trim()) return setError(t('blog.ai.titleRequired'))
    setStep('outline')
    const found = await run(
      'outline',
      { action: 'outline', brief: brief(), title: title.trim() },
      (d) => d.outline as BlogOutlineItem[],
    )
    if (found?.length) setOutline(found)
  }

  const goWrite = () => {
    if (outline.length === 0) return setError(t('blog.ai.failed'))
    setSections(outline.map((_, index) => sections[index] ?? ''))
    setError(null)
    setStep('write')
  }

  /** Writes one section. The earlier sections are sent so the text does not repeat itself. */
  const writeSection = async (index: number, current: string[]): Promise<string[] | null> => {
    const text = await run(
      'section',
      {
        action: 'section',
        brief: brief(),
        title: title.trim(),
        outline,
        index,
        sections: current.slice(0, index),
      },
      (d) => String(d.text ?? ''),
    )
    if (text === null) return null
    const next = [...current]
    next[index] = text
    if (mounted.current) setSections(next)
    return next
  }

  const writeAll = async () => {
    let working = outline.map((_, index) => sections[index] ?? '')
    for (let index = 0; index < outline.length; index++) {
      if (working[index]) continue
      const next = await writeSection(index, working)
      if (!next) return
      working = next
    }
  }

  const goDetails = async () => {
    if (sections.some((text) => !text.trim())) return setError(t('blog.ai.writeFirst'))
    setStep('details')
    const found = await run(
      'details',
      { action: 'details', brief: brief(), title: title.trim(), outline, sections },
      (d) => d.meta as BlogMeta,
    )
    if (found) setMeta({ ...found, tags: found.tags.join(', ') })
  }

  const createDraft = async () => {
    const tags = parseKeywords(meta.tags)
    setBusy('create')
    setError(null)
    try {
      const data = await postBlogStep({
        action: 'create',
        title: title.trim(),
        outline,
        sections,
        meta: {
          metaTitle: meta.metaTitle.trim(),
          metaDescription: meta.metaDescription.trim(),
          slug: meta.slug.trim(),
          tags,
          category: meta.category.trim(),
        },
      })
      if (!mounted.current) return
      setCreated({ id: String(data.id), slug: String(data.slug) })
      setStep('done')
    } catch (caught) {
      if (mounted.current)
        setError(caught instanceof BlogBuilderError ? caught.message : t('blog.ai.failed'))
    } finally {
      if (mounted.current) setBusy(null)
    }
  }

  const updateSection = (index: number, value: string) =>
    setSections((prev) => prev.map((text, i) => (i === index ? value : text)))
  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= outline.length) return
    const swap = <V,>(list: V[]) => {
      const copy = [...list]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    }
    setOutline((prev) => swap(prev))
    setSections((prev) =>
      swap(prev.length === outline.length ? prev : outline.map((_, i) => prev[i] ?? '')),
    )
  }
  const removeSection = (index: number) => {
    setOutline((prev) => prev.filter((_, i) => i !== index))
    setSections((prev) => prev.filter((_, i) => i !== index))
  }
  const addSection = () => {
    setOutline((prev) => [...prev, { heading: '', notes: '' }])
    setSections((prev) => [...prev, ''])
  }
  const updateOutline = (index: number, patch: Partial<BlogOutlineItem>) =>
    setOutline((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const stepIndex = STEP_ORDER.indexOf(step)
  const totalSteps = STEP_ORDER.length
  const busyNow = busy !== null
  const outlineReady = outline.length > 0 && outline.every((item) => item.heading.trim())

  if (!canUseAi) {
    return <p role="alert">{t('blog.ai.noKey')}</p>
  }

  let body: ReactNode
  if (step === 'brief') {
    body = (
      <form
        className="blog-ai__form"
        onSubmit={(event) => {
          event.preventDefault()
          void goTitles()
        }}
      >
        <label className="blog-ai__field">
          <span>{t('blog.ai.topic')}</span>
          <small>{t('blog.ai.topicHint')}</small>
          <textarea
            required
            rows={2}
            maxLength={300}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus
          />
        </label>
        <label className="blog-ai__field">
          <span>{t('blog.ai.audience')}</span>
          <input
            type="text"
            maxLength={200}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />
        </label>
        <div className="blog-ai__row">
          <label className="blog-ai__field">
            <span>{t('blog.ai.tone')}</span>
            <select value={tone} onChange={(e) => setTone(e.target.value as BlogTone)}>
              {TONES.map((value) => (
                <option key={value} value={value}>
                  {t(TONE_KEY[value])}
                </option>
              ))}
            </select>
          </label>
          <label className="blog-ai__field">
            <span>{t('blog.ai.length')}</span>
            <select value={length} onChange={(e) => setLength(e.target.value as BlogLength)}>
              {(Object.keys(BLOG_LENGTH_WORDS) as BlogLength[]).map((value) => (
                <option key={value} value={value}>
                  {t(LENGTH_KEY[value], { words: BLOG_LENGTH_WORDS[value] })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="blog-ai__field">
          <span>{t('blog.ai.keywords')}</span>
          <small>{t('blog.ai.keywordsHint')}</small>
          <input
            type="text"
            maxLength={300}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </label>
        <label className="blog-ai__field">
          <span>{t('blog.ai.cta')}</span>
          <small>{t('blog.ai.ctaHint')}</small>
          <input
            type="text"
            maxLength={200}
            value={callToAction}
            onChange={(e) => setCallToAction(e.target.value)}
          />
        </label>
      </form>
    )
  } else if (step === 'titles') {
    body = (
      <fieldset className="blog-ai__form">
        <legend>{t('blog.ai.titlesHeading')}</legend>
        {titles.map((option) => (
          <label key={option} className="blog-ai__choice">
            <input
              type="radio"
              name="blog-ai-title"
              checked={title === option}
              onChange={() => setTitle(option)}
            />
            <span>{option}</span>
          </label>
        ))}
        <label className="blog-ai__field">
          <span>{t('blog.ai.titleOther')}</span>
          <input
            type="text"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </fieldset>
    )
  } else if (step === 'outline') {
    body = (
      <div className="blog-ai__form">
        <p className="blog-ai__hint">{t('blog.ai.outlineHint')}</p>
        <ol className="blog-ai__outline">
          {outline.map((item, index) => (
            <li key={index} className="blog-ai__outline-row">
              <input
                type="text"
                aria-label={t('blog.ai.sectionHeading')}
                maxLength={120}
                value={item.heading}
                onChange={(e) => updateOutline(index, { heading: e.target.value })}
              />
              <input
                type="text"
                aria-label={t('blog.ai.sectionNotes')}
                maxLength={300}
                value={item.notes}
                onChange={(e) => updateOutline(index, { notes: e.target.value })}
              />
              <button
                type="button"
                className="btn"
                onClick={() => moveSection(index, -1)}
                disabled={index === 0}
                aria-label={t('blog.ai.moveUp')}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => moveSection(index, 1)}
                disabled={index === outline.length - 1}
                aria-label={t('blog.ai.moveDown')}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => removeSection(index)}
                disabled={outline.length <= 1}
              >
                {t('blog.ai.remove')}
              </button>
            </li>
          ))}
        </ol>
        <div>
          <button type="button" className="btn" onClick={addSection}>
            {t('blog.ai.addSection')}
          </button>
        </div>
      </div>
    )
  } else if (step === 'write') {
    body = (
      <div className="blog-ai__form">
        <div>
          <button type="button" className="btn" onClick={() => void writeAll()} disabled={busyNow}>
            {t('blog.ai.writeAll')}
          </button>
        </div>
        {outline.map((item, index) => (
          <section key={index} className="blog-ai__section">
            <h3>{item.heading}</h3>
            <label className="blog-ai__field">
              <span className="blog-ai__sr">
                {t('blog.ai.sectionLabel', { heading: item.heading })}
              </span>
              <textarea
                rows={6}
                value={sections[index] ?? ''}
                onChange={(e) => updateSection(index, e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => void writeSection(index, sections)}
              disabled={busyNow}
            >
              {sections[index] ? t('blog.ai.rewriteSection') : t('blog.ai.writeSection')}
            </button>
          </section>
        ))}
      </div>
    )
  } else if (step === 'details') {
    body = (
      <form
        className="blog-ai__form"
        onSubmit={(event) => {
          event.preventDefault()
          void createDraft()
        }}
      >
        <h3>{t('blog.ai.detailsHeading')}</h3>
        <label className="blog-ai__field">
          <span>{t('blog.ai.metaTitle')}</span>
          <input
            type="text"
            maxLength={70}
            value={meta.metaTitle}
            onChange={(e) => setMeta({ ...meta, metaTitle: e.target.value })}
          />
        </label>
        <label className="blog-ai__field">
          <span>{t('blog.ai.metaDescription')}</span>
          <textarea
            rows={3}
            maxLength={200}
            value={meta.metaDescription}
            onChange={(e) => setMeta({ ...meta, metaDescription: e.target.value })}
          />
        </label>
        <label className="blog-ai__field">
          <span>{t('blog.ai.slug')}</span>
          <input
            type="text"
            maxLength={100}
            value={meta.slug}
            onChange={(e) => setMeta({ ...meta, slug: e.target.value })}
          />
        </label>
        <label className="blog-ai__field">
          <span>{t('blog.ai.tags')}</span>
          <input
            type="text"
            maxLength={300}
            value={meta.tags}
            onChange={(e) => setMeta({ ...meta, tags: e.target.value })}
          />
        </label>
        <label className="blog-ai__field">
          <span>{t('blog.ai.category')}</span>
          <input
            type="text"
            maxLength={60}
            value={meta.category}
            onChange={(e) => setMeta({ ...meta, category: e.target.value })}
          />
        </label>
      </form>
    )
  } else {
    body = (
      <div className="blog-ai__form">
        <h3>{t('blog.ai.doneTitle')}</h3>
        <p>{t('blog.ai.doneBody')}</p>
        {created ? (
          <p>
            <AdminLink
              path={`${adminCollectionPath('posts', '')}/${created.id}`}
              className="btn btn--primary"
            >
              {t('blog.ai.openDraft')}
            </AdminLink>
          </p>
        ) : null}
      </div>
    )
  }

  const restart = () => {
    controller.current?.abort()
    setStep('brief')
    setTitles([])
    setOutline([])
    setSections([])
    setCreated(null)
    setError(null)
  }

  return (
    <>
      <div className="blog-ai__head">
        <p className="blog-ai__step">
          {step === 'done' ? null : t('blog.ai.step', { step: stepIndex + 1, total: totalSteps })}
        </p>
        <button type="button" className="btn" onClick={onClose}>
          {t('blog.ai.close')}
        </button>
      </div>
      {usage ? (
        <p className="blog-ai__usage">
          {usage.capUsd > 0
            ? t('blog.ai.usageCap', { cost: usd(usage.estCostUsd), cap: usd(usage.capUsd) })
            : t('blog.ai.usage', { cost: usd(usage.estCostUsd) })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="blog-ai__error">
          {error}
        </p>
      ) : null}
      {busy !== null ? (
        <p className="blog-ai__busy" role="status">
          {busy === 'create'
            ? t('blog.ai.creating')
            : progress && progress > 0
              ? t('blog.ai.writing', { count: progress.toLocaleString('en-US') })
              : t('blog.ai.busy')}
        </p>
      ) : null}
      {body}
      <div className="blog-ai__footer">
        {step === 'brief' ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void goTitles()}
            disabled={busyNow}
          >
            {t('blog.ai.suggestTitles')}
          </button>
        ) : null}
        {step === 'titles' ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setStep('brief')}
              disabled={busyNow}
            >
              {t('blog.ai.back')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void goTitles()}
              disabled={busyNow}
            >
              {t('blog.ai.regenerate')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void goOutline()}
              disabled={busyNow || !title.trim()}
            >
              {t('blog.ai.next')}
            </button>
          </>
        ) : null}
        {step === 'outline' ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setStep('titles')}
              disabled={busyNow}
            >
              {t('blog.ai.back')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void goOutline()}
              disabled={busyNow}
            >
              {t('blog.ai.regenerate')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={goWrite}
              disabled={busyNow || !outlineReady}
            >
              {t('blog.ai.next')}
            </button>
          </>
        ) : null}
        {step === 'write' ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setStep('outline')}
              disabled={busyNow}
            >
              {t('blog.ai.back')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void goDetails()}
              disabled={busyNow || sections.some((text) => !text.trim())}
            >
              {t('blog.ai.next')}
            </button>
          </>
        ) : null}
        {step === 'details' ? (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setStep('write')}
              disabled={busyNow}
            >
              {t('blog.ai.back')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void goDetails()}
              disabled={busyNow}
            >
              {t('blog.ai.suggestDetails')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void createDraft()}
              disabled={busyNow || !meta.metaTitle.trim() || !meta.slug.trim()}
            >
              {t('blog.ai.createDraft')}
            </button>
          </>
        ) : null}
        {step === 'done' ? (
          <button type="button" className="btn" onClick={restart}>
            {t('blog.ai.startAgain')}
          </button>
        ) : null}
      </div>
    </>
  )
}
