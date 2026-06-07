'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, Store, WashingMachine, Home, CheckCircle, Banknote, Wallet, Building2, CreditCard, Plus, Archive, ArchiveRestore, ExternalLink } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile, UserRole, FinancialAccount, FinancialAccountType } from '@/types'

// ─── Business model catalogue ─────────────────────────────────────────────────
// Defined locally — these 3 are stable and don't need a DB fetch in settings.
const BUSINESS_MODELS = [
  {
    key: 'retail',
    label: 'Retail',
    description: 'Sell physical products or goods.',
    icon: Store,
  },
  {
    key: 'service',
    label: 'Service',
    description: 'Provide labor, expertise, or services to customers.',
    icon: WashingMachine,
  },
  {
    key: 'rental',
    label: 'Rental',
    description: 'Generate income from assets, spaces, or equipment.',
    icon: Home,
  },
]

const MODEL_LABEL: Record<string, string> = {
  retail: 'Retail',
  service: 'Service',
  rental: 'Rental',
}

// ─── Form schemas ─────────────────────────────────────────────────────────────

const bizSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  address: z.string().optional(),
  contact_number: z.string().optional(),
})

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  mobile_number: z.string().optional(),
})

type BizValues = z.infer<typeof bizSchema>
type ProfileValues = z.infer<typeof profileSchema>

// ─── Financial account config ─────────────────────────────────────────────────

const ACCOUNT_TYPE_OPTIONS: { value: FinancialAccountType; label: string; icon: React.ElementType; legacyMethod: string }[] = [
  { value: 'cash',       label: 'Cash',       icon: Banknote,   legacyMethod: 'cash'           },
  { value: 'ewallet',    label: 'E-Wallet',   icon: Wallet,     legacyMethod: 'gcash'          },
  { value: 'bank',       label: 'Bank',       icon: Building2,  legacyMethod: 'bank_transfer'  },
  { value: 'receivable', label: 'Receivable', icon: CreditCard, legacyMethod: 'credit'         },
]

const ACCOUNT_TYPE_ICON: Record<string, React.ElementType> = {
  cash: Banknote, ewallet: Wallet, bank: Building2, receivable: CreditCard,
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash: 'Cash', ewallet: 'E-Wallet', bank: 'Bank', receivable: 'Receivable',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  // template_key intentionally excluded — it is an internal compatibility field
  business: { id: string; name: string; address: string | null; contact_number: string | null }
  profile: UserProfile | null
  userId: string
  role: UserRole
  currentModelKeys: string[]
  financialAccounts: FinancialAccount[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsView({ business, profile, userId, role, currentModelKeys, financialAccounts: initialAccounts }: Props) {
  const isOwner = role === 'owner'

  // ── Business info form ─────────────────────────────────────────────────────
  const bizForm = useForm<BizValues>({
    resolver: zodResolver(bizSchema),
    defaultValues: {
      name: business.name,
      address: business.address ?? '',
      contact_number: business.contact_number ?? '',
    },
  })

  const bizMutation = useMutation({
    mutationFn: async (values: BizValues) => {
      const supabase = createClient()
      const { error } = await supabase.from('businesses').update({
        name: values.name,
        address: values.address || null,
        contact_number: values.contact_number || null,
      }).eq('id', business.id)
      if (error) throw error
    },
    onSuccess: () => toast.success('Business updated'),
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Profile form ───────────────────────────────────────────────────────────
  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      mobile_number: profile?.mobile_number ?? '',
    },
  })

  const profileMutation = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const supabase = createClient()
      const { error } = await supabase.from('user_profiles').update({
        full_name: values.full_name,
        mobile_number: values.mobile_number || null,
      }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => toast.success('Profile updated'),
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Business models management (owner only) ────────────────────────────────
  const [selectedModels, setSelectedModels] = useState<string[]>(currentModelKeys)

  const toggleModel = (key: string) =>
    setSelectedModels(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )

  const modelsMutation = useMutation({
    mutationFn: async (newModels: string[]) => {
      if (newModels.length === 0) throw new Error('At least one business model is required.')
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any

      // Delete all existing associations, then re-insert selected ones.
      const { error: deleteError } = await db
        .from('business_business_models')
        .delete()
        .eq('business_id', business.id)
      if (deleteError) throw deleteError

      const { error: insertError } = await db
        .from('business_business_models')
        .insert(newModels.map((model_key: string) => ({ business_id: business.id, model_key })))
      if (insertError) throw insertError
    },
    onSuccess: () => toast.success('Business models updated'),
    onError: (e: Error) => toast.error(e.message),
  })

  const modelsChanged =
    selectedModels.length !== currentModelKeys.length ||
    selectedModels.some(k => !currentModelKeys.includes(k))

  // ── Financial accounts management (owner only) ─────────────────────────────
  const [accounts, setAccounts] = useState<FinancialAccount[]>(initialAccounts)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountType, setNewAccountType] = useState<FinancialAccountType>('cash')
  const [addingAccount, setAddingAccount] = useState(false)

  const addAccountMutation = useMutation({
    mutationFn: async () => {
      const name = newAccountName.trim()
      if (!name) throw new Error('Account name is required.')
      const typeConfig = ACCOUNT_TYPE_OPTIONS.find(o => o.value === newAccountType)!
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('financial_accounts')
        .insert({
          business_id: business.id,
          name,
          account_type: newAccountType,
          legacy_method: typeConfig.legacyMethod,
          sort_order: accounts.length + 1,
        })
        .select()
        .single()
      if (error) throw error
      return data as FinancialAccount
    },
    onSuccess: (account) => {
      setAccounts(prev => [...prev, account])
      setNewAccountName('')
      setNewAccountType('cash')
      setAddingAccount(false)
      toast.success('Account added')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleAccountActive = async (account: FinancialAccount) => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('financial_accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id)
    if (error) { toast.error(error.message); return }
    setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: !a.is_active } : a))
    toast.success(account.is_active ? 'Account archived' : 'Account restored')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* ── Business Information ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Update your business name and contact details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={bizForm.handleSubmit(v => bizMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input {...bizForm.register('name')} />
              {bizForm.formState.errors.name && (
                <p className="text-xs text-destructive">{bizForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea rows={2} {...bizForm.register('address')} />
            </div>
            <div className="space-y-2">
              <Label>Contact Number</Label>
              <Input type="tel" {...bizForm.register('contact_number')} />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={bizMutation.isPending}>
                {bizMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Business Models ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Business Models</CardTitle>
          <CardDescription>
            {isOwner
              ? 'Manage the models that describe how your business operates. Changing models does not affect your enabled modules.'
              : 'The models that describe how this business operates.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Read-only view for non-owners */}
          {!isOwner && (
            <div className="flex flex-wrap gap-2">
              {currentModelKeys.length > 0
                ? currentModelKeys.map(key => (
                    <Badge key={key} variant="secondary" className="text-sm px-3 py-1">
                      {MODEL_LABEL[key] ?? key}
                    </Badge>
                  ))
                : <p className="text-sm text-muted-foreground">No models configured.</p>}
            </div>
          )}

          {/* Editable checkboxes for owners */}
          {isOwner && (
            <>
              <div className="grid gap-2">
                {BUSINESS_MODELS.map(model => {
                  const Icon = model.icon
                  const isSelected = selectedModels.includes(model.key)
                  return (
                    <div
                      key={model.key}
                      onClick={() => toggleModel(model.key)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-3 cursor-pointer select-none transition-all',
                        isSelected
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        isSelected ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{model.label}</p>
                        <p className="text-xs text-muted-foreground">{model.description}</p>
                      </div>
                      <div className={cn(
                        'w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
                        isSelected ? 'border-primary bg-primary' : 'border-slate-300 bg-white'
                      )}>
                        {isSelected && <CheckCircle className="h-3 w-3 text-white" />}
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedModels.length === 0 && (
                <p className="text-xs text-destructive">At least one business model is required.</p>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => modelsMutation.mutate(selectedModels)}
                  disabled={!modelsChanged || selectedModels.length === 0 || modelsMutation.isPending}
                  variant={modelsChanged ? 'default' : 'outline'}
                >
                  {modelsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {modelsChanged ? 'Save Models' : 'No Changes'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Financial Accounts ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle>Financial Accounts</CardTitle>
              <CardDescription className="mt-1">
                {isOwner
                  ? 'Configure where your business receives payments. Used in POS to track collections per account.'
                  : 'Payment accounts configured for this business.'}
              </CardDescription>
            </div>
            <a
              href={`/${business.id}/accounts`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap mt-0.5"
            >
              View Balances
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Account list */}
          <div className="space-y-2">
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts configured.</p>
            )}
            {accounts.map(account => {
              const Icon = ACCOUNT_TYPE_ICON[account.account_type] ?? Banknote
              return (
                <div
                  key={account.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3',
                    !account.is_active && 'opacity-50'
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[account.account_type]}</p>
                  </div>
                  {!account.is_active && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Archived</Badge>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => toggleAccountActive(account)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={account.is_active ? 'Archive' : 'Restore'}
                    >
                      {account.is_active
                        ? <Archive className="h-4 w-4" />
                        : <ArchiveRestore className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add account form — owner only */}
          {isOwner && (
            <>
              {!addingAccount ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setAddingAccount(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Account
                </Button>
              ) : (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Name</Label>
                    <Input
                      placeholder="e.g. BPI Savings, Petty Cash"
                      value={newAccountName}
                      onChange={e => setNewAccountName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Type</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ACCOUNT_TYPE_OPTIONS.map(opt => {
                        const Icon = opt.icon
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setNewAccountType(opt.value)}
                            className={cn(
                              'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                              newAccountType === opt.value
                                ? 'border-primary bg-primary/5 text-primary font-medium'
                                : 'border-border hover:bg-muted'
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => addAccountMutation.mutate()}
                      disabled={!newAccountName.trim() || addAccountMutation.isPending}
                    >
                      {addAccountMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Add
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { setAddingAccount(false); setNewAccountName('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Profile ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(v => profileMutation.mutate(v))} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input {...profileForm.register('full_name')} />
              {profileForm.formState.errors.full_name && (
                <p className="text-xs text-destructive">{profileForm.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Mobile Number</Label>
              <Input type="tel" {...profileForm.register('mobile_number')} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Profile
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
