'use client';
import { useEffect, useState, useCallback } from 'react';
import { usersApi, settingsApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { User } from '@/types';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Users, CheckCircle, ShieldCheck, UserX, UserCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const permLabel = (name: string) =>
  name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const ROLES = [
  { id: '2', label: 'Seller',  description: 'Can sell products and view own stats' },
  { id: '3', label: 'Manager', description: 'Can approve expenses, view reports, manage stock' },
  { id: '1', label: 'Admin',   description: 'Full system access' },
];

const emptyForm = {
  name: '', email: '', password: '', role_id: '2', phone: '',
  permissions: [] as number[],
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const isStrictAdmin = currentUser?.role === 'admin';

  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<'add' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form,    setForm]    = useState(emptyForm);
  const [saving,  setSaving]  = useState(false);
  const [permissions, setPermissions] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    settingsApi.getRolePermissions().then(r => setPermissions(r.data.permissions)).catch(() => {});
  }, []);

  if (currentUser && !isStrictAdmin) {
    return <p className="text-center text-gray-500 py-20">Access denied.</p>;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.getAll();
      setUsers(res.data.users);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(emptyForm);
    setSelected(null);
    setModal('add');
  };

  const openEdit = async (u: User) => {
    try {
      const res  = await usersApi.getOne(u.id);
      const user = res.data.user;
      setSelected(user);
      const customPerms = user.permissions?.filter((p: any) => p.is_custom).map((p: any) => p.id) || [];
      setForm({
        name:        user.name,
        email:       user.email,
        password:    '',
        role_id:     String(user.role_id),
        phone:       user.phone || '',
        permissions: customPerms,
      });
      setModal('edit');
    } catch { toast.error('Failed to load user'); }
  };

  const togglePermission = (id: number) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(id)
        ? prev.permissions.filter(p => p !== id)
        : [...prev.permissions, id],
    }));
  };

  const handleSave = async () => {
    if (!form.name || !form.email || (modal === 'add' && !form.password)) {
      toast.error('Name, email and password are required'); return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form, role_id: parseInt(form.role_id) };
      if (modal === 'add') {
        await usersApi.create(payload);
        toast.success('User created');
      } else if (selected) {
        const { password, ...rest } = payload;
        await usersApi.update(selected.id, password ? payload : rest);
        toast.success('User updated');
      }
      setModal(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to save user');
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (id: number, name: string, isActive: boolean) => {
    if (id === currentUser?.id) { toast.error("Can't deactivate your own account"); return; }
    const label = isActive ? 'deactivate' : 're-activate';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} "${name}"?`)) return;
    try {
      if (isActive) { await usersApi.remove(id); toast.success('User deactivated'); }
      else          { await usersApi.update(id, { is_active: true }); toast.success('User re-activated'); }
      load();
    } catch { toast.error(`Failed to ${label} user`); }
  };

  const handlePermanentDelete = async (id: number, name: string) => {
    if (id === currentUser?.id) { toast.error("Can't delete your own account"); return; }
    if (!confirm(`PERMANENTLY DELETE "${name}"?\n\nThis cannot be undone.`)) return;
    try {
      await usersApi.permanentDelete(id);
      toast.success('User permanently deleted');
      load();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed to delete user'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card">
          <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-700" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Users</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-2xl font-bold">{users.filter(u => u.is_active).length}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <LoadingSpinner /> : users.length === 0 ? (
          <EmptyState icon={Users} title="No users found"
            action={<button onClick={openAdd} className="btn-primary">Add User</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Last Login</th>
                  <th className="text-center px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map(u => (
                  <tr key={u.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-800 dark:text-blue-400 font-semibold text-sm">
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'purple' : u.role === 'manager' ? 'warning' : 'info'} className="capitalize">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.is_active ? 'success' : 'danger'}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.last_login ? formatDateTime(u.last_login) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(u)} title="Edit"
                          className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser?.id && (<>
                          <button onClick={() => handleDeactivate(u.id, u.name, u.is_active!)}
                            title={u.is_active ? 'Deactivate' : 'Re-activate'}
                            className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-600' : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600'}`}>
                            {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handlePermanentDelete(u.id, u.name)} title="Delete permanently"
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal open={modal === 'add' || modal === 'edit'} onClose={() => setModal(null)}
        title={modal === 'add' ? 'Add User' : 'Edit User'} size="md"
        footer={
          <>
            <button onClick={() => setModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : modal === 'add' ? 'Create User' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Full Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="input" placeholder="John Smith" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              className="input" placeholder="john@example.com" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{modal === 'add' ? 'Password *' : 'New Password (optional)'}</label>
              <input type="password" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="input" placeholder="Min 8 characters" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="input" placeholder="+250 7XX XXX XXX" />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="label">Role</label>
            <div className="space-y-2 mt-1">
              {ROLES.map(r => (
                <label key={r.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    form.role_id === r.id
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}>
                  <input type="radio" name="role" value={r.id} checked={form.role_id === r.id}
                    onChange={() => setForm({ ...form, role_id: r.id, permissions: [] })}
                    className="text-blue-700" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{r.label}</p>
                    <p className="text-xs text-gray-400">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Extra permissions for sellers */}
          {form.role_id === '2' && (
            <div>
              <label className="label">Additional Permissions for Seller</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {permissions.filter(p => p.name !== 'create_sale').map(p => (
                  <label key={p.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <input type="checkbox" checked={form.permissions.includes(p.id)}
                      onChange={() => togglePermission(p.id)} className="rounded text-blue-700" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{permLabel(p.name)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
