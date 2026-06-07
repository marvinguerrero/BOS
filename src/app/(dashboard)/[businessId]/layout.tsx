import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BusinessProvider } from '@/components/business/business-provider'
import type { TemplateConfig, Business, BusinessModule } from '@/types'

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [membershipResult, businessResult, modulesResult] = await Promise.all([
    supabase.from('business_users').select('role').eq('business_id', businessId).eq('user_id', user.id).eq('is_active', true).single(),
    supabase.from('businesses').select('*').eq('id', businessId).single(),
    supabase.from('business_modules').select('*').eq('business_id', businessId).eq('is_enabled', true),
  ])

  const membership = membershipResult.data as { role: string } | null
  if (!membership) redirect('/dashboard')

  const business = businessResult.data as Business | null
  if (!business) redirect('/dashboard')

  const modules = (modulesResult.data ?? []) as BusinessModule[]

  const { data: templateData } = await supabase
    .from('templates')
    .select('config')
    .eq('key', business.template_key)
    .single()
  const templateConfig = templateData ? (templateData as { config: TemplateConfig }).config : null

  return (
    <BusinessProvider
      business={business}
      role={membership.role as 'owner' | 'manager' | 'staff'}
      modules={modules}
      templateConfig={templateConfig}
    >
      {children}
    </BusinessProvider>
  )
}
