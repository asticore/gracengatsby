'use client'

import type { Field } from '@/engine'
import { useField } from '@/engine/ui'

import { CROP_RATIOS } from '../url'

type CropFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

const LABELS: Record<(typeof CROP_RATIOS)[number], string> = {
  free: 'Free (original shape)',
  '1:1': 'Square 1:1',
  '4:3': 'Landscape 4:3',
  '16:9': 'Widescreen 16:9',
}

/**
 * Picks the fixed shape a picture is shown in. Choosing a preset changes only
 * how the delivery address asks for the picture; the stored file is untouched.
 */
export function MediaCropField({ path, readOnly }: CropFieldProps) {
  const { value, setValue } = useField<{ ratio?: string | null } | null>({ path })
  const current = value?.ratio && value.ratio !== 'free' ? value.ratio : 'free'

  return (
    <div role="radiogroup" aria-label="Crop preset" className="flex flex-wrap gap-[8px]">
      {CROP_RATIOS.map((ratio) => {
        const active = current === ratio
        return (
          <button
            key={ratio}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={readOnly}
            onClick={() => setValue(ratio === 'free' ? null : { ratio })}
            className={`rounded-[4px] border px-[10px] py-[5px] text-[12px] ${
              active
                ? 'border-[var(--ac-gold)] text-[var(--ac-gold)]'
                : 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-700)] hover:border-[var(--theme-elevation-400)]'
            }`}
          >
            {LABELS[ratio]}
          </button>
        )
      })}
    </div>
  )
}
