import React, { useEffect, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { DocumentTranslations } from '@/features/multilingual/documentTranslations'

import { fetchMachineUsage, runBulkForDocument, saveCellText, setCellStatus } from './translateApi'
import { textCellsFor } from './translateCanvas'

/**
 * Page-level status actions for the language being edited: approve the page,
 * request review of its texts, machine translate the empty ones, and copy the
 * source into empty texts. Each one goes through the same routes the panel and
 * the Translations screen use, so the review rules are the server's.
 */
export function TranslateActions({
  state,
  locale,
  onChanged,
  onMessage,
}: {
  state: DocumentTranslations
  locale: string
  onChanged: () => void
  onMessage: (text: string) => void
}): React.ReactElement {
  const t = useAdminT()
  const [busy, setBusy] = useState<string | null>(null)
  const [usage, setUsage] = useState<{ usedChars: number; monthlyCharLimit: number } | null>(null)

  // This month's machine usage, shown beside the machine action (null for a viewer who may not read it).
  useEffect(() => {
    let live = true
    void fetchMachineUsage().then((next) => {
      if (live) setUsage(next)
    })
    return () => {
      live = false
    }
  }, [])

  const cells = textCellsFor(state, locale)
  const sourceId = state.sourceId

  const run = async (name: string, work: () => Promise<string>) => {
    setBusy(name)
    try {
      onMessage(await work())
    } catch (error) {
      onMessage((error as Error).message)
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  const approvePage = () =>
    run('approve', async () => {
      const result = await runBulkForDocument({ action: 'approve', sourceId, locale })
      return result.refused.length > 0 ? result.refused[0]! : t('builder.translate.result', { updated: result.updated, skipped: result.skipped })
    })

  const requestReview = () =>
    run('review', async () => {
      let count = 0
      for (const cell of cells) {
        if (cell.rowId === null || cell.status === 'needs_review' || cell.status === 'untranslated') continue
        await setCellStatus(cell, 'needs_review')
        count += 1
      }
      return t('builder.translate.result', { updated: count, skipped: cells.length - count })
    })

  const copySource = () =>
    run('copy', async () => {
      let count = 0
      for (const cell of cells) {
        if (cell.status !== 'untranslated' || cell.sourceText.trim().length === 0) continue
        await saveCellText({ cell, locale, sourceId, value: cell.sourceText })
        count += 1
      }
      return t('builder.translate.result', { updated: count, skipped: cells.length - count })
    })

  const machinePage = () =>
    run('machine', async () => {
      const result = await runBulkForDocument({ action: 'translate', sourceId, locale })
      setUsage((await fetchMachineUsage()) ?? usage)
      return result.refused.length > 0 ? result.refused[0]! : t('builder.translate.result', { updated: result.updated, skipped: result.skipped })
    })

  const hasUntranslated = cells.some((cell) => cell.status === 'untranslated')

  return (
    <div className="ve-translate-actions" data-testid="visual-editor-translate-actions">
      <button type="button" className="ve-btn ve-btn--primary" onClick={approvePage} disabled={busy !== null}>
        {t('builder.translate.approvePage')}
      </button>
      <button type="button" className="ve-btn" onClick={requestReview} disabled={busy !== null}>
        {t('builder.translate.requestReview')}
      </button>
      <button type="button" className="ve-btn" onClick={machinePage} disabled={busy !== null || !hasUntranslated}>
        {t('builder.translate.machinePage')}
      </button>
      <button type="button" className="ve-btn" onClick={copySource} disabled={busy !== null || !hasUntranslated}>
        {t('builder.translate.copySource')}
      </button>
      {usage ? (
        <span className="ve-translate-actions__usage">{t('builder.translate.usage', { used: usage.usedChars, limit: usage.monthlyCharLimit })}</span>
      ) : null}
    </div>
  )
}

export const TRANSLATE_ACTIONS_CSS = `
.ve-translate-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--theme-elevation-200, #e4e4e7); }
.ve-translate-actions__usage { font-size: 12px; color: var(--theme-elevation-600, #52525b); align-self: center; }
`
