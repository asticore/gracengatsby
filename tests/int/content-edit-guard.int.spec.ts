// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { applyContentOnlyEdit } from '@/features/roles/contentEditGuard'

describe('applyContentOnlyEdit', () => {
  const baseBlock = {
    id: 'block1',
    blockType: 'imageText',
    image: { id: '123', filename: 'image.jpg' },
    content: '<p>Some content</p>',
    imageSide: 'left',
    design: { backgroundColor: '#000' },
  }

  const baseBlocks = [baseBlock]

  it('allows any changes when canLayout is true', () => {
    const incoming = {
      blocks: [
        {
          id: 'block2', // different ID
          blockType: 'imageText',
          image: { id: '456', filename: 'other.jpg' },
          content: '<p>New content</p>',
          imageSide: 'right',
          design: { backgroundColor: '#fff' },
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.error).toBeUndefined()
    expect(result.data.blocks[0].id).toBe('block2')
  })

  it('rejects reordering when canLayout is false', () => {
    const incoming = {
      blocks: [
        { id: 'block2', blockType: 'section' } as any,
        { id: 'block1', blockType: 'imageText' } as any, // reordered
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks.concat([{ id: 'block2', blockType: 'section' } as any]),
      incoming,
      canStyle: true,
      canLayout: false,
      blocksField: 'blocks',
    })
    expect(result.error).toContain('add, remove or reorder')
  })

  it('rejects adding blocks when canLayout is false', () => {
    const incoming = {
      blocks: [
        baseBlock,
        { id: 'block2', blockType: 'section' } as any, // added
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: true,
      canLayout: false,
      blocksField: 'blocks',
    })
    expect(result.error).toContain('add, remove or reorder')
  })

  it('rejects removing blocks when canLayout is false', () => {
    const incoming: Record<string, any> = {
      blocks: [], // removed all
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks.concat([{ id: 'block2', blockType: 'section' } as any]),
      incoming,
      canStyle: true,
      canLayout: false,
      blocksField: 'blocks',
    })
    expect(result.error).toContain('add, remove or reorder')
  })

  it('restores design when canStyle is false', () => {
    const incoming = {
      blocks: [
        {
          ...baseBlock,
          design: { backgroundColor: '#fff' }, // changed
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.error).toBeUndefined()
    expect(result.data.blocks[0].design).toEqual({ backgroundColor: '#000' })
  })

  it('restores imageSide for imageText blocks when canStyle is false', () => {
    const incoming = {
      blocks: [
        {
          ...baseBlock,
          imageSide: 'right', // changed
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.data.blocks[0].imageSide).toBe('left')
  })

  it('restores style for ctaBanner blocks when canStyle is false', () => {
    const originalCta = {
      id: 'block1',
      blockType: 'ctaBanner',
      heading: 'Click me',
      style: 'dark',
      design: {},
    }
    const incoming = {
      blocks: [
        {
          id: 'block1',
          blockType: 'ctaBanner',
          heading: 'Click me',
          style: 'light', // changed
          design: {},
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: [originalCta],
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.data.blocks[0].style).toBe('dark')
  })

  it('restores columns for loop blocks when canStyle is false', () => {
    const originalLoop = {
      id: 'block1',
      blockType: 'loop',
      columns: 3,
      design: {},
    }
    const incoming = {
      blocks: [
        {
          id: 'block1',
          blockType: 'loop',
          columns: 2, // changed
          design: {},
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: [originalLoop],
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.data.blocks[0].columns).toBe(3)
  })

  it('keeps content changes when canStyle is false', () => {
    const incoming = {
      blocks: [
        {
          ...baseBlock,
          content: '<p>New content</p>', // content changed
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.data.blocks[0].content).toBe('<p>New content</p>')
  })

  it('handles blocks field with different name', () => {
    const incoming = {
      layout: [baseBlock],
    }
    const result = applyContentOnlyEdit({
      original: [baseBlock],
      incoming,
      canStyle: true,
      canLayout: true,
      blocksField: 'layout',
    })
    expect(result.error).toBeUndefined()
  })

  it('admin can edit both style and layout', () => {
    const incoming = {
      blocks: [
        {
          id: 'block2',
          blockType: 'imageText',
          design: { backgroundColor: '#fff' },
          imageSide: 'right',
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: true,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.error).toBeUndefined()
    expect(result.data.blocks[0].id).toBe('block2') // layout allowed
    expect(result.data.blocks[0].design.backgroundColor).toBe('#fff') // style allowed
  })

  it('returns data unchanged when incoming blocks is not an array', () => {
    const incoming = { blocks: 'not an array' }
    const result = applyContentOnlyEdit({
      original: baseBlocks,
      incoming,
      canStyle: false,
      canLayout: false,
      blocksField: 'blocks',
    })
    expect(result.error).toBeUndefined()
    expect(result.data).toEqual(incoming)
  })

  it('restores design for element blocks when canStyle is false', () => {
    const originalElement = {
      id: 'block1',
      blockType: 'element',
      tag: 'div',
      design: { color: '#000' },
    }
    const incoming = {
      blocks: [
        {
          id: 'block1',
          blockType: 'element',
          tag: 'div',
          design: { color: '#fff' }, // changed
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: [originalElement],
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.data.blocks[0].design).toEqual({ color: '#000' })
  })

  it('restores section columns layout when canStyle is false', () => {
    const originalSection = {
      id: 'block1',
      blockType: 'section',
      columns: {
        layout: '2',
        gap: '20px',
      },
      design: {},
    }
    const incoming = {
      blocks: [
        {
          id: 'block1',
          blockType: 'section',
          columns: {
            layout: '1', // changed
            gap: '10px',
          },
          design: {},
        },
      ],
    }
    const result = applyContentOnlyEdit({
      original: [originalSection],
      incoming,
      canStyle: false,
      canLayout: true,
      blocksField: 'blocks',
    })
    expect(result.data.blocks[0].columns).toEqual({
      layout: '2',
      gap: '20px',
    })
  })
})
