'use client'

import { useEffect } from 'react'
import { useBusinessStore } from '@/stores/business.store'
import { createClient } from '@/lib/supabase/client'
import type { Business, BusinessModule, UserRole, TemplateConfig } from '@/types'

interface BusinessProviderProps {
  business: Business
  role: UserRole
  modules: BusinessModule[]
  templateConfig: TemplateConfig | null
  modelKeys: string[]
  modelLabels: string[]
  children: React.ReactNode
}

export function BusinessProvider({ business, role, modules, templateConfig, modelKeys, modelLabels, children }: BusinessProviderProps) {
  const setActiveBusiness    = useBusinessStore(s => s.setActiveBusiness)
  const setPermissions       = useBusinessStore(s => s.setPermissions)
  const setPermissionScopes  = useBusinessStore(s => s.setPermissionScopes)

  useEffect(() => {
    if (templateConfig) {
      setActiveBusiness(business, role, modules, templateConfig, modelKeys, modelLabels)
    }
  }, [business, role, modules, templateConfig, modelKeys, modelLabels, setActiveBusiness])

  // Fetch effective permissions + scopes whenever the active business changes.
  // Owner bypass is handled in the store — we still fetch so arrays are populated.
  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.rpc('get_my_permissions',      { p_business_id: business.id }),
      supabase.rpc('get_my_permission_scopes', { p_business_id: business.id }),
    ]).then(([permResult, scopeResult]) => {
      const perms  = permResult.data  as string[] | null
      const scopes = scopeResult.data as Record<string, string> | null
      if (Array.isArray(perms))                   setPermissions(perms)
      if (scopes && typeof scopes === 'object')    setPermissionScopes(scopes)
    })
  }, [business.id, setPermissions, setPermissionScopes])

  return <>{children}</>
}
