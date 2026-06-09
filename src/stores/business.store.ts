import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Business, BusinessModule, UserRole, TemplateConfig } from '@/types'

interface BusinessState {
  activeBusiness: Business | null
  activeRole: UserRole | null
  modules: BusinessModule[]
  templateConfig: TemplateConfig | null
  modelKeys: string[]
  modelLabels: string[]
  businesses: Business[]
  /** Effective permission keys for the active business. null = not yet loaded. */
  permissions: string[] | null
  /** Scope map: permission_key → 'own' | 'assigned' | 'department' | 'all'. null = not yet loaded. */
  permissionScopes: Record<string, string> | null
  setActiveBusiness: (
    business: Business,
    role: UserRole,
    modules: BusinessModule[],
    config: TemplateConfig,
    modelKeys: string[],
    modelLabels: string[]
  ) => void
  setBusinesses: (businesses: Business[]) => void
  setPermissions: (permissions: string[]) => void
  setPermissionScopes: (scopes: Record<string, string>) => void
  clearActiveBusiness: () => void
  hasPermission: (key: string) => boolean
  getScope: (key: string) => 'own' | 'assigned' | 'department' | 'all' | null
}

export const useBusinessStore = create<BusinessState>()(
  persist(
    (set, get) => ({
      activeBusiness: null,
      activeRole: null,
      modules: [],
      templateConfig: null,
      modelKeys: [],
      modelLabels: [],
      businesses: [],
      permissions: null,
      permissionScopes: null,
      setActiveBusiness: (business, role, modules, config, modelKeys, modelLabels) =>
        set({ activeBusiness: business, activeRole: role, modules, templateConfig: config, modelKeys, modelLabels }),
      setBusinesses: (businesses) => set({ businesses }),
      setPermissions: (permissions) => set({ permissions }),
      setPermissionScopes: (scopes) => set({ permissionScopes: scopes }),
      clearActiveBusiness: () =>
        set({
          activeBusiness: null,
          activeRole: null,
          modules: [],
          templateConfig: null,
          modelKeys: [],
          modelLabels: [],
          permissions: null,
          permissionScopes: null,
        }),
      hasPermission: (key: string) => {
        const { activeRole, permissions } = get()
        if (activeRole === 'owner') return true
        if (!permissions) return false
        return permissions.includes(key)
      },
      getScope: (key: string) => {
        const { activeRole, permissionScopes } = get()
        if (activeRole === 'owner') return 'all'
        if (!permissionScopes) return null
        const scope = permissionScopes[key]
        if (!scope) return null
        return scope as 'own' | 'assigned' | 'department' | 'all'
      },
    }),
    {
      name: 'bos-business',
      partialize: (state) => ({
        activeBusiness: state.activeBusiness,
        activeRole: state.activeRole,
        templateConfig: state.templateConfig,
        modelKeys: state.modelKeys,
        modelLabels: state.modelLabels,
        // Intentionally NOT persisting permissions — always fetched fresh from server
      }),
    }
  )
)
