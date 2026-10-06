import type { Metadata } from 'next'

import { RootPage, generatePageMetadata } from '@/engine/next/views'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ params, searchParams })

const Page = ({ params, searchParams }: Args) => RootPage({ params, searchParams })

export default Page
