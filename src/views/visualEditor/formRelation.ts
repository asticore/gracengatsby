/**
 * Helpers for the `form` block's picker in the visual editor: create a blank form document from the
 * editor and find the editor path that designs its fields.
 *
 * A form stays a saved `forms` document, so its id, its public embed and its submit URL never change.
 * Creating one here is the only creation path left in the editor; the admin Forms list shows outputs.
 */

export type BlankFormResult = { ok: true; id: number | string } | { ok: false; error: string }

/**
 * POST /api/forms with an empty draft form. A draft is not shown on the site until someone publishes it
 * in the form's own editor, so creating one from a page never puts an empty form live.
 * Returns the new id only when the server confirms the create.
 */
export async function createBlankForm(title: string, fetchImpl: typeof fetch = fetch): Promise<BlankFormResult> {
  try {
    const res = await fetchImpl('/api/forms', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, layout: [], formStatus: 'draft' }),
    })
    if (!res.ok) return { ok: false, error: `The form could not be created (${res.status}).` }
    const json = (await res.json().catch((): null => null)) as { doc?: { id?: unknown } } | null
    const id = json?.doc?.id
    if (typeof id !== 'string' && typeof id !== 'number') return { ok: false, error: 'The form could not be created.' }
    return { ok: true, id }
  } catch {
    return { ok: false, error: 'The form could not be created. Check your connection and try again.' }
  }
}

/** The visual editor path (relative to the admin base) that designs a form's fields. */
export function formEditorPath(id: number | string): string {
  return `/visual-editor/collection/forms/${encodeURIComponent(String(id))}`
}
