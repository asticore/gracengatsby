'use client'

import React, { useState } from 'react'
import styles from '@/admin/admin.module.css'
import './settings-transfer.css'
import {
  IMPORT_SECTIONS,
  MIN_EXPORT_PASSWORD_LENGTH,
  SECTION_LABELS,
  type ImportReport,
  type ImportSection,
} from '@/features/settingsTransfer/format'

type Choices = Record<ImportSection, boolean>

const EXPORT_CHOICES: Array<{ key: ImportSection; label: string; hint: string }> = [
  { key: 'settings', label: 'Settings', hint: 'The settings pages: site, SEO, payments, email, security, backups and the rest.' },
  { key: 'headerFooter', label: 'Header and footer', hint: 'Menus and footer content.' },
  { key: 'roles', label: 'Roles', hint: 'Role names and their permission grids.' },
  { key: 'users', label: 'Admin users', hint: 'Names, emails and roles. Never passwords or 2FA secrets. Shop customers are not included.' },
  { key: 'redirects', label: 'Redirects', hint: 'Every redirect rule.' },
  { key: 'pageTemplates', label: 'Page templates', hint: 'Templates and their blocks.' },
  { key: 'fieldGroups', label: 'Field groups', hint: 'Custom field groups.' },
  { key: 'pages', label: 'Pages', hint: 'Page content. Parent links are not kept.' },
  { key: 'posts', label: 'Posts', hint: 'Post content. Featured image links are not kept.' },
  { key: 'products', label: 'Products', hint: 'Product content. Image links are not kept.' },
  { key: 'mediaMetadata', label: 'Media details', hint: 'File names and alt text. Image files are not included.' },
]

const NO_CHOICES: Choices = Object.fromEntries(IMPORT_SECTIONS.map((key) => [key, false])) as Choices

type ImportFile = { name: string; data: unknown; encrypted: boolean }

type Plan = {
  report: ImportReport
  file: unknown
  password: string
  sectionsKey: string
  allowAdmins: boolean
}

async function postImport(body: Record<string, unknown>): Promise<ImportReport> {
  const res = await fetch('/api/admin-settings-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch((): null => null)) as { error?: string; report?: ImportReport } | null
  if (!res.ok || !data?.report) throw new Error(data?.error ?? 'The import failed.')
  return data.report
}

function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match ? match[1] : null
}

function ReportTable({ report }: { report: ImportReport }) {
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead>
          <tr>
            <th scope="col">Section</th>
            <th scope="col">Created</th>
            <th scope="col">Updated</th>
            <th scope="col">Skipped</th>
            <th scope="col">Errors</th>
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
      <summary>{total} item{total === 1 ? '' : 's'} to review</summary>
      <ul>
        {warnings.map((warning, index) => (
          <li key={`warning-${warning.label}-${index}`}>
            <strong>{warning.label}</strong> warning: {warning.text}
          </li>
        ))}
        {issues.slice(0, 200).map((issue, index) => (
          <li key={`${issue.label}-${issue.key}-${index}`}>
            <strong>{issue.label}</strong> {issue.key}: {issue.action}
            {issue.message ? ` - ${issue.message}` : ''}
          </li>
        ))}
      </ul>
      {issues.length > 200 ? <p className="st-muted">Showing the first 200.</p> : null}
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
        setExportError(data?.error ?? 'The export failed.')
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
      setExportError('Network error. The export did not download.')
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
      setImportError('That file is not valid JSON. Choose a file exported from this admin.')
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
      setImportError(error instanceof Error ? error.message : 'The check failed.')
    } finally {
      setImportBusy(false)
    }
  }

  async function handleApply() {
    if (!importFile || !planClean) return
    if (!window.confirm('Apply this import? Matching settings and content will be overwritten with the file.')) return
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
      setImportError(error instanceof Error ? error.message : 'The import failed.')
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <div className="st-page">
      <header className="st-header">
        <h1 className="st-title">Export and import</h1>
        <p className="st-muted">
          Move settings, content and users between sites, or keep a copy. Only admins can use this page.
        </p>
      </header>

      <section className="st-card" aria-labelledby="st-export-heading">
        <h2 id="st-export-heading" className="st-heading">Export</h2>
        <fieldset className="st-fieldset" disabled={exportBusy}>
          <legend className="st-legend">What to include</legend>
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
                    <span className="st-check-label">{choice.label}</span>
                    <span className="st-muted st-check-hint">{choice.hint}</span>
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
              <span className="st-check-label">Include secrets</span>
              <span className="st-muted st-check-hint">
                API keys, payment and email secrets, and backup credentials. The whole file is then encrypted with the
                password below, and you will need it to import.
              </span>
            </span>
          </label>
          {includeSecrets ? (
            <div className="st-field">
              <label htmlFor="st-export-password" className="st-label">
                Encryption password (at least {MIN_EXPORT_PASSWORD_LENGTH} characters)
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
            {exportBusy ? 'Preparing...' : 'Download export'}
          </button>
        </div>
      </section>

      <section className="st-card" aria-labelledby="st-import-heading">
        <h2 id="st-import-heading" className="st-heading">Import</h2>
        <p className="st-muted">
          Choose a file exported from this admin. Run the check first. Apply becomes available only when the check finds
          no errors. Secrets missing from the file keep their current values, and existing users are left unchanged.
        </p>

        <div className="st-field">
          <label htmlFor="st-import-file" className="st-label">Export file</label>
          <input
            id="st-import-file"
            type="file"
            accept="application/json,.json"
            className="st-file"
            onChange={handleFile}
            disabled={importBusy}
          />
          {importFile ? <p className="st-muted">Loaded {importFile.name}.</p> : null}
        </div>

        {importFile?.encrypted ? (
          <div className="st-field">
            <label htmlFor="st-import-password" className="st-label">Password for this export</label>
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
            <legend className="st-legend">What to import</legend>
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
                    <span className="st-check-label">{SECTION_LABELS[section]}</span>
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
                <span className="st-check-label">Allow admin accounts</span>
                <span className="st-muted st-check-hint">
                  Imported users with the admin role stay admins. Off, they are imported as editors.
                </span>
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
            Check (dry run)
          </button>
          <button type="button" className={styles.btnPrimary} onClick={handleApply} disabled={!planClean || importBusy}>
            Apply import
          </button>
        </div>

        {plan && !planCurrent ? (
          <p className="st-muted">The file, password or sections changed. Run the check again before applying.</p>
        ) : null}

        {planCurrent ? (
          <div className="st-result">
            <h3 className="st-subheading">
              {planClean ? 'Check passed. Review the counts, then apply.' : 'The check found errors. Fix the file and check again.'}
            </h3>
            <ReportTable report={plan.report} />
            <IssueList report={plan.report} />
          </div>
        ) : null}

        {applied ? (
          <div className="st-result">
            <h3 className="st-subheading">Import applied.</h3>
            <ReportTable report={applied} />
            <IssueList report={applied} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
