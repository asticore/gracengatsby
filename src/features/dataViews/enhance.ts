/**
 * The small progressive script for tables and charts: sorting, search and paging for tables, hover
 * tooltips for charts. The markup is complete without it. It only reads the data-* attributes the
 * server rendered and writes with textContent, never innerHTML, so it cannot introduce markup.
 */

const ENHANCED = 'dvEnhanced'

type RowState = { el: HTMLTableRowElement; index: number; text: string }

function enhanceTable(wrap: HTMLElement): void {
  const table = wrap.querySelector('table')
  const body = table?.tBodies[0]
  if (!table || !body) return
  const rows: RowState[] = Array.from(body.querySelectorAll<HTMLTableRowElement>('tr[data-row]')).map((el, index) => ({ el, index, text: (el.textContent ?? '').toLowerCase() }))
  if (rows.length === 0) return

  const sortable = wrap.hasAttribute('data-dv-sortable')
  const searchable = wrap.hasAttribute('data-dv-search')
  const pageSize = Number(wrap.getAttribute('data-dv-pagesize') ?? '0') || 0

  let order = rows.slice()
  let query = ''
  let page = 0
  let sortCol = -1
  let sortDir: 'ascending' | 'descending' | 'none' = 'none'

  let status: HTMLElement | null = null
  let prev: HTMLButtonElement | null = null
  let next: HTMLButtonElement | null = null

  const render = (): void => {
    const matching = order.filter((row) => !query || row.text.includes(query))
    const pages = pageSize > 0 ? Math.max(1, Math.ceil(matching.length / pageSize)) : 1
    page = Math.min(page, pages - 1)
    const start = pageSize > 0 ? page * pageSize : 0
    const visible = new Set(matching.slice(start, pageSize > 0 ? start + pageSize : undefined))
    for (const row of rows) row.el.hidden = !visible.has(row)
    // Reorder in the DOM so the visible order matches the sort.
    for (const row of order) body.appendChild(row.el)
    if (status) status.textContent = matching.length === 0 ? 'No matching rows.' : pageSize > 0 ? `Page ${page + 1} of ${pages} (${matching.length} rows)` : `${matching.length} rows`
    if (prev) prev.disabled = page <= 0
    if (next) next.disabled = page >= pages - 1
  }

  if (searchable) {
    const label = document.createElement('label')
    label.className = 'dv-search'
    const text = document.createElement('span')
    text.className = 'dv-sr'
    text.textContent = 'Search this table'
    const input = document.createElement('input')
    input.type = 'search'
    input.placeholder = 'Search'
    input.autocomplete = 'off'
    input.addEventListener('input', () => {
      query = input.value.trim().toLowerCase()
      page = 0
      render()
    })
    label.appendChild(text)
    label.appendChild(input)
    wrap.insertBefore(label, wrap.firstChild)
  }

  if (pageSize > 0 && rows.length > pageSize) {
    const nav = document.createElement('div')
    nav.className = 'dv-pager'
    prev = document.createElement('button')
    prev.type = 'button'
    prev.textContent = 'Previous'
    next = document.createElement('button')
    next.type = 'button'
    next.textContent = 'Next'
    status = document.createElement('span')
    status.className = 'dv-pager-status'
    status.setAttribute('aria-live', 'polite')
    prev.addEventListener('click', () => {
      page -= 1
      render()
    })
    next.addEventListener('click', () => {
      page += 1
      render()
    })
    nav.appendChild(prev)
    nav.appendChild(status)
    nav.appendChild(next)
    wrap.appendChild(nav)
  }

  if (sortable) {
    const buttons = Array.from(table.querySelectorAll<HTMLButtonElement>('thead button[data-sort-col]'))
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const col = Number(button.getAttribute('data-sort-col'))
        const th = button.closest('th')
        const numeric = th?.getAttribute('data-type') !== 'text'
        sortDir = sortCol === col && sortDir === 'ascending' ? 'descending' : 'ascending'
        sortCol = col
        const factor = sortDir === 'ascending' ? 1 : -1
        order = rows.slice().sort((a, b) => {
          const x = a.el.cells[col]?.getAttribute('data-sort') ?? ''
          const y = b.el.cells[col]?.getAttribute('data-sort') ?? ''
          // Empty values stay last either way.
          if (x === '' || y === '') return x === y ? a.index - b.index : x === '' ? 1 : -1
          const result = numeric ? Number(x) - Number(y) : x.localeCompare(y, undefined, { numeric: true })
          return result === 0 ? a.index - b.index : result * factor
        })
        for (const other of buttons) other.closest('th')?.setAttribute('aria-sort', 'none')
        th?.setAttribute('aria-sort', sortDir)
        page = 0
        render()
      })
    }
  }

  render()
}

function enhanceChart(body: HTMLElement): void {
  const svg = body.querySelector('svg')
  if (!svg) return
  const tip = document.createElement('div')
  tip.className = 'dv-tooltip'
  tip.hidden = true
  tip.setAttribute('role', 'tooltip')
  body.appendChild(tip)
  // The native tooltips would double up with this one.
  for (const title of Array.from(svg.querySelectorAll('.dv-mark > title'))) title.remove()

  const show = (target: Element): void => {
    const text = target.getAttribute('data-tip')
    if (!text) return
    tip.textContent = text
    tip.hidden = false
    const box = target.getBoundingClientRect()
    const host = body.getBoundingClientRect()
    tip.style.left = `${Math.round(box.left - host.left + box.width / 2)}px`
    tip.style.top = `${Math.round(box.top - host.top)}px`
  }
  svg.addEventListener('pointerover', (event) => {
    const target = (event.target as Element | null)?.closest?.('[data-tip]')
    if (target) show(target)
  })
  svg.addEventListener('pointerout', () => {
    tip.hidden = true
  })
}

/** Upgrades every table and chart under `root` that has not been upgraded yet. Safe to call repeatedly. */
export function enhanceDataViews(root: ParentNode = document): void {
  for (const wrap of Array.from(root.querySelectorAll<HTMLElement>('[data-dv-table]'))) {
    if (wrap.dataset[ENHANCED]) continue
    wrap.dataset[ENHANCED] = '1'
    enhanceTable(wrap)
  }
  for (const body of Array.from(root.querySelectorAll<HTMLElement>('.dv-chart-body'))) {
    if (body.dataset[ENHANCED]) continue
    body.dataset[ENHANCED] = '1'
    enhanceChart(body)
  }
}