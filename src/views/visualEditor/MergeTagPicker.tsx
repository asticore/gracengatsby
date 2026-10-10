'use client'

import React, { useEffect, useState } from 'react'

import { MERGE_TAG_LIBRARY } from '@/lib/mergeTags'
import { fetchFieldGroups, type CustomFieldDef, type FieldGroupDoc } from '@/fields/customFields/types'

/**
 * Dropdown that inserts a merge tag into a text field.
 *
 * Shown next to any field marked `supportsMergeTags`. Custom fields are listed
 * from the Field Groups that apply to `collection` when it is given (eg when
 * editing a post), otherwise from every group (eg a Page Template, which a Loop
 * can render for any collection). Nested fields show their dotted tag too.
 */

const TYPE_HINT: Partial<Record<CustomFieldDef['type'], string>> = {
  link: 'link: url / title / target',
  map: 'map: address / lat / lng / zoom',
  gallery: 'gallery: .0, .1 = image URLs',
  repeater: 'repeater: .0.field',
  flexible: 'flexible: .0.layout / .0.field',
  group: 'group: .field',
  checkbox: 'checkbox: Yes / No',
}

function tagsFor(defs: CustomFieldDef[], prefix: string): { tag: string; label: string }[] {
  const out: { tag: string; label: string }[] = []
  for (const def of defs) {
    const key = `${prefix}${def.name}`
    out.push({ tag: `{{field:${key}}}`, label: def.label + (TYPE_HINT[def.type] ? ` (${TYPE_HINT[def.type]})` : '') })
    if (def.type === 'group') {
      for (const sub of def.subFields ?? []) out.push({ tag: `{{field:${key}.${sub.name}}}`, label: `${def.label} › ${sub.label}` })
    }
  }
  return out
}

export const MergeTagPicker: React.FC<{ onInsert: (tag: string) => void; collection?: string }> = ({ onInsert, collection }) => {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<FieldGroupDoc[] | null>(null)

  useEffect(() => {
    if (!open || groups !== null) return
    let cancelled = false
    fetchFieldGroups(collection ?? '').then(({ groups: docs }) => {
      if (!cancelled) setGroups(docs)
    })
    return () => {
      cancelled = true
    }
  }, [open, groups, collection])

  const insert = (tag: string) => {
    onInsert(tag)
    setOpen(false)
  }

  return (
    <div className="ve-tagpicker">
      <button
        type="button"
        className="ve-tagpicker__btn"
        onClick={() => setOpen(!open)}
        title="Insert a merge tag"
        aria-label="Insert a merge tag"
      >
        {'{ }'}
      </button>

      {open && (
        <>
          <div className="ve-tagpicker__scrim" onClick={() => setOpen(false)} role="presentation" />
          <div className="ve-tagpicker__menu">
            <p className="ve-tagpicker__hint">
              Inserts a placeholder that fills in per item when this is used inside a Loop.
            </p>

            {Object.entries(MERGE_TAG_LIBRARY).map(([group, tags]) => (
              <div className="ve-tagpicker__group" key={group}>
                <h5>{group === 'common' ? 'Any item' : group}</h5>
                {tags.map((entry) => (
                  <button key={entry.tag} type="button" className="ve-tagpicker__item" onClick={() => insert(entry.tag)}>
                    <code>{entry.tag}</code>
                    <span>{entry.label}</span>
                  </button>
                ))}
              </div>
            ))}

            {groups === null && <p className="ve-tagpicker__hint">Loading custom fields…</p>}
            {(groups ?? []).map((group) => {
              const tags = tagsFor(group.fields, '')
              if (tags.length === 0) return null
              return (
                <div className="ve-tagpicker__group" key={group.id}>
                  <h5>{group.name}</h5>
                  {tags.map((entry) => (
                    <button key={entry.tag} type="button" className="ve-tagpicker__item" onClick={() => insert(entry.tag)}>
                      <code>{entry.tag}</code>
                      <span>{entry.label}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
