'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Plus, Edit, DoorOpen, DoorClosed, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { Room, RoomStatus } from '@/types'
import { RoomDialog } from './room-dialog'

const STATUS_CONFIG: Record<RoomStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  available:   { label: 'Available',   color: 'bg-green-100 text-green-700', icon: DoorOpen },
  occupied:    { label: 'Occupied',    color: 'bg-blue-100 text-blue-700',   icon: DoorClosed },
  maintenance: { label: 'Maintenance', color: 'bg-amber-100 text-amber-700', icon: Wrench },
}

interface Props { businessId: string; initialRooms: Room[] }

export function RoomsView({ businessId, initialRooms }: Props) {
  const [rooms, setRooms] = useState(initialRooms)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null)

  const refresh = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('rooms').select('*').eq('business_id', businessId).eq('is_active', true).order('room_number')
    setRooms(data ?? [])
  }

  const available = rooms.filter(r => r.status === 'available').length
  const occupied = rooms.filter(r => r.status === 'occupied').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Rooms</h1>
          <p className="text-muted-foreground text-sm">{rooms.length} total · {available} available · {occupied} occupied</p>
        </div>
        <Button onClick={() => { setEditRoom(null); setDialogOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Room
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {rooms.length === 0 ? (
          <p className="col-span-full text-center py-8 text-muted-foreground">No rooms yet. Add your first room.</p>
        ) : (
          rooms.map(room => {
            const cfg = STATUS_CONFIG[room.status]
            const Icon = cfg.icon
            return (
              <Card key={room.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xl font-bold">Room {room.room_number}</p>
                      {room.floor && <p className="text-xs text-muted-foreground">Floor {room.floor}</p>}
                      {room.type && <p className="text-xs text-muted-foreground capitalize">{room.type}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="font-semibold text-primary">{formatCurrency(room.monthly_rate)}/mo</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 text-xs w-full"
                    onClick={() => { setEditRoom(room); setDialogOpen(true) }}
                  >
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <RoomDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        room={editRoom}
        onSuccess={() => { refresh(); setDialogOpen(false) }}
      />
    </div>
  )
}
