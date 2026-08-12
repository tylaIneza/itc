'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingCart, Package, DollarSign,
  BarChart3, Users, ClipboardList, X, ChevronRight,
  LogOut, CheckSquare, Settings, Zap, Building2, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface SidebarProps { open: boolean; onClose: () => void; }

const adminLinks = [
  { href: '/admin',           icon: LayoutDashboard, label: 'Dashboard',          exact: true },
  { href: '/sales',           icon: ShoppingCart,    label: 'Sales' },
  { href: '/products',        icon: Package,         label: 'Products & Stock' },
  { href: '/expenses',        icon: DollarSign,      label: 'Expenses' },
  { href: '/analytics',       icon: BarChart3,       label: 'Analytics & Reports' },
  { href: '/users',           icon: Users,           label: 'User Management' },
  { href: '/audit',           icon: ClipboardList,   label: 'Audit Logs' },
  { href: '/settings',        icon: Settings,        label: 'Settings' },
];

const managerLinks = [
  { href: '/admin',     icon: LayoutDashboard, label: 'Dashboard',          exact: true },
  { href: '/products',  icon: Package,         label: 'Products & Stock' },
  { href: '/expenses',  icon: DollarSign,      label: 'Expenses' },
  { href: '/analytics', icon: BarChart3,       label: 'Analytics & Reports' },
];

const sellerLinks = [
  { href: '/seller',   icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/sales',    icon: ShoppingCart,    label: 'Sales' },
  { href: '/products', icon: Package,         label: 'Products' },
  { href: '/expenses', icon: DollarSign,      label: 'Expenses' },
];

const superadminLinks = [
  { href: '/superadmin',             icon: Building2,    label: 'Companies',   exact: true },
  { href: '/superadmin/audit',       icon: ClipboardList, label: 'Audit Logs', exact: true },
  { href: '/superadmin/permissions', icon: ShieldCheck,  label: 'Permissions', exact: true },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname        = usePathname();
  const { user, logout, hasPermission } = useAuth();
  const router          = useRouter();
  const isSuperAdmin    = user?.role === 'superadmin';
  const isStrictAdmin   = user?.role === 'admin';
  const isManager       = user?.role === 'manager';
  const isAdminOrMgr    = isStrictAdmin || isManager;
  const canApprove      = isAdminOrMgr || hasPermission('approve_expense_requests');

  const links = isSuperAdmin ? superadminLinks
    : isStrictAdmin ? adminLinks
    : isManager ? managerLinks
    : sellerLinks;

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    router.replace('/login');
  };

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  const roleBadge = isSuperAdmin ? 'Superadmin' : isStrictAdmin ? 'Admin' : isManager ? 'Manager' : 'Seller';
  const roleColor = isSuperAdmin
    ? 'bg-violet-100 dark:bg-violet-950/60 text-violet-800 dark:text-violet-400'
    : isStrictAdmin
    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-400'
    : isManager
    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400';

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 left-0 h-full z-50 w-64 flex flex-col',
        'bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full',
        'lg:translate-x-0 lg:static lg:z-auto'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-700/25">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white text-sm leading-none">Tyla Shop</p>
              <p className="text-[11px] text-gray-400 mt-0.5 font-medium tracking-wide">MIS System</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
            <div className="w-9 h-9 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</p>
              <span className={cn('text-[11px] font-semibold px-1.5 py-0.5 rounded-md', roleColor)}>
                {roleBadge}
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin space-y-0.5">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">
            Navigation
          </p>
          {links.map(({ href, icon: Icon, label, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link key={href} href={href} onClick={onClose}
                className={cn('sidebar-link group', active && 'active')}>
                <Icon className={cn(
                  'w-[18px] h-[18px] flex-shrink-0 transition-colors',
                  active ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                )} />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 opacity-40" />}
              </Link>
            );
          })}

          {/* Approvals shortcut (for admin/manager) */}
          {canApprove && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3">
                  Approvals
                </p>
              </div>
              <Link href="/expenses?tab=approvals" onClick={onClose}
                className={cn('sidebar-link group', pathname.includes('tab=approvals') && 'active')}>
                <CheckSquare className="w-[18px] h-[18px] flex-shrink-0 text-amber-500" />
                <span className="flex-1">Expense Approvals</span>
              </Link>
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800">
          <button onClick={handleLogout}
            className="sidebar-link w-full text-red-500 hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-950/30">
            <LogOut className="w-[18px] h-[18px]" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
