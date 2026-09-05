import React from 'react'
import { RichText } from '@/engine/editor/react'

import type { Page } from '@/engage-types'

type RichTextBlockData = Extract<NonNullable<Page['blocks']>[number], { blockType: 'richText' }>

export const RichTextBlock: React.FC<{ content: RichTextBlockData['content'] }> = ({ content }) => {
  if (!content) return null

  return (
    <section className="built-block">
      <div className="mx-auto max-w-[760px] px-6 py-16">
        <RichText data={content} />
      </div>
    </section>
  )
}
