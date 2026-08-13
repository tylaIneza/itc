'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

const pageTitles: Record<string, string> = {
  '/superadmin/audit':       'Platform Audit Logs',
  '/superadmin/permissions': 'Permissions',
  '/superadmin/profile':     'Superadmin Account',
  '/superadmin/companies':   'Company Dashboard',
  '/superadmin': 'Companies',
  '/admin': 'Admin Dashboard',
  '/seller': 'My Dashboard',
  '/sales': 'Sales',
  '/products': 'Products & Stock',
  '/expenses': 'Expenses',
  '/analytics': 'Analytics & Reports',
  '/users': 'User Management',
  '/audit':    'Audit Logs',
  '/settings': 'System Settings',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    if (!token) router.replace('/login');
  }, [router]);

  const title = Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] || 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="p-4 lg:p-6 max-w-screen-2xl mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
