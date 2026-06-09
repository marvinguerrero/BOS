// ─── Core Domain Types ────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'manager' | 'staff' | 'viewer'
export type RelationshipType = 'owner' | 'employee' | 'customer' | 'tenant' | 'supplier_contact'
export type BusinessTemplateKey = 'sari_sari' | 'laundry' | 'room_rental'
export type ModuleKey =
  | 'inventory'
  | 'sales'
  | 'customers'
  | 'services'
  | 'orders'
  | 'laundry_services'
  | 'laundry_orders'
  | 'rooms'
  | 'tenants'
  | 'billing'
  | 'reports'
  | 'notifications'

export type NotificationStatus = 'unread' | 'read'
export type AuditAction = 'create' | 'update' | 'delete' | 'restore'

// ─── Database Row Types ───────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  full_name: string | null
  mobile_number: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Business {
  id: string
  name: string
  template_key: BusinessTemplateKey
  address: string | null
  contact_number: string | null
  logo_url: string | null
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export interface BusinessUser {
  id: string
  business_id: string
  user_id: string
  role: UserRole
  relationship_type: RelationshipType | null
  position_id: string | null
  is_active: boolean
  membership_status: MembershipStatus
  joined_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface Position {
  id: string
  business_id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type InviteStatus = 'none' | 'pending' | 'accepted' | 'revoked'
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'
export type BusinessPersonStatus = 'invited' | 'active' | 'inactive' | 'archived'
export type MembershipStatus = 'active' | 'inactive' | 'archived'

export interface BusinessPerson {
  id: string
  business_id: string
  user_id: string | null
  business_user_id: string | null
  name: string
  email: string | null
  mobile_number: string | null
  relationship_type: RelationshipType
  role: UserRole | null
  position_id: string | null
  is_active: boolean
  invite_status: InviteStatus
  status: BusinessPersonStatus
  archived_at: string | null
  scheduling_settings: Record<string, unknown>
  payroll_settings: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  position?: Position | null
}

export interface BusinessInvitation {
  id: string
  business_id: string
  email: string
  relationship_type: RelationshipType
  role: UserRole
  position_id: string | null
  status: InvitationStatus
  expires_at: string
  created_by: string
  accepted_by: string | null
  accepted_at: string | null
  declined_at: string | null
  email_sent_at: string | null
  email_delivery_status: 'queued' | 'sent' | 'failed' | 'not_configured'
  created_at: string
  updated_at: string
  business?: Pick<Business, 'id' | 'name'> | null
  position?: Position | null
}

export interface Template {
  id: string
  key: BusinessTemplateKey
  name: string
  description: string | null
  icon: string | null
  config: TemplateConfig
  is_active: boolean
}

export interface TemplateConfig {
  modules: ModuleKey[]
  dashboard_widgets: DashboardWidgetConfig[]
  navigation: NavigationItem[]
  settings: Record<string, unknown>
}

export interface DashboardWidgetConfig {
  id: string
  type: string
  title: string
  size: 'sm' | 'md' | 'lg' | 'xl'
  order: number
  config?: Record<string, unknown>
}

export interface NavigationItem {
  key: string
  label: string
  href: string
  icon: string
  module?: ModuleKey
  children?: NavigationItem[]
}

export interface BusinessModule {
  id: string
  business_id: string
  module_key: ModuleKey
  is_enabled: boolean
  config: Record<string, unknown>
  created_at: string
}

export interface AuditLog {
  id: string
  business_id: string
  user_id: string
  action: AuditAction
  table_name: string
  record_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  created_at: string
}

export interface Notification {
  id: string
  business_id: string
  user_id: string | null
  type: string
  title: string
  message: string
  status: NotificationStatus
  metadata: Record<string, unknown>
  created_at: string
}

// ─── Retail Types ─────────────────────────────────────────────────────────────

export interface Category {
  id: string
  business_id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  business_id: string
  category_id: string | null
  name: string
  sku: string | null
  cost_price: number
  selling_price: number
  stock_quantity: number
  low_stock_threshold: number
  is_active: boolean
  created_at: string
  updated_at: string
  category?: Category
}

export interface Customer {
  id: string
  business_id: string
  name: string
  contact_number: string | null
  outstanding_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'credit' | 'bank_transfer'
export type SaleStatus = 'completed' | 'voided' | 'refunded'
export type FinancialAccountType = 'cash' | 'ewallet' | 'bank' | 'receivable'
export type CustomerType = 'walk_in' | 'guest' | 'registered'

export interface FinancialAccount {
  id: string
  business_id: string
  name: string
  account_type: FinancialAccountType
  legacy_method: string
  is_active: boolean
  sort_order: number
  cached_balance: number
  created_at: string
}

export type AccountTransactionType =
  | 'sale' | 'credit_sale' | 'payment' | 'refund' | 'adjustment' | 'transfer_in' | 'transfer_out'

export interface AccountTransaction {
  id: string
  business_id: string
  account_id: string
  transaction_type: AccountTransactionType
  amount: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  transaction_date: string
  created_at: string
}
export type SalePaymentStatus = 'completed' | 'outstanding' | 'partially_paid'

export interface Sale {
  id: string
  business_id: string
  customer_id: string | null
  cashier_id: string
  subtotal: number
  discount: number
  total: number
  payment_method: PaymentMethod
  amount_tendered: number
  change_amount: number
  notes: string | null
  created_at: string
  // Enhanced fields (from migration 00006)
  receipt_number: string | null
  status: SaleStatus
  payment_status: SalePaymentStatus
  amount_paid: number
  balance_amount: number
  customer_type: CustomerType
  customer_name_snapshot: string | null
  customer_mobile_snapshot: string | null
  tax_amount: number
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  // BIR fields
  official_receipt_no: string | null
  invoice_no: string | null
  vat_amount: number | null
  vat_exempt_amount: number | null
  zero_rated_amount: number | null
  discount_type: string | null
  discount_reference: string | null
  bir_reference_no: string | null
  bir_acknowledgement_no: string | null
  // Relations
  customer?: Customer
  items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  // Snapshot fields (from migration 00006)
  product_name_snapshot: string | null
  product_sku_snapshot: string | null
  product?: Product
}

export interface CustomerLedger {
  id: string
  business_id: string
  customer_id: string
  sale_id: string | null
  type: 'debit' | 'credit'
  amount: number
  notes: string | null
  created_at: string
}

export interface InventoryMovement {
  id: string
  business_id: string
  product_id: string
  type: 'in' | 'out' | 'adjustment'
  quantity: number
  reference_id: string | null
  notes: string | null
  created_by: string
  created_at: string
}

// ─── Services and Orders Types ────────────────────────────────────────────────

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  price: number
  duration_minutes: number | null
  is_active: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type LaundryService = Service & {
  pricing_type?: 'fixed' | 'per_kg'
}

export interface OrderStatus {
  id: string
  business_id: string
  name: string
  sort_order: number
  color: string | null
  is_default: boolean
  created_at: string
}

export type LaundryOrderStatus = 'received' | 'washing' | 'drying' | 'ready' | 'claimed' | string

export interface Order {
  id: string
  business_id: string
  customer_id: string | null
  customer_type: CustomerType
  customer_name: string | null
  customer_contact: string | null
  customer_name_snapshot: string | null
  customer_mobile_snapshot: string | null
  assigned_to_person_id: string | null
  assigned_position_id: string | null
  service_id: string | null
  status_id: string | null
  total_amount: number
  notes: string | null
  received_at: string
  completed_at: string | null
  created_by: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  service?: Service
  order_status?: OrderStatus
  assigned_person?: BusinessPerson | null
  assigned_position?: Position | null
}

export interface LaundryOrder {
  id: string
  business_id: string
  customer_id: string | null
  customer_name: string
  customer_contact: string | null
  service_id: string
  total_amount: number
  notes: string | null
  received_at: string
  weight_kg: number | null
  status: LaundryOrderStatus
  ready_at: string | null
  claimed_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  service?: LaundryService
}

// ─── Rental Types ─────────────────────────────────────────────────────────────

export type RoomStatus = 'available' | 'occupied' | 'maintenance'

export interface Room {
  id: string
  business_id: string
  room_number: string
  floor: string | null
  type: string | null
  monthly_rate: number
  status: RoomStatus
  amenities: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  business_id: string
  room_id: string | null
  name: string
  contact_number: string | null
  email: string | null
  id_type: string | null
  id_number: string | null
  start_date: string
  end_date: string | null
  monthly_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
  room?: Room
}

export type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial'

export interface RentBill {
  id: string
  business_id: string
  tenant_id: string
  room_id: string
  billing_period: string
  due_date: string
  amount: number
  status: BillStatus
  paid_amount: number
  notes: string | null
  created_at: string
  updated_at: string
  tenant?: Tenant
  room?: Room
}

export interface RentPayment {
  id: string
  business_id: string
  bill_id: string
  amount: number
  payment_method: PaymentMethod
  reference_number: string | null
  notes: string | null
  created_by: string
  created_at: string
}

// ─── UI / App Types ───────────────────────────────────────────────────────────

export interface ActiveBusiness {
  business: Business
  role: UserRole
  modules: BusinessModule[]
}

export interface CartItem {
  product: Product
  quantity: number
  unit_price: number
}

export interface SearchResult {
  type: string
  id: string
  title: string
  subtitle?: string
  href: string
}

export interface ApiResponse<T = unknown> {
  data: T | null
  error: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
}
