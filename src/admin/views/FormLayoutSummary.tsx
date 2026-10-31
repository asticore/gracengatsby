import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { FormLayoutSummary as Summary } from '@/features/forms/layoutSummary'

export type FormLayoutSummaryProps = {
  summary: Summary
  /** Visual editor address of this form. */
  editHref: string
  strings: {
    title: string
    counts: string
    none: string
    readOnly: string
    unpublished: string
    listTitle: string
    button: string
  }
}

/**
 * Read-only card on the admin Forms edit screen. The fields, steps and layout are changed only in
 * the visual editor, so this shows what is there and a button to open it.
 */
export function FormLayoutSummary({ summary, editHref, strings }: FormLayoutSummaryProps) {
  return (
    <CollapsibleCard id="form-layout" title={strings.title} className="doc-group-card">
      <p className="doc-muted">{summary.inputs === 0 && summary.steps <= 1 ? strings.none : strings.counts}</p>
      <p className="doc-muted">{strings.readOnly}</p>
      {summary.unpublished && <p className="doc-muted">{strings.unpublished}</p>}
      {summary.items.length > 0 && (
        <>
          <p className="doc-muted">{strings.listTitle}</p>
          <ol>
            {summary.items.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ol>
        </>
      )}
      <p>
        <AdminLink className="btn btn--primary" href={editHref}>
          {strings.button}
        </AdminLink>
      </p>
    </CollapsibleCard>
  )
}
