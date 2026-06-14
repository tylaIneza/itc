'use client'
import { useState, useEffect, useCallback } from 'react'
import { PiggyBank, AlertTriangle, CheckCircle, Calendar, TrendingUp, Edit, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate, isSaturday } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useSocketEvent } from '@/hooks/use-socket'
import api from '@/lib/api'

interface CoOperaRecord {
  id: number
  date: string
  amount: number
  revenueToday: number
  businessMoney: number
  recordedBy: number
  isMissed: boolean
  isExcused: boolean
  notes: string | null
  user: { fullName: string }
}

interface CoOperaConfig {
  targetAmount: number
  minimumAmount: number
  startDate: string
}

interface TodayStatus {
  record: CoOperaRecord | null
  isSaturday: boolean
  notStarted: boolean
  startDate: string
  targetAmount: number
  canRecord: boolean
}

interface MonthlySummary {
  year: number
  month: number
  expectedDays: number
  recordedDays: number
  missingDays: number
  totalCoOpera: number
  totalRevenue: number
  totalBusinessMoney: number
  status: string
  startDate: string
  records: CoOperaRecord[]
}

interface YearlySummary {
  year: number
  months: Array<{ month: number; monthName: string; totalCoOpera: number; recordedDays: number }>
  annualTotal: number
}

function RecordCoOperaDialog({ config, onRecorded }: { config: CoOperaConfig; onRecorded: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: String(config.targetAmount), notes: '' })
  const [revenueToday, setRevenueToday] = useState(0)
  const [loadingRevenue, setLoadingRevenue] = useState(false)
  const [saving, setSaving] = useState(false)

  const businessMoney = revenueToday - parseFloat(form.amount || '0')

  useEffect(() => {
    if (!open) return
    setLoadingRevenue(true)
    api.get<{ today: { revenue: number } }>('/dashboard/overview')
      .then(res => { if (res.success) setRevenueToday(res.data.today.revenue) })
      .finally(() => setLoadingRevenue(false))
  }, [open])

  const handleSubmit = async () => {
    if (!form.amount) {
      toast({ title: 'Error', description: 'Co-opera amount is required', variant: 'destructive' })
      return
    }
    if (parseFloat(form.amount) < config.minimumAmount) {
      toast({ title: 'Error', description: `Minimum co-opera is ${formatCurrency(config.minimumAmount)}`, variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/co-opera/record', form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Co-opera Recorded!', description: `${formatCurrency(parseFloat(form.amount))} recorded successfully` })
      setOpen(false)
      onRecorded()
    } finally { setSaving(false) }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-green-600 hover:bg-green-500">
        <Plus className="w-4 h-4 mr-2" />Record Co-opera
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Co-opera</DialogTitle>
            <DialogDescription>Record today&apos;s co-opera amount</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-muted border text-sm">
              <p className="text-xs text-muted-foreground mb-1">Today&apos;s Revenue (from sales)</p>
              {loadingRevenue ? (
                <p className="text-lg font-bold text-muted-foreground">Loading...</p>
              ) : (
                <p className="text-xl font-bold">{formatCurrency(revenueToday ?? 0)}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Co-opera Amount (FRW) * <span className="text-muted-foreground text-xs">(min: {formatCurrency(config.minimumAmount)})</span></Label>
              <Input type="number" min={config.minimumAmount} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 text-sm">
              <p className="text-muted-foreground">Business Money (after co-opera)</p>
              {loadingRevenue ? (
                <p className="text-xl font-bold text-muted-foreground">Loading...</p>
              ) : (
                <>
                  <p className={`text-xl font-bold ${businessMoney >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {formatCurrency(businessMoney)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">= {formatCurrency(revenueToday)} - {formatCurrency(parseFloat(form.amount || '0'))}</p>
                </>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Input placeholder="Any notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="bg-green-600 hover:bg-green-500">
              {saving ? 'Recording...' : 'Record Co-opera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EditAmountDialog({ config, onUpdated }: { config: CoOperaConfig; onUpdated: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ targetAmount: String(config.targetAmount), reason: '' })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.reason) { toast({ title: 'Error', description: 'Reason is required', variant: 'destructive' }); return }
    if (parseFloat(form.targetAmount) < 17500) { toast({ title: 'Error', description: 'Minimum is 17,500 FRW', variant: 'destructive' }); return }
    setSaving(true)
    try {
      const res = await api.put('/co-opera/config', form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: 'Co-opera target updated' })
      setOpen(false)
      onUpdated()
    } finally { setSaving(false) }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Edit className="w-4 h-4 mr-2" />Edit Amount</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Co-opera Target</DialogTitle>
            <DialogDescription>Minimum is 17,500 FRW</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>New Target Amount (FRW)</Label>
              <Input type="number" min={17500} value={form.targetAmount} onChange={e => setForm(p => ({ ...p, targetAmount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Input placeholder="Reason for change" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Update Target'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function CoOperaPage() {
  const { checkPermission } = usePermissions()
  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null)
  const [config, setConfig] = useState<CoOperaConfig>({ targetAmount: 17500, minimumAmount: 17500, startDate: '2026-06-14' })
  const [history, setHistory] = useState<CoOperaRecord[]>([])
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null)
  const [yearly, setYearly] = useState<YearlySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const isSat = isSaturday(today)

  const canRecord = checkPermission('record_co_opera')
  const canEditAmount = checkPermission('edit_co_opera_amount')
  const canViewHistory = checkPermission('view_co_opera_history')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [todayRes, configRes, historyRes, monthlyRes, yearlyRes] = await Promise.all([
        api.get<TodayStatus>('/co-opera/today'),
        api.get<CoOperaConfig>('/co-opera/config'),
        canViewHistory ? api.get<{ records: CoOperaRecord[] }>('/co-opera/history?limit=30') : Promise.resolve({ success: false, data: { records: [] }, message: '' }),
        api.get<MonthlySummary>(`/co-opera/monthly-summary?year=${today.getFullYear()}&month=${today.getMonth() + 1}`),
        api.get<YearlySummary>(`/co-opera/yearly-summary?year=${today.getFullYear()}`),
      ])
      if (todayRes.success) setTodayStatus(todayRes.data)
      if (configRes.success) setConfig(configRes.data)
      if (historyRes.success) setHistory((historyRes.data as { records: CoOperaRecord[] }).records)
      if (monthlyRes.success) setMonthly(monthlyRes.data)
      if (yearlyRes.success) setYearly(yearlyRes.data)
    } finally { setLoading(false) }
  }, [canViewHistory, today.getFullYear(), today.getMonth()])

  useEffect(() => { loadData() }, [loadData])
  useSocketEvent('co-opera:recorded', useCallback(() => loadData(), [loadData]))
  useSocketEvent('co-opera:config-updated', useCallback(() => loadData(), [loadData]))

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><PiggyBank className="w-6 h-6 text-green-600" />Co-opera</h1>
          <p className="text-muted-foreground text-sm">Tracking from June 14, 2026</p>
        </div>
        <div className="flex items-center gap-2">
          {canEditAmount && <EditAmountDialog config={config} onUpdated={loadData} />}
          {canRecord && !isSat && !todayStatus?.record && !todayStatus?.notStarted && (
            <RecordCoOperaDialog config={config} onRecorded={loadData} />
          )}
        </div>
      </div>

      {/* Saturday warning */}
      {isSat && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200">
          <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
          <p className="text-sm text-orange-700 dark:text-orange-400 font-medium">
            Co-opera cannot be recorded on Saturdays because the shop is closed.
          </p>
        </div>
      )}

      {/* Not started yet notice */}
      {todayStatus?.notStarted && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200">
          <Calendar className="w-5 h-5 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
            Co-opera tracking begins on {new Date(todayStatus.startDate + 'T12:00:00').toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
            Starting from <strong>{formatCurrency(config.targetAmount)}</strong> per day.
          </p>
        </div>
      )}

      {/* Today's status */}
      <Card className={`border-l-4 ${todayStatus?.record ? 'border-l-green-500' : 'border-l-amber-500'}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Today — {today.toLocaleDateString('en-RW', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayStatus?.record ? (
            <div className="grid sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Co-opera</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(todayStatus.record.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue Today</p>
                <p className="text-xl font-bold">{formatCurrency(todayStatus.record.revenueToday)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Business Money</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(todayStatus.record.businessMoney)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="success" className="mt-1"><CheckCircle className="w-3 h-3 mr-1" />Recorded</Badge>
              </div>
            </div>
          ) : todayStatus?.notStarted ? (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Tracking starts</p>
                <p className="text-xl font-bold text-blue-600">
                  {new Date(todayStatus.startDate + 'T12:00:00').toLocaleDateString('en-RW', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <Badge variant="info" className="text-sm">Not Started Yet</Badge>
            </div>
          ) : !isSat ? (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Target for today</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(config.targetAmount)}</p>
              </div>
              <Badge variant="warning" className="text-sm">Not Recorded Yet</Badge>
              {canRecord && <RecordCoOperaDialog config={config} onRecorded={loadData} />}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No recording on Saturdays</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="monthly">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">Yearly</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Monthly */}
        <TabsContent value="monthly" className="space-y-4">
          {monthly && (
            <>
              {monthly.status === 'NOT_STARTED' ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <PiggyBank className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium text-muted-foreground">Co-opera tracking hasn&apos;t started yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Recording begins on {monthly.startDate ? new Date(monthly.startDate + 'T12:00:00').toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'June 14, 2026'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{monthNames[monthly.month - 1]} {monthly.year}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <p className="text-2xl font-bold">{monthly.expectedDays}</p>
                      <p className="text-xs text-muted-foreground">Expected Days</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{monthly.recordedDays}</p>
                      <p className="text-xs text-muted-foreground">Recorded Days</p>
                    </div>
                    <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600">{monthly.missingDays}</p>
                      <p className="text-xs text-muted-foreground">Missing Days</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(monthly.totalCoOpera)}</p>
                      <p className="text-xs text-muted-foreground">Total Co-opera</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                    <span>Total Revenue: <strong>{formatCurrency(monthly.totalRevenue)}</strong></span>
                    <span>Business Money: <strong>{formatCurrency(monthly.totalBusinessMoney)}</strong></span>
                  </div>
                </CardContent>
              </Card>
              )}

              {monthly.records.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Co-opera</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Revenue</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Business Money</TableHead>
                          <TableHead className="hidden md:table-cell">Recorded By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthly.records.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                            <TableCell className="text-right font-semibold text-green-600">{formatCurrency(r.amount)}</TableCell>
                            <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(r.revenueToday)}</TableCell>
                            <TableCell className="text-right text-sm text-blue-600 hidden sm:table-cell">{formatCurrency(r.businessMoney)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{r.user?.fullName}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Yearly */}
        <TabsContent value="yearly">
          {yearly && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {yearly.year} Annual Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Recorded Days</TableHead>
                      <TableHead className="text-right">Total Co-opera</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yearly.months.map(m => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{m.monthName}</TableCell>
                        <TableCell className="text-right">{m.recordedDays}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {m.totalCoOpera > 0 ? formatCurrency(m.totalCoOpera) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Annual Total</TableCell>
                      <TableCell className="text-right">{yearly.months.reduce((sum, m) => sum + m.recordedDays, 0)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(yearly.annualTotal)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No co-opera records yet</div>
              ) : (
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Co-opera</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Revenue</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Business Money</TableHead>
                      <TableHead className="hidden md:table-cell">Recorded By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">{formatCurrency(r.amount)}</TableCell>
                        <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(r.revenueToday)}</TableCell>
                        <TableCell className="text-right text-sm text-blue-600 hidden sm:table-cell">{formatCurrency(r.businessMoney)}</TableCell>
                        <TableCell className="text-sm hidden md:table-cell">{r.user?.fullName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
