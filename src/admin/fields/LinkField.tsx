'use client'

import React from 'react'

type LinkValue = {
  url?: string
  newTab?: boolean
  nofollow?: boolean
}

export const LinkField: React.FC<{
  value: unknown
  onChange: (v: LinkValue | undefined) => void
  label: string
  helpText?: string
}> = ({ value, onChange, label, helpText }) => {
  // Legacy elements stored a plain URL string; read it as {url} so it shows and survives a toggle.
  const linkData = (typeof value === 'string' ? { url: value } : value && typeof value === 'object' ? value : {}) as LinkValue
  const url = linkData.url || ''
  const newTab = linkData.newTab || false
  const nofollow = linkData.nofollow || false

  const sanitizeUrl = (rawUrl: string): string => {
    if (!rawUrl.trim()) return ''
    const trimmed = rawUrl.trim()
    if (trimmed.toLowerCase().startsWith('javascript:')) return ''
    return trimmed
  }

  const handleUrlChange = (newUrl: string) => {
    const sanitized = sanitizeUrl(newUrl)
    const updated: LinkValue = {}
    if (sanitized) {
      updated.url = sanitized
    }
    if (newTab) updated.newTab = true
    if (nofollow) updated.nofollow = true
    onChange(Object.keys(updated).length > 0 ? updated : undefined)
  }

  const handleToggle = (key: 'newTab' | 'nofollow', val: boolean) => {
    const updated: LinkValue = {}
    if (url) updated.url = url
    if (key === 'newTab') {
      if (val) updated.newTab = true
      if (nofollow) updated.nofollow = true
    } else {
      if (newTab) updated.newTab = true
      if (val) updated.nofollow = true
    }
    onChange(Object.keys(updated).length > 0 ? updated : undefined)
  }

  return (
    <div className="ve-field ve-field--full">
      <span>{label}</span>
      <input
        type="text"
        placeholder="https://example.com or /page or mailto:..."
        value={url}
        onChange={(e) => handleUrlChange(e.target.value)}
        style={{
          width: '100%',
          padding: '0.5rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={newTab}
            onChange={(e) => handleToggle('newTab', e.target.checked)}
          />
          <span style={{ fontSize: '0.9rem' }}>Open in new tab</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={nofollow}
            onChange={(e) => handleToggle('nofollow', e.target.checked)}
          />
          <span style={{ fontSize: '0.9rem' }}>No follow</span>
        </label>
      </div>
      {helpText && <span className="ve-field__help">{helpText}</span>}
    </div>
  )
}
