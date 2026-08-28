/**
 * Shared between the client-side loader and anything else that wants to read
 * or react to the visitor's choice. Kept out of the loader module because a
 * 'use client' file's exports become client references and cannot be read
 * during a server render.
 */

export const CONSENT_STORAGE_KEY = 'engage-cookie-consent'

/** Dispatched on `window` with `detail: 'granted' | 'denied'` when a choice is made. */
export const CONSENT_EVENT = 'engage:cookie-consent'

export type ConsentValue = 'granted' | 'denied'
