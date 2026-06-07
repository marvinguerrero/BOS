import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { SaleDetailView } from '@/components/modules/sales/sale-detail-view'

export const metadata: Metadata = { title: 'Sale Detail' }

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; saleId: string }>
}) {
  const { businessId, saleId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [saleResult, membershipResult] = await Promise.all([
    supabase
      .from('sales')
      .select(`
        *,
        customers(name, contact_number),
        sale_items(
          id, product_id, quantity, unit_price, total_price,
          product_name_snapshot, product_sku_snapshot,
          products(name, sku)
        )
      `)
      .eq('id', saleId)
      .eq('business_id', businessId)
      .single(),
    supabase
      .from('business_users')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
  ])

  if (!saleResult.data) notFound()

  // Fetch cashier and voider profiles separately (Supabase doesn't support
  // multiple FK aliases to the same table in a single select cleanly)
  const profileIds = [saleResult.data.cashier_id, saleResult.data.voided_by].filter(Boolean) as string[]
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name')
    .in('id', profileIds)

  const profileMap = Object.fromEntries((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))

  const role = (membershipResult.data?.role ?? 'staff') as 'owner' | 'manager' | 'staff'

  return (
    <SaleDetailView
      sale={saleResult.data}
      cashierName={profileMap[saleResult.data.cashier_id] ?? null}
      voiderName={saleResult.data.voided_by ? (profileMap[saleResult.data.voided_by] ?? null) : null}
      businessId={businessId}
      userId={user.id}
      role={role}
    />
  )
}
