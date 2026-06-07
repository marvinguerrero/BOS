import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { POSView } from '@/components/modules/sales/pos-view'
import type { FinancialAccount } from '@/types'

export const metadata: Metadata = { title: 'New Sale' }

export default async function NewSalePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()

  const [{ data: products }, { data: customers }, { data: accounts }] = await Promise.all([
    supabase.from('products').select('*').eq('business_id', businessId).eq('is_active', true).gt('stock_quantity', 0).order('name'),
    supabase.from('customers').select('id, name, outstanding_balance').eq('business_id', businessId).eq('is_active', true).order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('financial_accounts').select('*').eq('business_id', businessId).eq('is_active', true).order('sort_order'),
  ])

  return (
    <POSView
      businessId={businessId}
      products={products ?? []}
      customers={customers ?? []}
      financialAccounts={(accounts ?? []) as FinancialAccount[]}
    />
  )
}
