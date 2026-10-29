'use client'

import React, { useState } from 'react'
import styles from '@/admin/admin.module.css'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'
import './settings-transfer.css'
import {
  IMPORT_SECTIONS,
  MIN_EXPORT_PASSWORD_LENGTH,
  type ImportReport,
  type ImportSection,
} from '@/features/settingsTransfer/format'

type Choices = Record<ImportSection, boolean>

/** Export choices. Labels and hints are UI string keys, read through the admin translator. */
const EXPORT_CHOICES: Array<{ key: ImportSection; label: UiStringKey; hint: UiStringKey }> = [
  { key: 'settings', label: 'st.label.settings', hint: 'st.hint.settings' },
  { key: 'headerFooter', label: 'st.label.headerFooter', hint: 'st.hint.headerFooter' },
  { key: 'roles', label: 'st.label.roles', hint: 'st.hint.roles' },
  { key: 'users', label: 'st.label.users', hint: 'st.hint.users' },
  { key: 'redirects', label: 'st.label.redirects', hint: 'st.hint.redirects' },
  { key: 'pageTemplates', label: 'st.label.pageTemplates', hint: 'st.hint.pageTemplates' },
  { key: 'fieldGroups', label: 'st.label.fieldGroups', hint: 'st.hint.fieldGroups' },
  { key: 'pages', label: 'st.label.pages', hint: 'st.hint.pages' },
  { key: 'posts', label: 'st.label.posts', hint: 'st.hint.posts' },
  { key: 'products', label: 'st.label.products', hint: 'st.hint.products' },
  { key: 'mediaMetadata', label: 'st.label.mediaMetadata', hint: 'st.hint.mediaMetadata' },
]

const IMPORT_LABEL_KEYS: Record<ImportSection, UiStringKey> = {
  settings: 'st.label.settings',
  headerFooter: 'st.label.headerFooter',
  roles: 'st.label.roles',
  users: 'st.label.users',
  redirects: 'st.label.redirects',
  pageTemplates: 'st.label.pageTemplates',
  fieldGroups: 'st.label.fieldGroups',
  pages: 'st.label.pages',
  posts: 'st.label.posts',
  products: 'st.label.products',
  mediaMetadata: 'st.label.mediaMetadata',
}

const NO_CHOICES: Choices = Object.fromEntries(IMPORT_SECTIONS.map((key) => [key, false])) as Choices

type ImportFile = { name: string; data: unknown; encrypted: boolean }

type Plan = {
  report: ImportReport
  file: unknown
  password: string
  sectionsKey: string
  allowAdmins: boolean
}

/** Throws the server's message, or an empty message when there is none (callers then show a translated fallback). */
async function postImport(body: Record<string, unknown>): Promise<ImportReport> {
  const res = await fetch('/api/admin-settings-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch((): null => null)) as { error?: string; report?: ImportReport } | null
  if (!res.ok || !data?.report) throw new Error(data?.error ?? '')
  return data.report
}

function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match ? match[1] : null
}

function ReportTable({ report }: { report: ImportReport }) {
  const t = useAdminT()
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">{t('st.colSection')}</th>
            <th scope="col">{t('st.colCreated')}</th>
            <th scope="col">{t('st.colUpdated')}</th>
            <th scope="col">{t('st.colSkipped')}</th>
            <th scope="col">{t('st.colErrors')}</th>
          </tr>
        </thead>
        <tbody>
          {report.sections.map((section) => (
            <tr key={section.section}>
              <th scope="row">{section.label}</th>
              <td>{section.created}</td>
              <td>{section.updated}</td>
              <td>{section.skipped}</td>
              <td className={section.errors > 0 ? 'st-error-count' : undefined}>{section.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IssueList({ report }: { report: ImportReport }) {
  const t = useAdminT()
  const issues = report.sections.flatMap((section) =>
    section.items
      .filter((item) => item.action === 'error' || item.action === 'skipped' || item.message)
      .map((item) => ({ ...item, label: section.label })),
  )
  const warnings = report.sections.flatMap((section) => section.warnings.map((text) => ({ label: section.label, text })))
  const total = issues.length + warnings.length
  if (total === 0) return null

  return (
    <details className="st-issues">
      <summary>{total === 1 ? t('st.reviewOne') : t('st.reviewMany', { count: total })}</summary>
      <ul>
        {warnings.map((warning, index) => (
          <li key={`warning-${warning.label}-${index}`}>
            {t('st.warning', { label: warning.label, text: warning.text })}
          </li>
        ))}
        {issues.slice(0, 200).map((issue, index) => (
          <li key={`${issue.label}-${issue.key}-${index}`}>
            {issue.message
              ? t('st.issueMessage', { label: issue.label, key: issue.key, action: issue.action, message: issue.message })
              : t('st.issue', { label: issue.label, key: issue.key, action: issue.action })}
          </li>
        ))}
      </ul>
      {issues.length > 200 ? <p className="st-muted">{t('st.showingFirst')}</p> : null}
    </details>
  )
}

/**
 * Admin view for moving settings, content and users between sites. Export
 * builds a JSON file (encrypted when it carries secrets). Import reads one
 * back, runs a dry run that shows what would change, and applies it only
 * once that dry run is clean.
 */
export function SettingsTransferClient() {
  const t = useAdminT()
  const [choices, setChoices] = useState<Choices>({ ...NO_CHOICES, settings: true })
  const [includeSecrets, setIncludeSecrets] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const [importFile, setImportFile] = useState<ImportFile | null>(null)
  const [importPassword, setImportPassword] = useState('')
  const [importSections, setImportSections] = useState<ImportSection[]>([...IMPORT_SECTIONS])
  const [allowAdmins, setAllowAdmins] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [applied, setApplied] = useState<ImportReport | null>(null)

  const anyChosen = Object.values(choices).some(Boolean)
  const secretPasswordTooShort = includeSecrets && exportPassword.length < MIN_EXPORT_PASSWORD_LENGTH
  const exportDisabled = exportBusy || !anyChosen || secretPasswordTooShort

  const sectionsKey = importSections.join(',')
  const planCurrent =
    plan !== null &&
    importFile !== null &&
    plan.file === importFile.data &&
    plan.password === importPassword &&
    plan.sectionsKey === sectionsKey &&
    plan.allowAdmins === allowAdmins
  const planClean = planCurrent && plan.report.sections.every((section) => section.errors === 0)

  function toggleChoice(key: ImportSection) {
    setChoices((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleImportSection(key: ImportSection) {
    setImportSections((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  async function handleExport() {
    setExportBusy(true)
    setExportError(null)
    try {
      const body = {
        settings: choices.settings,
        headerFooter: choices.headerFooter,
        roles: choices.roles,
        users: choices.users,
        redirects: choices.redirects,
        pageTemplates: choices.pageTemplates,
        fieldGroups: choices.fieldGroups,
        content: {
          pages: choices.pages,
          posts: choices.posts,
          products: choices.products,
          mediaMetadata: choices.mediaMetadata,
        },
        includeSecrets,
        ...(includeSecrets ? { password: exportPassword } : {}),
      }
      const res = await fetch('/api/admin-settings-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = (await res.json().catch((): null => null)) as { error?: string } | null
        setExportError(data?.error ?? t('st.exportFailed'))
        return
      }

      const blob = await res.blob()
      const name = filenameFrom(res.headers.get('Content-Disposition')) ?? 'gracengatsby-export.json'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setExportError(t('st.exportNetwork'))
    } finally {
      setExportBusy(false)
    }
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    setPlan(null)
    setApplied(null)
    setImportError(null)
    setImportFile(null)
    if (!picked) return

    try {
      const data = JSON.parse(await picked.text()) as unknown
      const encrypted = Boolean(data && typeof data === 'object' && (data as { encrypted?: unknown }).encrypted === true)
      setImportFile({ name: picked.name, data, encrypted })
      setImportSections([...IMPORT_SECTIONS])
    } catch {
      setImportError(t('st.notJson'))
    }
  }

  async function handleDryRun() {
    if (!importFile) return
    setImportBusy(true)
    setImportError(null)
    setApplied(null)
    try {
      const report = await postImport({
        file: importFile.data,
        password: importPassword || undefined,
        dryRun: true,
        sections: importSections,
        allowAdminUsers: allowAdmins,
      })
      setPlan({ report, file: importFile.data, password: importPassword, sectionsKey, allowAdmins })
    } catch (error) {
      setPlan(null)
      setImportError(error instanceof Error && error.message ? error.message : t('st.checkFailed'))
    } finally {
      setImportBusy(false)
    }
  }

  async function handleApply() {
    if (!importFile || !planClean) return
    if (!window.confirm(t('st.confirmApply'))) return
    setImportBusy(true)
    setImportError(null)
    try {
      const report = await postImport({
        file: importFile.data,
        password: importPassword || undefined,
        dryRun: false,
        sections: importSections,
        allowAdminUsers: allowAdmins,
      })
      setApplied(report)
      setPlan(null)
    } catch (error) {
      setImportError(error instanceof Error && error.message ? error.message : t('st.importFailed'))
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="st-page">
      <header className="st-header">
        <h1 className="st-title">{t('st.title')}</h1>
        <p className="st-muted">{t('st.intro')}</p>
      </header>

      <CollapsibleCard id="st:export" title={t('st.exportTitle')} className="st-card">
        <fieldset className="st-fieldset" disabled={exportBusy}>
          <legend className="st-legend">{t('st.whatInclude')}</legend>
          <ul className="st-checks">
            {EXPORT_CHOICES.map((choice) => (
              <li key={choice.key}>
                <label className="st-check">
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={choices[choice.key]}
                    onChange={() => toggleChoice(choice.key)}
                  />
                  <span>
                    <span className="st-check-label">{t(choice.label)}</span>
                    <span className="st-muted st-check-hint">{t(choice.hint)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="st-secrets">
          <label className="st-check">
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={includeSecrets}
              onChange={(event) => setIncludeSecrets(event.target.checked)}
              disabled={exportBusy}
            />
            <span>
              <span className="st-check-label">{t('st.secretsLabel')}</span>
              <span className="st-muted st-check-hint">{t('st.secretsHint')}</span>
            </span>
          </label>
          {includeSecrets ? (
            <div className="st-field">
              <label htmlFor="st-export-password" className="st-label">
                {t('st.encryptPassword', { min: MIN_EXPORT_PASSWORD_LENGTH })}
              </label>
              <input
                id="st-export-password"
                type="password"
                autoComplete="new-password"
                className={`${styles.input} st-input`}
                value={exportPassword}
                onChange={(event) => setExportPassword(event.target.value)}
                disabled={exportBusy}
              />
            </div>
          ) : null}
        </div>

        {exportError ? <p className={`${styles.error} st-error`} role="alert">{exportError}</p> : null}

        <div className="st-actions">
          <button type="button" className={styles.btnPrimary} onClick={handleExport} disabled={exportDisabled}>
            {exportBusy ? t('st.preparing') : t('st.download')}
          </button>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="st:import" title={t('st.importTitle')} className="st-card">
        <p className="st-muted">
          {t('st.importIntro')}
        </p>

        <div className="st-field">
          <label htmlFor="st-import-file" className="st-label">{t('st.exportFile')}</label>
          <input
            id="st-import-file"
            type="file"
            accept="application/json,.json"
            className="st-file"
            onChange={handleFile}
            disabled={importBusy}
          />
          {importFile ? <p className="st-muted">{t('st.loaded', { name: importFile.name })}</p> : null}
        </div>

        {importFile?.encrypted ? (
          <div className="st-field">
            <label htmlFor="st-import-password" className="st-label">{t('st.importPassword')}</label>
            <input
              id="st-import-password"
              type="password"
              autoComplete="off"
              className={`${styles.input} st-input`}
              value={importPassword}
              onChange={(event) => setImportPassword(event.target.value)}
              disabled={importBusy}
            />
          </div>
        ) : null}

        {importFile ? (
          <fieldset className="st-fieldset" disabled={importBusy}>
            <legend className="st-legend">{t('st.whatImport')}</legend>
            <ul className="st-checks">
              {IMPORT_SECTIONS.map((section) => (
                <li key={section}>
                  <label className="st-check">
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={importSections.includes(section)}
                      onChange={() => toggleImportSection(section)}
                    />
                    <span className="st-check-label">{t(IMPORT_LABEL_KEYS[section])}</span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="st-check">
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={allowAdmins}
                onChange={(event) => setAllowAdmins(event.target.checked)}
              />
              <span>
                <span className="st-check-label">{t('st.allowAdmins')}</span>
                <span className="st-muted st-check-hint">{t('st.allowAdminsHint')}</span>
              </span>
            </label>
          </fieldset>
        ) : null}

        {importError ? <p className={`${styles.error} st-error`} role="alert">{importError}</p> : null}

        <div className="st-actions">
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleDryRun}
            disabled={!importFile || importBusy || importSections.length === 0 || (importFile.encrypted && !importPassword)}
          >
            {t('st.dryRun')}
          </button>
          <button type="button" className={styles.btnPrimary} onClick={handleApply} disabled={!planClean || importBusy}>
            {t('st.apply')}
          </button>
        </div>

        {plan && !planCurrent ? (
          <p className="st-muted">{t('st.planChanged')}</p>
        ) : null}

        {planCurrent ? (
          <div className="st-result">
            <h3 className="st-subheading">
              {planClean ? t('st.checkPassed') : t('st.checkErrors')}
            </h3>
            <ReportTable report={plan.report} />
            <IssueList report={plan.report} />
          </div>
        ) : null}

        {applied ? (
          <div className="st-result">
            <h3 className="st-subheading">{t('st.applied')}</h3>
            <ReportTable report={applied} />
            <IssueList report={applied} />
          </div>
        ) : null}
      </CollapsibleCard>
    </div>
  )
}
