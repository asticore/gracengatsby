import React from 'react'
import { RichText } from '@payloadcms/richtext-lexical/react'

import type { Page } from '@/engage-types'

type RichTextBlockData = Extract<NonNullable<Page['blocks']>[number], { blockType: 'richText' }>

export const RichTextBlock: React.FC<{ content: RichTextBlockData['content'] }> = ({ content }) => {
  if (!content) return null

  return (
    <section className="built-block built-block--richtext">
      <div className="page-shell built-block__inner">
        <RichText data={content} />
      </div>
    </section>
  )
}
