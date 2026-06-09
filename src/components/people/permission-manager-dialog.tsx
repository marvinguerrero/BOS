'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import type { UserRole } from '@/types'

// ─── Permission catalogue ──────────────────────────────────────────────────

interface PermDef { key: string; label: string }
interface Group    { label: string; perms: PermDef[] }

const PERMISSION_GROUPS: Group[] = [
  {
    label: 'Dashboard',
    perms: [{ key: 'dashboard.view', label: 'View Dashboard' }],
  },
  {
    label: 'Sales',
    perms: [
      { key: 'sales.view',   label: 'View Sales' },
      { key: 'sales.create', label: 'Create Sales' },
      { key: 'sales.update', label: 'Edit Sales' },
      { key: 'sales.delete', label: 'Void / Delete Sales' },
    ],
  },
  {
    label: 'Orders',
    perms: [
      { key: 'orders.view',   label: 'View Orders' },
      { key: 'orders.create', label: 'Create Orders' },
      { key: 'orders.update', label: 'Update Orders' },
      { key: 'orders.delete', label: 'Delete Orders' },
    ],
  },
  {
    label: 'Customers',
    perms: [
      { key: 'customers.view',   label: 'View Customers' },
      { key: 'customers.create', label: 'Add Customers' },
      { key: 'customers.update', label: 'Edit Customers' },
      { key: 'customers.delete', label: 'Delete Customers' },
    ],
  },
  {
    label: 'Inventory',
    perms: [
      { key: 'inventory.view',   label: 'View Inventory' },
      { key: 'inventory.create', label: 'Add Products' },
      { key: 'inventory.update', label: 'Edit Products' },
      { key: 'inventory.delete', label: 'Delete Products' },
    ],
  },
  {
    label: 'Reports',
    perms: [{ key: 'reports.view', label: 'View Reports' }],
  },
  {
    label: 'Financial Accounts',
    perms: [
      { key: 'financial_accounts.view',   label: 'View Balances & Transactions' },
      { key: 'financial_accounts.create', label: 'Add Accounts' },
      { key: 'financial_accounts.update', label: 'Edit Accounts' },
      { key: 'financial_accounts.delete', label: 'Archive Accounts' },
    ],
  },
  {
    label: 'People / Team',
    perms: [
      { key: 'people.view',   label: 'View Team' },
      { key: 'people.create', label: 'Invite Members' },
      { key: 'people.update', label: 'Manage Roles & Positions' },
      { key: 'people.delete', label: 'Remove Members' },
    ],
  },
  {
    label: 'Settings',
    perms: [
      { key: 'settings.view',   label: 'View Settings' },
      { key: 'settings.update', label: 'Edit Settings' },
    ],
  },
]

const ALL_KEYS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key))

// ─── Types ─────────────────────────────────────────────────────────────────

interface PermissionProfile {
  id: string
  name: string
  description: string | null
  is_system: boolean
  sort_order: number
}

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  businessId: string
  businessUserId: string
  personName: string
  currentRole: UserRole
}

// ─── Component ─────────────────────────────────────────────────────────────

export function PermissionManagerDialog({
  open,
  onOpenChange,
  businessId,
  businessUserId,
  personName,
  currentRole,
}: Props) {
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [resetting, setResetting] = useState(false)

  // Available profiles (system + this business's custom)
  const [profiles, setProfiles] = useState<PermissionProfile[]>([])
  // profileId → Set of permission keys granted by that profile
  const [profileGrantsMap, setProfileGrantsMap] = useState<Record<string, Set<string>>>({})

  // Profile assignment state
  const [originalProfileId, setOriginalProfileId] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  // Role permission defaults (fallback when no profile assigned)
  const [roleDefaults, setRoleDefaults] = useState<Record<string, boolean>>({})
  // Individual overrides from DB (key → granted)
  const [dbOverrides, setDbOverrides] = useState<Record<string, boolean>>({})
  // What the checkboxes currently show
  const [desired, setDesired]     = useState<Record<string, boolean>>({})

  // Base defaults: profile grants if profile selected, else role defaults
  const baseDefaults = useMemo<Record<string, boolean>>(() => {
    if (selectedProfileId && profileGrantsMap[selectedProfileId]) {
      const base: Record<string, boolean> = {}
      for (const key of ALL_KEYS) base[key] = false
      for (const key of profileGrantsMap[selectedProfileId]) {
        if (ALL_KEYS.includes(key)) base[key] = true
      }
      return base
    }
    return roleDefaults
  }, [selectedProfileId, profileGrantsMap, roleDefaults])

  const profileChanged    = selectedProfileId !== originalProfileId
  const overridesDirty    = ALL_KEYS.some(k => desired[k] !== ((dbOverrides[k] !== undefined ? dbOverrides[k] : baseDefaults[k]) ?? false))
  const isDirty           = profileChanged || overridesDirty

  // ── Load data on open ────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    setLoading(true)

    const supabase = createClient()
    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('permission_profiles')
        .select('id, name, description, is_system, sort_order')
        .or(`business_id.is.null,business_id.eq.${businessId}`)
        .order('sort_order'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('permission_profile_grants')
        .select('profile_id, permission_key'),
      // Current profile assignment
      supabase
        .from('business_users')
        .select('permission_profile_id')
        .eq('id', businessUserId)
        .single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('role_permissions')
        .select('permission_key')
        .eq('role', currentRole),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('business_user_permissions')
        .select('permission_key, granted')
        .eq('business_user_id', businessUserId),
    ]).then(([profilesResult, grantsResult, memberResult, roleResult, overrideResult]) => {
      const loadedProfiles = (profilesResult.data ?? []) as PermissionProfile[]
      setProfiles(loadedProfiles)

      // Build profileId → Set<key>
      const gmap: Record<string, Set<string>> = {}
      for (const row of (grantsResult.data ?? []) as { profile_id: string; permission_key: string }[]) {
        if (!gmap[row.profile_id]) gmap[row.profile_id] = new Set()
        gmap[row.profile_id].add(row.permission_key)
      }
      setProfileGrantsMap(gmap)

      // Current profile assignment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentProfileId = (memberResult.data as any)?.permission_profile_id ?? null
      setOriginalProfileId(currentProfileId)
      setSelectedProfileId(currentProfileId)

      // Role defaults
      const defaults: Record<string, boolean> = {}
      for (const key of ALL_KEYS) defaults[key] = false
      for (const row of (roleResult.data ?? []) as { permission_key: string }[]) {
        defaults[row.permission_key] = true
      }
      setRoleDefaults(defaults)

      // Individual overrides
      const overrides: Record<string, boolean> = {}
      for (const row of (overrideResult.data ?? []) as { permission_key: string; granted: boolean }[]) {
        overrides[row.permission_key] = row.granted
      }
      setDbOverrides(overrides)

      // Initial desired = base (profile or role) + individual overrides
      const base: Record<string, boolean> = {}
      if (currentProfileId && gmap[currentProfileId]) {
        for (const key of ALL_KEYS) base[key] = false
        for (const key of gmap[currentProfileId]) {
          if (ALL_KEYS.includes(key)) base[key] = true
        }
      } else {
        Object.assign(base, defaults)
      }

      const initial: Record<string, boolean> = {}
      for (const key of ALL_KEYS) {
        initial[key] = overrides[key] !== undefined ? overrides[key] : base[key]
      }
      setDesired(initial)
      setLoading(false)
    })
  }, [open, businessId, businessUserId, currentRole])

  // ── When profile changes, reset desired to profile base (+ existing overrides) ──

  const handleProfileChange = (value: string | null) => {
    const newProfileId = !value || value === '__none__' ? null : value
    setSelectedProfileId(newProfileId)

    // Re-initialize desired: new base + keep existing DB overrides
    const newBase: Record<string, boolean> = {}
    if (newProfileId && profileGrantsMap[newProfileId]) {
      for (const key of ALL_KEYS) newBase[key] = false
      for (const key of profileGrantsMap[newProfileId]) {
        if (ALL_KEYS.includes(key)) newBase[key] = true
      }
    } else {
      Object.assign(newBase, roleDefaults)
    }

    const initial: Record<string, boolean> = {}
    for (const key of ALL_KEYS) {
      initial[key] = dbOverrides[key] !== undefined ? dbOverrides[key] : newBase[key]
    }
    setDesired(initial)
  }

  // ── Toggle a single permission ─────────────────────────────────────────

  const toggle = (key: string) => {
    setDesired(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Save ───────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true)
    const supabase = createClient()
    const ops: Promise<unknown>[] = []

    // 1. Update profile assignment on business_users if changed
    if (profileChanged) {
      ops.push(
        supabase
          .from('business_users')
          .update({ permission_profile_id: selectedProfileId } as never)
          .eq('id', businessUserId)
      )
    }

    // 2. Compute individual overrides vs. the new base
    const toUpsert: { business_user_id: string; permission_key: string; granted: boolean }[] = []
    const toDelete: string[] = []

    for (const key of ALL_KEYS) {
      const want = desired[key] ?? false
      const base = baseDefaults[key] ?? false

      if (want !== base) {
        toUpsert.push({ business_user_id: businessUserId, permission_key: key, granted: want })
      } else {
        toDelete.push(key)
      }
    }

    if (toUpsert.length > 0) {
      ops.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('business_user_permissions')
          .upsert(toUpsert, { onConflict: 'business_user_id,permission_key' })
      )
    }
    if (toDelete.length > 0) {
      ops.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('business_user_permissions')
          .delete()
          .eq('business_user_id', businessUserId)
          .in('permission_key', toDelete)
      )
    }

    const results = await Promise.all(ops)
    setSaving(false)

    const failed = results.some((r: unknown) => (r as { error: unknown }).error)
    if (failed) {
      toast.error('Failed to save permissions')
      return
    }

    // Refresh local state
    setOriginalProfileId(selectedProfileId)
    const newOverrides: Record<string, boolean> = {}
    for (const key of ALL_KEYS) {
      if (desired[key] !== (baseDefaults[key] ?? false)) {
        newOverrides[key] = desired[key] ?? false
      }
    }
    setDbOverrides(newOverrides)
    toast.success('Permissions saved')
    onOpenChange(false)
  }

  // ── Reset individual adjustments ───────────────────────────────────────

  const resetAdjustments = async () => {
    setResetting(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('business_user_permissions')
      .delete()
      .eq('business_user_id', businessUserId)
    setResetting(false)

    if (error) {
      toast.error('Failed to reset adjustments')
      return
    }

    setDbOverrides({})
    const reset: Record<string, boolean> = {}
    for (const key of ALL_KEYS) reset[key] = baseDefaults[key] ?? false
    setDesired(reset)
    toast.success('Individual adjustments cleared')
  }

  const ROLE_LABEL: Record<UserRole, string> = {
    owner: 'Owner', manager: 'Manager', staff: 'Staff', viewer: 'Viewer',
  }

  const hasAnyOverride = Object.keys(dbOverrides).length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Manage Permissions
          </DialogTitle>
          <DialogDescription>
            {personName} · <span className="font-medium">{ROLE_LABEL[currentRole]}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-5">
          {/* ── Profile selector ───────────────────────────────────────── */}
          <div className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Permission Profile
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Profiles are named permission bundles. Individual adjustments below override the profile.
            </p>
            {loading ? (
              <div className="h-9 bg-muted rounded animate-pulse" />
            ) : (
              <Select
                value={selectedProfileId ?? '__none__'}
                onValueChange={handleProfileChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None — use role defaults" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None — use role defaults</SelectItem>
                  {profiles.map(profile => (
                    <SelectItem key={profile.id} value={profile.id}>
                      <span className="font-medium">{profile.name}</span>
                      {profile.description && (
                        <span className="ml-2 text-xs text-muted-foreground">{profile.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {profileChanged && (
              <p className="text-xs text-amber-600 mt-1">Profile changed — save to apply</p>
            )}
          </div>

          {/* ── Individual adjustments ──────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Individual Adjustments
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Override specific permissions on top of the profile (or role defaults).
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-5">
                {PERMISSION_GROUPS.map(group => {
                  const visiblePerms = group.perms.filter(p => ALL_KEYS.includes(p.key))
                  if (visiblePerms.length === 0) return null
                  return (
                    <div key={group.label}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        {group.label}
                      </p>
                      <div className="space-y-1.5">
                        {visiblePerms.map(perm => {
                          const isGranted    = desired[perm.key] ?? false
                          const isBase       = (desired[perm.key] ?? false) === (baseDefaults[perm.key] ?? false)
                          const hasDbOverride = dbOverrides[perm.key] !== undefined

                          return (
                            <label
                              key={perm.key}
                              className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isGranted}
                                onChange={() => toggle(perm.key)}
                                className="h-4 w-4 rounded border-input accent-primary"
                              />
                              <span className={`flex-1 text-sm ${isGranted ? '' : 'text-muted-foreground'}`}>
                                {perm.label}
                              </span>
                              {hasDbOverride && (
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                                  Custom
                                </Badge>
                              )}
                              {!isBase && !hasDbOverride && (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                  Unsaved
                                </Badge>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center gap-2 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mr-auto gap-1.5"
            disabled={resetting || loading || !hasAnyOverride}
            onClick={resetAdjustments}
          >
            {resetting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RotateCcw className="h-3.5 w-3.5" />
            }
            Clear adjustments
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving || loading || !isDirty}
            onClick={save}
          >
            {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
