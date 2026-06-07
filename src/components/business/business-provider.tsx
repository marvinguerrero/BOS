'use client'

import { useEffect } from 'react'
import { useBusinessStore } from '@/stores/business.store'
import type { Business, BusinessModule, UserRole, TemplateConfig } from '@/types'

interface BusinessProviderProps {
  business: Business
  role: UserRole
  modules: BusinessModule[]
  templateConfig: TemplateConfig | null
  children: React.ReactNode
}

export function BusinessProvider({ business, role, modules, templateConfig, children }: BusinessProviderProps) {
  const setActiveBusiness = useBusinessStore(s => s.setActiveBusiness)

  useEffect(() => {
    if (templateConfig) {
      setActiveBusiness(business, role, modules, templateConfig)
    }
  }, [business.id, role])

  return <>{children}</>
}
