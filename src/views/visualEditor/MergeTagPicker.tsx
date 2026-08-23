'use client'

import React, { useEffect, useState } from 'react'

import { MERGE_TAG_LIBRARY } from '@/lib/mergeTags'
import { fetchFieldGroups, type FieldGroupDoc } from '@/fields/customFields/types'

/**
 * Dropdown that inserts a merge tag into a text field.
 *
 * Shown next to any field marked `supportsMergeTags`, and most useful when
 * editing a Page Template that a Loop block renders per item. Custom fields
 * defined via Field Groups are listed alongside the built-in tags, so a field
 * someone added in the portal is immediately usable in a template.
 */
export const MergeTagPicker: React.FC<{ onInsert: (tag: string) => void }> = ({ onInsert }) => {
  const [open, setOpen] = useState(false)
  const [customGroups, setCustomGroups] = useState<FieldGroupDoc[]>([])

  useEffect(() => {
    if (!open || customGroups.length > 0) return
    // Any group counts here - a template can be looped over any collection, so
    // every defined custom field is a potentially valid tag.
    fetch('/api/field-groups?limit=100&depth=0', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { docs: [] as FieldGroupDoc[] }))
      .then((json: { docs?: FieldGroupDoc[] }) => setCustomGroups(json.docs || []))
      .catch(() => setCustomGroups([]))
  }, [open, customGroups.length])

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

            {customGroups.length > 0 && (
              <div className="ve-tagpicker__group">
                <h5>Custom fields</h5>
                {customGroups.flatMap((group) =>
                  (group.fields || []).map((field) => (
                    <button
                      key={`${group.id}-${field.name}`}
                      type="button"
                      className="ve-tagpicker__item"
                      onClick={() => insert(`{{field:${field.name}}}`)}
                    >
                      <code>{`{{field:${field.name}}}`}</code>
                      <span>{field.label}</span>
                    </button>
                  )),
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export { fetchFieldGroups }
