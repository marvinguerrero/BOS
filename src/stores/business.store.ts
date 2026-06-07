import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Business, BusinessModule, UserRole, TemplateConfig } from '@/types'

interface BusinessState {
  activeBusiness: Business | null
  activeRole: UserRole | null
  modules: BusinessModule[]
  templateConfig: TemplateConfig | null
  businesses: Business[]
  setActiveBusiness: (business: Business, role: UserRole, modules: BusinessModule[], config: TemplateConfig) => void
  setBusinesses: (businesses: Business[]) => void
  clearActiveBusiness: () => void
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set) => ({
      activeBusiness: null,
      activeRole: null,
      modules: [],
      templateConfig: null,
      businesses: [],
      setActiveBusiness: (business, role, modules, config) =>
        set({ activeBusiness: business, activeRole: role, modules, templateConfig: config }),
      setBusinesses: (businesses) => set({ businesses }),
      clearActiveBusiness: () =>
        set({ activeBusiness: null, activeRole: null, modules: [], templateConfig: null }),
    }),
    {
      name: 'bos-business',
      partialize: (state) => ({
        activeBusiness: state.activeBusiness,
        activeRole: state.activeRole,
        templateConfig: state.templateConfig,
      }),
    }
  )
)
