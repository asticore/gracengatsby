import type { Where } from '@/engine'

import { eq, sql } from 'drizzle-orm'

import { getDb } from '../connect'
import { faqs } from '../schema'
import { buildWhere } from '../where'

/** Payload's document shape for the `faqs` collection (src/collections/Faqs.ts). */
export type FaqDoc = {
  id: number
  question: string
  answer: unknown
  category?: string | null
  order?: number | null
  customFields?: Record<string, unknown> | null
  updatedAt: string
  createdAt: string
}

const columns = { id: faqs.id, question: faqs.question, category: faqs.category, order: faqs.order }

/** Row -> document. `answer` and `customFields` are JSON columns, stored as text. */
function toDoc(row: typeof faqs.$inferSelect): FaqDoc {
  return {
    id: row.id,
    question: row.question,
    answer: JSON.parse(row.answer) as unknown,
    category: row.category,
    order: row.order,
    customFields: row.customFields ? (JSON.parse(row.customFields) as Record<string, unknown>) : null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  }
}

export async function findFaqs(args: { where?: Where; limit?: number } = {}): Promise<FaqDoc[]> {
  const db = await getDb()
  const condition = buildWhere(columns, args.where)
  const rows = await db
    .select()
    .from(faqs)
    .where(condition)
    .orderBy(faqs.order)
    .limit(args.limit ?? 1000)
  return rows.map(toDoc)
}

export async function findFaqByID(id: number): Promise<FaqDoc | null> {
  const db = await getDb()
  const [row] = await db.select().from(faqs).where(eq(faqs.id, id)).limit(1)
  return row ? toDoc(row) : null
}

export async function countFaqs(args: { where?: Where } = {}): Promise<number> {
  const db = await getDb()
  const condition = buildWhere(columns, args.where)
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(faqs).where(condition)
  return row?.n ?? 0
}

export async function createFaq(data: {
  question: string
  answer: unknown
  category?: string | null
  order?: number | null
  customFields?: Record<string, unknown> | null
}): Promise<FaqDoc> {
  const db = await getDb()
  const now = new Date().toISOString()
  const [row] = await db
    .insert(faqs)
    .values({
      question: data.question,
      answer: JSON.stringify(data.answer),
      category: data.category ?? null,
      order: data.order ?? 0,
      customFields: data.customFields ? JSON.stringify(data.customFields) : null,
      updatedAt: now,
      createdAt: now,
    })
    .returning()
  return toDoc(row)
}

export async function updateFaq(
  id: number,
  data: Partial<{ question: string; answer: unknown; category: string | null; order: number | null; customFields: Record<string, unknown> | null }>,
): Promise<FaqDoc | null> {
  const db = await getDb()
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if ('question' in data) set.question = data.question
  if ('answer' in data) set.answer = JSON.stringify(data.answer)
  if ('category' in data) set.category = data.category
  if ('order' in data) set.order = data.order
  if ('customFields' in data) set.customFields = data.customFields ? JSON.stringify(data.customFields) : null

  const [row] = await db.update(faqs).set(set).where(eq(faqs.id, id)).returning()
  return row ? toDoc(row) : null
}

export async function deleteFaq(id: number): Promise<boolean> {
  const db = await getDb()
  const result = await db.delete(faqs).where(eq(faqs.id, id)).returning({ id: faqs.id })
  return result.length > 0
}
