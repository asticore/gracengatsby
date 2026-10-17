'use client'

import React, { useCallback, useState } from 'react'

export interface NavigatorItem {
  id: string
  name: string
  status?: 'draft' | 'published'
  locked?: boolean
  scheduled?: boolean
  isCollection?: boolean
}

export interface NavigatorCollection {
  slug: string
  label: string
  items: NavigatorItem[]
  isExpanded?: boolean
}

interface NavigatorPanelProps {
  collections: NavigatorCollection[]
  onSelectItem?: (item: NavigatorItem, collectionSlug: string) => void
  onRenameItem?: (itemId: string, collectionSlug: string, newName: string) => void
  onReorderItem?: (itemId: string, collectionSlug: string, newIndex: number) => void
  selectedItemId?: string
  expandedState?: Record<string, boolean>
  onExpandedStateChange?: (state: Record<string, boolean>) => void
}

const getStatusIcon = (status?: string, locked?: boolean, scheduled?: boolean): string => {
  if (locked) return '🔒'
  if (scheduled) return '⏲️'
  if (status === 'draft') return '📝'
  if (status === 'published') return '✓'
  return ''
}

const NavigatorItem: React.FC<{
  item: NavigatorItem
  collectionSlug: string
  isSelected?: boolean
  onSelect?: (item: NavigatorItem, collectionSlug: string) => void
  onRename?: (itemId: string, collectionSlug: string, newName: string) => void
  onReorder?: (itemId: string, collectionSlug: string, newIndex: number) => void
}> = ({ item, collectionSlug, isSelected, onSelect, onRename, onReorder }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => setIsEditing(true)

  const handleSave = () => {
    if (editName.trim() && editName !== item.name && onRename) {
      onRename(item.id, collectionSlug, editName.trim())
    }
    setIsEditing(false)
    setEditName(item.name)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditName(item.name)
    }
  }

  const handleBlur = () => {
    handleSave()
  }

  const statusIcon = getStatusIcon(item.status, item.locked, item.scheduled)

  return (
    <div
      className={`ve-nav__item ${isSelected ? 've-nav__item--selected' : ''}`}
      onClick={() => onSelect?.(item, collectionSlug)}
    >
      <span className="ve-nav__item-icon">{statusIcon}</span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="ve-nav__item-input"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="ve-nav__item-label" onDoubleClick={handleDoubleClick} title={item.name}>
          {item.name}
        </span>
      )}
    </div>
  )
}

const NavigatorCollection: React.FC<{
  collection: NavigatorCollection
  isExpanded?: boolean
  onToggleExpand?: (slug: string) => void
  selectedItemId?: string
  onSelectItem?: (item: NavigatorItem, collectionSlug: string) => void
  onRenameItem?: (itemId: string, collectionSlug: string, newName: string) => void
  onReorderItem?: (itemId: string, collectionSlug: string, newIndex: number) => void
}> = ({ collection, isExpanded, onToggleExpand, selectedItemId, onSelectItem, onRenameItem, onReorderItem }) => {
  return (
    <div className="ve-nav__group">
      <button
        type="button"
        className="ve-nav__group-header"
        onClick={() => onToggleExpand?.(collection.slug)}
        aria-expanded={isExpanded}
      >
        <span className="ve-nav__group-toggle">{isExpanded ? '▼' : '▶'}</span>
        <span className="ve-nav__group-label">{collection.label}</span>
        <span className="ve-nav__group-count">{collection.items.length}</span>
      </button>
      {isExpanded && (
        <div className="ve-nav__group-items">
          {collection.items.map((item) => (
            <NavigatorItem
              key={item.id}
              item={item}
              collectionSlug={collection.slug}
              isSelected={item.id === selectedItemId}
              onSelect={onSelectItem}
              onRename={onRenameItem}
              onReorder={onReorderItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const NavigatorPanel: React.FC<NavigatorPanelProps> = ({
  collections,
  onSelectItem,
  onRenameItem,
  onReorderItem,
  selectedItemId,
  expandedState = {},
  onExpandedStateChange,
}) => {
  const [localExpandedState, setLocalExpandedState] = useState<Record<string, boolean>>(expandedState)

  const handleToggleExpand = useCallback((slug: string) => {
    const newState = { ...localExpandedState, [slug]: !localExpandedState[slug] }
    setLocalExpandedState(newState)
    onExpandedStateChange?.(newState)
  }, [localExpandedState, onExpandedStateChange])

  return (
    <div className="ve-nav">
      {collections.map((collection) => (
        <NavigatorCollection
          key={collection.slug}
          collection={collection}
          isExpanded={localExpandedState[collection.slug] !== false}
          onToggleExpand={handleToggleExpand}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          onRenameItem={onRenameItem}
          onReorderItem={onReorderItem}
        />
      ))}
    </div>
  )
}
