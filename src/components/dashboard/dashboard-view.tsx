'use client'

import type { DashboardWidgetConfig, BusinessTemplateKey } from '@/types'
import { WidgetRenderer } from './widget-renderer'
import { cn } from '@/lib/utils'

interface DashboardViewProps {
  businessId: string
  businessName: string
  templateKey: BusinessTemplateKey
  widgets: DashboardWidgetConfig[]
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'col-span-1',
  md: 'col-span-1 md:col-span-1',
  lg: 'col-span-1 md:col-span-2',
  xl: 'col-span-1 md:col-span-2 lg:col-span-3',
}

export function DashboardView({ businessId, businessName, templateKey, widgets }: DashboardViewProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{businessName}</h1>
        <p className="text-muted-foreground text-sm capitalize">{templateKey.replace('_', ' ')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map(widget => (
          <div key={widget.id} className={cn(SIZE_CLASS[widget.size] ?? 'col-span-1')}>
            <WidgetRenderer widget={widget} businessId={businessId} templateKey={templateKey} />
          </div>
        ))}
      </div>
    </div>
  )
}
