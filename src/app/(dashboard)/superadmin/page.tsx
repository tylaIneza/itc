'use client';
import { useEffect, useState, useCallback } from 'react';
import { superadminApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Company } from '@/types';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Building2, Plus, Users, Power, LayoutDashboard } from 'lucide-react';

const emptyForm = { company_name: '', admin_name: '', admin_email: '', admin_password: '' };

export default function SuperadminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState(emptyForm);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await superadminApi.getCompanies();
      setCompanies(res.data.companies);
    } catch { toast.error('Failed to load companies'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(emptyForm); setModal(true); };

  const handleCreate = async () => {
    if (!form.company_name || !form.admin_name || !form.admin_email || !form.admin_password) {
      toast.error('All fields are required'); return;
    }
    if (form.admin_password.length < 8) {
      toast.error('Admin password must be at least 8 characters'); return;
    }
    setSaving(true);
    try {
      await superadminApi.createCompany(form);
      toast.success('Company created');
      setModal(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to create company');
    } finally { setSaving(false); }
  };

  const handleToggle = async (c: Company) => {
    if (!confirm(`${c.is_active ? 'Suspend' : 'Reactivate'} "${c.name}"? ${c.is_active ? 'Its users will be locked out immediately.' : ''}`)) return;
    try {
      await superadminApi.toggleCompany(c.id);
      toast.success(c.is_active ? 'Company suspended' : 'Company reactivated');
      load();
    } catch { toast.error('Failed to update company'); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {companies.length} compan{companies.length === 1 ? 'y' : 'ies'} on this platform
        </p>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> New Company
        </button>
      </div>

      {companies.length === 0 ? (
        <EmptyState icon={Building2} title="No companies yet" description="Create the first company account to get started." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {companies.map(c => (
            <div key={c.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.slug}</p>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  c.is_active
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {c.is_active ? 'Active' : 'Suspended'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {c.user_count} user{c.user_count !== 1 ? 's' : ''}
                </span>
                <span>Created {formatDate(c.created_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/superadmin/companies/${c.id}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Link>
                <button onClick={() => handleToggle(c)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors ${
                    c.is_active
                      ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                  }`}>
                  <Power className="w-4 h-4" /> {c.is_active ? 'Suspend' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Create Company" size="md"
        footer={
          <>
            <button onClick={() => setModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreate} disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create Company'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Company Name *</label>
            <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
              className="input" placeholder="e.g. Acme Electronics" />
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Initial Admin Account</p>
            <div className="space-y-4">
              <div>
                <label className="label">Admin Name *</label>
                <input value={form.admin_name} onChange={e => setForm({ ...form, admin_name: e.target.value })}
                  className="input" placeholder="Full name" />
              </div>
              <div>
                <label className="label">Admin Email *</label>
                <input type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })}
                  className="input" placeholder="admin@company.com" />
              </div>
              <div>
                <label className="label">Admin Password *</label>
                <input type="password" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })}
                  className="input" placeholder="Minimum 8 characters" />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
