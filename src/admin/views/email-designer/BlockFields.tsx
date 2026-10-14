'use client'

import React from 'react'
import type { ColumnBlock, EmailAlign, EmailBlock, SocialNetwork } from '@/features/email/design/types'
import { ALIGN_OPTIONS, SOCIAL_OPTIONS } from './designerModel'
import { LongTextField, NumberField, SelectField, TextField } from './fieldControls'

type Props = {
  block: EmailBlock | ColumnBlock
  onChange: (next: EmailBlock | ColumnBlock) => void
}

const ALIGN = ALIGN_OPTIONS.map((option) => ({ value: option.value as EmailAlign, label: option.label }))
const LEVELS = [
  { value: '1', label: 'Large' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'Small' },
] as const

/** The fields for one block. Every change is passed up whole, so the parent keeps the only copy. */
export function BlockFields({ block, onChange }: Props) {
  switch (block.type) {
    case 'heading':
      return (
        <>
          <TextField label="Heading text" value={block.text} maxLength={200} onChange={(text) => onChange({ ...block, text })} />
          <SelectField
            label="Size"
            value={String(block.level) as '1'}
            options={LEVELS}
            hint="Large is the biggest line."
            onChange={(value) => onChange({ ...block, level: Number(value) as 1 | 2 | 3 })}
          />
          <SelectField label="Alignment" value={block.align} options={ALIGN} onChange={(align) => onChange({ ...block, align })} />
        </>
      )
    case 'text':
      return (
        <>
          <LongTextField
            label="Text"
            value={block.text}
            maxLength={5000}
            hint="A blank line starts a new paragraph. Use **bold** and [link text](https://...). Tags such as {{link}} are filled in when the email is sent."
            onChange={(text) => onChange({ ...block, text })}
          />
          <SelectField label="Alignment" value={block.align} options={ALIGN} onChange={(align) => onChange({ ...block, align })} />
        </>
      )
    case 'button':
      return (
        <>
          <TextField label="Button label" value={block.label} maxLength={80} onChange={(label) => onChange({ ...block, label })} />
          <TextField
            label="Web address the button opens"
            value={block.url}
            maxLength={2048}
            placeholder="https://"
            hint="Starts with https:// or mailto:. Tags such as {{link}} can be used."
            onChange={(url) => onChange({ ...block, url })}
          />
          <TextField
            label="Button colour (optional)"
            value={block.color ?? ''}
            maxLength={7}
            placeholder="Blank uses your accent colour"
            onChange={(color) => onChange({ ...block, color: color || undefined })}
          />
          <SelectField label="Alignment" value={block.align} options={ALIGN} onChange={(align) => onChange({ ...block, align })} />
        </>
      )
    case 'image':
      return (
        <>
          <TextField
            label="Picture web address"
            value={block.src}
            maxLength={2048}
            placeholder="https://"
            hint="Use an address that starts with https://. Upload the picture to Media first, then copy its address."
            onChange={(src) => onChange({ ...block, src })}
          />
          <TextField
            label="Description for screen readers"
            value={block.alt}
            maxLength={200}
            hint="What the picture shows. Leave it blank only for pure decoration."
            onChange={(alt) => onChange({ ...block, alt })}
          />
          <NumberField label="Width" value={block.width} min={1} max={600} title="Width in pixels, 1 to 600" hint="Pixels, 1 to 600." onChange={(width) => onChange({ ...block, width })} />
          <TextField label="Link when clicked (optional)" value={block.link ?? ''} maxLength={2048} onChange={(link) => onChange({ ...block, link: link || undefined })} />
        </>
      )
    case 'divider':
      return <p className="ed-muted">A thin line. It has no settings.</p>
    case 'spacer':
      return <NumberField label="Height" value={block.height} min={4} max={200} title="Height in pixels, 4 to 200" hint="Pixels, 4 to 200." onChange={(height) => onChange({ ...block, height })} />
    case 'social':
      return <SocialFields links={block.links} onChange={(links) => onChange({ ...block, links })} />
    case 'footerNote':
      return <LongTextField label="Small print" value={block.text} maxLength={500} onChange={(text) => onChange({ ...block, text })} />
    case 'columns2':
      return <p className="ed-muted">Edit the two columns below.</p>
  }
}

function SocialFields({ links, onChange }: { links: { network: SocialNetwork; url: string }[]; onChange: (links: { network: SocialNetwork; url: string }[]) => void }) {
  return (
    <>
      {links.map((link, index) => (
        <div className="ed-row" key={index}>
          <SelectField
            label={`Network ${index + 1}`}
            value={link.network}
            options={SOCIAL_OPTIONS}
            onChange={(network) => onChange(links.map((item, i) => (i === index ? { ...item, network } : item)))}
          />
          <TextField
            label="Address"
            value={link.url}
            maxLength={2048}
            onChange={(url) => onChange(links.map((item, i) => (i === index ? { ...item, url } : item)))}
          />
          <button type="button" className="ed-button ed-button--quiet" onClick={() => onChange(links.filter((_item, i) => i !== index))}>
            Remove link
          </button>
        </div>
      ))}
      {links.length < 8 && (
        <button type="button" className="ed-button ed-button--quiet" onClick={() => onChange([...links, { network: 'website', url: 'https://example.com' }])}>
          Add a link
        </button>
      )}
    </>
  )
}
