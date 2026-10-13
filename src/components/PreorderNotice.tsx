import type { PreorderInfo } from '@/features/ecommerce/lib/preorder'

/** "Ships from <date>" and the shop's note, under the price while a pre-order is live. Renders nothing otherwise. */
export function PreorderNotice({ info }: { info: PreorderInfo }) {
  if (!info.active) return null
  return (
    <div className="mb-3 text-[0.9rem]">
      {info.shipsFrom ? <p className="m-0">Ships from {info.shipsFrom}</p> : null}
      {info.note ? <p className="m-0 opacity-80">{info.note}</p> : null}
    </div>
  )
}
