import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditAction } from '@/types'

export async function logAudit(
  supabase: SupabaseClient,
  params: {
    businessId: string
    userId: string
    action: AuditAction
    tableName: string
    recordId: string
    oldData?: Record<string, unknown> | null
    newData?: Record<string, unknown> | null
  }
) {
  await supabase.from('audit_logs').insert({
    business_id: params.businessId,
    user_id: params.userId,
    action: params.action,
    table_name: params.tableName,
    record_id: params.recordId,
    old_data: params.oldData ?? null,
    new_data: params.newData ?? null,
  })
}
