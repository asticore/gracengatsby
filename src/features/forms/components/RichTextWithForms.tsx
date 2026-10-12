import React from 'react'

import { AdRichText } from '@/features/ads/components/AdRichText'

import { hasFormShortcode, splitFormShortcodes } from '../shortcode'
import { FormBlockRenderer } from './FormBlockRenderer'

/**
 * Rich text that also understands the `[form id="..."]` shortcode. Text with no
 * shortcode goes straight to the ordinary rich-text renderer, so pages without
 * one are unchanged.
 */
export const RichTextWithForms = async ({ content }: { content: any }): Promise<React.ReactElement | null> => {
  const root = content?.root
  const nodes: unknown[] = Array.isArray(root?.children) ? root.children : []
  if (!hasFormShortcode(nodes)) return <AdRichText content={content} />

  return (
    <>
      {splitFormShortcodes(nodes).map((segment, index) =>
        segment.type === 'form' ? (
          <FormBlockRenderer key={index} form={segment.id} showTitle={false} />
        ) : (
          <AdRichText key={index} content={{ ...content, root: { ...root, children: segment.nodes } }} />
        ),
      )}
    </>
  )
}
