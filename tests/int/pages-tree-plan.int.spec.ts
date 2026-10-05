import { describe, it, expect } from 'vitest'
import {
  MAX_DEPTH,
  pagePath,
  buildTree,
  planMoves,
  type TreePage,
  type MoveInput
} from '@/features/pagesTree'

describe('pagesTree', () => {
  describe('pagePath', () => {
    it('returns / for homepage', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Home',
          slug: 'home',
          parent: null,
          sortOrder: 0,
          isHomepage: true,
          status: 'published'
        }
      ]
      expect(pagePath(pages, 1)).toBe('/')
    })

    it('returns /slug for root non-homepage page', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'About',
          slug: 'about',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      expect(pagePath(pages, 1)).toBe('/about')
    })

    it('returns /a/b for nested pages', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'About',
          slug: 'about',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Team',
          slug: 'team',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      expect(pagePath(pages, 2)).toBe('/about/team')
    })

    it('returns path for 8-deep chain', () => {
      const pages: TreePage[] = [
        { id: 1, title: 'L1', slug: 'l1', parent: null, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 2, title: 'L2', slug: 'l2', parent: 1, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 3, title: 'L3', slug: 'l3', parent: 2, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 4, title: 'L4', slug: 'l4', parent: 3, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 5, title: 'L5', slug: 'l5', parent: 4, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 6, title: 'L6', slug: 'l6', parent: 5, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 7, title: 'L7', slug: 'l7', parent: 6, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 8, title: 'L8', slug: 'l8', parent: 7, sortOrder: 0, isHomepage: false, status: 'published' }
      ]
      expect(pagePath(pages, 8)).toBe('/l1/l2/l3/l4/l5/l6/l7/l8')
    })

    it('returns null for unknown page', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Home',
          slug: 'home',
          parent: null,
          sortOrder: 0,
          isHomepage: true,
          status: 'published'
        }
      ]
      expect(pagePath(pages, 999)).toBeNull()
    })

    it('returns null when parent chain is broken', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Page1',
          slug: 'page1',
          parent: 999,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      expect(pagePath(pages, 1)).toBeNull()
    })

    it('returns null for cyclic chain', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Page1',
          slug: 'page1',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Page2',
          slug: 'page2',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      expect(pagePath(pages, 1)).toBeNull()
    })
  })

  describe('buildTree', () => {
    it('returns single homepage', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Home',
          slug: 'home',
          parent: null,
          sortOrder: 0,
          isHomepage: true,
          status: 'published'
        }
      ]
      const tree = buildTree(pages)
      expect(tree).toHaveLength(1)
      expect(tree[0].page.id).toBe(1)
      expect(tree[0].depth).toBe(1)
      expect(tree[0].children).toHaveLength(0)
    })

    it('sorts children by sortOrder asc', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Second',
          slug: 'second',
          parent: 1,
          sortOrder: 2,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'First',
          slug: 'first',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const tree = buildTree(pages)
      expect(tree[0].children[0].page.id).toBe(3) // sortOrder 1
      expect(tree[0].children[1].page.id).toBe(2) // sortOrder 2
    })

    it('sorts by title (case-insensitive) when sortOrder is same', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Zebra',
          slug: 'zebra',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'apple',
          slug: 'apple',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const tree = buildTree(pages)
      expect(tree[0].children[0].page.id).toBe(3) // apple < Zebra
      expect(tree[0].children[1].page.id).toBe(2)
    })

    it('sorts by id when sortOrder and title are same', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Same',
          slug: 'slug1',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Same',
          slug: 'slug2',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const tree = buildTree(pages)
      expect(tree[0].children[0].page.id).toBe(2) // id 2 < 3
      expect(tree[0].children[1].page.id).toBe(3)
    })

    it('handles orphans (missing parent) as roots', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Orphan',
          slug: 'orphan',
          parent: 999,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const tree = buildTree(pages)
      expect(tree).toHaveLength(2)
      expect(tree.some(n => n.page.id === 1)).toBe(true)
      expect(tree.some(n => n.page.id === 2)).toBe(true)
    })

    it('is cycle-safe', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Page1',
          slug: 'page1',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Page2',
          slug: 'page2',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      // Should not infinite loop
      const tree = buildTree(pages)
      expect(tree).toBeDefined()
      expect(tree.length).toBeGreaterThanOrEqual(0)
    })

    it('sets correct depth values', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child',
          slug: 'child',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Grandchild',
          slug: 'grandchild',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const tree = buildTree(pages)
      expect(tree[0].depth).toBe(1)
      expect(tree[0].children[0].depth).toBe(2)
      expect(tree[0].children[0].children[0].depth).toBe(3)
    })
  })

  describe('planMoves', () => {
    it('returns empty moves for no-op', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child',
          slug: 'child',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 2, parent: 1, sortOrder: 0 } // No change
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.changedCount).toBe(0)
        expect(result.moves).toHaveLength(0)
      }
    })

    it('drops no-ops but processes other moves', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child1',
          slug: 'child1',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Child2',
          slug: 'child2',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 2, parent: 1, sortOrder: 0 }, // No-op
        { id: 3, parent: 1, sortOrder: 0 } // Change
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.changedCount).toBe(1)
        expect(result.moves).toHaveLength(1)
        expect(result.moves[0].id).toBe(3)
      }
    })

    it('de-duplicates moves by id (last wins)', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child',
          slug: 'child',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 2, parent: 1, sortOrder: 1 },
        { id: 2, parent: 1, sortOrder: 2 } // Last wins
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.moves).toHaveLength(1)
        expect(result.moves[0].newSortOrder).toBe(2)
      }
    })

    it('reorders siblings without changing paths', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child1',
          slug: 'child1',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Child2',
          slug: 'child2',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 3, parent: 1, sortOrder: 0 },
        { id: 2, parent: 1, sortOrder: 1 }
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.moves).toHaveLength(2)
        // moves[0] is id 3 (child2)
        expect(result.moves[0].id).toBe(3)
        expect(result.moves[0].pathChanged).toBe(false)
        expect(result.moves[0].oldPath).toBe('/root/child2')
        expect(result.moves[0].newPath).toBe('/root/child2')
        // moves[1] is id 2 (child1)
        expect(result.moves[1].id).toBe(2)
        expect(result.moves[1].pathChanged).toBe(false)
        expect(result.moves[1].oldPath).toBe('/root/child1')
        expect(result.moves[1].newPath).toBe('/root/child1')
      }
    })

    it('re-parents with descendants and updates their paths', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Parent1',
          slug: 'parent1',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Child',
          slug: 'child',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 4,
          title: 'Parent2',
          slug: 'parent2',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 2, parent: 4, sortOrder: 0 } // Move to Parent2
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        const move = result.moves[0]
        expect(move.oldPath).toBe('/root/parent1')
        expect(move.newPath).toBe('/root/parent2/parent1')
        expect(move.pathChanged).toBe(true)
        expect(move.descendants).toHaveLength(1)
        expect(move.descendants[0].id).toBe(3)
        expect(move.descendants[0].oldPath).toBe('/root/parent1/child')
        expect(move.descendants[0].newPath).toBe('/root/parent2/parent1/child')
      }
    })

    it('reports unknown page id', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 999, parent: 1, sortOrder: 0 }])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('Unknown page ID'))).toBe(true)
      }
    })

    it('reports unknown parent id', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 1, parent: 999, sortOrder: 0 }])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('Unknown parent ID'))).toBe(true)
      }
    })

    it('rejects cycle into self', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 1, parent: 1, sortOrder: 0 }])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('cannot be dropped into itself'))).toBe(true)
      }
    })

    it('rejects cycle into descendant', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child',
          slug: 'child',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Grandchild',
          slug: 'grandchild',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 1, parent: 3, sortOrder: 0 }])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('descendant'))).toBe(true)
      }
    })

    it('rejects depth > 8', () => {
      const pages: TreePage[] = [
        { id: 1, title: 'L1', slug: 'l1', parent: null, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 2, title: 'L2', slug: 'l2', parent: 1, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 3, title: 'L3', slug: 'l3', parent: 2, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 4, title: 'L4', slug: 'l4', parent: 3, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 5, title: 'L5', slug: 'l5', parent: 4, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 6, title: 'L6', slug: 'l6', parent: 5, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 7, title: 'L7', slug: 'l7', parent: 6, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 8, title: 'L8', slug: 'l8', parent: 7, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 9, title: 'L9', slug: 'l9', parent: null, sortOrder: 1, isHomepage: false, status: 'published' }
      ]
      const result = planMoves(pages, [{ id: 9, parent: 8, sortOrder: 0 }])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('exceed'))).toBe(true)
      }
    })

    it('accepts depth = 8', () => {
      const pages: TreePage[] = [
        { id: 1, title: 'L1', slug: 'l1', parent: null, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 2, title: 'L2', slug: 'l2', parent: 1, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 3, title: 'L3', slug: 'l3', parent: 2, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 4, title: 'L4', slug: 'l4', parent: 3, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 5, title: 'L5', slug: 'l5', parent: 4, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 6, title: 'L6', slug: 'l6', parent: 5, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 7, title: 'L7', slug: 'l7', parent: 6, sortOrder: 0, isHomepage: false, status: 'published' },
        { id: 8, title: 'L8', slug: 'l8', parent: null, sortOrder: 1, isHomepage: false, status: 'published' }
      ]
      const result = planMoves(pages, [{ id: 8, parent: 7, sortOrder: 0 }])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.moves).toHaveLength(1)
      }
    })

    it('rejects homepage with parent', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Home',
          slug: 'home',
          parent: null,
          sortOrder: 0,
          isHomepage: true,
          status: 'published'
        },
        {
          id: 2,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 1, parent: 2, sortOrder: 0 }])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('homepage must stay at the top level'))).toBe(true)
      }
    })

    it('reports slug clash after move (both pages in clash)', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Parent1',
          slug: 'parent1',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Parent2',
          slug: 'parent2',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 4,
          title: 'Clash1',
          slug: 'clash',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 5,
          title: 'Clash2',
          slug: 'clash',
          parent: 3,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 5, parent: 2, sortOrder: 0 } // Move to Parent1, creating clash
      ])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.some(e => e.message.includes('Slug clash'))).toBe(true)
        expect(result.errors.some(e => e.message.includes('Clash1') && e.message.includes('Clash2'))).toBe(true)
      }
    })

    it('does not block unrelated move for slug clash elsewhere', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Parent1',
          slug: 'parent1',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Parent2',
          slug: 'parent2',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 4,
          title: 'Clash1',
          slug: 'clash',
          parent: 1,
          sortOrder: 2,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 5,
          title: 'Clash2',
          slug: 'clash',
          parent: 1,
          sortOrder: 3,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 6,
          title: 'UnrelatedChild',
          slug: 'unrelated',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      // Pre-existing clash at root between 4 and 5, but we're moving 6 (unrelated)
      const result = planMoves(pages, [{ id: 6, parent: 3, sortOrder: 0 }])
      expect(result.ok).toBe(true)
      if (result.ok === true) {
        expect(result.moves).toHaveLength(1)
      }
    })

    it('moves to root', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Child',
          slug: 'child',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 2, parent: null, sortOrder: 1 }])
      expect(result.ok).toBe(true)
      if (result.ok) {
        const move = result.moves[0]
        expect(move.newParent).toBeNull()
        expect(move.oldPath).toBe('/root/child')
        expect(move.newPath).toBe('/child')
      }
    })

    it('maintains move order in result', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'A',
          slug: 'a',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'B',
          slug: 'b',
          parent: 1,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 3, parent: 1, sortOrder: 0 },
        { id: 2, parent: 1, sortOrder: 1 }
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.moves[0].id).toBe(3)
        expect(result.moves[1].id).toBe(2)
      }
    })

    it('returns multiple errors together', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Home',
          slug: 'home',
          parent: null,
          sortOrder: 0,
          isHomepage: true,
          status: 'published'
        },
        {
          id: 2,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 1,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [
        { id: 1, parent: 2, sortOrder: 0 }, // Homepage with parent
        { id: 999, parent: 1, sortOrder: 0 } // Unknown page
      ])
      expect(result.ok).toBe(false)
      if (result.ok === false) {
        expect(result.errors.length).toBeGreaterThanOrEqual(2)
      }
    })

    it('counts descendants including all levels', () => {
      const pages: TreePage[] = [
        {
          id: 1,
          title: 'Root',
          slug: 'root',
          parent: null,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 2,
          title: 'Parent',
          slug: 'parent',
          parent: 1,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 3,
          title: 'Child',
          slug: 'child',
          parent: 2,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        },
        {
          id: 4,
          title: 'Grandchild',
          slug: 'grandchild',
          parent: 3,
          sortOrder: 0,
          isHomepage: false,
          status: 'published'
        }
      ]
      const result = planMoves(pages, [{ id: 2, parent: 1, sortOrder: 1 }])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.moves[0].descendantCount).toBe(2) // child and grandchild
      }
    })
  })
})
