import { hashDraftToken, isDraftExpired } from './drafts'

/**
 * The database side of save and continue. Only the `form-drafts` collection is touched, always with
 * overrideAccess (the collection refuses public writes on purpose; the request handler has already
 * checked the form, the origin, the rate limit and the email).
 *
 * A person has one live draft per form: saving again replaces the old link. Expired drafts for the
 * form are swept at the same time, so the table does not grow without limit.
 */

const COLLECTION = 'form-drafts'
const SWEEP_LIMIT = 500

export type DraftRow = { id: number | string; tokenHash?: string; email?: string; dataJson?: string; page?: number; expiresAt?: string }

export type DraftEngine = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
  create: (args: Record<string, unknown>) => Promise<unknown>
  delete: (args: Record<string, unknown>) => Promise<unknown>
}

const asRow = (doc: Record<string, unknown>): DraftRow => ({
  id: doc.id as number,
  tokenHash: doc.tokenHash as string | undefined,
  email: doc.email as string | undefined,
  dataJson: doc.dataJson as string | undefined,
  page: doc.page as number | undefined,
  expiresAt: doc.expiresAt as string | undefined,
})

/** The live draft a token points at, for this form only. Null when there is none. */
export async function findDraftByToken(engine: DraftEngine, formID: string | number, token: string): Promise<DraftRow | null> {
  const tokenHash = await hashDraftToken(token)
  const { docs } = await engine.find({
    collection: COLLECTION,
    where: { and: [{ tokenHash: { equals: tokenHash } }, { form: { equals: formID } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ? asRow(docs[0]) : null
}

/** Stores a fresh draft for this person and form, and removes their earlier drafts for it. */
export async function replaceDraft(
  engine: DraftEngine,
  input: { formID: string | number; email: string; tokenHash: string; dataJson: string; page: number; expiresAt: string; now: Date },
): Promise<void> {
  const { docs } = await engine.find({
    collection: COLLECTION,
    where: { form: { equals: input.formID } },
    limit: SWEEP_LIMIT,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of docs) {
    const row = asRow(doc)
    if (row.email === input.email || isDraftExpired(row.expiresAt, input.now)) {
      await engine.delete({ collection: COLLECTION, id: row.id, overrideAccess: true })
    }
  }
  await engine.create({
    collection: COLLECTION,
    data: {
      form: input.formID,
      tokenHash: input.tokenHash,
      email: input.email,
      dataJson: input.dataJson,
      page: input.page,
      expiresAt: input.expiresAt,
    },
    overrideAccess: true,
  })
}

/** Removes the draft a finished submission came from. Called after the entry is stored. */
export async function discardDraftByToken(engine: DraftEngine, formID: string | number, token: string): Promise<void> {
  const row = await findDraftByToken(engine, formID, token)
  if (row) await engine.delete({ collection: COLLECTION, id: row.id, overrideAccess: true })
}
