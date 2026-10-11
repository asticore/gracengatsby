import { getAdsPageState } from '../server'

/** Put first inside a page, post or product. Declares its "No ads" switch and type to every slot below it. */
export const AdsPageScope = ({ collection, noAds }: { collection: 'pages' | 'posts' | 'products'; noAds?: boolean | null }) => {
  const state = getAdsPageState()
  state.collection = collection
  state.noAds = noAds === true
  return noAds === true ? <div data-engage-no-ads hidden /> : null
}
