'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Loader2, CheckCircle, ArrowLeft, ArrowRight,
  Store, WashingMachine, Home,
  Package, ShoppingCart, Users, User, Wrench, ClipboardList,
  DoorOpen, CreditCard, BarChart2, Bell,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { BusinessTemplateKey } from '@/types'

// ─── Legacy compat ────────────────────────────────────────────────────────────
// Derives businesses.template_key from the primary (first-selected) model.
// Required by dashboard, reports, search, and navigation until Phase 4.
const MODEL_TO_TEMPLATE: Record<string, BusinessTemplateKey> = {
  retail:  'sari_sari',
  service: 'laundry',
  rental:  'room_rental',
}

// ─── Module suggestions per model ─────────────────────────────────────────────
const MODEL_MODULES: Record<string, string[]> = {
  retail:  ['inventory', 'sales', 'customers', 'reports', 'notifications'],
  service: ['services', 'orders', 'customers', 'reports', 'notifications'],
  rental:  ['rooms', 'tenants', 'billing', 'reports', 'notifications'],
}

// ─── Module display catalogue ─────────────────────────────────────────────────
// Keys match module_key values in the business_modules table.
const MODULE_CATALOGUE = [
  { key: 'inventory',        label: 'Inventory',      description: 'Track products, stock levels, and reorder points.',       icon: Package },
  { key: 'sales',            label: 'Sales',          description: 'Record sales transactions and collect payments.',         icon: ShoppingCart },
  { key: 'customers',        label: 'Customers',      description: 'Manage customer profiles and outstanding balances.',      icon: Users },
  { key: 'services',         label: 'Services',       description: 'Define your service catalogue and pricing.',              icon: Wrench },
  { key: 'orders',           label: 'Orders',         description: 'Track service orders from intake to completion.',        icon: ClipboardList },
  { key: 'rooms',            label: 'Rooms',          description: 'Manage rentable rooms, units, or spaces.',               icon: DoorOpen },
  { key: 'tenants',          label: 'Tenants',        description: 'Track tenant records and lease agreements.',             icon: User },
  { key: 'billing',          label: 'Billing',        description: 'Generate bills, track payments, and overdue rent.',      icon: CreditCard },
  { key: 'reports',          label: 'Reports',        description: 'Revenue charts, trends, and business insights.',         icon: BarChart2 },
  { key: 'notifications',    label: 'Notifications',  description: 'In-app alerts for important business events.',           icon: Bell },
] as const

// ─── Model card icons ─────────────────────────────────────────────────────────
const MODEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  retail:  Store,
  service: WashingMachine,
  rental:  Home,
}

// Examples shown under each model card
const MODEL_EXAMPLES: Record<string, string> = {
  retail:  'e.g. Mini Mart, Pharmacy, Hardware, Grocery',
  service: 'e.g. Salon, Repair Shop, Accounting Firm, Cleaning Service',
  rental:  'e.g. Apartment, Boarding House, Car Rental, Parking',
}

// Display order for models (DB returns alphabetical, we override)
const MODEL_ORDER = ['retail', 'service', 'rental']

const getRecommendedModuleKeys = (models: string[]) => {
  const keys = new Set<string>()
  models.forEach(m => (MODEL_MODULES[m] ?? []).forEach(k => keys.add(k)))
  return Array.from(keys)
}

// Keep temporary diagnostics serializable so Next devtools does not collapse
// Supabase/PostgREST errors to "{}".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const serializeSupabaseError = (error: any) => {
  if (!error) return null

  return {
    name: error.name ?? null,
    message: error.message ?? null,
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    status: error.status ?? null,
    statusText: error.statusText ?? null,
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessModel {
  key: string
  name: string
  description: string | null
}

const step1Schema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  address: z.string().optional(),
  contact_number: z.string().optional(),
})
type Step1Values = z.infer<typeof step1Schema>

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function SetupWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 data
  const [step1Data, setStep1Data] = useState<Step1Values | null>(null)

  // Step 2 — business models (loaded from DB)
  const [businessModels, setBusinessModels] = useState<BusinessModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [selectedModels, setSelectedModels] = useState<string[]>([])

  // Step 3 — modules
  const [selectedModules, setSelectedModules] = useState<string[]>([])

  const { register, handleSubmit, formState: { errors } } = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
  })

  // ── Fetch business models once on mount ────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('business_models')
          .select('key, name, description')
          .eq('is_active', true)
        const sorted = ((data ?? []) as BusinessModel[]).sort(
          (a, b) => MODEL_ORDER.indexOf(a.key) - MODEL_ORDER.indexOf(b.key)
        )
        setBusinessModels(sorted)
      } catch {
        // Non-fatal: user sees empty list, can still proceed with fallback
      } finally {
        setModelsLoading(false)
      }
    }
    load()
  }, [])

  // ── Compute recommended modules from selected models ───────────────────────
  const recommendedKeys = useMemo(
    () => getRecommendedModuleKeys(selectedModels),
    [selectedModels]
  )

  const additionalModules = useMemo(
    () => MODULE_CATALOGUE.filter(m => !recommendedKeys.includes(m.key)),
    [recommendedKeys]
  )

  // ── Handlers ───────────────────────────────────────────────────────────────

  const onStep1Submit = (values: Step1Values) => {
    setStep1Data(values)
    setStep(2)
  }

  const toggleModel = (key: string) => {
    const nextModels = selectedModels.includes(key)
      ? selectedModels.filter(k => k !== key)
      : [...selectedModels, key]
    setSelectedModels(nextModels)
    setSelectedModules(getRecommendedModuleKeys(nextModels))
  }

  const toggleModule = (key: string) =>
    setSelectedModules(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )

  const onCreateBusiness = async () => {
    if (!step1Data || selectedModels.length === 0 || selectedModules.length === 0) return
    setSubmitting(true)

    try {
      const supabase = createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      console.info('[onboarding] authenticated user', {
        userId: user?.id ?? null,
        sessionUserId: session?.user.id ?? null,
        hasAccessToken: Boolean(session?.access_token),
        authError: serializeSupabaseError(authError),
        sessionError: serializeSupabaseError(sessionError),
      })

      if (authError || !user) {
        console.info('[onboarding] getUser failed', {
          authError: serializeSupabaseError(authError),
          user,
        })
        setSubmitting(false)
        router.push('/auth/login')
        return
      }

      if (sessionError || !session?.access_token || session.user.id !== user.id) {
        console.info('[onboarding] session validation failed', {
          userId: user.id,
          sessionUserId: session?.user.id ?? null,
          hasAccessToken: Boolean(session?.access_token),
          sessionError: serializeSupabaseError(sessionError),
        })
        setSubmitting(false)
        router.push('/auth/login')
        return
      }

      const authenticatedUserId = user.id
      const authorizationHeader = `Bearer ${session.access_token}`

      // UUID v4 via getRandomValues — works on HTTP (randomUUID requires HTTPS)
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      const businessId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`

      // Derive legacy template_key from primary (first) model for backward compat
      const templateKey: BusinessTemplateKey = MODEL_TO_TEMPLATE[selectedModels[0]] ?? 'sari_sari'

      const businessPayload = {
        id: businessId,
        name: step1Data.name,
        template_key: templateKey,
        address: step1Data.address || null,
        contact_number: step1Data.contact_number || null,
        created_by: authenticatedUserId,
      }

      const memberPayload = {
        business_id: businessId,
        user_id: authenticatedUserId,
        role: 'owner' as const,
      }

      const modelPayloads = selectedModels.map((model_key: string) => ({
        business_id: businessId,
        model_key,
      }))

      const modulePayloads = selectedModules.map(module_key => ({
        business_id: businessId,
        module_key,
        is_enabled: true,
      }))

      const orderStatusPayloads = [
        { business_id: businessId, name: 'Received', sort_order: 10, color: 'blue', is_default: true },
        { business_id: businessId, name: 'In Progress', sort_order: 20, color: 'yellow', is_default: false },
        { business_id: businessId, name: 'Ready', sort_order: 30, color: 'green', is_default: false },
        { business_id: businessId, name: 'Completed', sort_order: 40, color: 'slate', is_default: false },
      ]

      console.info('[onboarding] insert payloads', {
        userId: authenticatedUserId,
        businesses: businessPayload,
        business_users: memberPayload,
        business_business_models: modelPayloads,
        business_modules: modulePayloads,
        order_statuses: selectedModules.includes('orders') ? orderStatusPayloads : [],
      })

      // 1. Create business
      const { error: bizError } = await supabase
        .from('businesses')
        .insert(businessPayload)
        .setHeader('Authorization', authorizationHeader)
      if (bizError) {
        console.info('[onboarding] businesses insert failed', {
          userId: authenticatedUserId,
          payload: businessPayload,
          error: serializeSupabaseError(bizError),
        })
        throw new Error(`Could not create business: ${bizError.message}`)
      }

      // 2. Owner membership
      const { error: memberError } = await supabase
        .from('business_users')
        .insert(memberPayload)
        .setHeader('Authorization', authorizationHeader)
      if (memberError) {
        console.info('[onboarding] business_users insert failed', {
          userId: authenticatedUserId,
          payload: memberPayload,
          error: serializeSupabaseError(memberError),
        })
        throw new Error(`Could not assign owner role: ${memberError.message}`)
      }

      // 3. Business model associations (one row per selected model)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: modelsError } = await (supabase as any)
        .from('business_business_models')
        .insert(modelPayloads)
        .setHeader('Authorization', authorizationHeader)
      if (modelsError) {
        console.info('[onboarding] business_business_models insert failed', {
          userId: authenticatedUserId,
          payload: modelPayloads,
          error: serializeSupabaseError(modelsError),
        })
        throw new Error(`Could not save business models: ${modelsError.message}`)
      }

      // 4. Provision selected modules
      const { error: modulesError } = await supabase
        .from('business_modules')
        .insert(modulePayloads)
        .setHeader('Authorization', authorizationHeader)
      if (modulesError) {
        console.info('[onboarding] business_modules insert failed', {
          userId: authenticatedUserId,
          payload: modulePayloads,
          error: serializeSupabaseError(modulesError),
        })
        throw new Error(`Could not provision modules: ${modulesError.message}`)
      }

      if (selectedModules.includes('orders')) {
        const { error: statusesError } = await supabase
          .from('order_statuses')
          .insert(orderStatusPayloads)
          .setHeader('Authorization', authorizationHeader)
        if (statusesError) {
          console.info('[onboarding] order_statuses insert failed', {
            userId: authenticatedUserId,
            payload: orderStatusPayloads,
            error: serializeSupabaseError(statusesError),
          })
          throw new Error(`Could not configure order statuses: ${statusesError.message}`)
        }
      }

      toast.success(`${step1Data.name} is ready!`)
      setStep(4)
      setTimeout(() => router.push(`/${businessId}/dashboard`), 1500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // ── Step labels ────────────────────────────────────────────────────────────
  const STEP_LABELS = ['Business Info', 'Business Models', 'Module Selection']

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">

      {/* Progress indicator (steps 1–3 only; step 4 is full-page success) */}
      {step < 4 && (
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step > s
                  ? 'bg-primary text-primary-foreground'
                  : step === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-slate-200 text-slate-500'
              )}>
                {step > s ? <CheckCircle className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div className={cn('h-0.5 w-12 transition-colors', step > s ? 'bg-primary' : 'bg-slate-200')} />
              )}
            </div>
          ))}
          <span className="ml-4 text-sm text-muted-foreground">{STEP_LABELS[step - 1]}</span>
        </div>
      )}

      {/* ── Step 1: Business Info ─────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <h1 className="text-2xl font-bold mb-1">Business information</h1>
          <p className="text-muted-foreground mb-6">Tell us the basics about your business.</p>
          <form onSubmit={handleSubmit(onStep1Submit)}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    Business Name <span className="text-destructive">*</span>
                  </Label>
                  <Input id="name" placeholder="e.g. Aling Nena's Store" {...register('name')} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">
                    Address{' '}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </Label>
                  <Textarea id="address" placeholder="Street, Barangay, City" rows={2} {...register('address')} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_number">
                    Contact Number{' '}
                    <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                  </Label>
                  <Input id="contact_number" type="tel" placeholder="09XXXXXXXXX" {...register('contact_number')} />
                </div>
                <Button type="submit" className="w-full gap-2">
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </form>
        </div>
      )}

      {/* ── Step 2: Business Models ───────────────────────────────────────── */}
      {step === 2 && (
        <div>
          <Button variant="ghost" className="mb-4 -ml-2 gap-2" onClick={() => setStep(1)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold mb-1">Business models</h1>
          <p className="text-muted-foreground mb-6">
            Select all business models that apply to your business. You can select more than one.
          </p>

          {modelsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : businessModels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Could not load business models. Please refresh and try again.
            </div>
          ) : (
            <div className="grid gap-3 mb-6">
              {businessModels.map(model => {
                const Icon = MODEL_ICONS[model.key] ?? Store
                const isSelected = selectedModels.includes(model.key)
                return (
                  <Card
                    key={model.key}
                    onClick={() => toggleModel(model.key)}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md select-none',
                      isSelected
                        ? 'border-primary ring-2 ring-primary ring-offset-2'
                        : 'hover:border-slate-300'
                    )}
                  >
                    <CardContent className="flex items-start gap-4 p-4">
                      <div className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-600'
                      )}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold">{model.name}</p>
                          {isSelected && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                        </div>
                        {model.description && (
                          <p className="text-sm text-muted-foreground">{model.description}</p>
                        )}
                        {MODEL_EXAMPLES[model.key] && (
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {MODEL_EXAMPLES[model.key]}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          <Button
            className="w-full gap-2"
            disabled={selectedModels.length === 0 || modelsLoading}
            onClick={() => setStep(3)}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
          {selectedModels.length === 0 && !modelsLoading && (
            <p className="text-sm text-destructive mt-2 text-center">
              Select at least one business model to continue.
            </p>
          )}
        </div>
      )}

      {/* ── Step 3: Module Selection ──────────────────────────────────────── */}
      {step === 3 && (
        <div>
          <Button variant="ghost" className="mb-4 -ml-2 gap-2" onClick={() => setStep(2)}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="flex items-start justify-between mb-1">
            <h1 className="text-2xl font-bold">Module selection</h1>
            <Badge variant="secondary" className="mt-1.5 text-xs">
              {selectedModules.length} enabled
            </Badge>
          </div>
          <p className="text-muted-foreground mb-6">
            These modules were recommended based on your selected business models. Enable or disable any module — you can always change this later in Settings.
          </p>

          {/* Recommended modules */}
          {recommendedKeys.length > 0 && (
            <div className="mb-5">
              <p className="text-sm font-semibold text-slate-700 mb-3">Recommended modules</p>
              <div className="grid gap-2">
                {MODULE_CATALOGUE.filter(m => recommendedKeys.includes(m.key)).map(mod => {
                  const Icon = mod.icon
                  const enabled = selectedModules.includes(mod.key)
                  return (
                    <ModuleCard
                      key={mod.key}
                      label={mod.label}
                      description={mod.description}
                      icon={<Icon className="h-4 w-4" />}
                      enabled={enabled}
                      onClick={() => toggleModule(mod.key)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Additional modules */}
          {additionalModules.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-semibold text-slate-700 mb-1">Additional modules</p>
              <p className="text-xs text-muted-foreground mb-3">
                Optionally enable modules beyond your selected business models.
              </p>
              <div className="grid gap-2">
                {additionalModules.map(mod => {
                  const Icon = mod.icon
                  const enabled = selectedModules.includes(mod.key)
                  return (
                    <ModuleCard
                      key={mod.key}
                      label={mod.label}
                      description={mod.description}
                      icon={<Icon className="h-4 w-4" />}
                      enabled={enabled}
                      onClick={() => toggleModule(mod.key)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          <Button
            className="w-full gap-2"
            disabled={submitting || selectedModules.length === 0}
            onClick={onCreateBusiness}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Creating business…' : 'Create Business'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </Button>
          {selectedModules.length === 0 && (
            <p className="text-sm text-destructive mt-2 text-center">
              Enable at least one module to continue.
            </p>
          )}
        </div>
      )}

      {/* ── Step 4: Success ───────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Business created!</h1>
          <p className="text-muted-foreground">Taking you to your dashboard…</p>
          <Loader2 className="h-6 w-6 animate-spin mx-auto mt-4 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// ─── Module card sub-component ────────────────────────────────────────────────

function ModuleCard({
  label,
  description,
  icon,
  enabled,
  onClick,
}: {
  label: string
  description: string
  icon: React.ReactNode
  enabled: boolean
  onClick: () => void
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all select-none',
        enabled
          ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
          : 'opacity-70 hover:opacity-100 hover:border-slate-300'
      )}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          enabled ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'
        )}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {/* Checkbox indicator */}
        <div className={cn(
          'w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors',
          enabled ? 'border-primary bg-primary' : 'border-slate-300 bg-white'
        )}>
          {enabled && <CheckCircle className="h-3 w-3 text-white" />}
        </div>
      </CardContent>
    </Card>
  )
}
