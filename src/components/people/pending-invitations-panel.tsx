'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import type { BusinessInvitation } from '@/types'

const RELATIONSHIP_LABELS: Record<string, string> = {
  owner: 'Owner',
  employee: 'Employee',
  customer: 'Customer',
  tenant: 'Tenant',
  supplier_contact: 'Supplier Contact',
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
}

interface Props {
  initialInvitations: BusinessInvitation[]
}

export function PendingInvitationsPanel({ initialInvitations }: Props) {
  const router = useRouter()
  const [invitations, setInvitations] = useState(initialInvitations)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const respond = async (invitation: BusinessInvitation, action: 'accept' | 'decline') => {
    setLoadingId(invitation.id)
    const supabase = createClient()
    const rpcName = action === 'accept' ? 'accept_business_invitation' : 'decline_business_invitation'
    const { error } = await supabase.rpc(rpcName, { p_invitation_id: invitation.id })
    setLoadingId(null)

    if (error) {
      toast.error(error.message)
      return
    }

    setInvitations(prev => prev.filter(item => item.id !== invitation.id))
    toast.success(action === 'accept' ? 'Invitation accepted' : 'Invitation declined')

    if (action === 'accept') {
      router.push(`/${invitation.business_id}/dashboard`)
      router.refresh()
    }
  }

  if (invitations.length === 0) return null

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Business Invitations</CardTitle>
        <CardDescription>You have been invited to join a business in BOS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map(invitation => {
          const isLoading = loadingId === invitation.id
          return (
            <div key={invitation.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{invitation.business?.name ?? 'Business'}</p>
                <p className="text-sm text-muted-foreground">
                  {RELATIONSHIP_LABELS[invitation.relationship_type]} · {ROLE_LABELS[invitation.role]}
                  {invitation.position?.name ? ` · ${invitation.position.name}` : ''}
                </p>
              </div>
              <Badge variant="outline">Invited</Badge>
              <div className="flex gap-2">
                <Button size="sm" className="gap-1" disabled={isLoading} onClick={() => respond(invitation, 'accept')}>
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Accept
                </Button>
                <Button size="sm" variant="outline" className="gap-1" disabled={isLoading} onClick={() => respond(invitation, 'decline')}>
                  <XCircle className="h-3.5 w-3.5" />
                  Decline
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
