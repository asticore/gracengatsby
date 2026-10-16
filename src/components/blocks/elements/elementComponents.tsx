import type React from 'react'

import { CountdownElement } from './CountdownElement'
import { AccordionElement, AlertElement, CounterElement, ProgressBarElement, SocialIconsElement, StarRatingElement, TabsElement, ToggleElement } from './InteractiveElements'
import { AnchorElement, DividerElement, HtmlElement, MapElement, SpacerElement } from './LayoutElements'
import { CallToActionElement, FlipBoxElement, IconBoxElement, ImageBoxElement, PriceListElement, PricingTableElement, TeamMemberElement, TestimonialElement } from './MarketingElements'
import { IconElement, ImageCarouselElement, ImageElement, ImageGalleryElement, LogoStripElement, VideoElement } from './MediaElements'
import { IconListElement, ListElement, QuoteElement, TextEditorElement } from './TextElements'

/**
 * The wave-26 elements, keyed by `elementType`. renderElement.tsx falls through to this table after its explicit
 * cases (heading, button, content-slot), so adding an element here and in src/lib/elements/wave26Defs.ts is all it takes.
 */
export const ELEMENT_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  'text-editor': TextEditorElement,
  quote: QuoteElement,
  'icon-list': IconListElement,
  list: ListElement,
  image: ImageElement,
  video: VideoElement,
  'image-gallery': ImageGalleryElement,
  'image-carousel': ImageCarouselElement,
  icon: IconElement,
  'logo-strip': LogoStripElement,
  accordion: AccordionElement,
  tabs: TabsElement,
  toggle: ToggleElement,
  counter: CounterElement,
  'progress-bar': ProgressBarElement,
  'star-rating': StarRatingElement,
  alert: AlertElement,
  'social-icons': SocialIconsElement,
  countdown: CountdownElement,
  testimonial: TestimonialElement,
  'pricing-table': PricingTableElement,
  'price-list': PriceListElement,
  'team-member': TeamMemberElement,
  'flip-box': FlipBoxElement,
  'call-to-action': CallToActionElement,
  'icon-box': IconBoxElement,
  'image-box': ImageBoxElement,
  divider: DividerElement,
  spacer: SpacerElement,
  anchor: AnchorElement,
  html: HtmlElement,
  map: MapElement,
}
