'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useMemo, useState } from 'react'

import { Icon, ICON_NAMES } from '@/components/blocks/elements/icons'

type IconValue = {
  icon?: string
}

/** 'builtin': the inline SVG set used by the element renderers, stored as a plain name. 'fontawesome': the original picker. */
export type IconPickerSource = 'builtin' | 'fontawesome'

// Lazy-loaded FontAwesome Free icon list (subset for demo; in production this would be more comprehensive)
const FONTAWESOME_ICONS = [
  'fa-heart',
  'fa-star',
  'fa-search',
  'fa-user',
  'fa-cog',
  'fa-home',
  'fa-envelope',
  'fa-phone',
  'fa-map-marker',
  'fa-check',
  'fa-times',
  'fa-arrow-right',
  'fa-arrow-left',
  'fa-arrow-up',
  'fa-arrow-down',
  'fa-plus',
  'fa-minus',
  'fa-download',
  'fa-upload',
  'fa-share',
  'fa-link',
  'fa-lock',
  'fa-unlock',
  'fa-bell',
  'fa-calendar',
  'fa-clock',
  'fa-fire',
  'fa-lightbulb',
  'fa-folder',
  'fa-file',
  'fa-trash',
  'fa-edit',
  'fa-copy',
  'fa-paste',
  'fa-eye',
  'fa-eye-slash',
  'fa-thumbs-up',
  'fa-thumbs-down',
  'fa-smile',
  'fa-frown',
  'fa-quote-left',
  'fa-quote-right',
  'fa-music',
  'fa-film',
  'fa-camera',
  'fa-image',
  'fa-video',
  'fa-play',
  'fa-pause',
  'fa-stop',
  'fa-info-circle',
  'fa-warning',
  'fa-exclamation-triangle',
  'fa-question-circle',
  'fa-circle',
  'fa-square',
  'fa-code',
  'fa-database',
  'fa-server',
  'fa-cloud',
  'fa-wifi',
  'fa-battery',
  'fa-plug',
  'fa-laptop',
  'fa-mobile',
  'fa-tablet',
  'fa-keyboard',
  'fa-mouse',
  'fa-monitor',
  'fa-globe',
  'fa-globe-africa',
  'fa-globe-americas',
  'fa-globe-asia',
  'fa-sign-in-alt',
  'fa-sign-out-alt',
  'fa-sign-in',
  'fa-sign-out',
  'fa-flag',
  'fa-bookmark',
  'fa-comments',
  'fa-comment',
  'fa-credit-card',
  'fa-shopping-cart',
  'fa-shopping-bag',
  'fa-dollar-sign',
  'fa-euro-sign',
  'fa-pound-sign',
  'fa-yen-sign',
  'fa-rupee-sign',
  'fa-bitcoin',
  'fa-bars',
  'fa-list',
  'fa-list-ul',
  'fa-list-ol',
  'fa-indent',
  'fa-outdent',
  'fa-align-left',
  'fa-align-center',
  'fa-align-right',
  'fa-align-justify',
  'fa-strikethrough',
  'fa-underline',
  'fa-italic',
  'fa-bold',
]

const FontAwesomePicker: React.FC<{
  value: unknown
  onChange: (v: IconValue | undefined) => void
  label: string
  helpText?: string
}> = ({ value, onChange, label, helpText }) => {
  const iconData = (value && typeof value === 'object' ? (value as IconValue) : {}) as IconValue
  const selectedIcon = iconData.icon || ''
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const filteredIcons = useMemo(() => {
    if (!search.trim()) return FONTAWESOME_ICONS.slice(0, 20)
    const term = search.toLowerCase()
    return FONTAWESOME_ICONS.filter((icon) => icon.includes(term)).slice(0, 50)
  }, [search])

  const handleSelect = (icon: string) => {
    onChange({ icon: `fa-solid ${icon}` })
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = () => {
    onChange(undefined)
  }

  return (
    <div className="ve-field ve-field--full">
      <span>{label}</span>
      <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            minHeight: '2.5rem',
          }}
        >
          {selectedIcon ? (
            <>
              <i
                className={selectedIcon}
                style={{
                  fontSize: '1.2rem',
                  minWidth: '1.5rem',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: '0.9rem', color: '#666', flex: 1 }}>
                {selectedIcon.replace('fa-solid ', '')}
              </span>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  padding: '0.3rem 0.6rem',
                  background: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                  padding: '0.3rem 0.6rem',
                  background: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {isOpen ? 'Close' : 'Change'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              style={{
                padding: '0.5rem 1rem',
                background: '#007bff',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Pick an icon
            </button>
          )}
        </div>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.5rem',
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              zIndex: 1000,
              maxHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <input
              type="text"
              placeholder="Search icons (e.g., arrow, heart)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '0.75rem',
                border: 'none',
                borderBottom: '1px solid #eee',
                fontSize: 'inherit',
                fontFamily: 'inherit',
              }}
              autoFocus
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))',
                gap: '0.5rem',
                padding: '0.75rem',
                overflowY: 'auto',
                maxHeight: '320px',
              }}
            >
              {filteredIcons.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => handleSelect(icon)}
                  title={icon}
                  style={{
                    padding: '0.5rem',
                    background: 'none',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '50px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = '#f0f0f0'
                    ;(e.currentTarget as HTMLElement).style.borderColor = '#007bff'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
                    ;(e.currentTarget as HTMLElement).style.borderColor = '#ddd'
                  }}
                >
                  <i
                    className={`fa-solid ${icon}`}
                    style={{
                      fontSize: '1.5rem',
                    }}
                  />
                </button>
              ))}
            </div>
            {filteredIcons.length === 0 && (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
                No icons found
              </div>
            )}
          </div>
        )}
      </div>
      {helpText && <span className="ve-field__help">{helpText}</span>}
    </div>
  )
}

const BuiltinIconPicker: React.FC<{
  value: unknown
  onChange: (v: string | undefined) => void
  label: string
  helpText?: string
}> = ({ value, onChange, label, helpText }) => {
  const t = useAdminT()
  const raw = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as IconValue).icon : undefined
  const selected = typeof raw === 'string' && ICON_NAMES.includes(raw) ? raw : ''
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? ICON_NAMES.filter((name) => name.includes(term)) : ICON_NAMES
  }, [search])

  const handleSelect = (name: string) => {
    onChange(name)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div className="ve-field ve-field--full">
      <span>{label}</span>
      <div style={{ marginBottom: '0.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            minHeight: '2.5rem',
          }}
        >
          {selected ? (
            <>
              <Icon name={selected} size={24} />
              <span style={{ fontSize: '0.9rem', color: '#666', flex: 1 }}>{selected}</span>
              <button
                type="button"
                onClick={() => onChange(undefined)}
                style={{ padding: '0.3rem 0.6rem', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Clear
              </button>
            </>
          ) : (
            <span style={{ fontSize: '0.9rem', color: '#666', flex: 1 }}>No icon</span>
          )}
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            style={{ padding: '0.3rem 0.6rem', background: '#007bff', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {isOpen ? 'Close' : selected ? 'Change' : 'Pick an icon'}
          </button>
        </div>

        {isOpen && (
          <div style={{ marginTop: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#fff', padding: '0.5rem' }}>
            <input
              type="search"
              aria-label={t('al.searchIcons')}
              placeholder="Search icons (e.g., arrow, heart)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem', marginBottom: '0.5rem', fontSize: 'inherit', fontFamily: 'inherit' }}
              autoFocus
            />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
                gap: '0.5rem',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {shown.map((name) => {
                const isSelected = name === selected
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={isSelected}
                    onClick={() => handleSelect(name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: '48px',
                      padding: '0.5rem',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      border: isSelected ? '2px solid #007bff' : '1px solid #ddd',
                      background: isSelected ? '#e7f1ff' : '#fff',
                      color: '#222',
                    }}
                  >
                    <Icon name={name} size={24} />
                  </button>
                )
              })}
            </div>
            {shown.length === 0 && <div style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>No icons found</div>}
          </div>
        )}
      </div>
      {helpText && <span className="ve-field__help">{helpText}</span>}
    </div>
  )
}

/**
 * Icon picker. Default is the FontAwesome picker (stores {icon: "fa-solid fa-..."}), unchanged.
 * source="builtin" picks from the built-in SVG set and stores the plain name, e.g. "star".
 */
export const IconPickerField: React.FC<{
  value: unknown
  onChange: (v: IconValue | string | undefined) => void
  label: string
  helpText?: string
  source?: IconPickerSource
}> = ({ value, onChange, label, helpText, source = 'fontawesome' }) => {
  if (source === 'builtin') return <BuiltinIconPicker value={value} onChange={onChange} label={label} helpText={helpText} />
  return <FontAwesomePicker value={value} onChange={onChange} label={label} helpText={helpText} />
}
