import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlusCircle, Store } from 'lucide-react'
import { getBusinessModelLabels } from '@/lib/business-models'
import { PendingInvitationsPanel } from '@/components/people/pending-invitations-panel'
import type { BusinessInvitation } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  type BUWithBiz = {
    role: string
    businesses: { id: string; name: string } | null
  }

  const { data: businessUsers } = await supabase
    .from('business_users')
    .select('role, businesses(id, name)')
    .eq('user_id', user.id)
    .eq('is_active', true) as { data: BUWithBiz[] | null; error: unknown }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invitationQuery = user.email
    ? (supabase as any)
      .from('business_invitations')
      .select('*, business:businesses(id, name), position:positions(*)')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .ilike('email', user.email)
      .order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null })

  const { data: pendingInvitations, error: invitationError } = await invitationQuery

  // TODO: remove after debugging invitation visibility
  console.log('[/dashboard] invitation query', {
    userEmail: user.email,
    userId: user.id,
    count: (pendingInvitations ?? []).length,
    error: invitationError,
    statuses: (pendingInvitations ?? []).map((i: { id: string; status: string; email: string }) => ({
      id: i.id, status: i.status, email: i.email,
    })),
  })

  const invitations = (pendingInvitations ?? []) as BusinessInvitation[]

  const businessIds = (businessUsers ?? [])
    .map(bu => bu.businesses?.id)
    .filter((id): id is string => Boolean(id))

  const { data: modelRows } = businessIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any)
      .from('business_business_models')
      .select('business_id, model_key')
      .in('business_id', businessIds)
    : { data: [] }

  const modelKeysByBusiness = new Map<string, string[]>()
  ;((modelRows ?? []) as { business_id: string; model_key: string }[]).forEach(row => {
    modelKeysByBusiness.set(row.business_id, [
      ...(modelKeysByBusiness.get(row.business_id) ?? []),
      row.model_key,
    ])
  })

  // If user has exactly one active business, redirect to it
  if (businessUsers && businessUsers.length === 1 && businessUsers[0].businesses && invitations.length === 0) {
    redirect(`/${businessUsers[0].businesses.id}/dashboard`)
  }

  // If one or more businesses plus pending invitations, show selector + invites.
  if (businessUsers && businessUsers.length > 0) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <PendingInvitationsPanel initialInvitations={invitations} />
        <h1 className="text-2xl font-bold mb-2">Your Businesses</h1>
        <p className="text-muted-foreground mb-6">Select a business to manage.</p>
        <div className="grid gap-3">
          {businessUsers.map(bu => {
            if (!bu.businesses) return null
            const modelLabels = getBusinessModelLabels(modelKeysByBusiness.get(bu.businesses.id) ?? [])
            return (
              <Link key={bu.businesses.id} href={`/${bu.businesses.id}/dashboard`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{bu.businesses.name}</CardTitle>
                    <CardDescription className="capitalize">
                      {(modelLabels.length > 0 ? modelLabels.join(', ') : 'Business')} · {bu.role}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )
          })}
        </div>
        <div className="mt-4">
          <Link href="/setup/step-1">
            <Button variant="outline" className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Add another business
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // No business yet
  return (
    <div className="max-w-md mx-auto mt-16 text-center">
      <PendingInvitationsPanel initialInvitations={invitations} />
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
        <Store className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Welcome to BOS</h1>
      <p className="text-muted-foreground mb-8">
        You don&apos;t have any businesses yet. Create your first business to get started.
      </p>
      <Link href="/setup/step-1">
        <Button size="lg" className="gap-2">
          <PlusCircle className="h-5 w-5" />
          Create your first business
        </Button>
      </Link>
    </div>
  )
}
