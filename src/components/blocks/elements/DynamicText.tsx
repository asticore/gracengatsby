import React from 'react'

import { getEngine } from '@/lib/engine'
import { getBlockContext } from '@/lib/blockContext'
import { resolveTags } from '@/lib/dynamicTags'
import type { DateFormat, TagContext } from '@/lib/dynamicTags'

const TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'])

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** Pure view: resolves the template against a ready context. */
export function DynamicTextView({ props, ctx }: { props: Record<string, unknown>; ctx: TagContext }): React.ReactElement {
  const tag = typeof props.tag === 'string' && TAGS.has(props.tag) ? props.tag : 'p'
  const dateFormat: DateFormat = props.format === 'short' ? 'short' : 'long'
  const html = resolveTags(props.template, { ...ctx, dateFormat })
  return React.createElement(tag, { className: 'dynamic-text', dangerouslySetInnerHTML: { __html: html } })
}

/**
 * Async server component. Page context arrives as optional props the page passes down: `post`, `page`, `product`
 * ({title, date, excerpt, author, price}) or a single `ctx` object holding them. site.* is read from the
 * site-settings global; any failure leaves it empty (site.year is always the current year).
 */
export async function DynamicTextElement(props: Record<string, unknown>): Promise<React.ReactElement> {
  const base = obj(props.ctx)
  const fallback = getBlockContext()
  const ctx: TagContext = {
    post: obj(props.post ?? base.post ?? fallback.post),
    page: obj(props.page ?? base.page ?? fallback.page),
    product: obj(props.product ?? base.product ?? fallback.product),
    event: obj(props.event ?? base.event ?? fallback.event),
    site: {},
  }
  try {
    const engine = (await getEngine()) as unknown as { findGlobal: (a: unknown) => Promise<Record<string, unknown> | null> }
    const s = await engine.findGlobal({ slug: 'site-settings', depth: 0 })
    const name: unknown = s?.siteName
    ctx.site = { name: typeof name === 'string' ? name : '' }
  } catch {
    // site.name stays empty
  }
  return <DynamicTextView props={props} ctx={ctx} />
}

export const WAVE60_COMPONENTS: Record<string, (props: Record<string, unknown>) => Promise<React.ReactElement>> = {
  'dynamic-text': DynamicTextElement,
}
