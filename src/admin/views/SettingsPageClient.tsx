'use client'

import React, { useEffect, useState } from 'react'
import type { Field } from '@/engine'
import { EditForm } from './EditForm'
import type { SettingsPage, LinkSection } from '@/admin/settingsPages'

export type SettingsPageSection =
  | {
      kind: 'global'
      slug: string
      label: string
      fields: Field[]
      doc: Record<string, unknown>
    }
  | LinkSection

interface SettingsPageClientProps {
  page: SettingsPage
  sections: SettingsPageSection[]
}

/**
 * Client component for settings pages. Renders:
 * - Page title and description
 * - Jump bar (sticky, with anchor links) when 2+ global sections
 * - Global sections as titled cards
 * - Link sections as a grid of cards
 */
export const SettingsPageClient: React.FC<SettingsPageClientProps> = ({ page, sections }) => {
  const [activeAnchor, setActiveAnchor] = useState<string>('')

  useEffect(() => {
    const read = () => {
      if (window.location.hash) setActiveAnchor(window.location.hash.slice(1))
    }
    // Deferred so the initial hash read is not a synchronous setState in the effect body.
    const t = setTimeout(read, 0)
    window.addEventListener('hashchange', read)
    return () => {
      clearTimeout(t)
      window.removeEventListener('hashchange', read)
    }
  }, [])

  const globalSections = sections.filter((s) => s.kind === 'global')
  const linkSections = sections.filter((s) => s.kind === 'link')
  const showJumpBar = globalSections.length >= 2

  const handleAnchorClick = (slug: string) => {
    setActiveAnchor(slug)
    const el = document.getElementById(slug)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    window.history.replaceState(null, '', `#${slug}`)
  }

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-page__header">
        <h1 className="settings-page__title">{page.title}</h1>
        <p className="settings-page__description">{page.description}</p>
      </div>

      {/* Jump bar */}
      {showJumpBar && (
        <div className="settings-page__jump-bar">
          <div className="settings-page__jump-bar-content">
            {globalSections.map((section) => (
              <button
                key={section.slug}
                className={`settings-page__jump-link${activeAnchor === section.slug ? ' settings-page__jump-link--active' : ''}`}
                onClick={() => handleAnchorClick(section.slug)}
                type="button"
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Global sections */}
      <div className="settings-page__sections">
        {globalSections.map((section) => (
          <div key={section.slug} className="settings-page__section" id={section.slug}>
            <div className="settings-page__section-header">
              <h2 className="settings-page__section-title">{section.label}</h2>
            </div>
            <div className="settings-page__section-content">
              <EditForm doc={section.doc} fields={section.fields} globalSlug={section.slug} />
            </div>
          </div>
        ))}
      </div>

      {/* Link sections */}
      {linkSections.length > 0 && (
        <div className="settings-page__links">
          {linkSections.map((section) => (
            <a
              key={`${section.type}:${section.href}`}
              href={`/admin${section.href}`}
              className="settings-page__link-card"
            >
              <div className="settings-page__link-card-content">
                <h3 className="settings-page__link-card-title">{section.label}</h3>
                <p className="settings-page__link-card-description">{section.description}</p>
              </div>
              <div className="settings-page__link-card-icon">→</div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

export default SettingsPageClient
