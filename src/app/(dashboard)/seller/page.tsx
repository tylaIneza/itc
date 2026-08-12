'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { analyticsApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import {
  DollarSign, ShoppingCart, TrendingUp, RefreshCw, Plus, ArrowRight,
  Package, Zap, BarChart3, Clock, CheckCircle2, Star,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar,
} from 'recharts';
import Link from 'next/link';

// ── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * ease));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value;
}

// ── Greeting based on time of day ────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', emoji: '⚡' };
  return { text: 'Good evening', emoji: '🌙' };
}

// ── Stat card with count-up ───────────────────────────────────────────────────
function AnimatedCard({
  title, value, icon: Icon, iconColor, iconBg, isCurrency, subtitle, accent,
}: {
  title: string; value: number; icon: any; iconColor: string; iconBg: string;
  isCurrency?: boolean; subtitle?: string; accent?: string;
}) {
  const animated = useCountUp(value);
  const display  = isCurrency ? formatCurrency(animated) : animated.toLocaleString();
  return (
    <div className={`stat-card relative overflow-hidden group hover:shadow-md transition-all duration-300 ${accent ? `border-l-4 ${accent}` : ''}`}>
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="w-16 h-16 rounded-full opacity-5 absolute -top-3 -right-3 bg-current" />
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5 tabular-nums tracking-tight">{display}</p>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Live sale notification card ───────────────────────────────────────────────
interface LiveSale {
  id: number; invoice_number: string; total_amount: number; items_count: number; created_at: string;
}

export default function SellerDashboard() {
  const { user }      = useAuth();
  const [data, setData]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveSales, setLiveSales] = useState<LiveSale[]>([]);
  const [newSaleFlash, setNewSaleFlash] = useState(false);
  const [greeting]                = useState(getGreeting());
  const [now, setNow]             = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await analyticsApi.getSellerDashboard();
      setData(res.data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => { fetchData(true); }, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useSocket('new_sale', (sale: any) => {
    setLiveSales(prev => [sale, ...prev].slice(0, 3));
    setNewSaleFlash(true);
    setTimeout(() => setNewSaleFlash(false), 3000);
    fetchData(true);
    toast.success(`Sale recorded — ${formatCurrency(sale.total_amount)}`, { icon: '🛒' });
  });

  if (loading) return <LoadingSpinner />;
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
        <Zap className="w-8 h-8 text-red-500" />
      </div>
      <p className="text-gray-500 dark:text-gray-400 text-sm">Failed to load dashboard. <button onClick={() => fetchData()} className="text-blue-700 underline">Retry</button></p>
    </div>
  );

  const todayRev   = data.today?.revenue || 0;
  const todayTxn   = data.today?.transactions || 0;
  const weeklyRev  = data.weekly?.revenue || 0;
  const weeklyTxn  = data.weekly?.transactions || 0;
  const avgDailyRev = weeklyTxn > 0 && data.daily_trend?.length
    ? weeklyRev / Math.max(data.daily_trend.length, 1) : 0;
  const performancePct = avgDailyRev > 0 ? Math.min(Math.round((todayRev / avgDailyRev) * 100), 200) : 0;
  const isAheadOfAvg = todayRev >= avgDailyRev && avgDailyRev > 0;

  const maxProduct = data.top_products?.[0]?.revenue || 1;

  const tooltipStyle = {
    contentStyle: { background: '#1f2937', border: 'none', borderRadius: 12, color: '#f9fafb', fontSize: 12 },
    labelStyle: { color: '#9ca3af' },
  };

  return (
    <div className="space-y-6">

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900 p-6 text-white shadow-xl shadow-blue-900/20 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-12 right-16 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute top-4 right-40 w-16 h-16 rounded-full bg-blue-400/10" />

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-blue-200 text-xs font-semibold uppercase tracking-widest">Live Dashboard</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-white">
              {greeting.emoji} {greeting.text}, {user?.name?.split(' ')[0]}!
            </h1>
            <p className="text-blue-200 text-sm mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAheadOfAvg && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30">
                <Star className="w-4 h-4 text-emerald-300" />
                <span className="text-emerald-200 text-xs font-semibold">Above average today!</span>
              </div>
            )}
            <button onClick={() => fetchData(true)} disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
            <Link href="/sales"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-blue-800 text-sm font-bold hover:bg-blue-50 transition-all shadow-lg">
              <Plus className="w-4 h-4" /> New Sale
            </Link>
          </div>
        </div>

        {/* Performance bar */}
        {avgDailyRev > 0 && (
          <div className="relative mt-5 pt-4 border-t border-white/10">
            <div className="flex justify-between text-xs text-blue-200 mb-2">
              <span>Today vs daily average</span>
              <span className={`font-bold ${isAheadOfAvg ? 'text-emerald-300' : 'text-amber-300'}`}>
                {performancePct}% {isAheadOfAvg ? '↑ ahead' : '↓ behind'}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${isAheadOfAvg ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{ width: `${Math.min(performancePct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Live sales flash ────────────────────────────────────────────────── */}
      {liveSales.length > 0 && (
        <div className={`card p-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 transition-all duration-500 ${newSaleFlash ? 'ring-2 ring-emerald-400/50' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-emerald-500 animate-pulse" />
            <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Just Sold</h3>
          </div>
          <div className="flex gap-3 flex-wrap">
            {liveSales.map((s, i) => (
              <div key={s.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-800/50"
                style={{ animation: i === 0 ? 'fadeSlideIn 0.4s ease' : undefined }}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{s.invoice_number}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(s.total_amount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AnimatedCard title="Revenue Today" value={todayRev} isCurrency
          icon={DollarSign} iconColor="text-blue-700" iconBg="bg-blue-100 dark:bg-blue-900/30"
          accent="border-blue-700" />
        <AnimatedCard title="Sales Today" value={todayTxn}
          icon={ShoppingCart} iconColor="text-violet-600" iconBg="bg-violet-100 dark:bg-violet-900/30"
          accent="border-violet-500"
          subtitle={todayTxn > 0 ? `avg ${formatCurrency(todayRev / todayTxn)} / sale` : undefined} />
        <AnimatedCard title="Weekly Revenue" value={weeklyRev} isCurrency
          icon={TrendingUp} iconColor="text-emerald-600" iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          accent="border-emerald-500"
          subtitle={`${weeklyTxn} transactions`} />
        <AnimatedCard title="Items Sold (Week)" value={data.top_products?.reduce((a: number, p: any) => a + (p.qty_sold || 0), 0) || 0}
          icon={Package} iconColor="text-amber-600" iconBg="bg-amber-100 dark:bg-amber-900/30"
          accent="border-amber-500"
          subtitle={`${data.top_products?.length || 0} products`} />
      </div>

      {/* ── Charts row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Revenue trend area chart */}
        <div className="card p-5 xl:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Revenue This Week</h3>
              <p className="text-xs text-gray-400 mt-0.5">Daily breakdown</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <BarChart3 className="w-3.5 h-3.5" />
              7-day window
            </div>
          </div>
          {data.daily_trend?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.daily_trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="sellerRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1d4ed8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sellerTxn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => new Date(v).toLocaleDateString('en-US', { weekday: 'short' })} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle}
                  formatter={(v: number, name: string) => [
                    name === 'revenue' ? formatCurrency(v) : v,
                    name === 'revenue' ? 'Revenue' : 'Sales',
                  ]} />
                <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2.5}
                  fill="url(#sellerRev)" dot={{ r: 4, fill: '#1d4ed8', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#1d4ed8' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-52 text-gray-400">
              <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No sales data yet this week</p>
              <Link href="/sales" className="mt-3 text-blue-700 text-xs font-semibold hover:underline">Make your first sale →</Link>
            </div>
          )}
        </div>

        {/* Quick actions + daily sales bar */}
        <div className="xl:col-span-2 space-y-4">
          {/* Quick actions */}
          <div className="card p-5">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
            <div className="space-y-2.5">
              {[
                { href: '/sales',    icon: Plus,       label: 'Record New Sale',   color: 'bg-blue-700 hover:bg-blue-800 text-white', bold: true },
                { href: '/products', icon: Package,    label: 'Browse Products',   color: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300' },
                { href: '/expenses', icon: DollarSign, label: 'Log an Expense',    color: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300' },
              ].map(({ href, icon: Icon, label, color }) => (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${color}`}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{label}</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-60" />
                </Link>
              ))}
            </div>
          </div>

          {/* Daily transactions bar chart */}
          {data.daily_trend?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm">Daily Transactions</h3>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={data.daily_trend} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={v => new Date(v).toLocaleDateString('en-US', { weekday: 'narrow' })} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [v, 'Sales']} />
                  <Bar dataKey="transactions" fill="#1d4ed8" radius={[4, 4, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom row: products + recent sales ─────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Top products with visual bars */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Top Products</h3>
              <p className="text-xs text-gray-400 mt-0.5">This week</p>
            </div>
            <Link href="/products" className="text-xs text-blue-700 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1">
              All products <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {data.top_products?.length ? (
            <div className="space-y-4">
              {data.top_products.map((p: any, i: number) => {
                const pct = Math.round((p.revenue / maxProduct) * 100);
                const colors = [
                  'bg-blue-700', 'bg-violet-600', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
                ];
                const textColors = [
                  'text-blue-700 dark:text-blue-400', 'text-violet-600 dark:text-violet-400',
                  'text-emerald-600 dark:text-emerald-400', 'text-amber-600 dark:text-amber-400',
                  'text-rose-600 dark:text-rose-400',
                ];
                return (
                  <div key={i} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${colors[i % colors.length]}`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.product_name}</span>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className={`text-sm font-bold tabular-nums ${textColors[i % textColors.length]}`}>{formatCurrency(p.revenue)}</p>
                        <p className="text-[11px] text-gray-400">{p.qty_sold} units</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${colors[i % colors.length]}`}
                        style={{ width: `${pct}%`, transitionDelay: `${i * 100}ms` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Package className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No products sold this week yet.</p>
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Recent Transactions</h3>
              <p className="text-xs text-gray-400 mt-0.5">Your latest sales</p>
            </div>
            <Link href="/sales" className="text-xs text-blue-700 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {data.recent_sales?.length ? (
            <div className="space-y-2">
              {data.recent_sales.map((s: any, i: number) => (
                <div key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group"
                  style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                    <ShoppingCart className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 truncate">{s.invoice_number}</p>
                    <p className="text-xs text-gray-400 truncate">{s.items_count} item{s.items_count !== 1 ? 's' : ''} · {formatDateTime(s.created_at)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(s.total_amount)}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" /> Paid
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No sales recorded yet.</p>
              <Link href="/sales" className="mt-3 btn-primary text-xs px-4 py-2">
                <Plus className="w-3.5 h-3.5" /> Start Selling
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
