'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { expensesApi } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { Expense, ExpenseCategory } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import {
  Plus, Edit2, Trash2, DollarSign, CheckCircle, XCircle,
  Clock, AlertTriangle, Check, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

type Tab = 'expenses' | 'approvals' | 'my-requests';

const todayRwanda = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Kigali' });

const emptyForm = {
  title: '', amount: '', category_id: '',
  expense_date: '',
  description: '',
};

function ExpensesContent() {
  const { user, isAdmin, hasPermission } = useAuth();
  const canApprove = isAdmin || user?.role === 'manager' || hasPermission('can_approve_expenses');
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get('tab') as Tab) || 'expenses';
  const [tab, setTab] = useState<Tab>(initialTab);

  // Expenses state
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [catFilter, setCatFilter]   = useState('');

  // Modal state
  const [modal, setModal]       = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);

  // Approval state
  const [approvals, setApprovals]         = useState<any[]>([]);
  const [myRequests, setMyRequests]       = useState<any[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [reviewModal, setReviewModal]     = useState<any | null>(null);
  const [reviewNote, setReviewNote]       = useState('');
  const [reviewSaving, setReviewSaving]   = useState(false);

  // Load categories once
  useEffect(() => {
    expensesApi.getCategories().then(r => setCategories(r.data.categories));
  }, []);

  // Sync tab from query param
  useEffect(() => {
    const t = searchParams.get('tab') as Tab;
    if (t && t !== tab) setTab(t);
  }, [searchParams]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await expensesApi.getAll({
        start_date:  startDate  || undefined,
        end_date:    endDate    || undefined,
        category_id: catFilter  || undefined,
        limit: 100,
      });
      setExpenses(res.data.expenses);
      setTotalAmount(parseFloat(res.data.total_amount));
    } catch { toast.error('Failed to load expenses'); }
    finally { setLoading(false); }
  }, [startDate, endDate, catFilter]);

  const loadApprovals = useCallback(async () => {
    if (!canApprove) return;
    setApprovalsLoading(true);
    try {
      const res = await expensesApi.getApprovalRequests({ status: 'pending' });
      setApprovals(res.data.requests);
    } catch {}
    finally { setApprovalsLoading(false); }
  }, [canApprove]);

  const loadMyRequests = useCallback(async () => {
    try {
      const res = await expensesApi.getMyRequests();
      setMyRequests(res.data.requests);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'expenses')    loadExpenses();
    if (tab === 'approvals')   loadApprovals();
    if (tab === 'my-requests') loadMyRequests();
  }, [tab, loadExpenses, loadApprovals, loadMyRequests]);

  // ── Handlers ─────────────────────────────────────────────

  const openAdd = () => { setForm({ ...emptyForm, expense_date: todayRwanda() }); setSelected(null); setModal('add'); };

  const openEdit = (e: Expense) => {
    setSelected(e);
    setForm({
      title: e.title, amount: String(e.amount), category_id: String(e.category_id),
      expense_date: e.expense_date.split('T')[0], description: e.description || '',
    });
    setModal('edit');
  };

  const handleSave = async () => {
    if (!form.title || !form.amount || !form.category_id || !form.expense_date) {
      toast.error('All required fields must be filled');
      return;
    }
    const expYear = parseInt(form.expense_date.slice(0, 4));
    const thisYear = parseInt(todayRwanda().slice(0, 4));
    if (expYear < thisYear - 5 || expYear > thisYear + 1) {
      toast.error(`Expense date looks wrong (${expYear}) — please check the date`);
      return;
    }
    setSaving(true);
    try {
      if (modal === 'add') {
        await expensesApi.create(form);
        toast.success('Expense recorded');
        loadExpenses();
      } else if (selected) {
        const res = await expensesApi.update(selected.id, form);
        if (res.data.requires_approval) {
          toast.success('Edit request submitted — awaiting approval', { duration: 4000 });
        } else {
          toast.success('Expense updated directly');
          loadExpenses();
        }
      }
      setModal(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete expense "${title}"?`)) return;
    try {
      await expensesApi.remove(id);
      toast.success('Expense deleted');
      loadExpenses();
    } catch { toast.error('Failed to delete'); }
  };

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewModal) return;
    setReviewSaving(true);
    try {
      await expensesApi.reviewRequest(reviewModal.id, { action, review_note: reviewNote });
      toast.success(`Request ${action === 'approve' ? 'approved ✓' : 'rejected'}`);
      setReviewModal(null);
      setReviewNote('');
      loadApprovals();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed');
    } finally { setReviewSaving(false); }
  };

  // ── Derived ───────────────────────────────────────────────

  const catBreakdown = categories.map(c => ({
    ...c,
    total: expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + Number(e.amount), 0),
  })).filter(c => c.total > 0).slice(0, 3);

  const tabItems: { key: Tab; label: string; count?: number }[] = [
    { key: 'expenses', label: 'All Expenses' },
    ...(canApprove ? [{ key: 'approvals' as Tab, label: 'Pending Approvals', count: approvals.length }] : []),
    { key: 'my-requests', label: 'My Edit Requests' },
  ];

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card col-span-2 sm:col-span-1">
          <div className="w-11 h-11 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Expenses</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums">{formatCurrency(totalAmount)}</p>
            <p className="text-xs text-gray-400">{expenses.length} records</p>
          </div>
        </div>
        {catBreakdown.map(c => (
          <div key={c.id} className="stat-card">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color || '#1d4ed8' }} />
            <div>
              <p className="text-sm text-gray-500 font-medium">{c.name}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(c.total)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Category bar chart */}
      {(() => {
        const chartData = categories
          .map(c => ({ name: c.name, color: c.color, total: expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + Number(e.amount), 0) }))
          .filter(c => c.total > 0)
          .sort((a, b) => b.total - a.total);
        if (!chartData.length) return null;
        return (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Spending by Category</h3>
              <span className="text-xs text-gray-400">{startDate || endDate ? 'Filtered period' : 'All time'}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              {/* Bar chart */}
              <ResponsiveContainer width="100%" height={Math.max(chartData.length * 44, 120)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), 'Amount']}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', fontSize: 12 }}
                    cursor={{ fill: 'rgba(29,78,216,0.06)' }}
                  />
                  <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={20}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color || '#1d4ed8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Category list */}
              <div className="space-y-3">
                {chartData.map((c, i) => {
                  const pct = totalAmount > 0 ? (c.total / totalAmount) * 100 : 0;
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color || '#1d4ed8' }} />
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums w-24 text-right">
                            {formatCurrency(c.total)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: c.color || '#1d4ed8' }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between">
                  <span className="text-xs text-gray-400">Total</span>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800">
        {tabItems.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              tab === t.key
                ? 'border-blue-700 text-blue-800 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: Expenses ── */}
      {tab === 'expenses' && (
        <>
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input w-40" />
              <input type="date" value={endDate}   onChange={e => setEndDate(e.target.value)}   className="input w-40" />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input w-44">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button onClick={openAdd} className="btn-primary">
              <Plus className="w-4 h-4" /> Add Expense
            </button>
          </div>

          <div className="card overflow-hidden">
            {loading ? <LoadingSpinner /> : expenses.length === 0 ? (
              <EmptyState icon={DollarSign} title="No expenses found"
                description="Record your first operational cost."
                action={<button onClick={openAdd} className="btn-primary">Add Expense</button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left px-4 py-3 font-semibold">Title</th>
                      <th className="text-left px-4 py-3 font-semibold">Category</th>
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">By</th>
                      <th className="text-left px-4 py-3 font-semibold">Status</th>
                      <th className="text-right px-4 py-3 font-semibold">Amount</th>
                      <th className="text-center px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {expenses.map(e => (
                      <tr key={e.id} className="table-row">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{e.title}</p>
                          {e.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{e.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: (e as any).category_color || '#1d4ed8' }} />
                            <span className="text-gray-600 dark:text-gray-400">{(e as any).category_name}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                        <td className="px-4 py-3 text-gray-500">{(e as any).created_by_name}</td>
                        <td className="px-4 py-3">
                          {(e as any).pending_requests > 0
                            ? <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />Pending edit</Badge>
                            : <Badge variant="success">Active</Badge>
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400 tabular-nums">
                          {formatCurrency(e.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEdit(e)} title="Edit / Request edit"
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                            {canApprove && (
                              <button onClick={() => handleDelete(e.id, e.title)} title="Delete"
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-t-2 border-gray-200 dark:border-gray-700">
                      <td colSpan={5} className="px-4 py-3 font-bold text-gray-900 dark:text-white">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400 tabular-nums text-base">
                        {formatCurrency(totalAmount)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TAB: Pending Approvals ── */}
      {tab === 'approvals' && canApprove && (
        <div className="card overflow-hidden">
          {approvalsLoading ? <LoadingSpinner /> : approvals.length === 0 ? (
            <EmptyState icon={CheckCircle} title="No pending approvals"
              description="All expense edit requests have been reviewed." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold">Expense</th>
                    <th className="text-left px-4 py-3 font-semibold">Requested By</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Proposed Changes</th>
                    <th className="text-center px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {approvals.map(r => {
                    const proposed = typeof r.proposed === 'string' ? JSON.parse(r.proposed) : r.proposed;
                    return (
                      <tr key={r.id} className="table-row">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{r.expense_title}</p>
                          <p className="text-xs text-gray-400">{r.category_name}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.requested_by_name}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-0.5 text-xs">
                            <p><span className="text-gray-400">Title:</span> <span className="font-medium">{proposed.title}</span></p>
                            <p><span className="text-gray-400">Amount:</span> <span className="font-bold text-red-600">{formatCurrency(proposed.amount)}</span></p>
                            <p><span className="text-gray-400">Date:</span> {formatDate(proposed.expense_date)}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { setReviewModal(r); setReviewNote(''); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors">
                              <AlertTriangle className="w-3.5 h-3.5" /> Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: My Requests ── */}
      {tab === 'my-requests' && (
        <div className="card overflow-hidden">
          {myRequests.length === 0 ? (
            <EmptyState icon={Clock} title="No edit requests"
              description="When you request changes to expenses, they'll appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-semibold">Expense</th>
                    <th className="text-left px-4 py-3 font-semibold">Submitted</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Reviewed By</th>
                    <th className="text-left px-4 py-3 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {myRequests.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.expense_title}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3">
                        {r.status === 'pending'  && <Badge variant="warning"><Clock className="w-3 h-3 mr-1" />Pending</Badge>}
                        {r.status === 'approved' && <Badge variant="success"><Check className="w-3 h-3 mr-1" />Approved</Badge>}
                        {r.status === 'rejected' && <Badge variant="danger"><X className="w-3 h-3 mr-1" />Rejected</Badge>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.reviewed_by_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.review_note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'add' ? 'Add Expense' : canApprove ? 'Edit Expense' : 'Request Expense Edit'}
        size="md"
        footer={
          <>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : modal === 'add' ? 'Add Expense' : canApprove ? 'Save Changes' : 'Submit for Approval'}
            </button>
          </>
        }
      >
        {modal === 'edit' && !canApprove && (
          <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Your changes will be submitted to a manager for approval before taking effect.
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="input" placeholder="e.g. Monthly Rent" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Amount *</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="input" placeholder="0.00" />
            </div>
            <div>
              <label className="label">Category *</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className="input">
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" value={form.expense_date}
              onChange={e => setForm({ ...form, expense_date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="input h-20 resize-none" placeholder="Optional notes" />
          </div>
        </div>
      </Modal>

      {/* ── Review Approval Modal ── */}
      <Modal open={!!reviewModal} onClose={() => setReviewModal(null)} title="Review Edit Request" size="md"
        footer={
          <>
            <button onClick={() => setReviewModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={() => handleReview('reject')} disabled={reviewSaving}
              className="btn-danger">
              {reviewSaving ? '…' : <><X className="w-4 h-4" />Reject</>}
            </button>
            <button onClick={() => handleReview('approve')} disabled={reviewSaving}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700">
              {reviewSaving ? '…' : <><Check className="w-4 h-4" />Approve</>}
            </button>
          </>
        }
      >
        {reviewModal && (() => {
          const proposed = typeof reviewModal.proposed === 'string'
            ? JSON.parse(reviewModal.proposed)
            : reviewModal.proposed;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-400 mb-1">Expense</p>
                  <p className="font-semibold">{reviewModal.expense_title}</p>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-400 mb-1">Requested By</p>
                  <p className="font-semibold">{reviewModal.requested_by_name}</p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
                <div className="bg-amber-50 dark:bg-amber-950/30 px-4 py-2">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Proposed Changes</p>
                </div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Title</span>
                    <span className="font-medium">{proposed.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-bold text-red-600">{formatCurrency(proposed.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium">{formatDate(proposed.expense_date)}</span>
                  </div>
                  {proposed.description && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Notes</span>
                      <span className="font-medium max-w-[180px] text-right">{proposed.description}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Review Note (optional)</label>
                <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                  className="input h-20 resize-none" placeholder="Reason for approval or rejection…" />
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense>
      <ExpensesContent />
    </Suspense>
  );
}
