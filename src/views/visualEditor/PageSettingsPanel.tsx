'use client'

import React, { useState } from 'react'

import { MediaPicker } from './MediaPicker'
import {
  descriptionHint,
  sanitiseSlug,
  titleHint,
  validatePageSettings,
  type LengthHint,
  type PageSettings,
  type PageSettingsAvailability,
} from './pageSettings'

/**
 * The "Page" section of the Settings tab. Controlled: the editor owns the values and folds the changes
 * into its normal save (same PATCH, same dirty tracking).
 */
type Props = {
  value: PageSettings
  available: PageSettingsAvailability
  onChange: (next: PageSettings) => void
}

const Hint: React.FC<{ hint: LengthHint }> = ({ hint }) => (
  <small role={hint.level === 'long' ? 'alert' : undefined} style={{ color: hint.level === 'long' ? '#b45309' : undefined }}>
    {hint.text}
  </small>
)

export const PageSettingsPanel: React.FC<Props> = ({ value, available, onChange }) => {
  const [picker, setPicker] = useState(false)
  const [thumb, setThumb] = useState<string | null>(null)
  const set = <K extends keyof PageSettings>(key: K, v: PageSettings[K]) => onChange({ ...value, [key]: v })
  const errors = validatePageSettings(value, available)

  return (
    <section className="ve-page-settings" aria-label="Page settings">
      <h3>Page</h3>
      <label>
        Title
        <input type="text" value={value.title} onChange={(e) => set('title', e.target.value)} />
      </label>
      {available.slug && (
        <label>
          Slug
          <input type="text" value={value.slug} onChange={(e) => set('slug', sanitiseSlug(e.target.value))} />
        </label>
      )}
      {available.status && (
        <label>
          Status
          <select value={value.status} onChange={(e) => set('status', e.target.value === 'published' ? 'published' : 'draft')}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      )}
      {available.seo && (
        <>
          <label>
            SEO title
            <input type="text" value={value.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} />
            <Hint hint={titleHint(value.metaTitle)} />
          </label>
          <label>
            SEO meta description
            <textarea rows={3} value={value.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} />
            <Hint hint={descriptionHint(value.metaDescription)} />
          </label>
          <div>
            <span>Social image</span>
            {value.ogImage !== null && <small> Media #{value.ogImage}</small>}
            {thumb && value.ogImage !== null && <img src={thumb} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: 96 }} />}
            <div>
              <button type="button" onClick={() => setPicker(true)}>
                {value.ogImage === null ? 'Choose image' : 'Change image'}
              </button>
              {value.ogImage !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setThumb(null)
                    set('ogImage', null)
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {picker && (
            <MediaPicker
              onClose={() => setPicker(false)}
              onSelect={(id, doc) => {
                setThumb(doc.url || null)
                onChange({ ...value, ogImage: id })
                setPicker(false)
              }}
            />
          )}
          <label>
            <input type="checkbox" checked={value.noIndex} onChange={(e) => set('noIndex', e.target.checked)} /> Hide from search engines (noindex)
          </label>
        </>
      )}
      {errors.map((message) => (
        <p key={message} className="ve-error" role="alert">
          {message}
        </p>
      ))}
    </section>
  )
}
