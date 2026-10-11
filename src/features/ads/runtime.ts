/**
 * The browser side of Ads. Called by AdsRuntime (a client component) only once
 * the visitor's marketing choice is known to be "granted"; until then nothing
 * here runs, so no script is added and no request is made.
 *
 * What it does, in order:
 *   1. tells the page about the consent signals (event `engage:ads-consent`, the
 *      hook point for a certified CMP integration),
 *   2. adds the scripts the page actually needs (see loader.planScripts),
 *   3. finds the reserved slots (`.engage-ad[data-ad-unit]`), and fills each one
 *      when it nears the screen (IntersectionObserver) or at once for non-lazy units,
 *   4. measures viewable impressions (50% in view for one second) and sends one
 *      first-party beacon per impression to POST /api/ad-track,
 *   5. refreshes Ad Manager units on their rule, never while hidden.
 *
 * Space is reserved on the server (min-height from the unit's sizes), so
 * nothing here changes layout.
 */

import {
  buildGptSlot,
  buildPrebidAdUnit,
  buildPrebidSetConfig,
  buildTamSlot,
  prebidConsentManagement,
  type PublicConfig,
  type PublicUnit,
} from './builders'
import { breakpointFor, sizesAt } from './config'
import { gdprApplies, planScripts, type SlotNeeds } from './loader'
import { AD_TRACK_PATH } from './slugs'
import type { ConsentChoices } from '@/features/consent/consent'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdWindow = Window & {
  googletag?: any
  pbjs?: any
  apstag?: any
  adsbygoogle?: unknown[]
  __tcfapi?: unknown
}

export const NO_ADS_SELECTOR = '[data-engage-no-ads]'
export const SLOT_SELECTOR = '.engage-ad[data-ad-unit]'
export const CONSENT_EVENT_NAME = 'engage:ads-consent'

const VIEWABLE_RATIO = 0.5
const VIEWABLE_MS = 1000
const LAZY_MARGIN = '300px 0px'

type SlotState = {
  el: HTMLElement
  unit: PublicUnit
  divId: string
  gptSlot?: any
  filled: boolean
  viewable: boolean
  visible: boolean
  counted: boolean
  viewTimer?: ReturnType<typeof setTimeout>
  refreshTimer?: ReturnType<typeof setInterval>
  refreshes: number
  watcher?: IntersectionObserver
  /** True once filling began (container mounted / request made). Such a slot keeps its state when ads restart. */
  started?: boolean
  /** Undo for everything this slot registered on document/element (listeners, timers, observers). */
  cleanup?: Array<() => void>
}

const scriptsAdded = new Set<string>()
let slotCounter = 0
let tamInitialised = false
let gptConfigured = false
let prebidConfigured = false

const w = (): AdWindow => window as AdWindow

function addScript(id: string, src: string): void {
  if (scriptsAdded.has(id) || document.getElementById(id)) return
  scriptsAdded.add(id)
  const script = document.createElement('script')
  script.id = id
  script.async = true
  script.src = src
  if (id === 'engage-ads-adsense') script.crossOrigin = 'anonymous'
  document.head.appendChild(script)
}

export function pageHasNoAdsMarker(root: ParentNode = document): boolean {
  return root.querySelector(NO_ADS_SELECTOR) !== null
}

export function slotNeeds(config: PublicConfig, root: ParentNode = document): SlotNeeds {
  const needs: SlotNeeds = { gam: false, adsense: false }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SLOT_SELECTOR))) {
    const unit = config.units[el.getAttribute('data-ad-unit') ?? '']
    if (!unit) continue
    if (unit.network === 'gam') needs.gam = true
    else needs.adsense = true
  }
  return needs
}

/** Fire-and-forget first-party beacon. Carries the unit key, the event and the breakpoint, nothing about the visitor. */
function track(unit: PublicUnit, event: 'v' | 'c'): void {
  const body = JSON.stringify({ u: unit.key, e: event, b: breakpointFor(window.innerWidth).charAt(0) })
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(AD_TRACK_PATH, new Blob([body], { type: 'application/json' }))) return
  } catch {
    // Fall through to fetch.
  }
  try {
    void fetch(AD_TRACK_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch((): void => undefined)
  } catch {
    // Counting is best effort.
  }
}

function watchViewability(state: SlotState): void {
  const target = state.el
  const clear = () => {
    if (state.viewTimer) clearTimeout(state.viewTimer)
    state.viewTimer = undefined
  }
  const evaluate = () => {
    clear()
    if (!state.visible || document.visibilityState !== 'visible') return
    state.viewTimer = setTimeout(() => {
      if (!state.filled || state.counted) return
      state.counted = true
      state.viewable = true
      track(state.unit, 'v')
    }, VIEWABLE_MS)
  }
  state.watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) state.visible = entry.isIntersecting && entry.intersectionRatio >= VIEWABLE_RATIO
      evaluate()
    },
    { threshold: [0, VIEWABLE_RATIO] },
  )
  state.watcher.observe(target)
  document.addEventListener('visibilitychange', evaluate)
  // An ad that arrives while already in view still needs its timer started.
  state.el.addEventListener('engage-ad-filled', evaluate)
  ;(state.cleanup ??= []).push(() => {
    clear()
    state.watcher?.disconnect()
    document.removeEventListener('visibilitychange', evaluate)
    state.el.removeEventListener('engage-ad-filled', evaluate)
  })
}

function chooseSizes(unit: PublicUnit) {
  return sizesAt(unit.sizes, breakpointFor(window.innerWidth))
}

function mountContainer(state: SlotState): HTMLElement {
  const holder = document.createElement('div')
  holder.id = state.divId
  holder.className = 'engage-ad__slot'
  state.el.appendChild(holder)
  return holder
}

// --- AdSense ----------------------------------------------------------------------

function renderAdsense(state: SlotState, config: PublicConfig): void {
  if (!config.adsense || !state.unit.slot) return
  const ins = document.createElement('ins')
  ins.className = 'adsbygoogle'
  ins.style.display = 'block'
  ins.setAttribute('data-ad-client', config.adsense.client)
  ins.setAttribute('data-ad-slot', state.unit.slot)
  const sizes = chooseSizes(state.unit)
  if (state.unit.responsive || sizes.length === 0) {
    ins.setAttribute('data-ad-format', 'auto')
    ins.setAttribute('data-full-width-responsive', 'true')
  } else {
    ins.style.width = `${sizes[0]![0]}px`
    ins.style.height = `${sizes[0]![1]}px`
  }
  const holder = mountContainer(state)
  holder.appendChild(ins)
  // AdSense marks the element when it has an ad; that is what "filled" means here.
  const mark = new MutationObserver(() => {
    if (ins.getAttribute('data-ad-status') === 'filled') {
      state.filled = true
      state.el.dispatchEvent(new Event('engage-ad-filled'))
    }
  })
  mark.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] })
  const queue = (w().adsbygoogle = w().adsbygoogle || [])
  try {
    queue.push({})
  } catch {
    // A blocked or failed AdSense script leaves the reserved space empty.
  }
}

// --- Google Ad Manager with header bidding ------------------------------------------

function configureGpt(config: PublicConfig, gdpr: boolean, hasTcf: boolean): void {
  if (gptConfigured) return
  gptConfigured = true
  const win = w()
  win.googletag = win.googletag || { cmd: [] }
  win.googletag.cmd.push(() => {
    const pubads = win.googletag.pubads()
    // Every slot is requested by hand after bidding (or at once when it has no bidders).
    pubads.disableInitialLoad()
    // Never collapse an empty slot: that is a layout shift.
    pubads.collapseEmptyDivs(false)
    pubads.addEventListener('slotRenderEnded', (event: any) => {
      const id = event?.slot?.getSlotElementId?.()
      const el = id ? document.getElementById(id)?.closest<HTMLElement>(SLOT_SELECTOR) : null
      if (!el) return
      if (!event.isEmpty) {
        const holder = el
        holder.setAttribute('data-ad-filled', '1')
        holder.dispatchEvent(new CustomEvent('engage-ad-gpt-filled', { detail: { id } }))
      }
    })
    // Basic privacy handling. Without a certified CMP there is no TC string for Google to read, so
    // ask for non personalised ads rather than pretend a consent exists.
    if (gdpr && !hasTcf) pubads.setPrivacySettings({ nonPersonalizedAds: true })
    if (config.gam?.single && Object.values(config.units).every((u) => !u.lazy)) pubads.enableSingleRequest()
    win.googletag.enableServices()
  })
}

function configurePrebid(config: PublicConfig, gdpr: boolean, hasTcf: boolean): void {
  if (prebidConfigured || !config.prebid) return
  prebidConfigured = true
  const win = w()
  win.pbjs = win.pbjs || { que: [] }
  const prebid = config.prebid
  const units = Object.values(config.units).filter((u) => u.bids.length > 0)
  win.pbjs.que.push(() => {
    win.pbjs.setConfig(buildPrebidSetConfig(prebid, units, prebidConsentManagement({ gdprApplies: gdpr, hasTcfApi: hasTcf, timeout: config.privacy.tcfTimeout })))
  })
}

/** Runs the header-bidding auctions for one slot, then asks Ad Manager for the ad. */
function auctionAndFetch(state: SlotState, config: PublicConfig): void {
  const win = w()
  const { unit, divId } = state
  const sizes = chooseSizes(unit)
  let pending = 0
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    win.googletag.cmd.push(() => {
      if (state.gptSlot) win.googletag.pubads().refresh([state.gptSlot])
    })
  }
  const done = () => {
    pending -= 1
    if (pending <= 0) finish()
  }

  if (unit.bids.length > 0 && config.prebid) {
    pending += 1
    win.pbjs = win.pbjs || { que: [] }
    win.pbjs.que.push(() => {
      win.pbjs.removeAdUnit?.(divId)
      win.pbjs.addAdUnits(buildPrebidAdUnit(unit, divId, sizes))
      win.pbjs.requestBids({
        adUnitCodes: [divId],
        timeout: config.prebid!.timeout,
        bidsBackHandler: () => {
          win.pbjs.setTargetingForGPTAsync([divId])
          done()
        },
      })
    })
  }

  if (unit.tam && config.tam) {
    pending += 1
    const run = () => {
      if (!tamInitialised) {
        tamInitialised = true
        win.apstag.init({ pubID: config.tam!.pubId, adServer: 'googletag', simple: true })
      }
      win.apstag.fetchBids({ slots: [buildTamSlot(unit, divId, sizes)], timeout: config.prebid?.timeout ?? 1000 }, () => {
        win.googletag.cmd.push(() => win.apstag.setDisplayBids())
        done()
      })
    }
    if (win.apstag?.fetchBids) run()
    else {
      // The apstag library is still loading: wait for it, but never longer than the failsafe.
      const started = Date.now()
      const wait = setInterval(() => {
        if (win.apstag?.fetchBids) {
          clearInterval(wait)
          run()
        } else if (Date.now() - started > (config.prebid?.failsafe ?? 3000)) {
          clearInterval(wait)
          done()
        }
      }, 50)
    }
  }

  if (pending === 0) finish()
  else setTimeout(finish, config.prebid?.failsafe ?? 3000)
}

function renderGam(state: SlotState, config: PublicConfig): void {
  const win = w()
  const sizes = chooseSizes(state.unit)
  if (sizes.length === 0 || !state.unit.path) return
  mountContainer(state)
  const spec = buildGptSlot(state.unit, state.divId, sizes)
  win.googletag = win.googletag || { cmd: [] }
  win.googletag.cmd.push(() => {
    const slot = win.googletag.defineSlot(spec.path, spec.sizes, spec.divId)
    if (!slot) return
    slot.addService(win.googletag.pubads())
    for (const [key, values] of spec.targeting) slot.setTargeting(key, values)
    state.gptSlot = slot
    win.googletag.display(spec.divId)
    auctionAndFetch(state, config)
  })
  const onGptFilled = () => {
    state.filled = true
    state.el.dispatchEvent(new Event('engage-ad-filled'))
  }
  state.el.addEventListener('engage-ad-gpt-filled', onGptFilled)
  ;(state.cleanup ??= []).push(() => state.el.removeEventListener('engage-ad-gpt-filled', onGptFilled))
}

function scheduleRefresh(state: SlotState, config: PublicConfig): void {
  const rule = state.unit.refresh
  if (!rule || state.unit.network !== 'gam') return
  state.refreshTimer = setInterval(() => {
    if (state.refreshes >= rule.max) {
      if (state.refreshTimer) clearInterval(state.refreshTimer)
      return
    }
    if (document.visibilityState !== 'visible') return
    // With the viewable rule, only a slot that is on screen and has had its first view counted may refresh.
    if (rule.viewable && !(state.visible && state.viewable)) return
    state.refreshes += 1
    state.counted = false
    state.viewable = false
    auctionAndFetch(state, config)
    state.el.dispatchEvent(new Event('engage-ad-filled'))
  }, rule.seconds * 1000)
  ;(state.cleanup ??= []).push(() => {
    if (state.refreshTimer) clearInterval(state.refreshTimer)
    state.refreshTimer = undefined
  })
}

function fillSlot(state: SlotState, config: PublicConfig): void {
  state.started = true
  if (state.unit.network === 'adsense') renderAdsense(state, config)
  else renderGam(state, config)
  watchViewability(state)
  scheduleRefresh(state, config)
}

// --- Start ---------------------------------------------------------------------------

export type StartOptions = { optInRegion: boolean }

/**
 * Starts ads for this page. Safe to call again (after a route change): scripts,
 * configuration and already-filled slots are not repeated. Returns a stop
 * function that disconnects the observers (it cannot unload loaded tags).
 */
export function startAds(config: PublicConfig, choices: ConsentChoices, options: StartOptions): () => void {
  if (typeof window === 'undefined') return () => undefined
  const noAds = pageHasNoAdsMarker()
  const needs = slotNeeds(config)
  const plan = planScripts(config, choices, { noAds, needs })
  if (plan.length === 0) return () => undefined

  const gdpr = gdprApplies(config.privacy.gdpr, options.optInRegion)
  const hasTcf = typeof w().__tcfapi === 'function'
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT_NAME, { detail: { gdprApplies: gdpr, marketing: choices.marketing, tcf: hasTcf } }))
  } catch {
    // Older browsers without CustomEvent constructors skip the hook; ads still follow the same rules.
  }
  if (gdpr && !hasTcf && typeof console !== 'undefined') {
    console.warn('[ads] GDPR applies but no TCF CMP (window.__tcfapi) was found. A certified CMP is needed for TCF; requesting non personalised ads only.')
  }

  if (needs.gam) {
    configureGpt(config, gdpr, hasTcf)
    configurePrebid(config, gdpr, hasTcf)
  }
  for (const item of plan) addScript(item.id, item.src)

  const observers: IntersectionObserver[] = []
  const lazyObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        lazyObserver.unobserve(entry.target)
        const state = states.get(entry.target as HTMLElement)
        if (state) fillSlot(state, config)
      }
    },
    { rootMargin: LAZY_MARGIN },
  )
  observers.push(lazyObserver)
  const states = new WeakMap<HTMLElement, SlotState>()
  const active = new Set<SlotState>()

  const scan = () => {
    if (pageHasNoAdsMarker()) return
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(SLOT_SELECTOR))) {
      if (el.getAttribute('data-ad-state')) continue
      const unit = config.units[el.getAttribute('data-ad-unit') ?? '']
      if (!unit) {
        el.setAttribute('data-ad-state', 'skipped')
        continue
      }
      el.setAttribute('data-ad-state', 'pending')
      slotCounter += 1
      const state: SlotState = { el, unit, divId: `engage-ad-${unit.key}-${slotCounter}`, filled: false, viewable: false, visible: false, counted: false, refreshes: 0 }
      states.set(el, state)
      active.add(state)
      if (unit.lazy) lazyObserver.observe(el)
      else fillSlot(state, config)
    }
  }
  scan()

  // Slots can arrive after the first scan (client navigation, late rendered content).
  const mutations = new MutationObserver(() => {
    const more = slotNeeds(config)
    if (more.gam !== needs.gam || more.adsense !== needs.adsense) {
      for (const item of planScripts(config, choices, { noAds: pageHasNoAdsMarker(), needs: more })) addScript(item.id, item.src)
      if (more.gam) {
        configureGpt(config, gdpr, hasTcf)
        configurePrebid(config, gdpr, hasTcf)
      }
    }
    scan()
  })
  mutations.observe(document.body, { childList: true, subtree: true })

  return () => {
    for (const observer of observers) observer.disconnect()
    mutations.disconnect()
    // Slots whose fill never began (lazy ones not yet near the viewport) would stay 'pending' for ever
    // and be skipped by the next start; release them. Remove listeners and timers of every slot.
    for (const state of active) {
      for (const undo of state.cleanup ?? []) undo()
      state.cleanup = undefined
      if (!state.started && state.el.getAttribute('data-ad-state') === 'pending') state.el.removeAttribute('data-ad-state')
    }
    active.clear()
  }
}
