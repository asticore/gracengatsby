import { getAdminRoot } from '@/features/security/settings'
import React from 'react'
import type { AdminViewServerProps } from '@/engine'

import { loadListPrefs } from '@/admin/list/listPrefs'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { parseListSearchParams, resolveVisibleColumns, serializeListState, type ListState } from '@/admin/list/listQuery'
import { isAdminUser } from '@/admin/auth'

import { localeLabel } from '../locales'
import { getMultilingualSettings } from '../settings'
import { TRANSLATABLE_COLLECTIONS } from '../translatableFields'
import { buildDocumentRows, documentColumns, DOCUMENT_DEFAULT_COLUMNS, STATUS_TEXT_KEYS } from '../documentRows'
import {
  canApproveTranslation,
  computeTranslationStatus,
  parseAssignedTo,
  type TranslationStatus,
} from '../translationStatus'
import {
  filterOverviewRows,
  itemKey,
  OVERVIEW_DEFAULT_SORT,
  pageOverviewRows,
  sortOverviewRows,
} from '../translationOverview'
import { translationKey } from '../store'
import { TranslationEditor, type EditorCell, type EditorField } from './TranslationEditor'
import { TranslationsOverview } from './TranslationsOverview'
import { loadAssignableUsers, loadOverviewData } from './translationsData'
import { ListToolbar } from '@/admin/views/ListToolbar'

/**
 * `/admin/translations` - every translatable item, one status per language.
 *
 * Server-rendered so the table is real at first paint. The list controls are
 * the same ones the Pages list and the Templates hub use (search, filters,
 * columns, sort), and a click on an item opens its editor beside the table.
 * Writing happens in the editor or in the bulk bar; both go through the
 * collection's own write rule.
 */

const first = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return null
}

const noticeClassName =
  'flex flex-col gap-[calc(var(--base)*1.25)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)]'
const noticeTextClassName = 'max-w-[60ch] text-[var(--theme-elevation-600)]'
const LIST_LIMIT = 25

export const TranslationsView: React.FC<AdminViewServerProps> = async (props) => {
  const engine = props.engine
  if (!engine?.config) return null
  const ui = await getAdminUi()
  const statusText = (status: TranslationStatus): string => ui.t(STATUS_TEXT_KEYS[status])

  const searchParams = (props.searchParams ?? {}) as Record<string, unknown>
  const settings = await getMultilingualSettings(engine as Parameters<typeof getMultilingualSettings>[0])
  const user = props.user
  const viewerId = Number(user?.id)
  const viewer = Number.isInteger(viewerId) && viewerId > 0 ? viewerId : null
  const apiBase = `${engine.config.serverURL ?? ''}${engine.config.routes?.api ?? '/api'}/translations`
  const bulkApi = `${engine.config.serverURL ?? ''}${engine.config.routes?.api ?? '/api'}/admin-translations`

  if (!settings.enabled) {
    return (
      <div className={noticeClassName}>
        <h1>{ui.t('translations.heading')}</h1>
        <p className={noticeTextClassName}>{ui.t('translations.disabled')}</p>
      </div>
    )
  }

  const targets = settings.activeLocales.filter((code) => code !== settings.defaultLocale)
  if (targets.length === 0) {
    return (
      <div className={noticeClassName}>
        <h1>{ui.t('translations.heading')}</h1>
        <p className={noticeTextClassName}>{ui.t('translations.onlyPrimary')}</p>
      </div>
    )
  }

  const savedPrefs = await loadListPrefs(engine, user, 'translations')
  const urlState = parseListSearchParams(searchParams as Record<string, string | string[] | undefined>)
  const state: ListState = {
    ...urlState,
    sort: urlState.sort || savedPrefs.sort || OVERVIEW_DEFAULT_SORT,
    limit: urlState.limit || savedPrefs.limit || LIST_LIMIT,
    cols: urlState.cols || savedPrefs.cols || null,
    view: null,
  }

  const [data, users] = await Promise.all([
    loadOverviewData({ engine, user, settings }),
    loadAssignableUsers({ engine, user }),
  ])
  const userLabel = new Map(users.map((entry) => [entry.id, entry.label]))

  const columns = documentColumns({ targetLocales: targets, localeLabel, t: ui.t })
  const defaults = DOCUMENT_DEFAULT_COLUMNS(targets)
  const { visibleNames } = resolveVisibleColumns(columns, state.cols, savedPrefs.cols, defaults)

  // One row per document. The document's own editor link is the fallback target for builder-less types.
  const documentHref = (collection: string, documentId: string) =>
    `?${serializeListState(state, { page: state.page })}&item=${encodeURIComponent(`collection:${collection}:${documentId}`)}`
  const rows = buildDocumentRows({
    adminRoot: await getAdminRoot(),
    items: data.items,
    stored: data.stored,
    targetLocales: targets,
    rules: settings.translationRules,
    catalogue: {
      documents: new Map(data.documents.map((doc) => [doc.sourceId, doc])),
      confirmedMissing: new Set(),
    },
    documentHref,
  })
  const matching = sortOverviewRows(filterOverviewRows(rows, state.filters, state.q, viewer), state.sort)
  const paged = pageOverviewRows(matching, state.page, state.limit)

  const selectedKey = first(searchParams.item)
  const selected = selectedKey ? data.items.find((item) => itemKey(item.sourceKind, item.sourceId) === selectedKey) : undefined

  // Per-language progress, for the header. Counted over the whole site, not the filtered list.
  const progress = targets.map((locale) => {
    const cells = rows.map((row) => row.cells.find((cell) => cell.locale === locale)).filter(Boolean)
    const done = cells.filter((cell) => cell?.status === 'approved').length
    return { locale, label: localeLabel(locale), done, total: cells.length }
  })

  let editor: React.ReactNode = null
  if (selected) {
    const storedRows = data.stored.filter((row) => row.sourceKind === selected.sourceKind && row.sourceId === selected.sourceId)
    const byKey = new Map(storedRows.map((row) => [translationKey(row), row]))
    const fields: EditorField[] = selected.fields.map((field) => ({
      fieldPath: field.fieldPath,
      label: field.label,
      sourceText: field.sourceText,
    }))
    const cells: EditorCell[] = []
    for (const field of selected.fields) {
      for (const locale of targets) {
        const row = byKey.get(translationKey({ locale, sourceKind: selected.sourceKind, sourceId: selected.sourceId, fieldPath: field.fieldPath }))
        const status: TranslationStatus = computeTranslationStatus(
          { value: row?.value ?? null, status: row?.status ?? null, sourceText: row?.sourceText ?? null },
          field.sourceText,
        )
        cells.push({
          fieldPath: field.fieldPath,
          locale,
          value: row?.value ?? '',
          id: row?.id ?? null,
          status,
          statusLabel: statusText(status),
          assignees: parseAssignedTo(row?.assignedTo),
        })
      }
    }
    const approvable = Object.fromEntries(
      targets.map((locale) => [locale, canApproveTranslation({ id: viewer ?? 0, isAdmin: isAdminUser(user) }, locale, settings).ok]),
    )
    editor = (
      <TranslationEditor
        key={selectedKey ?? ''}
        itemKey={selectedKey ?? ''}
        title={selected.title}
        typeLabel={selected.typeLabel}
        editHref={selected.editHref}
        sourceKind={selected.sourceKind}
        sourceId={selected.sourceId}
        sourceLocale={settings.defaultLocale}
        sourceLabel={localeLabel(settings.defaultLocale)}
        targetLocales={targets}
        localeLabels={Object.fromEntries(targets.map((code) => [code, localeLabel(code)]))}
        fields={fields}
        cells={cells}
        users={users}
        approvable={approvable}
        apiBase={apiBase}
        bulkApi={bulkApi}
        requireReview={settings.requireReview}
        closeHref={`?${serializeListState(state, { page: state.page })}`}
      />
    )
  }

  const listRows = paged.rows.map((row) => ({
    key: row.key,
    title: row.title,
    typeLabel: row.typeLabel,
    progress: row.progress,
    updatedAt: row.lastSourceChange,
    url: row.url,
    editHref: row.href,
    mode: row.mode,
    inactiveCount: row.counts.inactive,
    outdatedCount: row.counts.outdated,
    inactive: row.inactive.map((entry) => ({
      locale: entry.locale,
      localeLabel: localeLabel(entry.locale),
      fieldPath: entry.fieldPath,
      reason: entry.reason,
      value: entry.value.length > 80 ? `${entry.value.slice(0, 80)}...` : entry.value,
    })),
    cells: row.cells.map((cell) => ({
      locale: cell.locale,
      status: cell.status,
      statusLabel: statusText(cell.status),
      approved: cell.approved,
      total: cell.total,
      href: cell.href,
      mode: cell.mode,
    })),
    assignees: row.assignees.map((id) => ({ id, label: userLabel.get(id) ?? `User ${id}` })),
  }))

  return (
    <div className="list-view">
      <div className="list-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h1>{ui.t('translations.heading')}</h1>
        <div className="text-[13px]" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {progress.map((entry) => (
            <span key={entry.locale}>
              {entry.label}: {entry.done} of {entry.total} approved
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="lst-panel" style={{ flex: '1 1 640px', minWidth: 0 }}>
          <ListToolbar
            collectionSlug="translations"
            state={state}
            columns={columns}
            visibleNames={visibleNames}
            limit={state.limit}
            hasSavedPrefs={!!(savedPrefs.cols || savedPrefs.sort || savedPrefs.limit)}
            totalDocs={matching.length}
            view="list"
          />
          <TranslationsOverview
            rows={listRows}
            visibleNames={visibleNames}
            targetLocales={targets}
            localeLabels={Object.fromEntries(targets.map((code) => [code, localeLabel(code)]))}
            users={users}
            clearApi={bulkApi}
            sortState={state.sort}
            bulkApi={bulkApi}
            hasRows={rows.length > 0}
            emptyFiltered={matching.length === 0 && rows.length > 0}
            selectedKey={selectedKey}
            page={paged.page}
            totalPages={paged.totalPages}
            totalMatching={matching.length}
            prevHref={paged.page > 1 ? `?${serializeListState(state, { page: paged.page - 1 })}` : null}
            nextHref={paged.page < paged.totalPages ? `?${serializeListState(state, { page: paged.page + 1 })}` : null}
            sortLinks={Object.fromEntries(
              ['title', 'type', 'updatedAt'].map((column) => [
                column,
                `?${serializeListState(state, { sort: nextSort(state.sort, column), page: 1 })}`,
              ]),
            )}
          />
        </div>
        {editor ? <div style={{ flex: '1 1 420px', minWidth: 0 }}>{editor}</div> : null}
      </div>
    </div>
  )
}

function nextSort(current: string, column: string): string {
  if (current === column) return `-${column}`
  if (current === `-${column}`) return ''
  return column
}

export default TranslationsView
