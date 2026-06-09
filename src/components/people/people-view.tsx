'use client'

import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Loader2, Mail, Pencil, Plus, RefreshCcw, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { PermissionManagerDialog } from './permission-manager-dialog'
import type { BusinessInvitation, BusinessPerson, Position, RelationshipType, UserRole } from '@/types'

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  owner: 'Owner',
  employee: 'Employee',
  customer: 'Customer',
  tenant: 'Tenant',
  supplier_contact: 'Supplier Contact',
}

const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
}

const RELATIONSHIP_OPTIONS: RelationshipType[] = ['owner', 'employee', 'customer', 'tenant', 'supplier_contact']
const ROLE_OPTIONS: UserRole[] = ['owner', 'manager', 'staff', 'viewer']

interface Props {
  businessId: string
  currentUserId: string
  role: UserRole
  initialPositions: Position[]
  initialPeople: BusinessPerson[]
  initialInvitations: BusinessInvitation[]
}

type AddMode = 'invite' | 'employee'

export function PeopleView({ businessId, currentUserId, role, initialPositions, initialPeople, initialInvitations }: Props) {
  const canManagePeople = role === 'owner'
  const canManageAssignments = role === 'owner' || role === 'manager'
  const [positions, setPositions] = useState(initialPositions)
  const [people, setPeople] = useState(initialPeople)
  const [invitations, setInvitations] = useState(initialInvitations)
  const [positionName, setPositionName] = useState('')
  const [positionDescription, setPositionDescription] = useState('')
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null)
  const [editingPositionName, setEditingPositionName] = useState('')
  const [editingPositionDescription, setEditingPositionDescription] = useState('')
  const [addingPosition, setAddingPosition] = useState(false)
  const [savingPersonId, setSavingPersonId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>('employee')
  const [personName, setPersonName] = useState('')
  const [personEmail, setPersonEmail] = useState('')
  const [personMobile, setPersonMobile] = useState('')
  const [personRelationship, setPersonRelationship] = useState<RelationshipType>('employee')
  const [personRole, setPersonRole] = useState<UserRole>('staff')
  const [personPositionId, setPersonPositionId] = useState('')
  const [addingPerson, setAddingPerson] = useState(false)
  const [personProfileId, setPersonProfileId] = useState('')
  const [inviteProfiles, setInviteProfiles] = useState<{ id: string; name: string }[]>([])
  const [permTarget, setPermTarget] = useState<{
    businessUserId: string
    personName: string
    role: UserRole
  } | null>(null)

  // Load permission profiles when invite dialog opens
  const loadInviteProfiles = () => {
    if (inviteProfiles.length > 0) return
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('permission_profiles')
      .select('id, name, sort_order')
      .or(`business_id.is.null,business_id.eq.${businessId}`)
      .order('sort_order')
      .then(({ data }: { data: { id: string; name: string; sort_order: number }[] | null }) => {
        if (data) setInviteProfiles(data)
      })
  }

  const activePositions = useMemo(() => positions.filter(position => position.is_active), [positions])
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name)),
    [people]
  )

  const recordAudit = async (
    tableName: string,
    recordId: string,
    oldData: Record<string, unknown> | null,
    newData: Record<string, unknown>
  ) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('audit_logs').insert({
      business_id: businessId,
      user_id: user.id,
      action: oldData ? 'update' : 'create',
      table_name: tableName,
      record_id: recordId,
      old_data: oldData,
      new_data: newData,
    })
  }

  const notifyPerson = async (person: BusinessPerson, title: string, message: string, metadata: Record<string, unknown>) => {
    if (!person.user_id) return
    const supabase = createClient()
    await supabase.from('notifications').insert({
      business_id: businessId,
      user_id: person.user_id,
      type: 'people_update',
      title,
      message,
      metadata,
    })
  }
  const invitationsByStatus = useMemo(() => ({
    pending: invitations.filter(invitation => invitation.status === 'pending'),
    accepted: invitations.filter(invitation => invitation.status === 'accepted'),
    declined: invitations.filter(invitation => invitation.status === 'declined'),
    expired: invitations.filter(invitation => invitation.status === 'expired'),
  }), [invitations])

  const resetPersonForm = () => {
    setPersonName('')
    setPersonEmail('')
    setPersonMobile('')
    setPersonRelationship('employee')
    setPersonRole('staff')
    setPersonPositionId('')
    setPersonProfileId('')
    setAddMode('employee')
  }

  const addPosition = async () => {
    const name = positionName.trim()
    if (!name) return
    setAddingPosition(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('positions')
      .insert({
        business_id: businessId,
        name,
        description: positionDescription.trim() || null,
      })
      .select()
      .single()
    setAddingPosition(false)

    if (error) {
      toast.error(error.message)
      return
    }

    setPositions(prev => [...prev, data as Position].sort((a, b) => a.name.localeCompare(b.name)))
    setPositionName('')
    setPositionDescription('')
    toast.success('Position added')
  }

  const togglePosition = async (position: Position) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('positions')
      .update({ is_active: !position.is_active })
      .eq('id', position.id)
    if (error) {
      toast.error(error.message)
      return
    }
    setPositions(prev => prev.map(item => item.id === position.id ? { ...item, is_active: !item.is_active } : item))
    toast.success(position.is_active ? 'Position archived' : 'Position restored')
  }

  const startEditingPosition = (position: Position) => {
    setEditingPositionId(position.id)
    setEditingPositionName(position.name)
    setEditingPositionDescription(position.description ?? '')
  }

  const updatePosition = async (position: Position) => {
    const name = editingPositionName.trim()
    if (!name) return
    const supabase = createClient()
    const { error } = await supabase
      .from('positions')
      .update({
        name,
        description: editingPositionDescription.trim() || null,
      })
      .eq('id', position.id)
    if (error) {
      toast.error(error.message)
      return
    }
    setPositions(prev => prev.map(item =>
      item.id === position.id
        ? { ...item, name, description: editingPositionDescription.trim() || null }
        : item
    ))
    setEditingPositionId(null)
    toast.success('Position updated')
  }

  const updatePerson = async (person: BusinessPerson, patch: Partial<BusinessPerson>) => {
    if (!canManageAssignments) return
    if ('is_active' in patch && person.role === 'owner' && person.is_active && !patch.is_active) {
      const activeOwners = people.filter(item => item.role === 'owner' && item.is_active).length
      if (activeOwners <= 1) {
        toast.error('At least one active owner must remain.')
        return
      }
    }
    setSavingPersonId(person.id)
    const supabase = createClient()
    const nextPosition = positions.find(position => position.id === patch.position_id) ?? null

    if (person.business_user_id) {
      const userPatch: Record<string, unknown> = {}
      if (patch.relationship_type) userPatch.relationship_type = patch.relationship_type
      if (patch.role && canManagePeople) userPatch.role = patch.role
      if ('position_id' in patch) userPatch.position_id = patch.position_id || null
      if ('is_active' in patch && canManagePeople) {
        userPatch.is_active = patch.is_active
        userPatch.membership_status = patch.is_active ? 'active' : 'inactive'
      }

      const { error: memberError } = await supabase
        .from('business_users')
        .update(userPatch)
        .eq('id', person.business_user_id)
      if (memberError) {
        setSavingPersonId(null)
        toast.error(memberError.message)
        return
      }
    }

    const personPatch: Record<string, unknown> = { ...patch }
    if (patch.position_id === '') personPatch.position_id = null
    if ('is_active' in patch) personPatch.status = patch.is_active ? 'active' : 'inactive'

    const { error } = await supabase
      .from('business_people')
      .update(personPatch)
      .eq('id', person.id)

    setSavingPersonId(null)
    if (error) {
      toast.error(error.message)
      return
    }

    setPeople(prev => prev.map(item =>
      item.id === person.id
        ? { ...item, ...patch, position: nextPosition }
        : item
    ))

    await recordAudit('business_people', person.id, {
      relationship_type: person.relationship_type,
      role: person.role,
      position_id: person.position_id,
      is_active: person.is_active,
      status: person.status,
    }, {
      relationship_type: patch.relationship_type ?? person.relationship_type,
      role: patch.role ?? person.role,
      position_id: 'position_id' in patch ? patch.position_id : person.position_id,
      is_active: 'is_active' in patch ? patch.is_active : person.is_active,
      status: 'is_active' in patch ? (patch.is_active ? 'active' : 'inactive') : person.status,
    })

    if (patch.role && patch.role !== person.role) {
      await notifyPerson(person, 'Role changed', `Your role was changed to ${ROLE_LABELS[patch.role]}.`, { role: patch.role })
    }
    if ('position_id' in patch && patch.position_id !== person.position_id) {
      await notifyPerson(person, 'Position changed', `Your position was changed to ${nextPosition?.name ?? 'No position'}.`, { position_id: patch.position_id })
    }
    if ('is_active' in patch && patch.is_active !== person.is_active) {
      await notifyPerson(
        person,
        patch.is_active ? 'Account activated' : 'Account deactivated',
        patch.is_active ? 'Your business access was restored.' : 'Your business access was suspended.',
        { is_active: patch.is_active }
      )
    }
  }

  const addPerson = async () => {
    const name = personName.trim()
    const email = personEmail.trim().toLowerCase()
    if (!name && addMode === 'employee') return
    if (addMode === 'invite' && !email) {
      toast.error('Email is required for invitations.')
      return
    }
    setAddingPerson(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAddingPerson(false)
      toast.error('You must be signed in to send invitations.')
      return
    }

    if (addMode === 'invite') {
      const invitationPayload = {
        business_id: businessId,
        email,
        relationship_type: personRelationship,
        role: personRole,
        position_id: personPositionId || null,
        permission_profile_id: personProfileId || null,
        created_by: user.id,
        email_delivery_status: 'not_configured',
      }
      const { data: invitation, error: invitationError } = await supabase
        .from('business_invitations')
        .insert(invitationPayload)
        .select('*, position:positions(*)')
        .single()

      if (invitationError) {
        setAddingPerson(false)
        toast.error(invitationError.message)
        return
      }

      const { data: pendingPerson } = await supabase
        .from('business_people')
        .insert({
          business_id: businessId,
          name: name || email,
          email,
          mobile_number: personMobile.trim() || null,
          relationship_type: personRelationship,
          role: personRole,
          position_id: personPositionId || null,
          invite_status: 'pending',
          status: 'invited',
          is_active: true,
          metadata: { source: 'business_invitation', invitation_id: invitation.id },
        })
        .select('*, positions(*)')
        .single()

      setInvitations(prev => [invitation as BusinessInvitation, ...prev])
      await recordAudit('business_invitations', invitation.id, null, {
        event: 'invitation_sent',
        email,
        relationship_type: personRelationship,
        role: personRole,
        position_id: personPositionId || null,
      })
      if (pendingPerson) {
        const inserted = pendingPerson as BusinessPerson & { positions?: Position | null }
        setPeople(prev => [...prev, { ...inserted, position: inserted.positions ?? null }])
      }
      setAddingPerson(false)
      resetPersonForm()
      setDialogOpen(false)
      toast.success('Invitation created')
      return
    }

    const payload = {
      business_id: businessId,
      name,
      email: email || null,
      mobile_number: personMobile.trim() || null,
      relationship_type: personRelationship,
      role: null,
      position_id: personPositionId || null,
      invite_status: 'none',
      status: 'active',
      metadata: { source: 'employee_record' },
    }

    const { data, error } = await supabase
      .from('business_people')
      .insert(payload)
      .select('*, positions(*)')
      .single()
    setAddingPerson(false)

    if (error) {
      toast.error(error.message)
      return
    }

    const inserted = data as BusinessPerson & { positions?: Position | null }
    setPeople(prev => [...prev, { ...inserted, position: inserted.positions ?? null }])
    resetPersonForm()
    setDialogOpen(false)
    toast.success('Employee record created')
  }

  const updateInvitation = async (invitation: BusinessInvitation, status: 'pending' | 'cancelled') => {
    const supabase = createClient()
    const nextExpiry = new Date()
    nextExpiry.setDate(nextExpiry.getDate() + 7)
    const patch = status === 'pending'
      ? {
          status,
          expires_at: nextExpiry.toISOString(),
          email_delivery_status: 'not_configured',
        }
      : { status }

    const { data, error } = await supabase
      .from('business_invitations')
      .update(patch)
      .eq('id', invitation.id)
      .select('*, position:positions(*)')
      .single()
    if (error) {
      toast.error(error.message)
      return
    }
    setInvitations(prev => prev.map(item => item.id === invitation.id ? data as BusinessInvitation : item))
    await recordAudit('business_invitations', invitation.id, {
      status: invitation.status,
      expires_at: invitation.expires_at,
    }, {
      event: status === 'pending' ? 'invitation_resent' : 'invitation_cancelled',
      status: data.status,
      expires_at: data.expires_at,
    })
    toast.success(status === 'pending' ? 'Invitation resent' : 'Invitation cancelled')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            People, roles, relationships, and positions for this business.
          </p>
        </div>
        {canManagePeople && (
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add Person
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Custom job titles used for assignments, scheduling, and payroll planning.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManagePeople && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input placeholder="Position name" value={positionName} onChange={e => setPositionName(e.target.value)} />
              <Input placeholder="Description" value={positionDescription} onChange={e => setPositionDescription(e.target.value)} />
              <Button onClick={addPosition} disabled={!positionName.trim() || addingPosition}>
                {addingPosition ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {positions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No positions yet.</p>
            ) : positions.map(position => (
              <div key={position.id} className="flex items-center gap-3 rounded-lg border p-3">
                {editingPositionId === position.id ? (
                  <>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input value={editingPositionName} onChange={e => setEditingPositionName(e.target.value)} className="h-8" />
                      <Input value={editingPositionDescription} onChange={e => setEditingPositionDescription(e.target.value)} className="h-8" />
                    </div>
                    <Button size="sm" onClick={() => updatePosition(position)} disabled={!editingPositionName.trim()}>
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{position.name}</p>
                      {position.description && <p className="text-xs text-muted-foreground truncate">{position.description}</p>}
                    </div>
                    {!position.is_active && <Badge variant="outline">Archived</Badge>}
                    {canManagePeople && (
                      <>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => startEditingPosition(position)}
                          aria-label="Edit position"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => togglePosition(position)}
                          aria-label={position.is_active ? 'Archive position' : 'Restore position'}
                        >
                          {position.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            People
          </CardTitle>
          <CardDescription>Roles control access. Relationships and positions describe business context and work.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Relationship</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPeople.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No people found</TableCell>
                </TableRow>
              ) : sortedPeople.map(person => {
                const isSaving = savingPersonId === person.id
                const isSelf = person.user_id === currentUserId
                return (
                  <TableRow key={person.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{person.name}</p>
                        <p className="text-xs text-muted-foreground">{person.email ?? person.mobile_number ?? '—'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManagePeople ? (
                        <Select
                          value={person.relationship_type}
                          onValueChange={(value: string | null) => updatePerson(person, { relationship_type: (value ?? 'employee') as RelationshipType })}
                          disabled={isSaving}
                        >
                          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RELATIONSHIP_OPTIONS.map(option => (
                              <SelectItem key={option} value={option}>{RELATIONSHIP_LABELS[option]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : RELATIONSHIP_LABELS[person.relationship_type]}
                    </TableCell>
                    <TableCell>
                      {person.business_user_id && canManagePeople ? (
                        <Select
                          value={person.role ?? 'staff'}
                          onValueChange={(value: string | null) => updatePerson(person, { role: (value ?? 'staff') as UserRole })}
                          disabled={isSaving || isSelf}
                        >
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map(option => (
                              <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : person.role ? ROLE_LABELS[person.role] : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {canManageAssignments ? (
                        <Select
                          value={person.position_id ?? ''}
                          onValueChange={(value: string | null) => updatePerson(person, { position_id: value || null })}
                          disabled={isSaving}
                        >
                          <SelectTrigger className="h-8 w-44"><SelectValue placeholder="No position" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">No position</SelectItem>
                            {activePositions.map(position => (
                              <SelectItem key={position.id} value={position.id}>{position.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : person.position?.name ?? 'N/A'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={person.is_active ? 'secondary' : 'outline'}>
                          {person.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {person.invite_status === 'pending' && <Badge variant="outline">Pending Invite</Badge>}
                        {canManagePeople && !isSelf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={isSaving}
                            onClick={() => updatePerson(person, { is_active: !person.is_active })}
                          >
                            {person.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                        {canManagePeople && !isSelf && person.business_user_id && person.role !== 'owner' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setPermTarget({
                              businessUserId: person.business_user_id!,
                              personName: person.name,
                              role: person.role ?? 'staff',
                            })}
                          >
                            <ShieldCheck className="h-3 w-3" />
                            Permissions
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManagePeople && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Invitations
            </CardTitle>
            <CardDescription>Invitation records remain visible after users accept, decline, or expire.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invitations yet.</p>
            ) : (['pending', 'accepted', 'declined', 'expired'] as const).map(status => {
              const rows = invitationsByStatus[status]
              if (rows.length === 0) return null
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{status}</p>
                    <Badge variant="outline">{rows.length}</Badge>
                  </div>
                  {rows.map(invitation => (
                    <div key={invitation.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{invitation.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {RELATIONSHIP_LABELS[invitation.relationship_type]} · {ROLE_LABELS[invitation.role]}
                          {invitation.position?.name ? ` · ${invitation.position.name}` : ''}
                        </p>
                      </div>
                      <Badge variant="outline">{invitation.status}</Badge>
                      {invitation.status === 'pending' && (
                        <>
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => updateInvitation(invitation, 'pending')}>
                            <RefreshCcw className="h-3.5 w-3.5" />
                            Resend
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1" onClick={() => updateInvitation(invitation, 'cancelled')}>
                            <X className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {permTarget && (
        <PermissionManagerDialog
          open={permTarget !== null}
          onOpenChange={(open) => { if (!open) setPermTarget(null) }}
          businessId={businessId}
          businessUserId={permTarget.businessUserId}
          personName={permTarget.personName}
          currentRole={permTarget.role}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetPersonForm() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Person</DialogTitle>
            <DialogDescription>Create a business person record, with or without BOS login access.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={addMode === 'employee' ? 'default' : 'outline'} onClick={() => setAddMode('employee')}>
                Employee Record
              </Button>
              <Button type="button" variant={addMode === 'invite' ? 'default' : 'outline'} onClick={() => { setAddMode('invite'); loadInviteProfiles() }}>
                Invite Person
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name{addMode === 'employee' ? '' : ' Optional'}</Label>
                <Input value={personName} onChange={e => setPersonName(e.target.value)} placeholder="John Santos" />
              </div>
              <div className="space-y-2">
                <Label>Email{addMode === 'invite' ? ' *' : ''}</Label>
                <Input type="email" value={personEmail} onChange={e => setPersonEmail(e.target.value)} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <Input value={personMobile} onChange={e => setPersonMobile(e.target.value)} placeholder="09XXXXXXXXX" />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={personRelationship} onValueChange={(value: string | null) => setPersonRelationship((value ?? 'employee') as RelationshipType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map(option => (
                      <SelectItem key={option} value={option}>{RELATIONSHIP_LABELS[option]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addMode === 'invite' && (
                <>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={personRole} onValueChange={(value: string | null) => setPersonRole((value ?? 'staff') as UserRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.filter(option => option !== 'owner').map(option => (
                          <SelectItem key={option} value={option}>{ROLE_LABELS[option]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Permission Profile</Label>
                    <Select
                      value={personProfileId || '__none__'}
                      onValueChange={(value: string | null) => setPersonProfileId(value === '__none__' ? '' : (value ?? ''))}
                      onOpenChange={(open) => { if (open) loadInviteProfiles() }}
                    >
                      <SelectTrigger><SelectValue placeholder="None — use role defaults" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None — use role defaults</SelectItem>
                        {inviteProfiles.map(profile => (
                          <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Position</Label>
                <Select value={personPositionId} onValueChange={(value: string | null) => setPersonPositionId(value ?? '')}>
                  <SelectTrigger><SelectValue placeholder="No position" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No position</SelectItem>
                    {activePositions.map(position => (
                      <SelectItem key={position.id} value={position.id}>{position.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Textarea
              readOnly
              value={addMode === 'invite'
                ? 'Creates a pending business invitation. Email delivery is marked not configured until SMTP/Edge Function delivery is connected.'
                : 'Creates an internal employee/person record. No customer record or BOS user is created.'}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={addPerson} disabled={(addMode === 'employee' ? !personName.trim() : !personEmail.trim()) || addingPerson}>
              {addingPerson && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {addMode === 'invite' ? 'Send Invitation' : 'Add Person'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
