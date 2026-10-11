import React from 'react'
import { RichText } from '@/engine/editor/react'

import { planAfterParagraphs, type ParagraphRule } from '../inject'
import { getAdsContext, getAdsPageState, MAX_AUTO_ADS_PER_PAGE } from '../server'
import { AdSlot } from './AdSlot'

/** Rich text with "after paragraph N" placements inserted. Identical to plain RichText when none apply. */
export const AdRichText = async ({ content }: { content: any }): Promise<React.ReactElement | null> => {
  const ctx = await getAdsContext()
  const state = getAdsPageState()
  const root = content?.root
  const nodes: unknown[] = Array.isArray(root?.children) ? root.children : []
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
