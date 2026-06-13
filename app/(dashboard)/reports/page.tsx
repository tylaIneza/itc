'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, FileSpreadsheet, TrendingUp, DollarSign, PiggyBank, Banknote, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import api from '@/lib/api'

type Period = 'daily' | 'weekly' | 'monthly'

interface ProfitData {
  revenue: number
  expenses: number
  coOpera: number
  businessMoney: number
  grossProfit: number
  netProfit: number
  profitMargin: number | string
}

interface SaleRecord {
  id: number; invoiceNumber: string; totalAmount: number | string
  createdAt: string; user: { fullName: string }; items: unknown[]
}

interface ExpenseRecord {
  id: number; description: string; amount: number | string
  date: string; category: { name: string }; user: { fullName: string }
}

interface CoOperaRecord {
  id: number; date: string; amount: number | string
  revenueToday: number | string; businessMoney: number | string; user: { fullName: string }
}

interface ReportData {
  profit: ProfitData | null
  sales: SaleRecord[]; salesCount: number; salesTotal: number
  expenses: ExpenseRecord[]; expensesTotal: number
  coOpera: CoOperaRecord[]; coOperaTotal: number
}

function getDateRange(period: Period) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)
  if (period === 'daily') return { startDate: today, endDate: today }
  if (period === 'weekly') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    const mon = new Date(now); mon.setDate(now.getDate() - day)
    return { startDate: fmt(mon), endDate: today }
  }
  return { startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: today }
}

function getPeriodLabel(period: Period) {
  const { startDate, endDate } = getDateRange(period)
  return startDate === endDate ? startDate : `${startDate} – ${endDate}`
}

export default function ReportsPage() {
  const { toast } = useToast()
  const { checkPermission } = usePermissions()
  const [activePeriod, setActivePeriod] = useState<Period>('daily')
  const [data, setData] = useState<Record<Period, ReportData | null>>({ daily: null, weekly: null, monthly: null })
  const [loading, setLoading] = useState<Record<Period, boolean>>({ daily: true, weekly: false, monthly: false })
  const [error, setError] = useState<Record<Period, string | null>>({ daily: null, weekly: null, monthly: null })
  const loadedRef = useRef<Set<Period>>(new Set())

  const canExportPDF = checkPermission('export_pdf')
  const canExportExcel = checkPermission('export_excel')

  const loadPeriod = useCallback(async (period: Period, force = false) => {
    if (loadedRef.current.has(period) && !force) return
    loadedRef.current.add(period)
    setLoading(prev => ({ ...prev, [period]: true }))
    setError(prev => ({ ...prev, [period]: null }))
    try {
      const { startDate, endDate } = getDateRange(period)
      const params = `?startDate=${startDate}&endDate=${endDate}`
      const [profitRes, salesRes, expensesRes, coOperaRes] = await Promise.all([
        api.get<ProfitData>(`/reports/profit${params}`),
        api.get<{ sales: SaleRecord[]; summary: { total: number; count: number } }>(`/reports/sales${params}`),
        api.get<{ expenses: ExpenseRecord[]; summary: { total: number; count: number } }>(`/reports/expenses${params}`),
        api.get<{ records: CoOperaRecord[]; summary: { totalCoOpera: number } }>(`/reports/co-opera${params}`),
      ])
      setData(prev => ({
        ...prev,
        [period]: {
          profit: profitRes.success ? profitRes.data : null,
          sales: salesRes.success ? salesRes.data.sales ?? [] : [],
          salesCount: salesRes.success ? (salesRes.data.summary?.count ?? 0) : 0,
          salesTotal: salesRes.success ? (salesRes.data.summary?.total ?? 0) : 0,
          expenses: expensesRes.success ? expensesRes.data.expenses ?? [] : [],
          expensesTotal: expensesRes.success ? (expensesRes.data.summary?.total ?? 0) : 0,
          coOpera: coOperaRes.success ? coOperaRes.data.records ?? [] : [],
          coOperaTotal: coOperaRes.success ? (coOperaRes.data.summary?.totalCoOpera ?? 0) : 0,
        },
      }))
    } catch (err) {
      console.error('Report load error:', err)
      setError(prev => ({ ...prev, [period]: 'Failed to load report data' }))
      loadedRef.current.delete(period)
    } finally {
      setLoading(prev => ({ ...prev, [period]: false }))
    }
  }, [])

  // Load daily on mount, load other periods when first visited
  useEffect(() => {
    loadPeriod(activePeriod)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePeriod])

  const handleRefresh = () => {
    loadedRef.current.delete(activePeriod)
    loadPeriod(activePeriod, true)
  }

  const exportPDF = async (period: Period) => {
    const d = data[period]
    if (!d) return
    const { default: jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default
    const doc = new jsPDF()
    doc.setFontSize(18); doc.text('Tyla Shop MIS', 14, 18)
    doc.setFontSize(13); doc.text(`${period.toUpperCase()} REPORT`, 14, 28)
    doc.setFontSize(9); doc.text(`Period: ${getPeriodLabel(period)}`, 14, 36)
    let y = 44
    if (d.profit) {
      autoTable(doc, {
        startY: y,
        head: [['Revenue', 'Expenses', 'Co-opera', 'Net Profit', 'Margin']],
        body: [[
          formatCurrency(Number(d.profit.revenue)), formatCurrency(Number(d.profit.expenses)),
          formatCurrency(Number(d.profit.coOpera)), formatCurrency(Number(d.profit.netProfit)),
          `${d.profit.profitMargin}%`,
        ]],
        theme: 'striped',
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    }
    if (d.sales.length > 0) {
      doc.setFontSize(10); doc.text('Sales', 14, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Invoice', 'Seller', 'Amount', 'Date']],
        body: d.sales.map(s => [s.invoiceNumber, s.user?.fullName, formatCurrency(Number(s.totalAmount)), formatDate(s.createdAt)]),
      })
    }
    doc.save(`tyla-shop-${period}-report.pdf`)
    toast({ title: 'PDF Exported' })
  }

  const exportExcel = async (period: Period) => {
    const d = data[period]
    if (!d) return
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    if (d.sales.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.sales.map(s => ({
        Invoice: s.invoiceNumber, Seller: s.user?.fullName,
        Amount: Number(s.totalAmount), Date: formatDate(s.createdAt),
      }))), 'Sales')
    }
    if (d.expenses.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.expenses.map(e => ({
        Date: formatDate(e.date), Category: e.category?.name,
        Description: e.description, Amount: Number(e.amount),
      }))), 'Expenses')
    }
    if (d.coOpera.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.coOpera.map(r => ({
        Date: formatDate(r.date), 'Co-opera': Number(r.amount),
        Revenue: Number(r.revenueToday), 'Business Money': Number(r.businessMoney),
      }))), 'Co-opera')
    }
    XLSX.writeFile(wb, `tyla-shop-${period}-report.xlsx`)
    toast({ title: 'Excel Exported' })
  }

  const periods: { value: Period; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted-foreground text-sm">Business performance reports</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading[activePeriod]}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading[activePeriod] ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activePeriod} onValueChange={v => setActivePeriod(v as Period)}>
        <TabsList className="grid w-full grid-cols-3">
          {periods.map(p => (
            <TabsTrigger key={p.value} value={p.value} className="text-sm">
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {periods.map(p => (
          <TabsContent key={p.value} value={p.value} className="mt-5 space-y-5">
            <PeriodReport
              period={p.value}
              data={data[p.value]}
              loading={loading[p.value]}
              error={error[p.value]}
              canPDF={canExportPDF}
              canExcel={canExportExcel}
              onExportPDF={() => exportPDF(p.value)}
              onExportExcel={() => exportExcel(p.value)}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function PeriodReport({ period, data, loading, error, canPDF, canExcel, onExportPDF, onExportExcel }: {
  period: Period
  data: ReportData | null
  loading: boolean
  error: string | null
  canPDF: boolean
  canExcel: boolean
  onExportPDF: () => void
  onExportExcel: () => void
}) {
  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
    </div>
  )

  if (error) return (
    <div className="text-center py-12 text-red-500 text-sm">{error}</div>
  )

  if (!data) return (
    <div className="text-center py-12 text-muted-foreground text-sm">No data loaded yet.</div>
  )

  const profit = data.profit

  return (
    <div className="space-y-5">
      {/* Date label + exports */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{getPeriodLabel(period)}</p>
        <div className="flex gap-2">
          {canPDF && data.sales.length > 0 && (
            <Button variant="outline" size="sm" onClick={onExportPDF}>
              <FileText className="w-3.5 h-3.5 mr-1.5" />PDF
            </Button>
          )}
          {canExcel && (data.sales.length > 0 || data.expenses.length > 0) && (
            <Button variant="outline" size="sm" onClick={onExportExcel}>
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />Excel
            </Button>
          )}
        </div>
      </div>

      {/* Main summary cards */}
      {profit ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Revenue', value: Number(profit.revenue), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/40' },
              { label: 'Expenses', value: Number(profit.expenses), icon: DollarSign, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/40' },
              { label: 'Co-opera', value: Number(profit.coOpera), icon: PiggyBank, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/40' },
              { label: 'Net Profit', value: Number(profit.netProfit), icon: Banknote,
                color: Number(profit.netProfit) >= 0 ? 'text-emerald-600' : 'text-red-600',
                bg: Number(profit.netProfit) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-red-50 dark:bg-red-950/40' },
            ].map(c => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <div className={`inline-flex p-1.5 rounded-lg ${c.bg} mb-2`}>
                    <c.icon className={`w-4 h-4 ${c.color}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className={`text-sm font-bold leading-tight truncate ${c.color}`}>{formatCurrency(c.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Business Money</p>
              <p className="text-sm font-bold text-cyan-600 truncate">{formatCurrency(Number(profit.businessMoney))}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Gross Profit</p>
              <p className="text-sm font-bold text-purple-600 truncate">{formatCurrency(Number(profit.grossProfit))}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Profit Margin</p>
              <p className="text-sm font-bold text-indigo-600">{profit.profitMargin}%</p>
            </CardContent></Card>
          </div>
        </>
      ) : (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">No financial data for this period.</CardContent></Card>
      )}

      {/* Sales */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-semibold flex justify-between">
            <span>Sales <span className="font-normal text-muted-foreground">({data.salesCount})</span></span>
            <span className="text-green-600">{formatCurrency(Number(data.salesTotal))}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.sales.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No sales in this period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="hidden sm:table-cell">Seller</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sales.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p className="font-mono text-sm font-medium text-blue-600">{s.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">{s.user?.fullName} · {formatDate(s.createdAt)}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{s.user?.fullName}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">{formatCurrency(Number(s.totalAmount))}</TableCell>
                      <TableCell className="text-sm hidden md:table-cell">{formatDate(s.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-semibold flex justify-between">
            <span>Expenses <span className="font-normal text-muted-foreground">({data.expenses.length})</span></span>
            <span className="text-red-500">{formatCurrency(Number(data.expensesTotal))}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.expenses.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No expenses in this period</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expenses.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{formatDate(e.date)}</TableCell>
                      <TableCell className="hidden sm:table-cell"><Badge variant="secondary">{e.category?.name}</Badge></TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{e.description}</TableCell>
                      <TableCell className="text-right font-semibold text-red-600">{formatCurrency(Number(e.amount))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Co-opera */}
      {data.coOpera.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-semibold flex justify-between">
              <span>Co-opera <span className="font-normal text-muted-foreground">({data.coOpera.length} days)</span></span>
              <span className="text-green-600">{formatCurrency(Number(data.coOperaTotal))}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Co-opera</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Revenue</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Business Money</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.coOpera.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{formatDate(r.date)}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">{formatCurrency(Number(r.amount))}</TableCell>
                      <TableCell className="text-right text-sm hidden sm:table-cell">{formatCurrency(Number(r.revenueToday))}</TableCell>
                      <TableCell className="text-right text-sm text-blue-600 hidden sm:table-cell">{formatCurrency(Number(r.businessMoney))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
