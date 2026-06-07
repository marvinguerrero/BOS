import type { Metadata } from 'next'
import { GlobalSearch } from '@/components/shared/global-search'

export const metadata: Metadata = { title: 'Search' }

export default async function SearchPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  return <GlobalSearch businessId={businessId} />
}
