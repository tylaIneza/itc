'use client';
import { useEffect, useState, useCallback } from 'react';
import { analyticsApi, capitalApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import type { DashboardData } from '@/types';
import StatCard from '@/components/ui/StatCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown, Package,
  Users, AlertTriangle, Activity, ArrowRight, RefreshCw, Zap, Wallet, Plus, Trash2,
} from 'lucide-react';

import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import Link from 'next/link';

export default function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const isStrictAdmin  = currentUser?.role === 'admin';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [capitalModal, setCapitalModal] = useState(false);
  const [capitalList, setCapitalList] = useState<Array<{ id: number; amount: number; description: string | null; date: string; admin: { name: string } }>>([]);
  const [capitalForm, setCapitalForm] = useState({ amount: '', description: '', date: new Date().toISOString().split('T')[0] });
  const [capitalSaving, setCapitalSaving] = useState(false);
  const [liveSales, setLiveSales] = useState<Array<{
    id: number; invoice_number: string; total_amount: number;
    seller_name: string; items_count: number; created_at: string;
  }>>([]);
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const dashRes = await analyticsApi.getDashboard();
      setData(dashRes.data);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => { fetchData(true); }, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const loadCapital = useCallback(async () => {
    try { const r = await capitalApi.getAll(); setCapitalList(r.data.injections); } catch {}
  }, []);

  useEffect(() => { loadCapital(); }, [loadCapital]);

  const handleAddCapital = async () => {
    if (!capitalForm.amount || parseFloat(capitalForm.amount) <= 0) {
      toast.error('Enter a valid amount'); return;
    }
    setCapitalSaving(true);
    try {
      await capitalApi.add({ amount: parseFloat(capitalForm.amount), description: capitalForm.description || undefined, date: capitalForm.date });
      toast.success('Capital added');
      setCapitalForm({ amount: '', description: '', date: new Date().toISOString().split('T')[0] });
      loadCapital();
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to add capital');
    } finally { setCapitalSaving(false); }
  };

  const handleDeleteCapital = async (id: number) => {
    if (!confirm('Remove this capital entry?')) return;
    try {
      await capitalApi.remove(id);
      toast.success('Removed');
      loadCapital();
      fetchData(true);
    } catch { toast.error('Failed to remove'); }
  };

  useSocket('new_sale', (sale) => {
    toast.success(
      `New sale — ${sale.invoice_number} · ${formatCurrency(sale.total_amount)} by ${sale.seller_name}`,
      { duration: 6000, icon: '🛒' }
    );
    setLiveSales(prev => [sale, ...prev].slice(0, 5));
    fetchData(true);
  });

  if (loading) return <LoadingSpinner />;
  if (!data) return <p className="text-center text-gray-500 py-20">Failed to load dashboard.</p>;

  const profitColor = (v: number) => v >= 0 ? 'text-emerald-500' : 'text-red-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Live Sales Feed */}
      {liveSales.length > 0 && (
        <div className="card p-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Live Sales</h3>
          </div>
          <div className="space-y-2">
            {liveSales.map((s, i) => (
              <div key={s.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-800/50"
                style={{ animation: i === 0 ? 'fadeSlideIn 0.4s ease' : undefined }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.invoice_number}</p>
                    <p className="text-xs text-gray-500">{s.seller_name} · {s.items_count} item{s.items_count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(s.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* All-Time Net Position */}
      {data.all_time && (
        <div className={`rounded-2xl p-5 border ${data.all_time.net_profit >= 0 ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 border-emerald-400' : 'bg-gradient-to-r from-red-600 to-red-500 border-red-400'} shadow-lg`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Wallet className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Total Money In Business</p>
                <p className="text-4xl font-extrabold text-white tabular-nums mt-0.5">
                  {formatCurrency(data.all_time.net_profit)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex gap-5 text-right flex-wrap">
                <div>
                  <p className="text-xs text-white/70 uppercase tracking-wide">Revenue</p>
                  <p className="text-lg font-bold text-white tabular-nums">{formatCurrency(data.all_time.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-white/70 uppercase tracking-wide">Expenses</p>
                  <p className="text-lg font-bold text-white/90 tabular-nums">{formatCurrency(data.all_time.expenses)}</p>
                </div>
              </div>
              {isStrictAdmin && (
                <button onClick={() => setCapitalModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold transition-all">
                  <Plus className="w-4 h-4" /> Add Capital
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Today KPIs */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Today's Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Revenue Today" value={data.today.revenue} isCurrency
            icon={DollarSign} iconColor="text-blue-700" iconBg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard title="Expenses Today" value={data.today.expenses} isCurrency
            icon={TrendingDown} iconColor="text-red-600" iconBg="bg-red-100 dark:bg-red-900/30" />
          <StatCard
            title="Net Profit Today" value={formatCurrency(data.today.net_profit)}
            icon={TrendingUp}
            iconColor={data.today.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}
            iconBg={data.today.net_profit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}
          />
          <StatCard title="Transactions" value={data.today.transactions}
            icon={ShoppingCart} iconColor="text-purple-600" iconBg="bg-purple-100 dark:bg-purple-900/30" />
        </div>
      </div>

      {/* Weekly KPIs */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">This Week</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Weekly Revenue" value={data.weekly.revenue} isCurrency
            icon={DollarSign} subtitle={`${data.weekly.transactions} transactions`} />
          <StatCard title="Weekly Expenses" value={data.weekly.expenses} isCurrency
            icon={TrendingDown} iconColor="text-red-600" iconBg="bg-red-100 dark:bg-red-900/30" />
          <div className="stat-card">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${data.weekly.net_profit >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <TrendingUp className={`w-5 h-5 ${data.weekly.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Weekly Net Profit</p>
              <p className={`text-2xl font-bold mt-0.5 ${profitColor(data.weekly.net_profit)}`}>
                {formatCurrency(data.weekly.net_profit)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* User Analytics */}
      {data.user_analytics?.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">User Analytics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.user_analytics.map(u => {
              const initials = u.seller_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
              const todayNet   = Number(u.today_revenue)   - Number(u.today_expenses);
              const weeklyNet  = Number(u.weekly_revenue)  - Number(u.weekly_expenses);
              const monthlyNet = Number(u.monthly_revenue) - Number(u.monthly_expenses);
              const colors = ['bg-blue-600', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
              const avatarColor = colors[u.seller_id % colors.length];
              return (
                <div key={u.seller_id} className="card p-5 space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${avatarColor} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{u.seller_name}</p>
                      <p className="text-xs text-gray-400">{u.total_sales} sales all time · {formatCurrency(Number(u.total_revenue))}</p>
                    </div>
                  </div>

                  {/* Period rows */}
                  <div className="space-y-2">
                    {/* Today */}
                    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Today</span>
                        <span className="text-[10px] text-gray-400">{u.today_sales} sale{u.today_sales !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400">Revenue</p>
                          <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(Number(u.today_revenue))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Expenses</p>
                          <p className="text-xs font-bold text-red-500 tabular-nums">{formatCurrency(Number(u.today_expenses))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Net</p>
                          <p className={`text-xs font-bold tabular-nums ${todayNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(todayNet)}</p>
                        </div>
                      </div>
                    </div>

                    {/* This Week */}
                    <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-900/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">This Week</span>
                        <span className="text-[10px] text-gray-400">{u.weekly_sales} sale{u.weekly_sales !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400">Revenue</p>
                          <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(Number(u.weekly_revenue))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Expenses</p>
                          <p className="text-xs font-bold text-red-500 tabular-nums">{formatCurrency(Number(u.weekly_expenses))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Net</p>
                          <p className={`text-xs font-bold tabular-nums ${weeklyNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(weeklyNet)}</p>
                        </div>
                      </div>
                    </div>

                    {/* This Month */}
                    <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-900/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">This Month</span>
                        <span className="text-[10px] text-gray-400">{u.monthly_sales} sale{u.monthly_sales !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] text-gray-400">Revenue</p>
                          <p className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(Number(u.monthly_revenue))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Expenses</p>
                          <p className="text-xs font-bold text-red-500 tabular-nums">{formatCurrency(Number(u.monthly_expenses))}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400">Net</p>
                          <p className={`text-xs font-bold tabular-nums ${monthlyNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatCurrency(monthlyNet)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top Products */}
        <div className="card p-5 xl:col-span-2">
          <h3 className="section-title mb-4">Top Products This Week</h3>
          {data.top_products.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.top_products} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" />
                <XAxis dataKey="product_name" tick={{ fontSize: 11 }} tickLine={false}
                  tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
                  formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-16">No sales data yet.</p>
          )}
        </div>

        {/* Expense Breakdown */}
        <div className="card p-5">
          <h3 className="section-title mb-4">Expense Breakdown</h3>
          {(() => {
            const filtered = data.expense_breakdown.filter(e => Number(e.total) > 0);
            const grandTotal = filtered.reduce((s, e) => s + Number(e.total), 0);
            if (!filtered.length) return (
              <p className="text-sm text-gray-400 text-center py-16">No expenses this month.</p>
            );
            return (
              <div className="space-y-4">
                {/* Donut with center label */}
                <div className="relative">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={filtered} cx="50%" cy="50%"
                        innerRadius={52} outerRadius={78}
                        dataKey="total" nameKey="name"
                        paddingAngle={3} strokeWidth={0}
                      >
                        {filtered.map((entry, i) => (
                          <Cell key={i} fill={entry.color || '#1d4ed8'} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [formatCurrency(v), 'Amount']}
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center total */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">This Month</p>
                    <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">
                      {formatCurrency(grandTotal)}
                    </p>
                  </div>
                </div>

                {/* Category breakdown list */}
                <div className="space-y-2.5">
                  {filtered.map((e, i) => {
                    const pct = grandTotal > 0 ? (Number(e.total) / grandTotal) * 100 : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.color || '#1d4ed8' }} />
                            <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[100px]">{e.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
                            <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums w-20 text-right">
                              {formatCurrency(Number(e.total))}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: e.color || '#1d4ed8' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                  <span className="text-xs text-gray-400">{filtered.length} categor{filtered.length === 1 ? 'y' : 'ies'}</span>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Seller Performance */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Seller Performance</h3>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          {data.seller_performance.length ? (
            <div className="space-y-3">
              {data.seller_performance.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-800 dark:text-blue-400 font-semibold text-xs flex-shrink-0">
                    {s.seller_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.seller_name}</p>
                    <p className="text-xs text-gray-500">{s.transactions} transactions</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(parseFloat(String(s.revenue)))}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No sellers yet.</p>}
        </div>

        {/* Recent Sales */}
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Recent Sales</h3>
            <Link href="/sales" className="text-sm text-blue-700 hover:text-blue-800 flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {data.recent_sales.length ? (
            <div className="space-y-2">
              {data.recent_sales.slice(0, 6).map(sale => (
                <div key={sale.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{sale.invoice_number}</p>
                    <p className="text-xs text-gray-500">{sale.seller_name} · {formatDateTime(sale.created_at)}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(sale.total_amount)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400 text-center py-8">No sales yet.</p>}
        </div>
      </div>

      {/* Low Stock Alert */}
      {data.low_stock.length > 0 && (
        <div className="card p-5 border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="section-title text-amber-700 dark:text-amber-400">Low Stock Alerts ({data.low_stock.length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.low_stock.map(p => (
              <div key={p.id} className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    {p.quantity === 0 ? 'OUT OF STOCK' : `${p.quantity} left`}
                  </span>
                  <span className="text-xs text-gray-400">min: {p.low_stock_threshold}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Seller Breakdown This Month */}
      {data.seller_breakdown?.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Seller Breakdown — This Month</h3>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-3 py-3 font-medium">Seller</th>
                  <th className="text-right px-3 py-3 font-medium">Transactions</th>
                  <th className="text-right px-3 py-3 font-medium">Sales Revenue</th>
                  <th className="text-right px-3 py-3 font-medium">Expenses Recorded</th>
                  <th className="text-right px-3 py-3 font-medium">Net Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.seller_breakdown.map(s => {
                  const rev = parseFloat(String(s.revenue));
                  const exp = parseFloat(String(s.expenses));
                  const net = rev - exp;
                  return (
                    <tr key={s.seller_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-800 dark:text-blue-400 font-semibold text-xs flex-shrink-0">
                            {s.seller_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{s.seller_name}</p>
                            {s.expense_count > 0 && (
                              <p className="text-xs text-gray-400">{s.expense_count} expense{s.expense_count !== 1 ? 's' : ''}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{s.transactions}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(rev)}</td>
                      <td className="px-3 py-3 text-right text-red-500">{exp > 0 ? formatCurrency(exp) : <span className="text-gray-400">—</span>}</td>
                      <td className={`px-3 py-3 text-right font-bold ${net >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatCurrency(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 dark:border-gray-700">
                <tr className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right">{data.seller_breakdown.reduce((a, s) => a + s.transactions, 0)}</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(data.seller_breakdown.reduce((a, s) => a + parseFloat(String(s.revenue)), 0))}</td>
                  <td className="px-3 py-3 text-right text-red-500">{formatCurrency(data.seller_breakdown.reduce((a, s) => a + parseFloat(String(s.expenses)), 0))}</td>
                  {(() => { const totalNet = data.seller_breakdown.reduce((a, s) => a + parseFloat(String(s.revenue)) - parseFloat(String(s.expenses)), 0); return (
                  <td className={`px-3 py-3 text-right font-bold ${totalNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {formatCurrency(totalNet)}
                  </td>); })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Stock Stats */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard title="Total Products" value={data.stock_stats.total_products}
          icon={Package} iconColor="text-blue-600" iconBg="bg-blue-100 dark:bg-blue-900/30" />
        <StatCard title="Total Items" value={data.stock_stats.total_items}
          icon={Activity} iconColor="text-purple-600" iconBg="bg-purple-100 dark:bg-purple-900/30" />
      </div>

      {/* Capital Injection Modal */}
      <Modal open={capitalModal} onClose={() => setCapitalModal(false)} title="Capital Injections" size="md"
        footer={<button onClick={() => setCapitalModal(false)} className="btn-secondary">Close</button>}
      >
        <div className="space-y-4">
          {/* Add form — admin only */}
          {isStrictAdmin && <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Add Money to Business</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount *</label>
                <input type="number" min="0" step="0.01" value={capitalForm.amount}
                  onChange={e => setCapitalForm(f => ({ ...f, amount: e.target.value }))}
                  className="input" placeholder="0.00" />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" value={capitalForm.date}
                  onChange={e => setCapitalForm(f => ({ ...f, date: e.target.value }))}
                  className="input" />
              </div>
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <input value={capitalForm.description}
                onChange={e => setCapitalForm(f => ({ ...f, description: e.target.value }))}
                className="input" placeholder="e.g. Owner investment, loan, restocking cash…" />
            </div>
            <button onClick={handleAddCapital} disabled={capitalSaving} className="btn-primary w-full">
              {capitalSaving ? 'Adding…' : <><Plus className="w-4 h-4" /> Add Capital</>}
            </button>
          </div>}

          {/* History */}
          {capitalList.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</p>
              <div className="max-h-64 overflow-y-auto space-y-2 scrollbar-thin">
                {capitalList.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <p className="text-sm font-semibold text-emerald-600 tabular-nums">{formatCurrency(Number(c.amount))}</p>
                      <p className="text-xs text-gray-400">{c.description || '—'} · {new Date(c.date).toLocaleDateString()} · by {c.admin.name}</p>
                    </div>
                    <button onClick={() => handleDeleteCapital(c.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No capital injections yet.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
