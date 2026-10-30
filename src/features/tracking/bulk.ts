/*
 * Runs one save per item, one after another, so a long "Add all" does not race itself and every row can show its own
 * result. A save that returns an error message, or throws, counts as failed and does not stop the rest. Pure.
 */
export type BulkResult = { added: number; failed: number; errors: Array<{ index: number; message: string }> }

export async function addEach<T>(
  items: readonly T[],
  save: (item: T, index: number) => Promise<string | null>,
  onRow?: (index: number, outcome: 'ok' | 'error', message?: string) => void,
): Promise<BulkResult> {
  const result: BulkResult = { added: 0, failed: 0, errors: [] }
  for (let index = 0; index < items.length; index++) {
    let message: string | null
    try {
      message = await save(items[index] as T, index)
    } catch {
      message = 'The request failed.'
    }
    if (message) {
      result.failed += 1
      result.errors.push({ index, message })
      onRow?.(index, 'error', message)
    } else {
      result.added += 1
      onRow?.(index, 'ok')
    }
  }
  return result
}
