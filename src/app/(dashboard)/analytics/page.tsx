'use client';
import { useEffect, useState } from 'react';
import { analyticsApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { exportReportPDF } from '@/lib/pdf';
import type { ReportData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import StatCard from '@/components/ui/StatCard';
import toast from 'react-hot-toast';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, Download, BarChart3, Users,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from 'recharts';

type Period = 'daily' | 'weekly' | 'monthly';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('weekly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [sellers, setSellers] = useState<Array<{ id: number; name: string }>>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsApi.getSellers().then(res => setSellers(res.data.sellers)).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (sellerId) params.seller_id = sellerId;
      const res = await analyticsApi.getReport(params);
      setReport(res.data);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [period]);

  const handleExport = () => {
    if (!report) return;
    try {
      exportReportPDF(report);
      toast.success('PDF exported');
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
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
          <div className="flex gap-2 ml-2 flex-wrap items-center">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="input w-36 text-xs" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="input w-36 text-xs" />
            {sellers.length > 0 && (
              <div className="relative">
                <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <select
                  value={sellerId}
                  onChange={e => setSellerId(e.target.value)}
                  className="input pl-8 pr-3 text-xs w-40"
                >
                  <option value="">All Sellers</option>
                  {sellers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={load} className="btn-primary text-xs px-3 py-2">Apply</button>
          </div>
        </div>
        <button onClick={handleExport} disabled={!report} className="btn-secondary">
          <Download className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {loading ? <LoadingSpinner /> : !report ? (
        <p className="text-center text-gray-500 py-20">No report data.</p>
      ) : (
        <>
          {report.start_date && (
            <p className="text-sm text-gray-500">
              Report period: <span className="font-medium">{formatDate(report.start_date)}</span> — <span className="font-medium">{formatDate(report.end_date)}</span>
              {sellerId && sellers.length > 0 && (
                <span className="ml-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs font-medium">
                  <Users className="w-3 h-3" />
                  {sellers.find(s => String(s.id) === sellerId)?.name}
                </span>
              )}
            </p>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Total Revenue" value={report.summary.revenue} isCurrency
              icon={DollarSign} iconColor="text-blue-700" />
            <StatCard title="Total Expenses" value={report.summary.expenses} isCurrency
              icon={TrendingDown} iconColor="text-red-600" iconBg="bg-red-100 dark:bg-red-900/30" />
            <div className="stat-card">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${report.summary.net_profit >= 0 ? 'bg-violet-100 dark:bg-violet-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                <TrendingUp className={`w-5 h-5 ${report.summary.net_profit >= 0 ? 'text-violet-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Net Profit</p>
                <p className={`text-2xl font-bold ${report.summary.net_profit >= 0 ? 'text-violet-600' : 'text-red-600'}`}>
                  {formatCurrency(report.summary.net_profit)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Margin: {report.summary.profit_margin}%</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="card p-5">
            <h3 className="section-title mb-4">Financial Summary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              {[
                { label: 'Revenue', value: report.summary.revenue, color: 'text-blue-700' },
                { label: 'Operating Expenses', value: report.summary.expenses, color: 'text-red-600' },
                { label: 'Net Profit', value: report.summary.net_profit, color: report.summary.net_profit >= 0 ? 'text-violet-600' : 'text-red-600' },
              ].map(item => (
                <div key={item.label} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <p className="text-gray-500 text-xs mb-1">{item.label}</p>
                  <p className={`text-xl font-bold ${item.color}`}>{formatCurrency(item.value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <div className="card p-5">
              <h3 className="section-title mb-4">Revenue Trend</h3>
              {report.daily_trend.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={report.daily_trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false}
                      tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']}
                      contentStyle={{ borderRadius: 12 }} />
                    <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2} fill="url(#revGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-400 text-center py-16">No trend data.</p>}
            </div>

            {/* Top Products */}
            <div className="card p-5">
              <h3 className="section-title mb-4">Top Products by Revenue</h3>
              {report.top_products.length ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={report.top_products.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
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

          {/* Seller Performance Table */}
          {report.seller_performance.length > 0 && (
            <div className="card p-5">
              <h3 className="section-title mb-4">Seller Performance</h3>
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
                    {report.seller_performance.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 font-medium text-gray-900 dark:text-white">{s.seller_name}</td>
                        <td className="py-3 text-right text-gray-600 dark:text-gray-400">{s.transactions}</td>
                        <td className="py-3 text-right font-semibold">{formatCurrency(s.revenue)}</td>
                        <td className="py-3 text-right text-gray-500">
                          {report.summary.revenue > 0
                            ? ((s.revenue / report.summary.revenue) * 100).toFixed(1) + '%'
                            : '0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
