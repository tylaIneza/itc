'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import api from '@/lib/api'

interface CapitalInjection {
  id: number; amount: number; description: string; date: string
  user: { fullName: string }
}

export default function CapitalPage() {
  const { toast } = useToast()
  const [injections, setInjections] = useState<CapitalInjection[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ amount: '', description: '', date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ injections: CapitalInjection[]; total: number; totalAmount: number }>('/capital')
      if (res.success) { setInjections(res.data.injections); setTotalAmount(res.data.totalAmount) }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.amount || !form.description || !form.date) {
      toast({ title: 'Error', description: 'All fields required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/capital', form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: 'Capital injection recorded' })
      setShowForm(false)
      setForm({ amount: '', description: '', date: new Date().toISOString().split('T')[0] })
      load()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Capital Injection</h1>
          <p className="text-muted-foreground text-sm">Track business capital investments</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" />Add Capital</Button>
      </div>

      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-xl">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Capital Injected</p>
              <p className="text-3xl font-bold text-blue-600">{formatCurrency(totalAmount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capital History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : injections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No capital injections yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Added By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {injections.map(inj => (
                  <TableRow key={inj.id}>
                    <TableCell>{formatDate(inj.date)}</TableCell>
                    <TableCell>{inj.description}</TableCell>
                    <TableCell className="text-right font-semibold text-blue-600">{formatCurrency(inj.amount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inj.user?.fullName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Capital Injection</DialogTitle>
            <DialogDescription>Record a new capital investment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Amount (FRW) *</Label>
              <Input type="number" min={0} placeholder="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description *</Label>
              <Input placeholder="Capital injection purpose" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Add Capital'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
