import { describe, expect, it } from 'vitest'
import { buildEventIcs, foldLine, icsDateTime, icsEscape, icsFromEvent, plainText } from '@/features/editScreens/ics'
import { orderBlogPosts } from '@/features/editScreens/blogOrder'

const octets = (s: string) => new TextEncoder().encode(s).length

describe('icsEscape', () => {
  it('escapes backslashes, semicolons, commas and newlines', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\;c\\,d\\ne')
  })

  it('drops control characters that are not allowed in TEXT', () => {
    expect(icsEscape('a\u0001b')).toBe('ab')
  })
})

describe('icsDateTime', () => {
  it('writes UTC in the basic form', () => {
    expect(icsDateTime(new Date(Date.UTC(2026, 9, 15, 9, 5, 7)))).toBe('20261015T090507Z')
  })
})

describe('foldLine', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:Short')).toBe('SUMMARY:Short')
  })

  it('folds long ASCII lines at 75 octets with a leading space on continuations', () => {
    const line = 'DESCRIPTION:' + 'x'.repeat(200)
    const folded = foldLine(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    expect(octets(parts[0])).toBe(75)
    for (const part of parts.slice(1)) {
      expect(part.startsWith(' ')).toBe(true)
      expect(octets(part)).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })

  it('never splits a multi-byte character', () => {
    const line = 'SUMMARY:' + 'é中'.repeat(60)
    const folded = foldLine(line)
    for (const part of folded.split('\r\n')) {
      expect(octets(part)).toBeLessThanOrEqual(75)
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line)
  })
})

describe('buildEventIcs', () => {
  const ics = buildEventIcs({
    uid: 'event-7@example.com',
    stamp: new Date(Date.UTC(2026, 0, 1)),
    start: new Date(Date.UTC(2026, 5, 1, 10, 0)),
    end: new Date(Date.UTC(2026, 5, 1, 12, 0)),
    summary: 'Tea, cake; and talk',
    location: 'Hall, Level 2',
    description: 'Line one\nLine two',
    url: 'https://example.com/events/tea',
  })

  it('uses CRLF line endings only and ends with CRLF', () => {
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/)
  })

  it('wraps the event in a VCALENDAR with one VEVENT', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('END:VEVENT\r\nEND:VCALENDAR\r\n')
  })

  it('writes UID, stamp, start, end and escaped text values', () => {
    expect(ics).toContain('UID:event-7@example.com\r\n')
    expect(ics).toContain('DTSTAMP:20260101T000000Z\r\n')
    expect(ics).toContain('DTSTART:20260601T100000Z\r\n')
    expect(ics).toContain('DTEND:20260601T120000Z\r\n')
    expect(ics).toContain('SUMMARY:Tea\\, cake\; and talk\r\n')
    expect(ics).toContain('LOCATION:Hall\\, Level 2\r\n')
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two\r\n')
    expect(ics).toContain('URL:https://example.com/events/tea\r\n')
  })

  it('keeps every physical line within 75 octets', () => {
    for (const line of ics.split('\r\n')) {
      expect(octets(line)).toBeLessThanOrEqual(75)
    }
  })

  it('leaves out optional properties that are empty', () => {
    const bare = buildEventIcs({
      uid: 'u',
      stamp: new Date(0),
      start: new Date(0),
      end: new Date(0),
      summary: 'Bare',
    })
    expect(bare).not.toContain('LOCATION')
    expect(bare).not.toContain('DESCRIPTION')
    expect(bare).not.toContain('URL')
  })
})

describe('icsFromEvent', () => {
  const base = {
    id: 42,
    title: 'Open day',
    slug: 'open-day',
    summary: 'A short teaser',
    description: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Come along' }] }] } },
    startDate: '2026-06-01T10:00:00.000Z',
    endDate: '2026-06-01T12:30:00.000Z',
    updatedAt: '2026-05-20T08:00:00.000Z',
    location: { venueName: 'Studio', address: '1 Main St', isOnline: false },
  }

  it('builds a calendar entry for a dated event with its own end time', () => {
    const ics = icsFromEvent(base, 'https://example.com/')
    expect(ics).not.toBeNull()
    expect(ics).toContain('UID:event-42@example.com\r\n')
    expect(ics).toContain('DTEND:20260601T123000Z\r\n')
    expect(ics).toContain('LOCATION:Studio\\, 1 Main St\r\n')
    expect(ics).toContain('DESCRIPTION:Come along\r\n')
    expect(ics).toContain('URL:https://example.com/events/open-day\r\n')
  })

  it('gives an event with no end one hour', () => {
    const ics = icsFromEvent({ ...base, endDate: null }, 'https://example.com')
    expect(ics).toContain('DTEND:20260601T110000Z\r\n')
  })

  it('uses Online as the location for an online event with no venue', () => {
    const ics = icsFromEvent({ ...base, location: { isOnline: true } }, 'https://example.com')
    expect(ics).toContain('LOCATION:Online\r\n')
  })

  it('falls back to the summary when there is no rich description', () => {
    const ics = icsFromEvent({ ...base, description: null }, 'https://example.com')
    expect(ics).toContain('DESCRIPTION:A short teaser\r\n')
  })

  it('returns null without a start date or slug', () => {
    expect(icsFromEvent({ ...base, startDate: null }, 'https://example.com')).toBeNull()
    expect(icsFromEvent({ ...base, startDate: 'not a date' }, 'https://example.com')).toBeNull()
    expect(icsFromEvent({ ...base, slug: '' }, 'https://example.com')).toBeNull()
  })
})

describe('plainText', () => {
  it('joins the words of a rich text tree and ignores structure', () => {
    const tree = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'world' }] }] } }
    expect(plainText(tree)).toBe('Hello world')
  })
})

describe('orderBlogPosts', () => {
  const post = (id: string, publishedDate: string | null, sticky = false) => ({ id, publishedDate, sticky })

  it('puts sticky posts first, then newest first', () => {
    const ordered = orderBlogPosts([
      post('old', '2025-01-01T00:00:00Z'),
      post('new', '2026-03-01T00:00:00Z'),
      post('pinned-old', '2024-06-01T00:00:00Z', true),
      post('mid', '2025-06-01T00:00:00Z'),
      post('pinned-new', '2026-01-01T00:00:00Z', true),
    ])
    expect(ordered.map((p) => p.id)).toEqual(['pinned-new', 'pinned-old', 'new', 'mid', 'old'])
  })

  it('sends undated posts to the bottom of their group', () => {
    const ordered = orderBlogPosts([post('undated', null), post('dated', '2025-01-01T00:00:00Z')])
    expect(ordered.map((p) => p.id)).toEqual(['dated', 'undated'])
  })

  it('does not change the array it was given', () => {
    const input = [post('a', '2025-01-01T00:00:00Z'), post('b', '2026-01-01T00:00:00Z')]
    orderBlogPosts(input)
    expect(input.map((p) => p.id)).toEqual(['a', 'b'])
  })
})
