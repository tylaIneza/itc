'use client';
import { useEffect, useState } from 'react';
import { superadminApi } from '@/lib/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { ShieldCheck, Users, Lock, Unlock, Info } from 'lucide-react';

const PERMISSION_LABELS: Record<string, { label: string; description: string; module: string }> = {
  create_sale:              { label: 'Create Sales',       description: 'Record new sales transactions',        module: 'Sales' },
  edit_sale:                { label: 'Edit Sales',         description: 'Modify existing sales',                 module: 'Sales' },
  delete_sale:               { label: 'Delete Sales',       description: 'Remove sales records',                  module: 'Sales' },
  view_sales:                { label: 'View Sales',         description: 'View sales history',                    module: 'Sales' },
  create_product:            { label: 'Create Products',    description: 'Add new products',                      module: 'Products' },
  edit_product:              { label: 'Edit Products',      description: 'Modify product details',                module: 'Products' },
  delete_product:            { label: 'Delete Products',    description: 'Remove products',                       module: 'Products' },
  adjust_stock:              { label: 'Adjust Stock',       description: 'Adjust product stock levels',           module: 'Products' },
  view_stock:                { label: 'View Stock',         description: 'View stock levels',                     module: 'Products' },
  create_expense:            { label: 'Create Expenses',    description: 'Add new expenses',                      module: 'Expenses' },
  edit_expense:              { label: 'Edit Expenses',      description: 'Modify existing expenses',              module: 'Expenses' },
  delete_expense:            { label: 'Delete Expenses',    description: 'Remove expenses',                       module: 'Expenses' },
  approve_expense_requests:  { label: 'Approve Expenses',   description: 'Approve or reject expense requests',    module: 'Expenses' },
  view_reports:              { label: 'View Reports',       description: 'Access analytics and reports',          module: 'Reports' },
  export_pdf:                { label: 'Export PDF',         description: 'Download PDF reports',                  module: 'Reports' },
  export_excel:              { label: 'Export Excel',       description: 'Download Excel/CSV reports',            module: 'Reports' },
  create_users:              { label: 'Create Users',       description: 'Create new user accounts',              module: 'Users' },
  edit_users:                { label: 'Edit Users',         description: 'Modify user accounts',                  module: 'Users' },
  deactivate_users:          { label: 'Deactivate Users',   description: 'Suspend or reactivate user accounts',   module: 'Users' },
  manage_permissions:        { label: 'Manage Permissions', description: 'Grant or revoke user permissions',      module: 'Users' },
  add_capital_injection:     { label: 'Add Capital',        description: 'Record capital injections',             module: 'Capital' },
  manage_settings:           { label: 'Manage Settings',    description: 'Change system settings',                module: 'Settings' },
  view_audit_logs:           { label: 'View Audit Logs',    description: 'Access system audit trail',             module: 'Audit Logs' },
};

const ROLE_COLORS: Record<string, string> = {
  admin:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  manager: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  seller:  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
};

interface Permission { id: number; name: string; description: string; granted: boolean; }
interface Role { id: number; name: string; description: string; permissions: Permission[]; }

export default function SuperadminPermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superadminApi.getRolePermissions()
      .then(r => setRoles(r.data.roles))
      .catch(() => toast.error('Failed to load permissions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  // These grants are platform-wide (shared by every company), not per-company —
  // superadmin can only view them here, not toggle.
  const manageableRoles = roles.filter(r => r.name !== 'admin' && r.name !== 'superadmin');
  const adminRole       = roles.find(r => r.name === 'admin');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="card p-4 flex items-start gap-3 border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10">
        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-400">
          Role permissions are shared across every company on the platform — there is no per-company
          override yet. This view is read-only; toggle grants from a company admin's Settings page instead.
        </p>
      </div>

      {adminRole && (
        <div className="card p-5 border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            <h2 className="font-bold text-gray-900 dark:text-white">Admin Role</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-semibold">Full Access</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Admin has access to all features by default at every company.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {adminRole.permissions.map(p => (
              <span key={p.id} className="text-xs px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                <Unlock className="w-3 h-3" />
                {PERMISSION_LABELS[p.name]?.label || p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {manageableRoles.map(role => (
        <div key={role.id} className="card p-5">
          <div className="flex items-center gap-3 mb-5">
            <Users className="w-5 h-5 text-gray-500" />
            <h2 className="font-bold text-gray-900 dark:text-white capitalize">{role.name} Role</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_COLORS[role.name] || ''}`}>
              {role.name}
            </span>
            <p className="text-sm text-gray-400 ml-1">{role.description}</p>
          </div>

          <div className="space-y-3">
            {role.permissions.map(perm => {
              const isOn = perm.granted;
              const meta = PERMISSION_LABELS[perm.name];

              return (
                <div key={perm.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isOn ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                      {isOn
                        ? <Unlock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        : <Lock className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {meta?.label || perm.name}
                      </p>
                      <p className="text-xs text-gray-400">{meta?.description || perm.description}</p>
                    </div>
                  </div>

                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    isOn
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>
                    {isOn ? 'Granted' : 'Not granted'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
