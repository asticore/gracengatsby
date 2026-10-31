'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useCallback, useMemo, useState } from 'react'
import styles from '@/admin/admin.module.css'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { APPROVAL_COLLECTIONS, MAX_APPROVALS_PER_STEP, type ApprovalCollection } from '@/features/approval/workflows'
import {
  COLLECTION_LABELS,
  canAddStep,
  draftFromRecord,
  emptyDraft,
  emptyStep,
  errorMessageFrom,
  moveStep,
  payloadFromDraft,
  roleChoices,
  toggleRole,
  unwrapDoc,
  validateDraft,
  type RoleChoice,
  type WorkflowDraft,
  type WorkflowRecord,
} from '@/features/approval/workflowForm'
import './roles-workflows.css'

type RoleRow = { id: number; name: string; slug: string; builtIn?: boolean; permissions?: Record<string, Record<string, boolean | string | undefined>> | null }

type Props = {
  workflows: WorkflowRecord[]
  roles: RoleRow[]
  canEdit: boolean
  /** The master switch under Settings > Security. Workflows do nothing while it is off. */
  approvalEnabled: boolean
}

const ENDPOINT = '/api/approval-workflows'

/** A group of checkboxes: pick any number of roles. */
function RolePicker({ legend, hint, value, choices, onChange, disabled }: { legend: string; hint?: string; value: string[]; choices: RoleChoice[]; onChange: (next: string[]) => void; disabled: boolean }) {
  // A role that was deleted after being chosen stays visible so it can be removed.
  const known = new Set(choices.map((choice) => choice.slug))
  const missing = value.filter((slug) => !known.has(slug))
  return (
    <fieldset className="rw-roles" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="rw-role-list">
        {choices.map((choice) => (
          <label key={choice.slug} className={`rw-role${value.includes(choice.slug) ? ' rw-role--on' : ''}`}>
            <input type="checkbox" checked={value.includes(choice.slug)} onChange={() => onChange(toggleRole(value, choice.slug))} />
            <span>{choice.name}</span>
          </label>
        ))}
        {missing.map((slug) => (
          <label key={slug} className="rw-role rw-role--on rw-role--missing">
            <input type="checkbox" checked onChange={() => onChange(toggleRole(value, slug))} />
            <span>{slug} (role no longer exists)</span>
          </label>
        ))}
      </div>
      {hint && <p className="rw-hint">{hint}</p>}
    </fieldset>
  )
}

/** The form for one workflow: used for a new draft and inside each saved workflow's card. */
function WorkflowForm({
  draft,
  choices,
  knownRoles,
  others,
  canEdit,
  busy,
  error,
  saveLabel,
  onChange,
  onSave,
  onCancel,
  onDelete,
  confirmDelete,
}: {
  draft: WorkflowDraft
  choices: RoleChoice[]
  knownRoles: string[]
  others: Array<{ id: number; collection: string; active: boolean }>
  canEdit: boolean
  busy: boolean
  error: string | null
  saveLabel: string
  onChange: (next: WorkflowDraft) => void
  onSave: () => void
  onCancel?: () => void
  onDelete?: () => void
  confirmDelete?: boolean
}) {
  const idBase = `rw-${draft.id ?? 'new'}`
  const problems = useMemo(() => validateDraft(draft, knownRoles, others), [draft, knownRoles, others])
  const [showProblems, setShowProblems] = useState(false)
  const disabled = !canEdit || busy
  const roleName = (slug: string) => choices.find((choice) => choice.slug === slug)

  const setStep = (index: number, patch: Partial<WorkflowDraft['steps'][number]>) =>
    onChange({ ...draft, steps: draft.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) })

  const weak = (slugs: string[]) => slugs.map(roleName).filter((choice): choice is RoleChoice => Boolean(choice) && !choice!.canApprove)

  return (
    <form
      className="rw-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (problems.length > 0) {
          setShowProblems(true)
          return
        }
        onSave()
      }}
    >
      <div className="rw-grid">
        <label className="rw-field" htmlFor={`${idBase}-name`}>
          <span>Name</span>
          <input id={`${idBase}-name`} className={styles.input} type="text" maxLength={120} value={draft.name} disabled={disabled} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="Editorial then legal" />
        </label>
        <label className="rw-field" htmlFor={`${idBase}-collection`}>
          <span>Content type</span>
          <select id={`${idBase}-collection`} className={styles.input} value={draft.collection} disabled={disabled} onChange={(event) => onChange({ ...draft, collection: event.target.value as ApprovalCollection })}>
            {APPROVAL_COLLECTIONS.map((value) => (
              <option key={value} value={value}>
                {COLLECTION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="rw-check">
        <input type="checkbox" checked={draft.active} disabled={disabled} onChange={(event) => onChange({ ...draft, active: event.target.checked })} />
        <span>
          Active. Replaces the approvals count in Security settings for {COLLECTION_LABELS[draft.collection].toLowerCase()}. Only one workflow can be active per content type.
        </span>
      </label>

      <RolePicker
        legend="Who can submit"
        hint="Leave all unticked to let anyone who can edit this content submit it. Admins can always submit."
        value={draft.submitterRoles}
        choices={choices}
        disabled={disabled}
        onChange={(next) => onChange({ ...draft, submitterRoles: next })}
      />

      <h3 className="rw-steps-title">Steps</h3>
      <p className="rw-hint">Content goes through the steps in order. Admins can approve any step.</p>
      <ol className="rw-steps">
        {draft.steps.map((step, index) => {
          const weakRoles = weak(step.approverRoles)
          return (
            <li key={step.key} className="rw-step">
              <div className="rw-step-head">
                <strong>Step {index + 1}</strong>
                <span className="rw-step-actions">
                  <button type="button" className={styles.btnSecondary} disabled={disabled || index === 0} aria-label={`Move step ${index + 1} up`} onClick={() => onChange({ ...draft, steps: moveStep(draft.steps, index, index - 1) })}>
                    Up
                  </button>
                  <button type="button" className={styles.btnSecondary} disabled={disabled || index === draft.steps.length - 1} aria-label={`Move step ${index + 1} down`} onClick={() => onChange({ ...draft, steps: moveStep(draft.steps, index, index + 1) })}>
                    Down
                  </button>
                  <button type="button" className={styles.btnSecondary} disabled={disabled || draft.steps.length <= 1} aria-label={`Remove step ${index + 1}`} onClick={() => onChange({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })}>
                    Remove
                  </button>
                </span>
              </div>
              <div className="rw-grid">
                <label className="rw-field" htmlFor={`${idBase}-step-${step.key}-name`}>
                  <span>Step name</span>
                  <input id={`${idBase}-step-${step.key}-name`} className={styles.input} type="text" maxLength={120} value={step.name} disabled={disabled} onChange={(event) => setStep(index, { name: event.target.value })} placeholder="Legal review" />
                </label>
                <label className="rw-field" htmlFor={`${idBase}-step-${step.key}-count`}>
                  <span>Approvals needed</span>
                  <input
                    id={`${idBase}-step-${step.key}-count`}
                    className={styles.input}
                    type="number"
                    min={1}
                    max={MAX_APPROVALS_PER_STEP}
                    step={1}
                    value={step.approvalsNeeded}
                    disabled={disabled}
                    onChange={(event) => setStep(index, { approvalsNeeded: event.target.value === '' ? 0 : Number(event.target.value) })}
                  />
                </label>
              </div>
              <RolePicker legend="Who can approve this step" value={step.approverRoles} choices={choices} disabled={disabled} onChange={(next) => setStep(index, { approverRoles: next })} />
              {weakRoles.length > 0 && (
                <p className="rw-warning" role="note">
                  {weakRoles.map((choice) => choice.name).join(', ')} {weakRoles.length === 1 ? 'does' : 'do'} not have the Review: publish permission yet, so {weakRoles.length === 1 ? 'it' : 'they'} could not approve. Grant it on the Permissions tab.
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <button type="button" className={styles.btnSecondary} disabled={disabled || !canAddStep(draft.steps)} onClick={() => onChange({ ...draft, steps: [...draft.steps, emptyStep()] })}>
        + Add step
      </button>

      {(showProblems ? problems : []).length > 0 && (
        <ul className="rw-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="rw-actions">
          <button type="submit" className={styles.btnPrimary} disabled={busy}>
            {busy ? 'Saving...' : saveLabel}
          </button>
          {onCancel && (
            <button type="button" className={styles.btnSecondary} disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
          {onDelete && (
            <button type="button" className={styles.btnDanger} disabled={busy} onClick={onDelete}>
              {confirmDelete ? 'Confirm delete?' : 'Delete'}
            </button>
          )}
        </div>
      )}
    </form>
  )
}

/**
 * The Approval workflows tab on the Roles page: named multi-step review flows per content type.
 * Every write goes through /api/approval-workflows, which only admins may write to; the same
 * rules the form checks are checked again on the server.
 */
export function ApprovalWorkflowsPanel({ workflows: initial, roles, canEdit, approvalEnabled }: Props) {
  const t = useAdminT()
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>(initial)
  const [drafts, setDrafts] = useState<Record<number, WorkflowDraft>>({})
  const [creating, setCreating] = useState<WorkflowDraft | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null)

  const choices = useMemo(() => roleChoices(roles), [roles])
  const knownRoles = useMemo(() => ['admin', ...choices.map((choice) => choice.slug)], [choices])
  const summaries = useMemo(
    () => workflows.map((workflow) => ({ id: workflow.id, collection: String(workflow.collection ?? ''), active: workflow.active === true })),
    [workflows],
  )
  const setError = (key: string, message: string | null) => setErrors((prev) => ({ ...prev, [key]: message }))

  const request = useCallback(async (url: string, method: string, body?: unknown): Promise<{ ok: boolean; body: unknown }> => {
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const parsed = (await res.json().catch((): null => null)) as unknown
      return { ok: res.ok, body: parsed }
    } catch {
      return { ok: false, body: null }
    }
  }, [])

  const create = async () => {
    if (!creating) return
    setBusyId(-1)
    setError('new', null)
    const result = await request(ENDPOINT, 'POST', payloadFromDraft(creating))
    setBusyId(null)
    const doc = result.ok ? unwrapDoc<WorkflowRecord>(result.body) : null
    if (!doc) {
      setError('new', errorMessageFrom(result.body, 'Could not create the workflow. Check your connection and try again.'))
      return
    }
    setWorkflows((prev) => [...prev, doc])
    setCreating(null)
  }

  const save = async (id: number) => {
    const draft = drafts[id]
    if (!draft) return
    setBusyId(id)
    setError(String(id), null)
    const result = await request(`${ENDPOINT}/${id}`, 'PATCH', payloadFromDraft(draft))
    setBusyId(null)
    const doc = result.ok ? unwrapDoc<WorkflowRecord>(result.body) : null
    if (!doc) {
      setError(String(id), errorMessageFrom(result.body, 'Could not save the workflow. Check your connection and try again.'))
      return
    }
    setWorkflows((prev) => prev.map((workflow) => (workflow.id === id ? doc : workflow)))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const remove = async (id: number) => {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id)
      return
    }
    setBusyId(id)
    setError(String(id), null)
    const result = await request(`${ENDPOINT}/${id}`, 'DELETE')
    setBusyId(null)
    setConfirmingDelete(null)
    if (!result.ok) {
      setError(String(id), errorMessageFrom(result.body, 'Could not delete the workflow.'))
      return
    }
    setWorkflows((prev) => prev.filter((workflow) => workflow.id !== id))
  }

  return (
    <div className="rw-panel">
      <div className="rw-intro">
        <p>
          An approval workflow sends content through named steps, each approved by the roles you choose. A content type with an active workflow uses it instead of the single approvals count in Security settings.
        </p>
        {!approvalEnabled && (
          <p className="rw-warning" role="note">
            Content approval is switched off, so workflows are not applied yet. Turn it on under Settings, Security.
          </p>
        )}
        {canEdit && !creating && (
          <button type="button" className={styles.btnPrimary} onClick={() => setCreating(emptyDraft())}>
            + New workflow
          </button>
        )}
      </div>

      {creating && (
        <section className="rw-new" aria-label={t('aria.workflow.new')}>
          <h2>New workflow</h2>
          <WorkflowForm
            draft={creating}
            choices={choices}
            knownRoles={knownRoles}
            others={summaries}
            canEdit={canEdit}
            busy={busyId === -1}
            error={errors.new ?? null}
            saveLabel="Create workflow"
            onChange={setCreating}
            onSave={() => void create()}
            onCancel={() => {
              setCreating(null)
              setError('new', null)
            }}
          />
        </section>
      )}

      {workflows.length === 0 && !creating && <p className="rw-empty">No approval workflows yet. Content types without one use the approvals count in Security settings.</p>}

      {workflows.map((workflow) => {
        const draft = drafts[workflow.id] ?? draftFromRecord(workflow)
        const title = `${workflow.name || `Workflow ${workflow.id}`} - ${COLLECTION_LABELS[draft.collection]}${workflow.active ? '' : ' (off)'}`
        return (
          <CollapsibleCard key={workflow.id} id={`roles-workflow-${workflow.id}`} title={title} className="rw-card">
            <WorkflowForm
              draft={draft}
              choices={choices}
              knownRoles={knownRoles}
              others={summaries}
              canEdit={canEdit}
              busy={busyId === workflow.id}
              error={errors[String(workflow.id)] ?? null}
              saveLabel="Save workflow"
              onChange={(next) => setDrafts((prev) => ({ ...prev, [workflow.id]: next }))}
              onSave={() => void save(workflow.id)}
              onCancel={
                drafts[workflow.id]
                  ? () => {
                      setDrafts((prev) => {
                        const next = { ...prev }
                        delete next[workflow.id]
                        return next
                      })
                      setError(String(workflow.id), null)
                    }
                  : undefined
              }
              onDelete={() => void remove(workflow.id)}
              confirmDelete={confirmingDelete === workflow.id}
            />
          </CollapsibleCard>
        )
      })}
    </div>
  )
}
