'use client'

import React, { useState, useMemo } from 'react'

export type SettingsEntry = {
  slug: string
  label: string
  description: string
  href: string
}

export type SettingsGroup = {
  label: string
  entries: SettingsEntry[]
}

export const SettingsOverviewSearch: React.FC<{
  groups: SettingsGroup[]
}> = ({ groups }) => {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return groups

    const lowerSearch = search.toLowerCase()
    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter(
          (entry) =>
            entry.label.toLowerCase().includes(lowerSearch) ||
            entry.description.toLowerCase().includes(lowerSearch),
        ),
      }))
      .filter((group) => group.entries.length > 0)
  }, [search, groups])

  const baseClass = 'settings-overview'

  return (
    <div className={`${baseClass}__wrapper`}>
      <div className={`${baseClass}__search-box`}>
        <input
          type="text"
          placeholder="Search settings by name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${baseClass}__search-input`}
          aria-label="Search settings"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={`${baseClass}__empty`}>
          <p>No settings found matching your search.</p>
        </div>
      ) : (
        <div className={`${baseClass}__groups`}>
          {filtered.map((group) => (
            <section key={group.label} className={`${baseClass}__group`}>
              <h2 className={`${baseClass}__group-title`}>{group.label}</h2>
              <div className={`${baseClass}__entries`}>
                {group.entries.map((entry) => (
                  <a
                    key={entry.slug}
                    href={entry.href}
                    className={`${baseClass}__entry`}
                    title={`Go to ${entry.label}`}
                  >
                    <div className={`${baseClass}__entry-title`}>{entry.label}</div>
                    <div className={`${baseClass}__entry-description`}>{entry.description}</div>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
