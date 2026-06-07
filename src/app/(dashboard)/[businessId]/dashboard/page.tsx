import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { asQ } from '@/lib/supabase/typed-client'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import type { TemplateConfig, Business, BusinessTemplateKey } from '@/types'

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const q = asQ(supabase)

  const { data: businessData } = await q
    .from('businesses')
    .select('id, name, template_key')
    .eq('id', businessId)
    .single()
  const business = businessData as { id: string; name: string; template_key: BusinessTemplateKey } | null
  if (!business) redirect('/dashboard')

  const { data: templateData } = await q
    .from('templates')
    .select('config')
    .eq('key', business.template_key)
    .single()
  const config = (templateData as { config: TemplateConfig } | null)?.config

  return (
    <DashboardView
      businessId={businessId}
      businessName={business.name}
      templateKey={business.template_key}
      widgets={config?.dashboard_widgets ?? []}
    />
  )
}
