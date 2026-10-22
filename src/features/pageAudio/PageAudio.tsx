'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { shouldSkipForReducedData, type PageAudioConfig } from './config'

const STORAGE_KEY = 'pageAudioMuted'

const readMuted = (): boolean | null => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

const writeMuted = (muted: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

/** Small floating background-audio control. Never plays unmuted before a user gesture. */
export function PageAudio({ config }: { config: PageAudioConfig }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const gestureRef = useRef(false)
  const [skip, setSkip] = useState(false)
  const [muted, setMuted] = useState(true)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (config.respectReducedData) {
      const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      if (shouldSkipForReducedData(conn)) {
        // Client-only capability check: it cannot be known during render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSkip(true)
        return
      }
    }
    const audio = new Audio()
    audio.preload = 'none'
    audio.loop = config.loop
    audio.volume = config.volume
    audio.src = config.src
    audioRef.current = audio
    const saved = readMuted()
    const startMuted = saved ?? config.startMuted
    audio.muted = startMuted
    setMuted(startMuted)
    audio.addEventListener('play', () => setPlaying(true))
    audio.addEventListener('pause', () => setPlaying(false))

    const tryPlay = () => {
      // Unmuted playback is only allowed after a gesture.
      if (!audio.muted && !gestureRef.current) audio.muted = true
      void audio.play().catch(() => {})
    }
    const onGesture = () => {
      gestureRef.current = true
      removeGestures()
      if (config.startOnFirstInteraction) {
        audio.muted = readMuted() ?? config.startMuted
        setMuted(audio.muted)
        if (audio.paused) void audio.play().catch(() => {})
      }
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    const removeGestures = () => events.forEach((e) => window.removeEventListener(e, onGesture))
    events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }))
    if (!config.startOnFirstInteraction || config.startMuted) tryPlay()

    const onVisibility = () => {
      if (document.hidden) audio.pause()
      else if (gestureRef.current || audio.muted) void audio.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      removeGestures()
      document.removeEventListener('visibilitychange', onVisibility)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
    }
  }, [config])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    gestureRef.current = true
    if (audio.muted || audio.paused) {
      audio.muted = false
      setMuted(false)
      writeMuted(false)
      void audio.play().catch(() => {})
    } else {
      audio.muted = true
      setMuted(true)
      writeMuted(true)
    }
  }, [])

  if (skip || !config.showControls) return null
  const sound = !muted && playing
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={sound ? 'Mute background audio' : 'Play background audio'}
      aria-pressed={sound}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 50,
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid rgba(0,0,0,0.2)',
        background: 'rgba(255,255,255,0.92)',
        color: '#14110f',
        cursor: 'pointer',
        lineHeight: 1,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 11, fontWeight: 600 }}>
        {sound ? 'On' : 'Off'}
      </span>
    </button>
  )
}
