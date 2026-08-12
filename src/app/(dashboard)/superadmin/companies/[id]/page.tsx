'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { superadminApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { CompanyDashboardData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import {
  ArrowLeft, DollarSign, TrendingUp, TrendingDown, Building2, Users, Package, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from 'recharts';

type Period = 'daily' | 'weekly' | 'monthly';

export default function CompanyDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [period, setPeriod] = useState<Period>('weekly');
  const [data, setData] = useState<CompanyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await superadminApi.getCompanyDashboard(id, { period });
      setData(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to load company dashboard');
      if (e?.response?.status === 404) router.replace('/superadmin');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [period, id]);

  if (loading) return <LoadingSpinner />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/superadmin')} className="btn-secondary px-3">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {data.company.name}
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                data.company.is_active
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {data.company.is_active ? 'Active' : 'Suspended'}
              </span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {data.company.user_count} user{data.company.user_count !== 1 ? 's' : ''} · {data.company.branches.length} branch{data.company.branches.length !== 1 ? 'es' : ''}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize ${
                period === p
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300'
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Revenue</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(data.summary.revenue)}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <TrendingDown className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Expenses</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(data.summary.expenses)}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${data.summary.net_profit >= 0 ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
            <TrendingUp className={`w-5 h-5 ${data.summary.net_profit >= 0 ? 'text-violet-600' : 'text-red-600'}`} />
          </div>
          <div>
            <p className="text-sm text-gray-500">Net Profit</p>
            <p className={`text-2xl font-bold ${data.summary.net_profit >= 0 ? 'text-violet-600' : 'text-red-600'}`}>
              {formatCurrency(data.summary.net_profit)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Margin: {data.summary.profit_margin}%</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${data.stock_stats.low_stock_count > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
            {data.stock_stats.low_stock_count > 0
              ? <AlertTriangle className="w-5 h-5 text-amber-600" />
              : <Package className="w-5 h-5 text-gray-500" />}
          </div>
          <div>
            <p className="text-sm text-gray-500">Products</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.stock_stats.total_products}</p>
            {data.stock_stats.low_stock_count > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">{data.stock_stats.low_stock_count} low stock</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="section-title mb-4">Revenue Trend</h3>
          {data.daily_trend.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.daily_trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="companyRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} contentStyle={{ borderRadius: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2} fill="url(#companyRevGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-16">No trend data.</p>}
        </div>

        <div className="card p-5">
          <h3 className="section-title mb-4">Top Products by Revenue</h3>
          {data.top_products.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.top_products.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => `$${v}`} />
                <YAxis dataKey="product_name" type="category" tick={{ fontSize: 10 }} tickLine={false} width={120}
                  tickFormatter={v => v.length > 15 ? v.slice(0, 15) + '…' : v} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} contentStyle={{ borderRadius: 12 }} />
                <Bar dataKey="revenue" fill="#1d4ed8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-16">No product data.</p>}
        </div>
      </div>

      {/* Seller Performance */}
      {data.seller_performance.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" /> Seller Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-3 font-medium">Seller</th>
                  <th className="text-right py-3 font-medium">Transactions</th>
                  <th className="text-right py-3 font-medium">Revenue</th>
                  <th className="text-right py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.seller_performance.map((s, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-3 font-medium text-gray-900 dark:text-white">{s.seller_name}</td>
                    <td className="py-3 text-right text-gray-600 dark:text-gray-400">{s.transactions}</td>
                    <td className="py-3 text-right font-semibold">{formatCurrency(s.revenue)}</td>
                    <td className="py-3 text-right text-gray-500">
                      {data.summary.revenue > 0
                        ? ((s.revenue / data.summary.revenue) * 100).toFixed(1) + '%'
                        : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
