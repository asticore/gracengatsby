'use client'

import React, { useState } from 'react'

type RangeSliderFieldProps = {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
  max?: number
  step?: number
  label?: string
}

export const RangeSliderField: React.FC<RangeSliderFieldProps> = ({
  value = 0,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
}) => {
  const numValue = typeof value === 'number' ? value : min

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(e.target.value)
    onChange(newValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value === '' ? undefined : Number(e.target.value)
    if (newValue === undefined) {
      onChange(undefined)
    } else if (newValue >= min && newValue <= max) {
      onChange(newValue)
    }
  }

  return (
    <div className="ve-range-slider">
      {label && <label className="ve-range-slider__label">{label}</label>}
      <div className="ve-range-slider__container">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numValue}
          onChange={handleSliderChange}
          className="ve-range-slider__slider"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={typeof numValue === 'number' ? numValue : ''}
          onChange={handleInputChange}
          className="ve-range-slider__input"
        />
      </div>
    </div>
  )
}
