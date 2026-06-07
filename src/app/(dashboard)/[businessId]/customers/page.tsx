import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { CustomersView } from '@/components/modules/customers/customers-view'
import type { FinancialAccount } from '@/types'

export const metadata: Metadata = { title: 'Customers' }

export default async function CustomersPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()

  const [{ data: customers }, { data: accounts }] = await Promise.all([
    supabase.from('customers').select('*').eq('business_id', businessId).eq('is_active', true).order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('financial_accounts').select('id, name, account_type, is_active, sort_order').eq('business_id', businessId).eq('is_active', true).order('sort_order'),
  ])

  return (
    <CustomersView
      businessId={businessId}
      initialCustomers={customers ?? []}
      financialAccounts={(accounts ?? []) as FinancialAccount[]}
    />
  )
}
