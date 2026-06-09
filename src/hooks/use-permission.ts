'use client'

import { useBusinessStore } from '@/stores/business.store'

/**
 * Returns true when the current user has the given permission in the active
 * business. Owners always return true. Returns false while permissions are
 * still loading (null).
 */
export function usePermission(key: string): boolean {
  return useBusinessStore(s => s.hasPermission(key))
}

/**
 * Returns a map of permission key → boolean for multiple keys at once.
 * Cheaper than calling usePermission() N times when many checks are needed.
 */
export function usePermissions(keys: readonly string[]): Record<string, boolean> {
  const hasPermission = useBusinessStore(s => s.hasPermission)
  return Object.fromEntries(keys.map(k => [k, hasPermission(k)]))
}

/**
 * Returns the effective scope for a permission key: 'own' | 'assigned' |
 * 'department' | 'all', or null if the user lacks the permission or scopes
 * haven't loaded yet. Owners always return 'all'.
 */
export function usePermissionScope(key: string): 'own' | 'assigned' | 'department' | 'all' | null {
  return useBusinessStore(s => s.getScope(key))
}
