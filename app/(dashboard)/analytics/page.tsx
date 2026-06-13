'use client'
import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, DollarSign, PiggyBank, Banknote, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts'

type FilterType = 'today' | 'week' | 'month' | 'year'

interface Summary {
  revenue: number
  expenses: number
  coOpera: number
  businessMoney: number
  netProfit: number
  salesCount: number
}

interface TrendData { date: string; revenue: number; expenses: number; coOpera: number }
interface TopProduct { name: string; revenue: number; quantity: number; profit: number }
interface ExpenseBreakdown { category: string; total: number; count: number }

const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2']

export default function AnalyticsPage() {
  const [filter, setFilter] = useState<FilterType>('month')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trend, setTrend] = useState<TrendData[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [expenseBreakdown, setExpenseBreakdown] = useState<ExpenseBreakdown[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const days = filter === 'today' ? 1 : filter === 'week' ? 7 : filter === 'month' ? 30 : 365
      const [summaryRes, trendRes, productsRes, expensesRes] = await Promise.all([
        api.get<Summary>(`/analytics/summary?filter=${filter}`),
        api.get<TrendData[]>(`/analytics/revenue-trend?days=${days}`),
        api.get<TopProduct[]>(`/analytics/top-products?filter=${filter}&limit=8`),
        api.get<ExpenseBreakdown[]>(`/analytics/expense-breakdown?filter=${filter}`),
      ])
      if (summaryRes.success) setSummary(summaryRes.data)
      if (trendRes.success) setTrend(trendRes.data)
      if (productsRes.success) setTopProducts(productsRes.data)
      if (expensesRes.success) setExpenseBreakdown(expensesRes.data)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])

  const filters: { label: string; value: FilterType }[] = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'This Year', value: 'year' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground text-sm">Business performance overview</p>
        </div>
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {filters.map(f => (
            <Button
              key={f.value}
              variant={filter === f.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter(f.value)}
              className="text-xs"
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { title: 'Revenue', value: summary?.revenue || 0, icon: TrendingUp, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50' },
            { title: 'Expenses', value: summary?.expenses || 0, icon: DollarSign, color: 'text-red-500 bg-red-50 dark:bg-red-950/50' },
            { title: 'Co-opera', value: summary?.coOpera || 0, icon: PiggyBank, color: 'text-green-600 bg-green-50 dark:bg-green-950/50' },
            { title: 'Business Money', value: summary?.businessMoney || 0, icon: Banknote, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50' },
            { title: 'Net Profit', value: summary?.netProfit || 0, icon: BarChart3, color: (summary?.netProfit || 0) >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' : 'text-red-600 bg-red-50 dark:bg-red-950/50' },
          ].map((card) => (
            <Card key={card.title}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded-lg ${card.color}`}>
                    <card.icon className="w-3.5 h-3.5" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">{card.title}</p>
                <p className="text-sm font-bold leading-tight truncate">{formatCurrency(card.value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue & Expenses Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#2563eb20" name="Revenue" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="#dc2626" fill="#dc262620" name="Expenses" strokeWidth={2} />
                <Area type="monotone" dataKey="coOpera" stroke="#059669" fill="#05966920" name="Co-opera" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Products by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
                <Bar dataKey="revenue" name="Revenue" fill="#7c3aed" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={expenseBreakdown} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {expenseBreakdown.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary && [
              { label: 'Total Revenue', value: summary.revenue, color: 'text-blue-600' },
              { label: 'Total Expenses', value: summary.expenses, color: 'text-red-500' },
              { label: 'Total Co-opera', value: summary.coOpera, color: 'text-green-600' },
              { label: 'Business Money', value: summary.businessMoney, color: 'text-cyan-600' },
              { label: 'Net Profit', value: summary.netProfit, color: summary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center py-2 border-b last:border-0">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <span className={`font-semibold ${item.color}`}>{formatCurrency(item.value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
