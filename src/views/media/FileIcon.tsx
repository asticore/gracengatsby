import { FILE_KIND_LABELS, fileKindOf, type FileKind } from '@/features/media/fileTypes'

const ACCENT: Record<FileKind, string> = {
  image: '#6b7280',
  pdf: '#c0392b',
  document: '#2b6cb0',
  spreadsheet: '#2f855a',
  presentation: '#c05621',
  text: '#6b7280',
  archive: '#805ad5',
  audio: '#d53f8c',
  video: '#0987a0',
  other: '#6b7280',
}

/** Where the badge reads best: the extension when there is one, else the kind. */
function badgeText(kind: FileKind, filename?: string): string {
  const dot = filename?.lastIndexOf('.') ?? -1
  if (filename && dot >= 0 && filename.length - dot <= 6) return filename.slice(dot + 1).toUpperCase()
  return FILE_KIND_LABELS[kind].toUpperCase().slice(0, 4)
}

/**
 * A page-with-folded-corner icon for a file that has no thumbnail, tinted by
 * kind and labelled with its extension. Decorative: the file name next to it is
 * the accessible label.
 */
export function FileIcon({ mimeType, filename, size = 56 }: { mimeType?: string | null; filename?: string | null; size?: number }) {
  const kind = fileKindOf(mimeType)
  const color = ACCENT[kind]
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 48 60" role="img" aria-label={FILE_KIND_LABELS[kind]} className="shrink-0">
      <path d="M6 2h26l10 10v44a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="var(--theme-elevation-0, #fff)" stroke={color} strokeWidth="2" />
      <path d="M32 2v10h10" fill="none" stroke={color} strokeWidth="2" />
      <rect x="8" y="34" width="32" height="14" rx="2" fill={color} />
      <text x="24" y="44.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
        {badgeText(kind, filename ?? undefined)}
      </text>
    </svg>
  )
}
