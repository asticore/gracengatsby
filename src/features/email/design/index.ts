/**
 * The email designer's engine: pure functions that turn a list of blocks and a
 * brand into HTML and plain text. No I/O here; storage lives in the email
 * templates and brand globals, and the admin page imports from this file.
 */

export { type EmailBlock, type EmailBlockType, type EmailAlign, type ColumnBlock, type SocialNetwork, EMAIL_BLOCK_TYPES, EMAIL_LIMITS, SOCIAL_NETWORKS } from './types'
export { type EmailBrand, type EmailFontKey, DEFAULT_EMAIL_BRAND, EMAIL_FONT_OPTIONS, brandFrom, cleanColor, fontCss, isHexColor } from './brand'
export { renderEmailHtml, type RenderEmailOptions } from './render'
export { renderEmailText } from './renderText'
export { validateEmailBlocks, type EmailBlocksResult } from './validate'
export { lintEmail, type EmailLintWarning, type LintOptions } from './lint'
