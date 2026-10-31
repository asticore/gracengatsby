'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { AdminLink } from '@/admin/adminRoute/AdminLink'
import React, { useMemo, useState } from 'react'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { lintEmail, renderEmailHtml, type EmailBlock, type EmailBrand } from '@/features/email/design'
import { EMAIL_TEMPLATE_DEFAULTS } from '@/features/email/templateDefaults'
import { BlockList } from './BlockList'
import { BrandPanel } from './BrandPanel'
import { type LogoChoice } from './LogoPicker'
import { PreviewPane, type PreviewDevice, type PreviewTheme } from './PreviewPane'
import { sampleVars, starterBlocks, tagsFor } from './designerModel'
import '../email-designer.css'

export type DesignerTemplate = {
  key: string
  label: string
  subject: string
  defaultSubject: string
  hasDesign: boolean
  blocks: EmailBlock[]
}

type Props = { templates: DesignerTemplate[]; brand: EmailBrand; logo: LogoChoice | null }

type Draft = { subject: string; blocks: EmailBlock[]; designed: boolean }
/** The brand look and the chosen logo, saved together. The brand's logoUrl always follows the logo. */
type BrandDraft = { brand: EmailBrand; logo: LogoChoice | null }
type Notice = { tone: 'ok' | 'error'; text: string } | null

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const SAVE_FAILED = 'The change could not be saved. Try again.'

/** Posts one change to the design route. Returns the reason when it fails. */
const post = async (payload: Record<string, unknown>): Promise<string | null> => {
  try {
    const response = await fetch('/api/admin-email-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    if (response.ok) return null
    const data = (await response.json().catch((): null => null)) as { error?: string } | null
    return data?.error || SAVE_FAILED
  } catch {
    return 'The change could not be saved. Check your connection and try again.'
  }
}

const draftFor = (template: DesignerTemplate): Draft => ({ subject: template.subject, blocks: template.blocks, designed: template.hasDesign })

/** The Email designer screen: pick an email, edit its subject and blocks, see the preview, save. */
export function EmailDesignerClient({ templates, brand: initialBrand, logo: initialLogo }: Props) {
  const t = useAdminT()
  const [key, setKey] = useState(templates[0]?.key ?? '')
  const [saved, setSaved] = useState<Record<string, Draft>>(() => Object.fromEntries(templates.map((t) => [t.key, draftFor(t)])))
  const [drafts, setDrafts] = useState<Record<string, Draft>>(saved)
  const [brandDraft, setBrandDraft] = useState<BrandDraft>({ brand: initialBrand, logo: initialLogo })
  const [savedBrand, setSavedBrand] = useState<BrandDraft>({ brand: initialBrand, logo: initialLogo })
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [theme, setTheme] = useState<PreviewTheme>('light')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const brand = brandDraft.brand
  const template = templates.find((t) => t.key === key)
  const draft: Draft = drafts[key] ?? { subject: '', blocks: [], designed: false }
  const dirty = !same(draft, saved[key])
  const brandDirty = !same(brandDraft, savedBrand)
  const setBrand = (next: EmailBrand) => setBrandDraft((current) => ({ ...current, brand: next }))
  const setLogo = (next: LogoChoice | null) => setBrandDraft((current) => ({ logo: next, brand: { ...current.brand, logoUrl: next?.url ?? '' } }))
  const tags = tagsFor(key)

  const html = useMemo(
    () => renderEmailHtml(draft.blocks, brand, { preheader: draft.subject, title: draft.subject, vars: sampleVars(key) }),
    [draft.blocks, draft.subject, brand, key],
  )
  const warnings = useMemo(() => lintEmail(draft.blocks, { brand }), [draft.blocks, brand])

  const patchDraft = (patch: Partial<Draft>) => {
    setNotice(null)
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? draft), ...patch } }))
  }

  const pickTemplate = (next: string) => {
    setNotice(null)
    setKey(next)
  }

  const save = async () => {
    setBusy(true)
    const error = await post({ kind: 'template', key, subject: draft.subject, blocks: draft.blocks })
    setBusy(false)
    if (error) return setNotice({ tone: 'error', text: error })
    setSaved((current) => ({ ...current, [key]: { ...draft, designed: true } }))
    setDrafts((current) => ({ ...current, [key]: { ...draft, designed: true } }))
    setNotice({ tone: 'ok', text: 'Saved. The site will use this design for this email.' })
  }

  const resetWording = async () => {
    if (!window.confirm('Go back to the built-in wording for this email? Its design will be removed.')) return
    setBusy(true)
    const error = await post({ kind: 'reset', key })
    setBusy(false)
    if (error) return setNotice({ tone: 'error', text: error })
    const defaults = EMAIL_TEMPLATE_DEFAULTS[key as keyof typeof EMAIL_TEMPLATE_DEFAULTS]
    const fresh: Draft = { subject: template?.defaultSubject ?? '', blocks: starterBlocks(defaults?.body ?? ''), designed: false }
    setSaved((current) => ({ ...current, [key]: fresh }))
    setDrafts((current) => ({ ...current, [key]: fresh }))
    setNotice({ tone: 'ok', text: 'Back to the built-in wording. Save a design again to use one.' })
  }

  const saveBrand = async () => {
    setBusy(true)
    const error = await post({ kind: 'brand', brand: brandDraft.brand, logo: brandDraft.logo?.id ?? null })
    setBusy(false)
    if (error) return setNotice({ tone: 'error', text: error })
    setSavedBrand(brandDraft)
    setNotice({ tone: 'ok', text: 'Brand look saved.' })
  }

  return (
    <div className="ed-page">
      <header className="ed-header">
        <h1 className="ed-title">Email designer</h1>
        <p className="ed-intro">
          Design the look of each automatic email. The preview updates as you type. Save to use the design on the site.{' '}
          <AdminLink path="/settings/communication">Back to Communication settings</AdminLink>
        </p>
      </header>

      <div className="ed-layout">
        <div className="ed-main">
          <section className="ed-section" aria-label={t('aria.email.chooseEmail')}>
            <label className="ed-field">
              <span className="ed-field__label">Email to design</span>
              <select className="ed-input" value={key} onChange={(event) => pickTemplate(event.target.value)}>
                {templates.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                    {item.hasDesign ? '' : ' (plain layout)'}
                  </option>
                ))}
              </select>
            </label>

            <label className="ed-field">
              <span className="ed-field__label">Subject line</span>
              <input className="ed-input" type="text" maxLength={300} value={draft.subject} onChange={(event) => patchDraft({ subject: event.target.value })} />
              <span className="ed-field__hint">Tags are filled in when the email is sent.</span>
            </label>

            <div className="ed-tags" aria-label={t('aria.email.tags')}>
              <span className="ed-field__label">Tags you can use</span>
              {tags.length === 0 && <span className="ed-muted">This email has no tags.</span>}
              {tags.map((tag) => (
                <code key={tag} className="ed-tag">{`{{${tag}}}`}</code>
              ))}
            </div>

            <p className="ed-status" role="status" aria-live="polite">
              {dirty ? 'You have unsaved changes.' : draft.designed ? 'This design is saved.' : 'This email uses the plain built-in layout.'}
            </p>
            {notice && <p className={`ed-notice ed-notice--${notice.tone}`}>{notice.text}</p>}

            <div className="ed-actions">
              <button type="button" className="ed-button ed-button--primary" disabled={busy || !dirty || !draft.subject.trim()} onClick={save}>
                {busy ? 'Saving...' : 'Save this email'}
              </button>
              <button type="button" className="ed-button ed-button--quiet" disabled={busy || !template} onClick={resetWording}>
                Reset to default wording
              </button>
            </div>
          </section>

          <CollapsibleCard id="email-designer-blocks" title="Email content">
            <BlockList blocks={draft.blocks} onChange={(blocks) => patchDraft({ blocks })} />
          </CollapsibleCard>

          <CollapsibleCard id="email-designer-brand" title="Brand look">
            <BrandPanel brand={brand} logo={brandDraft.logo} dirty={brandDirty} saving={busy} onChange={setBrand} onLogo={setLogo} onSave={saveBrand} />
          </CollapsibleCard>

          <CollapsibleCard id="email-designer-checks" title={`Checks (${warnings.length})`}>
            {warnings.length === 0 ? (
              <p className="ed-muted">No problems found.</p>
            ) : (
              <ul className="ed-checks">
                {warnings.map((warning) => (
                  <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
                ))}
              </ul>
            )}
          </CollapsibleCard>
        </div>

        <aside className="ed-side">
          <PreviewPane html={html} device={device} theme={theme} onDevice={setDevice} onTheme={setTheme} />
        </aside>
      </div>
    </div>
  )
}
