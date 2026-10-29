'use client'

import React, { useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { STYLE_PRESETS } from '@/features/forms/config'
import { iframeSnippet, scriptSnippet } from '@/features/forms/embedScript'
import type { FormConfig, FormNotificationRule, FormStylePreset, FormWebhook } from '@/features/forms/types'

/**
 * The "Form" tab of the editor dock: everything about the form that is not a
 * field. Writes into one `formConfig` object (see features/forms/config.ts);
 * the server normalises it again on save, so nothing here is trusted either.
 */

type Props = {
  config: FormConfig
  onChange: (next: FormConfig) => void
  formId: string | undefined
  embedKey: string | undefined
  formStatus: 'draft' | 'published'
  hasUnpublishedChanges: boolean
  isAdmin: boolean
  busy: boolean
  onPublish: () => void
  onUnpublish: () => void
}

const Section: React.FC<{ title: string; children: React.ReactNode; open?: boolean }> = ({ title, children, open }) => (
  <details className="ve-form-section" open={open}>
    <summary>{title}</summary>
    <div className="ve-section-fields">{children}</div>
  </details>
)

const uid = (): string => `x${Math.random().toString(36).slice(2, 8)}`

export const FormSettingsPanel: React.FC<Props> = ({ config, onChange, formId, embedKey, formStatus, hasUnpublishedChanges, isAdmin, busy, onPublish, onUnpublish }) => {
  const t = useAdminT()
  const [copied, setCopied] = useState<string | null>(null)
  const set = <K extends keyof FormConfig>(key: K, value: FormConfig[K]) => onChange({ ...config, [key]: value })
  const style = config.style || {}
  const steps = config.steps || {}
  const success = config.success || {}
  const embed = config.embed || {}
  const rules = config.notifications || []
  const hooks = config.webhooks || []
  const origins = embed.allowedOrigins || []
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const key = embedKey || formId || ''

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  const setRule = (index: number, patch: Partial<FormNotificationRule>) => set('notifications', rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  const setHook = (index: number, patch: Partial<FormWebhook>) => set('webhooks', hooks.map((hook, i) => (i === index ? { ...hook, ...patch } : hook)))

  return (
    <div className="ve-panel ve-form-settings">
      <div className="ve-panel__body">
        <Section title={t('ve.form.sectionStatus')} open>
          <p className="ve-panel__hint">
            This form is <strong>{formStatus === 'published' ? 'published' : 'a draft'}</strong>.
            {formStatus === 'published' && hasUnpublishedChanges ? t('ve.fsp.unpubChanges') : ''}
          </p>
          <div className="ve-col-row">
            <button type="button" className="ve-btn ve-btn--primary" onClick={onPublish} disabled={busy}>
              {formStatus === 'published' ? t('ve.form.publishChanges') : t('ve.form.publish')}
            </button>
            {formStatus === 'published' && (
              <button type="button" className="ve-btn ve-btn--ghost" onClick={onUnpublish} disabled={busy}>
                Unpublish
              </button>
            )}
          </div>
        </Section>

        <Section title={t('ve.form.sectionLook')}>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.style')}</span>
            <select value={style.preset || 'theme'} onChange={(event) => set('style', { ...style, preset: event.target.value as FormStylePreset })}>
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label} - {preset.description}
                </option>
              ))}
            </select>
          </label>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.accent')}</span>
            <input type="text" placeholder="#2e3192" value={style.accent || ''} onChange={(event) => set('style', { ...style, accent: event.target.value })} />
          </label>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.customCss')}</span>
            <textarea rows={6} spellCheck={false} value={style.customCss || ''} onChange={(event) => set('style', { ...style, customCss: event.target.value })} />
            <span className="ve-field__help">{t('ve.fsp.customCssHelp')}</span>
          </label>
        </Section>

        <Section title={t('ve.form.sectionSteps')}>
          <p className="ve-panel__hint">{t('ve.fsp.stepHint')}</p>
          <label className="ve-field ve-field--checkbox">
            <input type="checkbox" checked={steps.showProgress !== false} onChange={(event) => set('steps', { ...steps, showProgress: event.target.checked })} />
            <span>{t('ve.fsp.showProgress')}</span>
          </label>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.progressStyle')}</span>
            <select value={steps.progressStyle || 'bar'} onChange={(event) => set('steps', { ...steps, progressStyle: event.target.value as 'bar' | 'steps' | 'text' })}>
              <option value="bar">{t('ve.fsp.progBar')}</option>
              <option value="steps">{t('ve.fsp.progSteps')}</option>
              <option value="text">{t('ve.fsp.progText')}</option>
            </select>
          </label>
          <div className="ve-col-row">
            <input type="text" aria-label={t('ve.form.nextLabel')} placeholder={t('ve.form.next')} value={steps.nextLabel || ''} onChange={(event) => set('steps', { ...steps, nextLabel: event.target.value })} />
            <input type="text" aria-label={t('ve.form.backLabel')} placeholder={t('ve.form.back')} value={steps.backLabel || ''} onChange={(event) => set('steps', { ...steps, backLabel: event.target.value })} />
          </div>
        </Section>

        <Section title={t('ve.form.sectionAfter')}>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.whatHappens')}</span>
            <select value={success.mode || 'message'} onChange={(event) => set('success', { ...success, mode: event.target.value as 'message' | 'redirect' })}>
              <option value="message">{t('ve.fsp.showMessage')}</option>
              <option value="redirect">{t('ve.fsp.goRedirect')}</option>
            </select>
          </label>
          {success.mode === 'redirect' ? (
            <label className="ve-field ve-field--full">
              <span>{t('ve.fsp.redirectAddr')}</span>
              <input type="text" placeholder="/thank-you" value={success.redirectUrl || ''} onChange={(event) => set('success', { ...success, redirectUrl: event.target.value })} />
            </label>
          ) : (
            <label className="ve-field ve-field--full">
              <span>{t('ve.fsp.messageLabel')}</span>
              <textarea rows={3} value={success.message || ''} onChange={(event) => set('success', { ...success, message: event.target.value })} />
            </label>
          )}
        </Section>

        <Section title={t('ve.form.sectionBehaviour')}>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.prefill')}</span>
            <input
              type="text"
              placeholder={t('ve.fsp.prefillPh')}
              value={(config.prefillKeys || []).join(', ')}
              onChange={(event) => set('prefillKeys', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
            />
            <span className="ve-field__help">{t('ve.fsp.prefillHelp')}</span>
          </label>
          <label className="ve-field ve-field--full">
            <span>{t('ve.fsp.retention')}</span>
            <input
              type="number"
              min={0}
              value={typeof config.retentionDays === 'number' ? config.retentionDays : ''}
              onChange={(event) => set('retentionDays', event.target.value === '' ? undefined : Number(event.target.value))}
            />
          </label>
        </Section>

        <Section title={t('ve.form.sectionNotifications')}>
          <p className="ve-panel__hint">{t('ve.fsp.notifyHint', { tags: '{{field name}}' })}</p>
          {rules.map((rule, index) => (
            <div className="ve-form-card" key={rule.id || index}>
              <label className="ve-field ve-field--checkbox">
                <input type="checkbox" checked={rule.enabled !== false} onChange={(event) => setRule(index, { enabled: event.target.checked })} />
                <span>{rule.name || `Notification ${index + 1}`}</span>
              </label>
              <input type="text" aria-label={t('ve.form.name')} placeholder={t('ve.form.name')} value={rule.name || ''} onChange={(event) => setRule(index, { name: event.target.value })} />
              <input type="text" aria-label={t('ve.form.sendToLabel')} placeholder={t('ve.form.sendTo')} value={rule.recipients || ''} onChange={(event) => setRule(index, { recipients: event.target.value })} />
              <input type="text" aria-label={t('ve.form.subject')} placeholder={t('ve.form.subject')} value={rule.subject || ''} onChange={(event) => setRule(index, { subject: event.target.value })} />
              <textarea rows={3} aria-label={t('ve.form.message')} placeholder={t('ve.form.message')} value={rule.message || ''} onChange={(event) => setRule(index, { message: event.target.value })} />
              <div className="ve-col-row">
                <label className="ve-field--checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.conditions?.enabled)}
                    onChange={(event) => setRule(index, { conditions: { ...(rule.conditions || { action: 'show', match: 'all', rules: [] }), enabled: event.target.checked } })}
                  />
                  <span>{t('ve.fsp.onlyWhen')}</span>
                </label>
                {rule.conditions?.enabled && (
                  <>
                    <input
                      type="text"
                      aria-label={t('ve.form.fieldName')}
                      placeholder={t('ve.fsp.fieldNamePh')}
                      value={rule.conditions.rules?.[0]?.field || ''}
                      onChange={(event) =>
                        setRule(index, { conditions: { ...rule.conditions, rules: [{ operator: 'equals', ...(rule.conditions?.rules?.[0] || {}), field: event.target.value }] } })
                      }
                    />
                    <span>{t('ve.fsp.is')}</span>
                    <input
                      type="text"
                      aria-label={t('ve.form.value')}
                      placeholder={t('ve.fsp.valuePh')}
                      value={rule.conditions.rules?.[0]?.value || ''}
                      onChange={(event) =>
                        setRule(index, { conditions: { ...rule.conditions, rules: [{ operator: 'equals', ...(rule.conditions?.rules?.[0] || {}), value: event.target.value }] } })
                      }
                    />
                  </>
                )}
              </div>
              <button type="button" className="ve-btn ve-btn--ghost" onClick={() => set('notifications', rules.filter((_, i) => i !== index))}>
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ve-btn ve-btn--ghost"
            disabled={rules.length >= 10}
            onClick={() => set('notifications', [...rules, { id: uid(), name: `Notification ${rules.length + 1}`, enabled: true, recipients: '', subject: 'New entry: {{form}}', message: '' }])}
          >
            + Add notification
          </button>
        </Section>

        {isAdmin && (
          <Section title={t('ve.form.sectionWebhooks')}>
            <p className="ve-panel__hint">{t('ve.fsp.webhookHint', { header: 'X-Engage-Signature' })}</p>
            {hooks.map((hook, index) => (
              <div className="ve-form-card" key={hook.id || index}>
                <label className="ve-field ve-field--checkbox">
                  <input type="checkbox" checked={hook.enabled !== false} onChange={(event) => setHook(index, { enabled: event.target.checked })} />
                  <span>{hook.name || `Webhook ${index + 1}`}</span>
                </label>
                <input type="text" aria-label={t('ve.form.name')} placeholder={t('ve.form.name')} value={hook.name || ''} onChange={(event) => setHook(index, { name: event.target.value })} />
                <input type="url" aria-label={t('ve.form.url')} placeholder="https://example.com/hook" value={hook.url || ''} onChange={(event) => setHook(index, { url: event.target.value })} />
                <input type="password" aria-label={t('ve.form.signingSecret')} placeholder={t('ve.form.signingSecret')} autoComplete="new-password" value={hook.secret || ''} onChange={(event) => setHook(index, { secret: event.target.value })} />
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => set('webhooks', hooks.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ve-btn ve-btn--ghost"
              disabled={hooks.length >= 5}
              onClick={() => set('webhooks', [...hooks, { id: uid(), name: `Webhook ${hooks.length + 1}`, enabled: true, url: '', secret: '' }])}
            >
              + Add webhook
            </button>
          </Section>
        )}

        <Section title={t('ve.form.sectionEmbed')}>
          <label className="ve-field ve-field--checkbox">
            <input type="checkbox" checked={embed.enabled !== false} onChange={(event) => set('embed', { ...embed, enabled: event.target.checked })} />
            <span>{t('ve.fsp.allowEmbed')}</span>
          </label>
          {isAdmin ? (
            <label className="ve-field ve-field--full">
              <span>{t('ve.fsp.embedSites')}</span>
              <textarea
                rows={3}
                placeholder="https://example.com"
                value={origins.join('\n')}
                onChange={(event) => set('embed', { ...embed, allowedOrigins: event.target.value.split(/\n+/).map((entry) => entry.trim()).filter(Boolean) })}
              />
            </label>
          ) : null}
          {origins.length === 0 && (
            <p className="ve-error" role="note">
              Any website can embed this form. List the websites that may, to restrict it.
            </p>
          )}
          {formStatus !== 'published' && <p className="ve-panel__hint">{t('ve.form.publishFirst')}</p>}
          {key ? (
            <>
              <label className="ve-field ve-field--full">
                <span>{t('ve.fsp.scriptSnippet')}</span>
                <textarea readOnly rows={2} value={scriptSnippet(origin, key)} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => copy('script', scriptSnippet(origin, key))}>
                  {copied === 'script' ? t('ve.nav.copied') : t('ve.form.copy')}
                </button>
              </label>
              <label className="ve-field ve-field--full">
                <span>{t('ve.fsp.iframeSnippet')}</span>
                <textarea readOnly rows={3} value={iframeSnippet(origin, key)} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => copy('iframe', iframeSnippet(origin, key))}>
                  {copied === 'iframe' ? t('ve.nav.copied') : t('ve.form.copy')}
                </button>
              </label>
              <p className="ve-panel__hint">
                {t('ve.form.embedPlace', { shortcode: `[form id="${key}"]` })}
              </p>
            </>
          ) : (
            <p className="ve-panel__hint">{t('ve.form.saveForEmbed')}</p>
          )}
        </Section>
      </div>
    </div>
  )
}
