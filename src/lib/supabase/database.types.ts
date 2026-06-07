// Auto-generated from Supabase schema. Run `supabase gen types typescript` to regenerate.
// This file provides type-safe access to your Supabase tables.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string
          full_name: string | null
          mobile_number: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          mobile_number?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string | null
          mobile_number?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      businesses: {
        Row: {
          id: string
          name: string
          template_key: 'sari_sari' | 'laundry' | 'room_rental'
          address: string | null
          contact_number: string | null
          logo_url: string | null
          is_active: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          template_key: 'sari_sari' | 'laundry' | 'room_rental'
          address?: string | null
          contact_number?: string | null
          logo_url?: string | null
          is_active?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          address?: string | null
          contact_number?: string | null
          logo_url?: string | null
          is_active?: boolean
          updated_at?: string
        }
      }
      business_users: {
        Row: {
          id: string
          business_id: string
          user_id: string
          role: 'owner' | 'manager' | 'staff'
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          user_id: string
          role?: 'owner' | 'manager' | 'staff'
          is_active?: boolean
          created_at?: string
        }
        Update: {
          role?: 'owner' | 'manager' | 'staff'
          is_active?: boolean
        }
      }
      business_modules: {
        Row: {
          id: string
          business_id: string
          module_key: string
          is_enabled: boolean
          config: Json
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          module_key: string
          is_enabled?: boolean
          config?: Json
          created_at?: string
        }
        Update: {
          is_enabled?: boolean
          config?: Json
        }
      }
      templates: {
        Row: {
          id: string
          key: 'sari_sari' | 'laundry' | 'room_rental'
          name: string
          description: string | null
          icon: string | null
          config: Json
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          key: 'sari_sari' | 'laundry' | 'room_rental'
          name: string
          description?: string | null
          icon?: string | null
          config?: Json
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          icon?: string | null
          config?: Json
          is_active?: boolean
        }
      }
      notifications: {
        Row: {
          id: string
          business_id: string
          user_id: string | null
          type: string
          title: string
          message: string
          status: 'unread' | 'read'
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          user_id?: string | null
          type: string
          title: string
          message: string
          status?: 'unread' | 'read'
          metadata?: Json
          created_at?: string
        }
        Update: {
          status?: 'unread' | 'read'
        }
      }
      audit_logs: {
        Row: {
          id: string
          business_id: string
          user_id: string | null
          action: 'create' | 'update' | 'delete' | 'restore'
          table_name: string
          record_id: string
          old_data: Json | null
          new_data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          user_id?: string | null
          action: 'create' | 'update' | 'delete' | 'restore'
          table_name: string
          record_id: string
          old_data?: Json | null
          new_data?: Json | null
          created_at?: string
        }
        Update: Record<string, never>
      }
      categories: {
        Row: {
          id: string
          business_id: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          is_active?: boolean
        }
      }
      products: {
        Row: {
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
        }
        Insert: {
          id?: string
          business_id: string
          category_id?: string | null
          name: string
          sku?: string | null
          cost_price?: number
          selling_price?: number
          stock_quantity?: number
          low_stock_threshold?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          name?: string
          sku?: string | null
          cost_price?: number
          selling_price?: number
          stock_quantity?: number
          low_stock_threshold?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          business_id: string
          name: string
          contact_number: string | null
          outstanding_balance: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          contact_number?: string | null
          outstanding_balance?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          contact_number?: string | null
          outstanding_balance?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          business_id: string
          customer_id: string | null
          cashier_id: string
          subtotal: number
          discount: number
          total: number
          payment_method: 'cash' | 'gcash' | 'maya' | 'credit'
          amount_tendered: number
          change_amount: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          customer_id?: string | null
          cashier_id: string
          subtotal: number
          discount?: number
          total: number
          payment_method?: 'cash' | 'gcash' | 'maya' | 'credit'
          amount_tendered?: number
          change_amount?: number
          notes?: string | null
          created_at?: string
        }
        Update: Record<string, never>
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_price: number
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_price: number
        }
        Update: Record<string, never>
      }
      customer_ledger: {
        Row: {
          id: string
          business_id: string
          customer_id: string
          sale_id: string | null
          type: 'debit' | 'credit'
          amount: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          customer_id: string
          sale_id?: string | null
          type: 'debit' | 'credit'
          amount: number
          notes?: string | null
          created_at?: string
        }
        Update: Record<string, never>
      }
      inventory_movements: {
        Row: {
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
        Insert: {
          id?: string
          business_id: string
          product_id: string
          type: 'in' | 'out' | 'adjustment'
          quantity: number
          reference_id?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: Record<string, never>
      }
      laundry_services: {
        Row: {
          id: string
          business_id: string
          name: string
          pricing_type: 'fixed' | 'per_kg'
          price: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          pricing_type?: 'fixed' | 'per_kg'
          price?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          pricing_type?: 'fixed' | 'per_kg'
          price?: number
          is_active?: boolean
        }
      }
      laundry_orders: {
        Row: {
          id: string
          business_id: string
          customer_id: string | null
          customer_name: string
          customer_contact: string | null
          service_id: string
          weight_kg: number | null
          total_amount: number
          status: 'received' | 'washing' | 'drying' | 'ready' | 'claimed'
          notes: string | null
          received_at: string
          ready_at: string | null
          claimed_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          customer_id?: string | null
          customer_name: string
          customer_contact?: string | null
          service_id: string
          weight_kg?: number | null
          total_amount?: number
          status?: 'received' | 'washing' | 'drying' | 'ready' | 'claimed'
          notes?: string | null
          received_at?: string
          ready_at?: string | null
          claimed_at?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          customer_name?: string
          customer_contact?: string | null
          weight_kg?: number | null
          total_amount?: number
          status?: 'received' | 'washing' | 'drying' | 'ready' | 'claimed'
          notes?: string | null
          ready_at?: string | null
          claimed_at?: string | null
          updated_at?: string
        }
      }
      rooms: {
        Row: {
          id: string
          business_id: string
          room_number: string
          floor: string | null
          type: string | null
          monthly_rate: number
          status: 'available' | 'occupied' | 'maintenance'
          amenities: string[]
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          room_number: string
          floor?: string | null
          type?: string | null
          monthly_rate?: number
          status?: 'available' | 'occupied' | 'maintenance'
          amenities?: string[]
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          room_number?: string
          floor?: string | null
          type?: string | null
          monthly_rate?: number
          status?: 'available' | 'occupied' | 'maintenance'
          amenities?: string[]
          is_active?: boolean
          updated_at?: string
        }
      }
      tenants: {
        Row: {
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
        }
        Insert: {
          id?: string
          business_id: string
          room_id?: string | null
          name: string
          contact_number?: string | null
          email?: string | null
          id_type?: string | null
          id_number?: string | null
          start_date: string
          end_date?: string | null
          monthly_rate?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          room_id?: string | null
          name?: string
          contact_number?: string | null
          email?: string | null
          end_date?: string | null
          monthly_rate?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      rent_bills: {
        Row: {
          id: string
          business_id: string
          tenant_id: string
          room_id: string
          billing_period: string
          due_date: string
          amount: number
          paid_amount: number
          status: 'pending' | 'paid' | 'overdue' | 'partial'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          tenant_id: string
          room_id: string
          billing_period: string
          due_date: string
          amount: number
          paid_amount?: number
          status?: 'pending' | 'paid' | 'overdue' | 'partial'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          paid_amount?: number
          status?: 'pending' | 'paid' | 'overdue' | 'partial'
          notes?: string | null
          due_date?: string
          updated_at?: string
        }
      }
      rent_payments: {
        Row: {
          id: string
          business_id: string
          bill_id: string
          amount: number
          payment_method: 'cash' | 'gcash' | 'maya' | 'credit'
          reference_number: string | null
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          bill_id: string
          amount: number
          payment_method?: 'cash' | 'gcash' | 'maya' | 'credit'
          reference_number?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: Record<string, never>
      }
    }
    Views: Record<string, never>
    Functions: {
      is_business_member: {
        Args: { p_business_id: string }
        Returns: boolean
      }
      get_business_role: {
        Args: { p_business_id: string }
        Returns: 'owner' | 'manager' | 'staff'
      }
      is_business_admin: {
        Args: { p_business_id: string }
        Returns: boolean
      }
    }
    Enums: {
      user_role: 'owner' | 'manager' | 'staff'
      business_template_key: 'sari_sari' | 'laundry' | 'room_rental'
      payment_method: 'cash' | 'gcash' | 'maya' | 'credit'
      laundry_order_status: 'received' | 'washing' | 'drying' | 'ready' | 'claimed'
      room_status: 'available' | 'occupied' | 'maintenance'
      bill_status: 'pending' | 'paid' | 'overdue' | 'partial'
      notification_status: 'unread' | 'read'
    }
  }
}
