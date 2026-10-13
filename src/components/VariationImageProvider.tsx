'use client'

import React, { createContext, useContext, useMemo, useState } from 'react'

type VariationImageState = { imageUrl: string | null; setImageUrl: (url: string | null) => void }

const VariationImageContext = createContext<VariationImageState>({ imageUrl: null, setImageUrl: () => undefined })

/**
 * Holds the image of the variation the buyer has chosen, so the gallery (ProductGallery) can show it
 * as the main picture. Wraps the product page's gallery and purchase column. Renders no markup of its own.
 */
export function VariationImageProvider({ children }: { children: React.ReactNode }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const value = useMemo(() => ({ imageUrl, setImageUrl }), [imageUrl])
  return <VariationImageContext.Provider value={value}>{children}</VariationImageContext.Provider>
}

export function useVariationImage(): VariationImageState {
  return useContext(VariationImageContext)
}
