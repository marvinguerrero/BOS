'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Loader2, Plus, Trash2, ChevronUp, ChevronDown,
  ArrowRight, GitBranch,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { OrderStatus, WorkflowDefinition, WorkflowTransition } from '@/types'

// ── Color palette ─────────────────────────────────────────────────────────────

const COLORS = [
  { value: 'blue',   bg: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700'   },
  { value: 'yellow', bg: 'bg-yellow-400',  badge: 'bg-yellow-100 text-yellow-700' },
  { value: 'orange', bg: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-700' },
  { value: 'green',  bg: 'bg-green-500',   badge: 'bg-green-100 text-green-700'  },
  { value: 'teal',   bg: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700'   },
  { value: 'purple', bg: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-700' },
  { value: 'red',    bg: 'bg-red-500',     badge: 'bg-red-100 text-red-700'     },
  { value: 'slate',  bg: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700'  },
]

function StatusDot({ color }: { color: string | null }) {
  const entry = COLORS.find(c => c.value === color)
  return (
    <span className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', entry?.bg ?? 'bg-slate-300')} />
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  businessId: string
  workflow: WorkflowDefinition
  initialStatuses: OrderStatus[]
  initialTransitions: WorkflowTransition[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkflowManagementView({
  businessId,
  workflow,
  initialStatuses,
  initialTransitions,
}: Props) {
  const [statuses, setStatuses] = useState<OrderStatus[]>(initialStatuses)
  const [transitions, setTransitions] = useState<WorkflowTransition[]>(initialTransitions)
  const [saving, setSaving] = useState<string | null>(null)

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('blue')
  const [editTerminal, setEditTerminal] = useState(false)
  const [editDefault, setEditDefault] = useState(false)

  // ── Add status state ───────────────────────────────────────────────────────
  const [addingStatus, setAddingStatus] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('blue')

  // ── Add transition state ───────────────────────────────────────────────────
  const [addingTransition, setAddingTransition] = useState(false)
  const [newFromId, setNewFromId] = useState<string>('__any__')
  const [newToId, setNewToId] = useState<string>('')
  const [addingTrans, setAddingTrans] = useState(false)

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order),
    [statuses]
  )

  // ── Status helpers ─────────────────────────────────────────────────────────

  const startEdit = (status: OrderStatus) => {
    setEditingId(status.id)
    setEditName(status.name)
    setEditColor(status.color ?? 'blue')
    setEditTerminal(status.is_terminal)
    setEditDefault(status.is_default)
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (statusId: string) => {
    if (!editName.trim()) return
    setSaving(statusId)
    const supabase = createClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      name: editName.trim(),
      color: editColor,
      is_terminal: editTerminal,
    }

    // If setting default, clear existing default first
    if (editDefault) {
      await supabase
        .from('order_statuses')
        .update({ is_default: false })
        .eq('business_id', businessId)
        .neq('id', statusId)
    }
    updates.is_default = editDefault

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('order_statuses').update(updates).eq('id', statusId)
    if (error) { toast.error(error.message); setSaving(null); return }

    setStatuses(prev => prev.map(s => s.id === statusId ? {
      ...s, name: updates.name, color: updates.color,
      is_terminal: updates.is_terminal, is_default: updates.is_default,
    } : (editDefault && updates.is_default ? { ...s, is_default: false } : s)))
    setEditingId(null)
    setSaving(null)
    toast.success('Status updated')
  }

  const addStatus = async () => {
    if (!newName.trim()) return
    setSaving('new')
    const supabase = createClient()
    const maxSort = Math.max(0, ...statuses.map(s => s.sort_order))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('order_statuses')
      .insert({
        business_id: businessId,
        workflow_id: workflow.id,
        name: newName.trim(),
        color: newColor,
        sort_order: maxSort + 10,
        is_default: false,
        is_terminal: false,
      })
      .select()
      .single()
    if (error) { toast.error(error.message); setSaving(null); return }
    setStatuses(prev => [...prev, data as OrderStatus])
    setNewName('')
    setNewColor('blue')
    setAddingStatus(false)
    setSaving(null)
    toast.success('Status added')
  }

  const moveStatus = async (statusId: string, direction: 'up' | 'down') => {
    const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(s => s.id === statusId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const a = sorted[idx]
    const b = sorted[swapIdx]
    setSaving(statusId)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const [r1, r2] = await Promise.all([
      db.from('order_statuses').update({ sort_order: b.sort_order }).eq('id', a.id),
      db.from('order_statuses').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    if (r1.error || r2.error) { toast.error('Failed to reorder'); setSaving(null); return }
    setStatuses(prev => prev.map(s => {
      if (s.id === a.id) return { ...s, sort_order: b.sort_order }
      if (s.id === b.id) return { ...s, sort_order: a.sort_order }
      return s
    }))
    setSaving(null)
  }

  // ── Transition helpers ─────────────────────────────────────────────────────

  const addTransition = async () => {
    if (!newToId) return
    const fromId = newFromId === '__any__' ? null : newFromId
    setAddingTrans(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('workflow_transitions')
      .insert({
        workflow_id: workflow.id,
        from_status_id: fromId,
        to_status_id: newToId,
        sort_order: transitions.length,
      })
      .select()
      .single()
    if (error) { toast.error(error.message); setAddingTrans(false); return }
    setTransitions(prev => [...prev, data as WorkflowTransition])
    setNewFromId('__any__')
    setNewToId('')
    setAddingTransition(false)
    setAddingTrans(false)
    toast.success('Transition added')
  }

  const deleteTransition = async (id: string) => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('workflow_transitions').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setTransitions(prev => prev.filter(t => t.id !== id))
    toast.success('Transition removed')
  }

  const statusNameById = useMemo(
    () => new Map(statuses.map(s => [s.id, s])),
    [statuses]
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workflow Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure the stages and transitions for <span className="font-medium">{workflow.name}</span>.
        </p>
      </div>

      {/* ── Statuses ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Stages
          </CardTitle>
          <CardDescription>
            Define the stages an order moves through. Drag up/down to reorder.
            The default stage is set when a new order is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedStatuses.length === 0 && (
            <p className="text-sm text-muted-foreground">No stages configured yet.</p>
          )}

          {sortedStatuses.map((status, idx) => (
            <div key={status.id}>
              {editingId === status.id ? (
                // ── Edit form ────────────────────────────────────────────
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Stage Name</Label>
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(status.id) }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Color</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {COLORS.map(c => (
                          <button
                            key={c.value}
                            type="button"
                            title={c.value}
                            onClick={() => setEditColor(c.value)}
                            className={cn(
                              'w-6 h-6 rounded-full transition-all',
                              c.bg,
                              editColor === c.value
                                ? 'ring-2 ring-offset-1 ring-foreground scale-110'
                                : 'opacity-70 hover:opacity-100'
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editDefault}
                        onChange={e => setEditDefault(e.target.checked)}
                        className="rounded"
                      />
                      Default (new orders start here)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editTerminal}
                        onChange={e => setEditTerminal(e.target.checked)}
                        className="rounded"
                      />
                      Terminal (marks order as complete)
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(status.id)} disabled={saving === status.id || !editName.trim()}>
                      {saving === status.id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                  </div>
                </div>
              ) : (
                // ── Display row ──────────────────────────────────────────
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 hover:bg-muted/30 transition-colors">
                  <StatusDot color={status.color} />
                  <span className="flex-1 text-sm font-medium">{status.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {status.is_default && (
                      <Badge variant="secondary" className="text-xs py-0">Default</Badge>
                    )}
                    {status.is_terminal && (
                      <Badge variant="outline" className="text-xs py-0 text-muted-foreground">Terminal</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7"
                      disabled={idx === 0 || saving === status.id}
                      onClick={() => moveStatus(status.id, 'up')}
                    >
                      {saving === status.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7"
                      disabled={idx === sortedStatuses.length - 1 || saving === status.id}
                      onClick={() => moveStatus(status.id, 'down')}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => startEdit(status)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Add status ──────────────────────────────────────────────── */}
          {addingStatus ? (
            <div className="rounded-lg border p-3 space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Stage Name</Label>
                  <Input
                    placeholder="e.g. In Progress"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') addStatus() }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.value}
                        onClick={() => setNewColor(c.value)}
                        className={cn(
                          'w-6 h-6 rounded-full transition-all',
                          c.bg,
                          newColor === c.value
                            ? 'ring-2 ring-offset-1 ring-foreground scale-110'
                            : 'opacity-70 hover:opacity-100'
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addStatus} disabled={saving === 'new' || !newName.trim()}>
                  {saving === 'new' && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  Add Stage
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAddingStatus(false); setNewName('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline" size="sm" className="gap-2 mt-1"
              onClick={() => setAddingStatus(true)}
            >
              <Plus className="h-4 w-4" />
              Add Stage
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Transitions ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            Transitions
          </CardTitle>
          <CardDescription>
            {transitions.length === 0
              ? 'No transitions configured. Orders advance through stages in sequence by order.'
              : `${transitions.length} allowed transition${transitions.length === 1 ? '' : 's'} configured.`}
            {' '}Defining transitions restricts which stage changes are allowed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {transitions.length === 0 && !addingTransition && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              Currently using <span className="font-medium">automatic linear order</span> — stages
              advance one step at a time in the order shown above.
            </div>
          )}

          {transitions.map(t => {
            const from = t.from_status_id ? statusNameById.get(t.from_status_id) : null
            const to = statusNameById.get(t.to_status_id)
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
                <div className="flex-1 flex items-center gap-2 text-sm">
                  {from ? (
                    <>
                      <StatusDot color={from.color} />
                      <span>{from.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">Any stage</span>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {to ? (
                    <>
                      <StatusDot color={to.color} />
                      <span>{to.name}</span>
                    </>
                  ) : (
                    <span className="text-destructive text-xs">Unknown</span>
                  )}
                  {t.label && <span className="text-xs text-muted-foreground">({t.label})</span>}
                </div>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteTransition(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}

          {/* ── Add transition ─────────────────────────────────────────── */}
          {addingTransition ? (
            <div className="rounded-lg border p-3 space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">From Stage</Label>
                  <Select value={newFromId} onValueChange={(v: string | null) => setNewFromId(v ?? '__any__')}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any__">Any stage</SelectItem>
                      {sortedStatuses.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To Stage</Label>
                  <Select value={newToId} onValueChange={(v: string | null) => setNewToId(v ?? '')}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedStatuses
                        .filter(s => s.id !== (newFromId === '__any__' ? undefined : newFromId))
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addTransition} disabled={addingTrans || !newToId}>
                  {addingTrans && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  Add Transition
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAddingTransition(false); setNewFromId('__any__'); setNewToId('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline" size="sm" className="gap-2 mt-1"
              onClick={() => setAddingTransition(true)}
              disabled={sortedStatuses.length < 2}
            >
              <Plus className="h-4 w-4" />
              Add Transition
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
