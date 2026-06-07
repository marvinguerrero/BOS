import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ProductsView } from '@/components/modules/inventory/products-view'

export const metadata: Metadata = { title: 'Inventory' }

export default async function ProductsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*, categories(name)').eq('business_id', businessId).eq('is_active', true).order('name'),
    supabase.from('categories').select('*').eq('business_id', businessId).eq('is_active', true).order('name'),
  ])

  return <ProductsView businessId={businessId} initialProducts={products ?? []} categories={categories ?? []} />
}
