import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { FormUsageLink } from '@/features/forms/pageUsageServer'

export type { FormUsageLink }

/** Wording for the usage card. `count` is already filled in (for example "2 pages use this form."). */
export type FormPagesStrings = {
  title: string
  none: string
  hint: string
  count: string
  edit: string
  view: string
}

/** Wording for the Forms list table. `none` is shown for a form no page uses. */
export type FormUsageTableStrings = Pick<FormPagesStrings, 'none' | 'edit' | 'view'> & {
  listTitle: string
  colForm: string
  colPages: string
}

/** One form's pages, on the admin Forms edit screen. */
export function FormPagesCard({ pages, strings }: { pages: FormUsageLink[]; strings: FormPagesStrings }) {
  return (
    <CollapsibleCard id="form-usage" title={strings.title} className="doc-group-card">
      <p className="doc-muted">{pages.length === 0 ? strings.none : strings.count}</p>
      <p className="doc-muted">{strings.hint}</p>
      {pages.length > 0 && (
        <ul>
          {pages.map((page) => (
            <li key={String(page.id)}>
              {page.title} <span className="doc-muted">({page.statusLabel})</span>{' '}
              <AdminLink href={page.editHref}>{strings.edit}</AdminLink>
              {page.liveHref && (
                <>
                  {' · '}
                  <a href={page.liveHref} rel="noopener">
                    {strings.view}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  )
}

/** The Forms list: every form with the pages that use it, above the table. */
export function FormUsageTable({ rows, strings }: { rows: Array<{ id: string; title: string; pages: FormUsageLink[] }>; strings: FormUsageTableStrings }) {
  if (rows.length === 0) return null
  return (
    <section className="lst-usage" aria-label={strings.listTitle} style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: '1rem' }}>{strings.listTitle}</h2>
      <table className="lst-table">
        <thead>
          <tr>
            <th scope="col">{strings.colForm}</th>
            <th scope="col">{strings.colPages}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.title}</td>
              <td>
                {row.pages.length === 0 ? (
                  <span className="doc-muted">{strings.none}</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {row.pages.map((page) => (
                      <li key={String(page.id)}>
                        <AdminLink href={page.editHref}>{page.title}</AdminLink> <span className="doc-muted">({page.statusLabel})</span>
                        {page.liveHref && (
                          <>
                            {' · '}
                            <a href={page.liveHref} rel="noopener">
                              {strings.view}
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
