'use client'

import React, { useId, useState } from 'react'
import { ConsentManager } from '@/features/consent/ConsentManager'
import type { ConsentConfig } from '@/features/consent/config'

type View = 'banner' | 'dialog' | 'link'
type Device = 'desktop' | 'mobile'
type Theme = 'light' | 'dark'
type Region = 'opt-in' | 'opt-out'

type Option<T extends string> = { value: T; label: string }

const Segmented = <T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  legend: string
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) => (
  <fieldset className="cc-segmented" disabled={disabled}>
    <legend className="cc-segmented__legend">{legend}</legend>
    <div className="cc-segmented__options">
      {options.map((option) => (
        <label key={option.value} className="cc-segmented__option">
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </fieldset>
)

/** Which visitor regions the saved consent mode actually produces. */
export function regionsFor(mode: ConsentConfig['mode']): Region[] {
  if (mode === 'opt-in-all') return ['opt-in']
  if (mode === 'notice-only') return ['opt-out']
  return ['opt-in', 'opt-out']
}

/**
 * Previews the real banner and Customise dialog (ConsentManager in preview
 * mode) inside a mock page, for the settings as last saved. Preview mode never
 * writes the consent cookie, never logs a choice and never loads a script, so
 * clicking around here changes nothing on the site.
 */
export const CookieConsentPreview: React.FC<{ config: ConsentConfig }> = ({ config }) => {
  const [view, setView] = useState<View>('banner')
  const [device, setDevice] = useState<Device>('desktop')
  const [theme, setTheme] = useState<Theme>('light')
  const [regionChoice, setRegionChoice] = useState<Region>('opt-in')
  const noteId = useId()

  const regions = regionsFor(config.mode)
  const region = regions.includes(regionChoice) ? regionChoice : regions[0]
  const themeForced = config.theme !== 'auto'

  return (
    <div className="cc-preview">
      <p className="cc-note" id={noteId}>
        Shows the settings as last saved. Save on the Banner tab to update the preview. Nothing you click here is
        stored or logged.
        {!config.enabled ? ' The banner is currently switched off, so visitors do not see it.' : ''}
      </p>

      <div className="cc-controls">
        <Segmented<View>
          legend="Show"
          name="cc-view"
          value={view}
          onChange={setView}
          options={[
            { value: 'banner', label: 'Banner' },
            { value: 'dialog', label: 'Customise dialog' },
            { value: 'link', label: 'Settings link' },
          ]}
        />
        <Segmented<Device>
          legend="Screen"
          name="cc-device"
          value={device}
          onChange={setDevice}
          options={[
            { value: 'desktop', label: 'Desktop' },
            { value: 'mobile', label: 'Mobile' },
          ]}
        />
        <Segmented<Theme>
          legend="Site theme"
          name="cc-theme"
          value={themeForced ? (config.theme as Theme) : theme}
          onChange={setTheme}
          disabled={themeForced}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Segmented<Region>
          legend="Visitor region"
          name="cc-region"
          value={region}
          onChange={setRegionChoice}
          disabled={regions.length < 2}
          options={[
            { value: 'opt-in', label: 'Opt-in (EU, UK)' },
            { value: 'opt-out', label: 'Opt-out (elsewhere)' },
          ]}
        />
      </div>
      <p className="cc-note">
        {themeForced ? `The banner theme is fixed to ${config.theme} in the settings, so the site theme toggle is off. ` : ''}
        {regions.length < 2
          ? config.mode === 'opt-in-all'
            ? 'Consent mode is opt-in everywhere: every visitor starts with the optional categories off.'
            : 'Consent mode is notice only: tags load straight away and the categories start on.'
          : 'In the opt-out region the optional categories start switched on in the Customise dialog; in the opt-in region they start off.'}
      </p>

      <div
        className={`cc-frame cc-frame--${device}${view === 'dialog' ? ' cc-frame--tall' : ''}`}
        data-theme={themeForced ? config.theme : theme}
        aria-label="Preview of the cookie banner on a sample page"
        role="group"
        aria-describedby={noteId}
      >
        <div className="cc-frame__chrome" aria-hidden="true">
          <span className="cc-frame__dot" />
          <span className="cc-frame__dot" />
          <span className="cc-frame__dot" />
          <span className="cc-frame__url">your-site.example</span>
        </div>
        <div className="cc-frame__page" aria-hidden="true">
          <div className="cc-frame__nav">
            <span className="cc-frame__logo" />
            <span className="cc-frame__navlink" />
            <span className="cc-frame__navlink" />
            <span className="cc-frame__navlink" />
          </div>
          <div className="cc-frame__hero" />
          <div className="cc-frame__line cc-frame__line--long" />
          <div className="cc-frame__line" />
          <div className="cc-frame__line cc-frame__line--short" />
          <div className="cc-frame__cards">
            <span />
            <span />
            <span />
          </div>
        </div>
        <ConsentManager
          config={config}
          optIn={region === 'opt-in'}
          initialDecided={false}
          previewMode
          previewView={view}
          previewTheme={theme}
          previewNarrow={device === 'mobile'}
        />
      </div>
    </div>
  )
}

export default CookieConsentPreview
