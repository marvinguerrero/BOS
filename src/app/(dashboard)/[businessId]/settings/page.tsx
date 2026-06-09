import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsView } from '@/components/business/settings-view'
import type { UserRole, FinancialAccount } from '@/types'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [businessResult, profileResult, membershipResult, modelsResult, accountsResult] = await Promise.all([
    supabase.from('businesses').select('id, name, address, contact_number').eq('id', businessId).single(),
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('business_users').select('role').eq('business_id', businessId).eq('user_id', user.id).eq('is_active', true).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('business_business_models').select('model_key').eq('business_id', businessId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('financial_accounts').select('*').eq('business_id', businessId).order('sort_order'),
  ])

  if (!businessResult.data) redirect('/dashboard')

  const currentModelKeys: string[] = ((modelsResult as { data: { model_key: string }[] | null }).data ?? [])
    .map(r => r.model_key)

  const financialAccounts: FinancialAccount[] = (accountsResult as { data: FinancialAccount[] | null }).data ?? []

  const role = (membershipResult.data?.role ?? 'staff') as UserRole

  const { data: canView } = await supabase.rpc('has_permission', {
    p_business_id: businessId,
    p_permission_key: 'settings.view',
  })
  if (!canView) redirect(`/${businessId}/dashboard`)

  return (
    <SettingsView
      business={businessResult.data}
      profile={profileResult.data}
      userId={user.id}
      role={role}
      currentModelKeys={currentModelKeys}
      financialAccounts={financialAccounts}
    />
  )
}
