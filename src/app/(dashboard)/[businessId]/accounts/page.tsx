import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountsOverview } from '@/components/modules/financial/accounts-overview'
import type { FinancialAccount } from '@/types'

export const metadata: Metadata = { title: 'Financial Accounts' }

export default async function AccountsPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (supabase as any)
    .from('financial_accounts')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order') as { data: FinancialAccount[] | null }

  const membershipResult = await supabase
    .from('business_users')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!membershipResult.data) redirect('/dashboard')

  const { data: canView } = await supabase.rpc('has_permission', {
    p_business_id: businessId,
    p_permission_key: 'financial_accounts.view',
  })
  if (!canView) redirect(`/${businessId}/dashboard`)

  return (
    <AccountsOverview
      businessId={businessId}
      accounts={accounts ?? []}
      role={membershipResult.data.role as 'owner' | 'manager' | 'staff'}
    />
  )
}
