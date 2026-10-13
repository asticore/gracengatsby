/**
 * Variation images are chosen from the product's own gallery. Pure, no I/O.
 *
 * A variation stores the id of one gallery image. On save anything not in the gallery is dropped, and
 * on the product page the chosen image is moved to the front of the gallery.
 */

type ImageRef = number | { id: number } | null | undefined

export type GalleryImage = { id: number; url?: string | null; alt?: string | null }

const idOf = (value: ImageRef): number | null => {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (value && typeof value === 'object' && Number.isInteger(value.id)) return value.id
  return null
}

/** Ids of the product's gallery images (plain ids or populated objects). */
export function galleryIds(images: ImageRef[] | null | undefined): number[] {
  return (images ?? []).map(idOf).filter((id): id is number => id !== null)
}

/** The variation's image id when it is one of the gallery images, otherwise null. */
export function galleryImageId(image: ImageRef, gallery: number[]): number | null {
  const id = idOf(image)
  return id !== null && gallery.includes(id) ? id : null
}

/** Variations with any image outside the gallery cleared. Returns new objects; the input is not changed. */
export function keepGalleryVariationImages<T extends { image?: ImageRef }>(variations: T[], gallery: number[]): T[] {
  return variations.map((variation) => {
    if (variation.image === undefined || variation.image === null) return variation
    const id = galleryImageId(variation.image, gallery)
    return id === null ? { ...variation, image: null } : { ...variation, image: id }
  })
}

/** The gallery with the chosen image first. An image not in the gallery leaves the order as it is. */
export function orderGallery<T extends { url?: string | null }>(images: T[], chosenUrl: string | null | undefined): T[] {
  if (!chosenUrl) return images
  const at = images.findIndex((image) => image.url === chosenUrl)
  if (at <= 0) return images
  return [images[at], ...images.slice(0, at), ...images.slice(at + 1)]
}

type SelectableVariation = { imageUrl: string | null; attributes: Record<string, string> }
type SelectableOption = { name: string }

/**
 * The image to show for a partial or full choice of options: the matching variation's image, or null
 * when the choice is incomplete or no variation matches. Attribute values compare case-insensitively.
 */
export function imageForSelection(variations: SelectableVariation[], options: SelectableOption[], selection: Record<string, string>): string | null {
  if (options.length === 0 || options.some((option) => !selection[option.name])) return null
  const match = variations.find((variation) => options.every((option) => (variation.attributes[option.name] ?? '').toLowerCase() === selection[option.name].toLowerCase()))
  return match?.imageUrl ?? null
}