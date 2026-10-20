import { precheck, type UploadRules } from '@/features/media/admin/uploadClient'

/** `harbour_sunset-2.jpg` becomes `harbour sunset 2`. Matches the server's drafted alt. */
export function filenameToAlt(name: string): string {
  return name
    .replace(/\.[^.]*$/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 125)
}

export type FileCheck = { accepted: File[]; rejected: { name: string; error: string }[] }

/** Splits files into those worth sending and those refused with a readable message (type list and size cap come from the server rules). */
export function validateFiles(files: File[], rules: UploadRules | null, single = false): FileCheck {
  const accepted: File[] = []
  const rejected: { name: string; error: string }[] = []
  for (const file of files) {
    const problem = precheck(file, rules)
    if (problem) rejected.push({ name: file.name, error: problem })
    else if (single && accepted.length >= 1) rejected.push({ name: file.name, error: 'Only one image can be chosen here.' })
    else accepted.push(file)
  }
  return { accepted, rejected }
}

/** Appends new ids to the current list, skipping any already present. */
export function appendMediaIds(current: number[], added: Array<number | string>): number[] {
  const next = [...current]
  for (const raw of added) {
    const id = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(id) && !next.includes(id)) next.push(id)
  }
  return next
}

/** Image files found on a paste event's clipboard; unnamed screenshots get a stamped name. */
export function filesFromClipboard(items: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }> | null | undefined): File[] {
  const out: File[] = []
  if (!items) return out
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (!file) continue
    if (file.name && file.name !== 'image.png') out.push(file)
    else {
      const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
      out.push(new File([file], `pasted-image-${out.length + 1}.${ext}`, { type: file.type }))
    }
  }
  return out
}
