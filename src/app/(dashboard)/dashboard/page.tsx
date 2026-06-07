import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PlusCircle, Store } from 'lucide-react'

// Maps legacy template_key to the new business model display label.
// template_key is kept in the DB for backward compat but never shown raw to users.
const TEMPLATE_TO_MODEL_LABEL: Record<string, string> = {
  sari_sari:   'Retail',
  laundry:     'Service',
  room_rental: 'Rental',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  type BUWithBiz = {
    role: string
    businesses: { id: string; name: string; template_key: string } | null
  }

  const { data: businessUsers } = await supabase
    .from('business_users')
    .select('role, businesses(id, name, template_key)')
    .eq('user_id', user.id)
    .eq('is_active', true) as { data: BUWithBiz[] | null; error: unknown }

  // If user has exactly one active business, redirect to it
  if (businessUsers && businessUsers.length === 1 && businessUsers[0].businesses) {
    redirect(`/${businessUsers[0].businesses.id}/dashboard`)
  }

  // If multiple businesses, show selector
  if (businessUsers && businessUsers.length > 1) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <h1 className="text-2xl font-bold mb-2">Your Businesses</h1>
        <p className="text-muted-foreground mb-6">Select a business to manage.</p>
        <div className="grid gap-3">
          {businessUsers.map((bu, i) => {
            if (!bu.businesses) return null
            return (
              <Link key={bu.businesses.id} href={`/${bu.businesses.id}/dashboard`}>
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{bu.businesses.name}</CardTitle>
                    <CardDescription className="capitalize">
                      {TEMPLATE_TO_MODEL_LABEL[bu.businesses.template_key] ?? 'Business'} · {bu.role}
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
