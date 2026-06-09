import type {
  BusinessTemplateKey,
  TemplateConfig,
  NavigationItem,
  DashboardWidgetConfig,
  ModuleKey,
  UserRole,
} from '@/types'

// ─── Permission Matrix ────────────────────────────────────────────────────────

const MODULE_PERMISSIONS: Record<string, UserRole[]> = {
  inventory:         ['owner', 'manager'],
  sales:             ['owner', 'manager', 'staff'],
  customers:         ['owner', 'manager', 'staff'],
  services:          ['owner', 'manager'],
  orders:            ['owner', 'manager', 'staff'],
  laundry_services:  ['owner', 'manager'],
  laundry_orders:    ['owner', 'manager', 'staff'],
  rooms:             ['owner', 'manager'],
  tenants:           ['owner', 'manager', 'staff'],
  billing:           ['owner', 'manager'],
  reports:           ['owner', 'manager'],
  notifications:     ['owner', 'manager', 'staff'],
  settings:          ['owner'],
}

const LEGACY_MODULE_ALIASES: Record<string, ModuleKey> = {
  laundry_services: 'services',
  laundry_orders: 'orders',
}

const LEGACY_HREF_ALIASES: Record<string, string> = {
  '/laundry/services': '/services',
  '/laundry/orders': '/orders',
  '/laundry/orders/new': '/orders/new',
}

function normalizeModuleKey(module: string): string {
  return LEGACY_MODULE_ALIASES[module] ?? module
}

function normalizeNavigationHref(href: string): string {
  return LEGACY_HREF_ALIASES[href] ?? href
}

export function canAccessModule(module: string, role: UserRole): boolean {
  const allowed = MODULE_PERMISSIONS[normalizeModuleKey(module)]
  if (!allowed) return false
  return allowed.includes(role)
}

export function canPerformAction(
  action: 'create' | 'update' | 'delete' | 'view',
  module: string,
  role: UserRole
): boolean {
  if (!canAccessModule(module, role)) return false

  // Staff can only create/view, not update/delete
  if (role === 'staff' && (action === 'delete')) return false

  return true
}

// ─── Template Config Helpers ──────────────────────────────────────────────────

export function getEnabledModules(config: TemplateConfig, role: UserRole): ModuleKey[] {
  return config.modules.filter(m => canAccessModule(m, role))
}

export function getNavigation(config: TemplateConfig, role: UserRole, businessId: string): NavigationItem[] {
  return config.navigation
    .filter(item => {
      if (!item.module) return true
      return canAccessModule(item.module, role)
    })
    .map(item => ({
      ...item,
      module: item.module ? normalizeModuleKey(item.module) as ModuleKey : undefined,
      href: `/${businessId}${normalizeNavigationHref(item.href)}`,
      children: item.children?.map(child => ({
        ...child,
        module: child.module ? normalizeModuleKey(child.module) as ModuleKey : undefined,
        href: `/${businessId}${normalizeNavigationHref(child.href)}`,
      })),
    }))
}

export function getDashboardWidgets(config: TemplateConfig): DashboardWidgetConfig[] {
  return [...config.dashboard_widgets].sort((a, b) => a.order - b.order)
}

// ─── Template Provisioning ────────────────────────────────────────────────────

export function getDefaultModulesForTemplate(templateKey: BusinessTemplateKey): ModuleKey[] {
  const moduleMap: Record<BusinessTemplateKey, ModuleKey[]> = {
    sari_sari:   ['inventory', 'sales', 'customers', 'reports', 'notifications'],
    laundry:     ['services', 'orders', 'customers', 'reports', 'notifications'],
    room_rental: ['rooms', 'tenants', 'billing', 'reports', 'notifications'],
  }
  return moduleMap[templateKey] ?? []
}

export function getTemplateLabel(key: BusinessTemplateKey): string {
  const labels: Record<BusinessTemplateKey, string> = {
    sari_sari:   'Retail',
    laundry:     'Service',
    room_rental: 'Rental',
  }
  return labels[key]
}

export function getTemplateDescription(key: BusinessTemplateKey): string {
  const descriptions: Record<BusinessTemplateKey, string> = {
    sari_sari:   'Inventory, sales, and customer credit tracking for convenience stores.',
    laundry:     'Order management and revenue tracking for laundry shops.',
    room_rental: 'Room management, tenant tracking, and billing for rental properties.',
  }
  return descriptions[key]
}

export function getTemplateIcon(key: BusinessTemplateKey): string {
  const icons: Record<BusinessTemplateKey, string> = {
    sari_sari:   'Store',
    laundry:     'WashingMachine',
    room_rental: 'Home',
  }
  return icons[key]
}
