'use client'

import React, { useState } from 'react'

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
        <Section title="Status and publishing" open>
          <p className="ve-panel__hint">
            This form is <strong>{formStatus === 'published' ? 'published' : 'a draft'}</strong>.
            {formStatus === 'published' && hasUnpublishedChanges ? ' You have changes that visitors cannot see until you publish again.' : ''}
          </p>
          <div className="ve-col-row">
            <button type="button" className="ve-btn ve-btn--primary" onClick={onPublish} disabled={busy}>
              {formStatus === 'published' ? 'Publish changes' : 'Publish'}
            </button>
            {formStatus === 'published' && (
              <button type="button" className="ve-btn ve-btn--ghost" onClick={onUnpublish} disabled={busy}>
                Unpublish
              </button>
            )}
          </div>
        </Section>

        <Section title="Look">
          <label className="ve-field ve-field--full">
            <span>Style</span>
            <select value={style.preset || 'theme'} onChange={(event) => set('style', { ...style, preset: event.target.value as FormStylePreset })}>
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label} - {preset.description}
                </option>
              ))}
            </select>
          </label>
          <label className="ve-field ve-field--full">
            <span>Accent colour (blank = site accent)</span>
            <input type="text" placeholder="#2e3192" value={style.accent || ''} onChange={(event) => set('style', { ...style, accent: event.target.value })} />
          </label>
          <label className="ve-field ve-field--full">
            <span>Custom CSS for this form</span>
            <textarea rows={6} spellCheck={false} value={style.customCss || ''} onChange={(event) => set('style', { ...style, customCss: event.target.value })} />
            <span className="ve-field__help">Applies to this form only. Imports and scripts are removed.</span>
          </label>
        </Section>

        <Section title="Steps">
          <p className="ve-panel__hint">Add a Step break element between sections to split the form into steps.</p>
          <label className="ve-field ve-field--checkbox">
            <input type="checkbox" checked={steps.showProgress !== false} onChange={(event) => set('steps', { ...steps, showProgress: event.target.checked })} />
            <span>Show progress</span>
          </label>
          <label className="ve-field ve-field--full">
            <span>Progress style</span>
            <select value={steps.progressStyle || 'bar'} onChange={(event) => set('steps', { ...steps, progressStyle: event.target.value as 'bar' | 'steps' | 'text' })}>
              <option value="bar">Bar</option>
              <option value="steps">Numbered steps</option>
              <option value="text">Text (Step 2 of 3)</option>
            </select>
          </label>
          <div className="ve-col-row">
            <input type="text" aria-label="Next button label" placeholder="Next" value={steps.nextLabel || ''} onChange={(event) => set('steps', { ...steps, nextLabel: event.target.value })} />
            <input type="text" aria-label="Back button label" placeholder="Back" value={steps.backLabel || ''} onChange={(event) => set('steps', { ...steps, backLabel: event.target.value })} />
          </div>
        </Section>

        <Section title="After sending">
          <label className="ve-field ve-field--full">
            <span>What happens</span>
            <select value={success.mode || 'message'} onChange={(event) => set('success', { ...success, mode: event.target.value as 'message' | 'redirect' })}>
              <option value="message">Show a message</option>
              <option value="redirect">Go to another page</option>
            </select>
          </label>
          {success.mode === 'redirect' ? (
            <label className="ve-field ve-field--full">
              <span>Address to go to</span>
              <input type="text" placeholder="/thank-you" value={success.redirectUrl || ''} onChange={(event) => set('success', { ...success, redirectUrl: event.target.value })} />
            </label>
          ) : (
            <label className="ve-field ve-field--full">
              <span>Message</span>
              <textarea rows={3} value={success.message || ''} onChange={(event) => set('success', { ...success, message: event.target.value })} />
            </label>
          )}
        </Section>

        <Section title="Behaviour">
          <label className="ve-field ve-field--full">
            <span>Pre-fill from the address (keys, comma-separated)</span>
            <input
              type="text"
              placeholder="name, email"
              value={(config.prefillKeys || []).join(', ')}
              onChange={(event) => set('prefillKeys', event.target.value.split(',').map((entry) => entry.trim()).filter(Boolean))}
            />
            <span className="ve-field__help">A field only fills from the web address when its pre-fill key is listed here.</span>
          </label>
          <label className="ve-field ve-field--full">
            <span>Delete entries after (days, 0 = keep, blank = site default)</span>
            <input
              type="number"
              min={0}
              value={typeof config.retentionDays === 'number' ? config.retentionDays : ''}
              onChange={(event) => set('retentionDays', event.target.value === '' ? undefined : Number(event.target.value))}
            />
          </label>
        </Section>

        <Section title="Notifications">
          <p className="ve-panel__hint">Each rule sends an email when an entry arrives. Add conditions to send only for some entries. Merge tags: {'{{field name}}'}.</p>
          {rules.map((rule, index) => (
            <div className="ve-form-card" key={rule.id || index}>
              <label className="ve-field ve-field--checkbox">
                <input type="checkbox" checked={rule.enabled !== false} onChange={(event) => setRule(index, { enabled: event.target.checked })} />
                <span>{rule.name || `Notification ${index + 1}`}</span>
              </label>
              <input type="text" aria-label="Name" placeholder="Name" value={rule.name || ''} onChange={(event) => setRule(index, { name: event.target.value })} />
              <input type="text" aria-label="Send to" placeholder="Send to (comma-separated)" value={rule.recipients || ''} onChange={(event) => setRule(index, { recipients: event.target.value })} />
              <input type="text" aria-label="Subject" placeholder="Subject" value={rule.subject || ''} onChange={(event) => setRule(index, { subject: event.target.value })} />
              <textarea rows={3} aria-label="Message" placeholder="Message" value={rule.message || ''} onChange={(event) => setRule(index, { message: event.target.value })} />
              <div className="ve-col-row">
                <label className="ve-field--checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.conditions?.enabled)}
                    onChange={(event) => setRule(index, { conditions: { ...(rule.conditions || { action: 'show', match: 'all', rules: [] }), enabled: event.target.checked } })}
                  />
                  <span>Only when</span>
                </label>
                {rule.conditions?.enabled && (
                  <>
                    <input
                      type="text"
                      aria-label="Field name"
                      placeholder="field name"
                      value={rule.conditions.rules?.[0]?.field || ''}
                      onChange={(event) =>
                        setRule(index, { conditions: { ...rule.conditions, rules: [{ operator: 'equals', ...(rule.conditions?.rules?.[0] || {}), field: event.target.value }] } })
                      }
                    />
                    <span>is</span>
                    <input
                      type="text"
                      aria-label="Value"
                      placeholder="value"
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
          <Section title="Webhooks (administrators)">
            <p className="ve-panel__hint">
              Each new entry is sent as JSON to the address, signed with HMAC-SHA256 in the <code>X-Engage-Signature</code> header. Failed deliveries are retried with a growing delay.
            </p>
            {hooks.map((hook, index) => (
              <div className="ve-form-card" key={hook.id || index}>
                <label className="ve-field ve-field--checkbox">
                  <input type="checkbox" checked={hook.enabled !== false} onChange={(event) => setHook(index, { enabled: event.target.checked })} />
                  <span>{hook.name || `Webhook ${index + 1}`}</span>
                </label>
                <input type="text" aria-label="Name" placeholder="Name" value={hook.name || ''} onChange={(event) => setHook(index, { name: event.target.value })} />
                <input type="url" aria-label="URL" placeholder="https://example.com/hook" value={hook.url || ''} onChange={(event) => setHook(index, { url: event.target.value })} />
                <input type="password" aria-label="Signing secret" placeholder="Signing secret" autoComplete="new-password" value={hook.secret || ''} onChange={(event) => setHook(index, { secret: event.target.value })} />
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

        <Section title="Embed on another website">
          <label className="ve-field ve-field--checkbox">
            <input type="checkbox" checked={embed.enabled !== false} onChange={(event) => set('embed', { ...embed, enabled: event.target.checked })} />
            <span>Allow this form to be embedded</span>
          </label>
          {isAdmin ? (
            <label className="ve-field ve-field--full">
              <span>Websites allowed to embed it (one per line)</span>
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
          {formStatus !== 'published' && <p className="ve-panel__hint">Publish the form first: a draft cannot be embedded.</p>}
          {key ? (
            <>
              <label className="ve-field ve-field--full">
                <span>Script snippet</span>
                <textarea readOnly rows={2} value={scriptSnippet(origin, key)} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => copy('script', scriptSnippet(origin, key))}>
                  {copied === 'script' ? 'Copied' : 'Copy'}
                </button>
              </label>
              <label className="ve-field ve-field--full">
                <span>Iframe snippet</span>
                <textarea readOnly rows={3} value={iframeSnippet(origin, key)} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => copy('iframe', iframeSnippet(origin, key))}>
                  {copied === 'iframe' ? 'Copied' : 'Copy'}
                </button>
              </label>
              <p className="ve-panel__hint">
                To place it on a page of this site, use a Form block, or type <code>[form id=&quot;{key}&quot;]</code> in rich text.
              </p>
            </>
          ) : (
            <p className="ve-panel__hint">Save the form once to get its embed address.</p>
          )}
        </Section>
      </div>
    </div>
  )
}
