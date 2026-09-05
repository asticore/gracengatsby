import React from 'react'
import type { AdminViewServerProps } from '@/engine'

import { getMultilingualSettings } from '../settings'
import { TranslationsTable } from './TranslationsTable'
import { getTranslationsPageData } from './translationsData'
import { TRANSLATIONS_CSS } from './translations.styles'

/**
 * `/admin/translations` - the one screen where a person writes translations.
 *
 * Server-rendered so the source text and the existing translations are real at
 * first paint. A translator on a slow connection staring at a spinner is a
 * translator who opens the spreadsheet instead.
 *
 * The screen refuses rather than degrades when multilingual is off or only one
 * language is configured, because a translation table with no target column is
 * not a lesser version of this screen - it is a puzzle. The message says where
 * to go and why.
 */

const first = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

export const TranslationsView: React.FC<AdminViewServerProps> = async (props) => {
  const engine = props.payload
  if (!engine?.config) return null

  const searchParams = (props.searchParams ?? {}) as Record<string, unknown>
  // The feature's readers are typed against the narrow slice of the engine
  // they use, so they stay testable without a live instance. Widening them to
  // the engine's own generic signatures is the tail wagging the dog.
  const settings = await getMultilingualSettings(engine as Parameters<typeof getMultilingualSettings>[0])

  const routes = engine.config.routes
  const apiBase = `${engine.config.serverURL ?? ''}${routes?.api ?? '/api'}/translations`

  if (!settings.enabled) {
    return (
      <div className="eg-translations eg-translations--notice">
        {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
        <style dangerouslySetInnerHTML={{ __html: TRANSLATIONS_CSS }} />
        <h1>Translations</h1>
        <p>
          Multiple languages are switched off, so there is nothing to translate yet. Turn them on under Settings →
          Languages, choose the languages you want to offer, then come back here.
        </p>
      </div>
    )
  }

  const targets = settings.activeLocales.filter((code) => code !== settings.defaultLocale)

  if (targets.length === 0) {
    return (
      <div className="eg-translations eg-translations--notice">
        {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
        <style dangerouslySetInnerHTML={{ __html: TRANSLATIONS_CSS }} />
        <h1>Translations</h1>
        <p>
          Only your primary language is switched on. Add at least one more language under Settings → Languages and each
          one gets a column here.
        </p>
      </div>
    )
  }

  const scope = first(searchParams.scope) ?? 'interface'
  const documentId = first(searchParams.doc)
  const group = first(searchParams.group)

  const data = await getTranslationsPageData({
    engine: engine as unknown as Parameters<typeof getTranslationsPageData>[0]['engine'],
    settings,
    scope,
    documentId,
    group,
  })

  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
      <style dangerouslySetInnerHTML={{ __html: TRANSLATIONS_CSS }} />
      <TranslationsTable
        rows={data.rows}
        targetLocales={data.targetLocales}
        sourceLocale={settings.defaultLocale}
        progress={data.progress}
        collections={data.collections}
        documents={data.documents}
        scope={scope}
        documentId={documentId}
        group={group}
        apiBase={apiBase}
      />
    </>
  )
}
