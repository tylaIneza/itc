'use client';
import { useEffect, useState, useCallback } from 'react';
import { superadminApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { AuditLog, Company } from '@/types';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { ClipboardList } from 'lucide-react';

const actionColor = (action: string) => {
  if (action.startsWith('DELETE') || action === 'LOGIN_FAILED') return 'danger';
  if (action.startsWith('CREATE')) return 'success';
  if (action.startsWith('UPDATE') || action.startsWith('STOCK') || action.startsWith('TOGGLE')) return 'info';
  if (action === 'LOGIN') return 'success';
  if (action === 'LOGOUT') return 'default';
  return 'default';
};

export default function SuperadminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [companyFilter, setCompanyFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await superadminApi.getAuditLogs({
        company_id: companyFilter || undefined,
        start_date:  startDate || undefined,
        end_date:    endDate || undefined,
        page,
        limit: 50,
      });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch { }
    finally { setLoading(false); }
  }, [companyFilter, startDate, endDate, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { superadminApi.getCompanies().then(r => setCompanies(r.data.companies)); }, []);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={companyFilter} onChange={e => { setPage(1); setCompanyFilter(e.target.value); }} className="input w-48">
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={e => { setPage(1); setStartDate(e.target.value); }} className="input w-40" />
        <input type="date" value={endDate} onChange={e => { setPage(1); setEndDate(e.target.value); }} className="input w-40" />
      </div>

      <div className="text-sm text-gray-500">{total} log entries across the platform</div>

      <div className="card overflow-hidden">
        {loading ? <LoadingSpinner /> : logs.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No audit logs" description="Platform and company activity will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-medium">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium">Company</th>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Module</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map(log => (
                  <tr key={log.id} className="table-row">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={log.company_name === 'Platform' ? 'default' : 'info'}>{log.company_name}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">{log.user_name || 'System'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{log.module}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={actionColor(log.action)}>{log.action.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{log.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary">Previous</button>
          <span className="text-sm text-gray-500">Page {page} of {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)} className="btn-secondary">Next</button>
        </div>
      )}
    </div>
  );
}
