import React from 'react'
import { RichText } from '@/engine/editor/react'

import { planAfterParagraphs, type ParagraphRule } from '../inject'
import { getAdsContext, getAdsPageState, MAX_AUTO_ADS_PER_PAGE } from '../server'
import { AdSlot } from './AdSlot'
import { DataViewBlock } from '@/features/dataViews/components/DataViewBlock'
import { hasViewShortcode, splitViewShortcodes } from '@/features/dataViews/shortcode'

/** Rich text with "after paragraph N" placements inserted. Identical to plain RichText when none apply. */
export const AdRichText = async ({ content }: { content: any }): Promise<React.ReactElement | null> => {
  const ctx = await getAdsContext()
  const state = getAdsPageState()
  const root = content?.root
  const nodes: unknown[] = Array.isArray(root?.children) ? root.children : []
  // A paragraph that is only a [data-view ...] or {{data-view:...}} shortcode becomes that table or chart.
  if (hasViewShortcode(nodes)) {
    return (
      <>
        {splitViewShortcodes(nodes).map((seg, i) =>
          seg.type === 'view' ? <DataViewBlock key={i} viewRef={seg.ref} /> : <AdRichText key={i} content={{ ...content, root: { ...root, children: seg.nodes } }} />,
        )}
      </>
    )
  }
  const rules: ParagraphRule[] = ctx.config && !state.noAds
    ? ctx.placements
        .filter((p) => p.enabled && p.mode === 'after-paragraph' && ctx.config!.units[p.unit] && (state.collection === 'posts' ? p.onPosts : state.collection === 'products' ? p.onProducts : p.onPages))
        .map((p) => ({ key: p.key, after: p.afterParagraph, repeatEvery: p.repeatEvery, max: p.repeatEvery > 0 ? p.maxPerPage : 1 }))
    : []
  if (!rules.length) return <RichText data={content} />
  const { segments, used } = planAfterParagraphs(nodes, rules, MAX_AUTO_ADS_PER_PAGE - state.inserted)
  state.inserted += used
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'ad' ? <AdSlot key={i} placement={seg.key} /> : <RichText key={i} data={{ ...content, root: { ...root, children: seg.nodes } }} />,
      )}
    </>
  )
}
