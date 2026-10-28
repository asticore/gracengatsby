'use client'

import { useMemo, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'

export type InterfaceLanguageStatus = 'source' | 'translated' | 'same' | 'missing'

export type InterfaceLanguageRow = {
  key: UiStringKey
  english: string
  values: Record<string, { text: string; status: InterfaceLanguageStatus }>
}

export type InterfaceLanguageLocale = { code: string; label: string; native: string }

const STATUS_STYLE: Record<InterfaceLanguageStatus, React.CSSProperties> = {
  source: {},
  translated: {},
  same: { background: 'rgba(217, 119, 6, 0.18)' },
  missing: { background: 'rgba(220, 38, 38, 0.18)' },
}

export function InterfaceLanguagesClient({
  rows,
  locales,
  coverage,
  dir,
}: {
  rows: InterfaceLanguageRow[]
  locales: InterfaceLanguageLocale[]
  coverage: Record<string, number>
  locale: string
  dir: 'ltr' | 'rtl'
}) {
  const t = useAdminT()
  const [query, setQuery] = useState('')
  const [missingOnly, setMissingOnly] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      const hasGap = locales.some((locale) => {
        const status = row.values[locale.code]?.status
        return status === 'missing' || status === 'same'
      })
      if (missingOnly && !hasGap) return false
      if (!needle) return true
      if (row.key.toLowerCase().includes(needle) || row.english.toLowerCase().includes(needle))
        return true
      return locales.some((locale) =>
        (row.values[locale.code]?.text ?? '').toLowerCase().includes(needle),
      )
    })
  }, [rows, locales, query, missingOnly])

  return (
    <div className="interface-languages" dir={dir} style={{ display: 'grid', gap: 16 }}>
      <header>
        <h1>{t('interfaceLanguages.title')}</h1>
        <p style={{ maxWidth: 720 }}>{t('interfaceLanguages.description')}</p>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <input
          aria-label={t('interfaceLanguages.search')}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('interfaceLanguages.search')}
          type="search"
          value={query}
        />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            checked={missingOnly}
            onChange={(event) => setMissingOnly(event.target.checked)}
            type="checkbox"
          />
          {t('interfaceLanguages.missingOnly')}
        </label>
      </div>

      <ul
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
        aria-label={t('interfaceLanguages.coverage')}
      >
        {locales.map((locale) => (
          <li
            key={locale.code}
            style={{
              border: '1px solid currentColor',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
            }}
          >
            {locale.native} ({locale.code}): {t('interfaceLanguages.coverage')}{' '}
            {coverage[locale.code] ?? 0}%
          </li>
        ))}
      </ul>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'start', padding: 6 }}>
                {t('interfaceLanguages.keyColumn')}
              </th>
              <th scope="col" style={{ textAlign: 'start', padding: 6 }}>
                {t('interfaceLanguages.englishColumn')}
              </th>
              {locales.map((locale) => (
                <th
                  key={locale.code}
                  scope="col"
                  lang={locale.code}
                  style={{ textAlign: 'start', padding: 6 }}
                >
                  {locale.native}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} style={{ borderTop: '1px solid rgba(127,127,127,0.25)' }}>
                <td style={{ padding: 6, fontFamily: 'monospace' }}>{row.key}</td>
                <td style={{ padding: 6 }}>{row.english}</td>
                {locales.map((locale) => {
                  const cell = row.values[locale.code]
                  if (!cell) return <td key={locale.code} style={{ padding: 6 }} />
                  return (
                    <td
                      key={locale.code}
                      lang={locale.code}
                      data-status={cell.status}
                      style={{ padding: 6, ...STATUS_STYLE[cell.status] }}
                    >
                      {cell.text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? <p>{t('interfaceLanguages.noMatches')}</p> : null}
      </div>
    </div>
  )
}

export default InterfaceLanguagesClient
