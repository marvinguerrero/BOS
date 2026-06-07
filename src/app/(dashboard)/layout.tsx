import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: businessUsers }] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('business_users').select('*, businesses(*)').eq('user_id', user.id).eq('is_active', true),
  ])

  return (
    <AppShell user={user} profile={profile} businessUsers={businessUsers ?? []}>
      {children}
    </AppShell>
  )
}
