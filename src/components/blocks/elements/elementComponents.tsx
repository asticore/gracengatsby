import type React from 'react'

import { CountdownElement } from './CountdownElement'
import { AccordionElement, AlertElement, CounterElement, ProgressBarElement, SocialIconsElement, StarRatingElement, TabsElement, ToggleElement } from './InteractiveElements'
import { AnchorElement, DividerElement, HtmlElement, MapElement, SpacerElement } from './LayoutElements'
import { CallToActionElement, FlipBoxElement, IconBoxElement, ImageBoxElement, PriceListElement, PricingTableElement, TeamMemberElement, TestimonialElement } from './MarketingElements'
import { IconElement, ImageCarouselElement, ImageElement, ImageGalleryElement, LogoStripElement, VideoElement } from './MediaElements'
import { IconListElement, ListElement, QuoteElement, TextEditorElement } from './TextElements'
import { AnimatedHeadlineElement, BackToTopElement, BarChartElement, BreadcrumbsElement, CircleProgressElement, DualHeadingElement, ImageComparisonElement, PieChartElement, ShareButtonsElement, TableElement, TimelineElement } from './Wave36Elements'
import { WAVE37_COMPONENTS } from './Wave37Elements'
import { WAVE43_COMPONENTS } from './Wave43Elements'
import { WAVE44_COMPONENTS } from './Wave44Elements'
import { WAVE47_COMPONENTS } from './Wave47Elements'
import { WAVE48_COMPONENTS } from './Wave48Elements'

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
  // wave 36
  table: TableElement,
  timeline: TimelineElement,
  breadcrumbs: BreadcrumbsElement,
  'dual-heading': DualHeadingElement,
  'animated-headline': AnimatedHeadlineElement,
  'circle-progress': CircleProgressElement,
  'bar-chart': BarChartElement,
  'pie-chart': PieChartElement,
  'share-buttons': ShareButtonsElement,
  'back-to-top': BackToTopElement,
  'image-comparison': ImageComparisonElement,
  ...WAVE37_COMPONENTS,
  ...WAVE43_COMPONENTS,
  ...WAVE44_COMPONENTS,
  ...WAVE47_COMPONENTS,
  ...WAVE48_COMPONENTS,
}
