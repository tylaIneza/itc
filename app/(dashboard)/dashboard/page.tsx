'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, ShoppingCart, Package, PiggyBank, DollarSign,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Banknote, Wallet
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts'
import { useSocketEvent } from '@/hooks/use-socket'
import { toast } from '@/hooks/use-toast'

interface DashboardData {
  today: {
    revenue: number
    salesCount: number
    expenses: number
    coOpera: number
    businessMoney: number
    netProfit: number
  }
  week: { revenue: number }
  month: { revenue: number }
  totalCapital: number
  totalBusinessBalance: number
  lowStockCount: number
  coOperaToday: { amount: number; revenueToday: number; businessMoney: number } | null
}

interface ChartData {
  date: string
  revenue: number
  sales: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

function StatCard({
  title, value, icon: Icon, color, change, prefix
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  color: string
  change?: { value: number; label: string }
  prefix?: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <p className="text-base sm:text-lg xl:text-xl font-bold leading-tight truncate">
              {prefix}{typeof value === 'number' ? formatCurrency(value) : value}
            </p>
            {change && (
              <p className={`text-xs flex items-center gap-1 ${change.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {change.value >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span className="truncate">{change.label}</span>
              </p>
            )}
          </div>
          <div className={`p-2.5 rounded-xl shrink-0 ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
      <div className={`absolute bottom-0 left-0 right-0 h-1 ${color}`} />
    </Card>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [recentTransactions, setRecentTransactions] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [coOperaConfig, setCoOperaConfig] = useState<{ targetAmount: number }>({ targetAmount: 17500 })

  const loadData = useCallback(async () => {
    try {
      const [overview, chart, products, transactions, config] = await Promise.all([
        api.get<DashboardData>('/dashboard/overview'),
        api.get<ChartData[]>('/dashboard/revenue-chart?days=7'),
        api.get<TopProduct[]>('/dashboard/top-products?limit=5'),
        api.get('/dashboard/recent-transactions'),
        api.get<{ targetAmount: number }>('/co-opera/config'),
      ])

      if (overview.success) setDashboardData(overview.data)
      if (chart.success) setChartData(chart.data)
      if (products.success) setTopProducts(products.data)
      if (transactions.success) setRecentTransactions(transactions.data as unknown[])
      if (config.success) setCoOperaConfig(config.data)
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Real-time updates
  useSocketEvent('sale:created', useCallback(() => {
    loadData()
    toast({ title: 'New Sale', description: 'A new sale has been recorded', variant: 'default' })
  }, [loadData]))

  useSocketEvent('dashboard:refresh', useCallback(() => { loadData() }, [loadData]))

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-20" /></CardContent></Card>
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
          <Card><CardContent className="p-5"><Skeleton className="h-64" /></CardContent></Card>
        </div>
      </div>
    )
  }

  const d = dashboardData
  const isAdmin = user?.role?.name === 'Admin' || user?.role?.name === 'Manager'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top header */}
      <div>
        <h1 className="text-2xl font-bold">
          {user?.role?.name === 'Seller' ? `Hello, ${user.fullName.split(' ')[0]}! 👋` : 'Business Overview'}
        </h1>
        <p className="text-muted-foreground text-sm">{new Date().toLocaleDateString('en-RW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Low stock alert */}
      {(d?.lowStockCount || 0) > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <span className="font-semibold">{d?.lowStockCount} product(s)</span> are running low on stock. Check the Products page.
          </p>
          <Button variant="warning" size="sm" className="ml-auto" onClick={() => window.location.href = '/products?lowStock=true'}>
            View
          </Button>
        </div>
      )}

      {/* Stats grid — admin/manager see all 6 cards, sellers see only revenue + sales */}
      {isAdmin ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard title="Revenue Today" value={d?.today.revenue || 0} icon={TrendingUp} color="bg-blue-600" />
          <StatCard title="Sales Count" value={d?.today.salesCount || 0} icon={ShoppingCart} color="bg-purple-600" prefix="" />
          <StatCard title="Expenses" value={d?.today.expenses || 0} icon={Receipt} color="bg-red-500" />
          <StatCard title="Co-opera" value={d?.today.coOpera || 0} icon={PiggyBank} color="bg-green-600" />
          <StatCard title="Business Money" value={d?.totalBusinessBalance || 0} icon={Banknote} color="bg-cyan-600" />
          <StatCard title="Net Profit" value={d?.today.netProfit || 0} icon={DollarSign} color={d && d.today.netProfit >= 0 ? 'bg-emerald-600' : 'bg-red-600'} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <StatCard title="Revenue Today" value={d?.today.revenue || 0} icon={TrendingUp} color="bg-blue-600" />
          <StatCard title="Sales Today" value={d?.today.salesCount || 0} icon={ShoppingCart} color="bg-purple-600" prefix="" />
        </div>
      )}

      {/* Total Business Balance — admin/manager only */}
      {isAdmin && (
        <Card className="border-l-4 border-l-blue-600 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 rounded-xl shrink-0">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Total Business Balance</p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">{formatCurrency(d?.totalBusinessBalance || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Capital + All Revenue − All Expenses − All Co-opera</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">Capital Injected</p>
                <p className="text-lg font-semibold">{formatCurrency(d?.totalCapital || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Co-opera widget — admin/manager only */}
      {isAdmin && (
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="w-5 h-5 text-green-600" />
            Co-opera Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Target</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(coOperaConfig.targetAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Recorded Today</p>
              <p className="text-xl font-bold">{d?.coOperaToday ? formatCurrency(d.coOperaToday.amount) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              {d?.coOperaToday ? (
                <Badge variant="success" className="text-sm">✓ Recorded</Badge>
              ) : (
                <Badge variant="warning" className="text-sm">Not Recorded</Badge>
              )}
            </div>
          </div>
          {d?.coOperaToday && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Co-opera / Revenue</span>
                <span>{((d.coOperaToday.amount / d.today.revenue) * 100).toFixed(1)}%</span>
              </div>
              <Progress value={Math.min((d.coOperaToday.amount / coOperaConfig.targetAmount) * 100, 100)} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Revenue - Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={{ fill: '#2563eb', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-600" />
              Top Products (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                <Bar dataKey="revenue" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Weekly & Monthly summary */}
      {isAdmin && (
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-1">This Week Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(d?.week.revenue || 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-1">This Month Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(d?.month.revenue || 0)}</p>
            </CardContent>
          </Card>
          <Card className="border border-blue-200 dark:border-blue-800">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Total Business Balance</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(d?.totalBusinessBalance || 0)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No transactions yet today</p>
          ) : (
            <div className="space-y-3">
              {(recentTransactions as Array<{
                id: number
                invoiceNumber: string
                totalAmount: number
                createdAt: string
                user: { fullName: string }
                items: Array<{ product: { name: string } }>
              }>).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{sale.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.user?.fullName} · {sale.items?.length || 0} item(s) · {formatDate(sale.createdAt)}
                    </p>
                  </div>
                  <span className="font-semibold text-green-600">{formatCurrency(sale.totalAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Missing import
function Receipt({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" />
    </svg>
  )
}
