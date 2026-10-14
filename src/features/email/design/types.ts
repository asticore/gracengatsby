/**
 * The building blocks of a designed email. A template's design is a list of these,
 * stored as JSON and rendered by render.ts (HTML) and renderText.ts (plain text).
 *
 * Text fields accept {{tag}} placeholders, filled in when the email is sent.
 * Text blocks also accept **bold** and [link text](https://...).
 */

export type EmailAlign = 'left' | 'center' | 'right'

export type HeadingBlock = { type: 'heading'; text: string; level: 1 | 2 | 3; align: EmailAlign }

export type TextBlock = { type: 'text'; text: string; align: EmailAlign }

export type ButtonBlock = {
  type: 'button'
  label: string
  url: string
  /** Optional hex colour for the button. Blank uses the brand accent. */
  color?: string
  align: EmailAlign
}

export type ImageBlock = {
  type: 'image'
  src: string
  alt: string
  /** Width in pixels, 1 to 600. */
  width: number
  /** Optional link to open when the image is clicked. */
  link?: string
  /** Where the image sits. Defaults to centre. */
  align?: EmailAlign
}

export type DividerBlock = { type: 'divider' }

export type SpacerBlock = {
  type: 'spacer'
  /** Height in pixels, 4 to 200. */
  height: number
}

/** Blocks allowed inside a column of a two-column row. */
export type ColumnBlock = TextBlock | ButtonBlock | ImageBlock

export type Columns2Block = {
  type: 'columns2'
  left: ColumnBlock[]
  right: ColumnBlock[]
}

export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'website'] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

export type SocialBlock = {
  type: 'social'
  links: { network: SocialNetwork; url: string }[]
}

export type FooterNoteBlock = { type: 'footerNote'; text: string }

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | Columns2Block
  | SocialBlock
  | FooterNoteBlock

export type EmailBlockType = EmailBlock['type']

export const EMAIL_BLOCK_TYPES: EmailBlockType[] = [
  'heading',
  'text',
  'button',
  'image',
  'divider',
  'spacer',
  'columns2',
  'social',
  'footerNote',
]

/** Limits enforced by validateEmailBlocks. */
export const EMAIL_LIMITS = {
  maxBlocks: 40,
  maxColumnBlocks: 10,
  maxHeading: 200,
  maxText: 5000,
  maxLabel: 80,
  maxAlt: 200,
  maxUrl: 2048,
  maxFooterNote: 500,
} as const
