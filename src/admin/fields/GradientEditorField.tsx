'use client'

import React, { useState } from 'react'

export type GradientStop = {
  color: string
  position: number
}

export type GradientValue = {
  type?: string
  angle?: string
  stops?: GradientStop[]
}

const TYPE_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
]

export const GradientEditorField: React.FC<{
  value: unknown
  onChange: (v: GradientValue) => void
}> = ({ value, onChange }) => {
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null)

  const current = (typeof value === 'object' && value ? (value as GradientValue) : {}) as GradientValue
  const type = current.type || 'linear'
  const angle = current.angle || '90'
  const stops = (current.stops && Array.isArray(current.stops) ? current.stops : [
    { color: '#ff0000', position: 0 },
    { color: '#0000ff', position: 100 },
  ]) as GradientStop[]

  const handleChange = (updates: Partial<GradientValue>) => {
    onChange({ ...current, ...updates })
  }

  const updateStop = (index: number, updates: Partial<GradientStop>) => {
    const updated = [...stops]
    updated[index] = { ...updated[index], ...updates }
    handleChange({ stops: updated })
  }

  const addStop = () => {
    const newPosition = stops.length > 0 ? Math.round((stops[stops.length - 1].position + 0) / 2) : 50
    const newStop: GradientStop = { color: '#cccccc', position: newPosition }
    handleChange({ stops: [...stops, newStop].sort((a, b) => a.position - b.position) })
  }

  const removeStop = (index: number) => {
    if (stops.length > 2) {
      const updated = stops.filter((_, i) => i !== index)
      handleChange({ stops: updated })
      setSelectedStopIndex(null)
    }
  }

  const gradientString = (() => {
    if (type === 'radial') {
      const colorStops = stops.map((s) => `${s.color} ${s.position}%`).join(', ')
      return `radial-gradient(circle, ${colorStops})`
    }
    const colorStops = stops.map((s) => `${s.color} ${s.position}%`).join(', ')
    return `linear-gradient(${angle}deg, ${colorStops})`
  })()

  return (
    <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #ccc', borderRadius: '4px', padding: '12px' }}>
      {/* Type */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
          Gradient Type
        </label>
        <select
          value={type}
          onChange={(e) => handleChange({ type: e.target.value })}
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid #ccc',
            borderRadius: '3px',
            fontSize: '12px',
          }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Angle (for linear) */}
      {type === 'linear' && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>
            Angle (0-360°)
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={angle}
              onChange={(e) => handleChange({ angle: e.target.value })}
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min="0"
              max="360"
              value={angle}
              onChange={(e) => handleChange({ angle: e.target.value })}
              style={{
                width: '60px',
                padding: '6px 8px',
                border: '1px solid #ccc',
                borderRadius: '3px',
                fontSize: '12px',
              }}
            />
          </div>
        </div>
      )}

      {/* Preview */}
      <div
        style={{
          marginBottom: '12px',
          height: '80px',
          borderRadius: '4px',
          background: gradientString,
          border: '1px solid #ddd',
        }}
      />

      {/* Color Stops */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', fontWeight: 500 }}>
          Color Stops
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stops.map((stop, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedStopIndex(idx)}
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr 60px 60px',
                gap: '8px',
                alignItems: 'center',
                padding: '8px',
                backgroundColor: selectedStopIndex === idx ? '#e3f2fd' : '#ffffff',
                border: selectedStopIndex === idx ? '1px solid #2196f3' : '1px solid #e0e0e0',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              <input
                type="color"
                value={stop.color}
                onChange={(e) => updateStop(idx, { color: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '40px',
                  height: '32px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={stop.color}
                onChange={(e) => updateStop(idx, { color: e.target.value })}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              />
              <input
                type="number"
                min="0"
                max="100"
                value={stop.position}
                onChange={(e) => updateStop(idx, { position: Number(e.target.value) })}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  fontSize: '12px',
                }}
              />
              <span style={{ fontSize: '12px', color: '#666' }}>%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Remove buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={addStop}
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          + Add Stop
        </button>
        <button
          type="button"
          onClick={() => removeStop(selectedStopIndex ?? 0)}
          disabled={stops.length <= 2 || selectedStopIndex === null}
          style={{
            flex: 1,
            padding: '6px 8px',
            backgroundColor: stops.length <= 2 || selectedStopIndex === null ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            fontSize: '12px',
            cursor: stops.length <= 2 || selectedStopIndex === null ? 'not-allowed' : 'pointer',
          }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}
