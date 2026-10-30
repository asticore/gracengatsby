'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import React, { useRef, useSyncExternalStore } from 'react'
import type { Field } from '@/engine'
import { useAdminLabel, useAdminT } from '@/admin/i18n/AdminUiProvider'
import { UI_STRING_SOURCE, type UiStringKey } from '@/features/uiStrings'
import { EditForm } from './EditForm'
import { CollapseAllBar } from '@/admin/components/CollapseAllBar'
import { WorstPagesCard } from '@/features/pagespeed/ui/WorstPagesCard'
import { TagEditorButton } from '@/features/tracking/editor/TagEditorButton'
import { resolveActiveTab, type SettingsPage, type LinkSection } from '@/admin/settingsPages'
import '@/app/(engage)/settings-tabs.css'

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

/** Fired after a tab click so the hash subscription re-reads the URL (replaceState does not fire hashchange). */
const TAB_SELECT_EVENT = 'settings-tabs:select'

function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  window.addEventListener('popstate', onChange)
  window.addEventListener(TAB_SELECT_EVENT, onChange)
  return () => {
    window.removeEventListener('hashchange', onChange)
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(TAB_SELECT_EVENT, onChange)
  }
}

const readHash = () => window.location.hash
// Server render and hydration both see no hash, so the first tab is shown until the client reads the URL.
const readServerHash = () => ''

/**
 * Client component for settings pages. Renders:
 * - Page title and description
 * - One box with tabs (2+ global sections) or a single titled section, each global section's EditForm in its panel
 * - Link sections as a grid of cards, visible on every tab
 */
export const SettingsPageClient: React.FC<SettingsPageClientProps> = ({ page, sections }) => {
  const t = useAdminT()
  const labelFor = useAdminLabel()
  // Page title and description come from the reference table, keyed by page key.
  // A page with no key in the table keeps the English text from settingsPages.ts.
  const titleKey = `settings.page.${page.key}.title` as UiStringKey
  const descriptionKey = `settings.page.${page.key}.description` as UiStringKey
  const pageTitle = titleKey in UI_STRING_SOURCE ? t(titleKey) : page.title
  const pageDescription = descriptionKey in UI_STRING_SOURCE ? t(descriptionKey) : page.description
  const globalSections = sections.filter((s) => s.kind === 'global')
  // Link card text comes from the reference table, keyed by the card label; English text is kept when no key exists.
  const linkText = (cardLabel: string, field: 'label' | 'description', english: string): string => {
    const key = `settings.link.${cardLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.${field}` as UiStringKey
    return key in UI_STRING_SOURCE ? t(key) : english
  }
  const firstSection = globalSections[0]
  const firstGlobalLabel = firstSection?.kind === 'global' ? labelFor('global', firstSection.slug, firstSection.label) : firstSection?.label
  const linkSections = sections.filter((s) => s.kind === 'link')
  const showTabs = globalSections.length >= 2
  const tabSlugs = globalSections.map((s) => s.slug)

  const hash = useSyncExternalStore(subscribeToHash, readHash, readServerHash)
  const activeSlug = resolveActiveTab(hash, tabSlugs)

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selectTab = (slug: string) => {
    window.history.replaceState(null, '', `#${slug}`)
    window.dispatchEvent(new Event(TAB_SELECT_EVENT))
  }

  // WAI-ARIA tabs pattern: arrows move and activate, Home/End jump to the ends.
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabSlugs.length - 1
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1
        break
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }
    event.preventDefault()
    selectTab(tabSlugs[next])
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="settings-page">
      {/* Header */}
      <div className="settings-page__header">
        <h1 className="settings-page__title">{pageTitle}</h1>
        <p className="settings-page__description">{pageDescription}</p>
        {/* One bar for every card on the page, above the box (outside it). */}
        {globalSections.length > 0 && (
          <div className="settings-page__actions">
            <CollapseAllBar />
          </div>
        )}
      </div>

      {page.topCard === 'pagespeed-worst' && <WorstPagesCard />}

      {page.topCard === 'tracking-tags' && (
        <div className="settings-page__actions">
          <TagEditorButton />
        </div>
      )}

      {/* Global sections: one box, tabs on top (when 2+), the active panel below */}
      {globalSections.length > 0 && (
        <div className="settings-page__sections">
          <div className="settings-page__section settings-tabs">
            {showTabs ? (
              <div role="tablist" aria-label={pageTitle} className="settings-tabs__list">
                {globalSections.map((section, index) => {
                  const selected = section.slug === activeSlug
                  return (
                    <button
                      key={section.slug}
                      ref={(el) => {
                        tabRefs.current[index] = el
                      }}
                      id={`settings-tab-${section.slug}`}
                      role="tab"
                      type="button"
                      aria-selected={selected}
                      aria-controls={`settings-panel-${section.slug}`}
                      tabIndex={selected ? 0 : -1}
                      className="settings-tabs__tab"
                      onClick={() => selectTab(section.slug)}
                      onKeyDown={(event) => handleTabKeyDown(event, index)}
                    >
                      {labelFor('global', section.slug, section.label)}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="settings-tabs__heading">
                <h2 className="settings-page__section-title">{firstGlobalLabel}</h2>
              </div>
            )}

            {/* Panels stay mounted and are hidden, so unsaved edits survive a tab switch. */}
            {globalSections.map((section) => {
              const selected = !showTabs || section.slug === activeSlug
              return (
                <div
                  key={section.slug}
                  id={`settings-panel-${section.slug}`}
                  role={showTabs ? 'tabpanel' : undefined}
                  aria-labelledby={showTabs ? `settings-tab-${section.slug}` : undefined}
                  hidden={!selected}
                  tabIndex={showTabs ? 0 : undefined}
                  className="settings-tabs__panel"
                >
                  <EditForm doc={section.doc} fields={section.fields} globalSlug={section.slug} hideCollapseBar />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Link sections */}
      {linkSections.length > 0 && (
        <div className="settings-page__links">
          {linkSections.map((section) => (
            <AdminLink
              key={`${section.type}:${section.href}`}
              path={section.href}
              className="settings-page__link-card"
            >
              <div className="settings-page__link-card-content">
                <h3 className="settings-page__link-card-title">{linkText(section.label, 'label', section.label)}</h3>
                <p className="settings-page__link-card-description">{linkText(section.label, 'description', section.description)}</p>
              </div>
              <div className="settings-page__link-card-icon">→</div>
            </AdminLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default SettingsPageClient
