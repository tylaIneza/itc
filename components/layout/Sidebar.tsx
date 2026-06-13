'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Package, Receipt, PiggyBank, BarChart3,
  Users, ClipboardList, Settings, TrendingUp, DollarSign, LogOut,
  ShoppingBag, ChevronRight, X, Menu
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { usePermissions } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'

// anyOf: show the nav item if the user has at least one of these permissions
interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string       // single required permission
  anyOf?: string[]          // show if any of these permissions are held
  badge?: string
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sales', label: 'Sales', icon: ShoppingCart, anyOf: ['view_sales', 'create_sale', 'delete_sale'] },
  { href: '/products', label: 'Products & Stock', icon: Package },
  { href: '/expenses', label: 'Expenses', icon: Receipt, anyOf: ['create_expense', 'edit_expense', 'delete_expense', 'approve_expense_requests'] },
  { href: '/co-opera', label: 'Co-opera', icon: PiggyBank, anyOf: ['view_co_opera_history', 'record_co_opera', 'edit_co_opera_amount', 'fix_co_opera_records'] },
  { href: '/analytics', label: 'Analytics', icon: TrendingUp, permission: 'view_reports' },
  { href: '/reports', label: 'Reports', icon: BarChart3, permission: 'view_reports' },
  { href: '/capital', label: 'Capital', icon: DollarSign, permission: 'add_capital_injection' },
  { href: '/users', label: 'Users', icon: Users, anyOf: ['edit_users', 'create_users', 'deactivate_users', 'manage_permissions'] },
  { href: '/audit-logs', label: 'Audit Logs', icon: ClipboardList, permission: 'view_audit_logs' },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { toast } = useToast()
  const { user, logout } = useAuthStore()
  const { checkPermission } = usePermissions()

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {})
    } catch {}
    logout()
    router.push('/login')
    toast({ title: 'Logged out', description: 'You have been logged out successfully' })
  }

  const visibleItems = navItems.filter(item => {
    if (item.anyOf) return item.anyOf.some(p => checkPermission(p))
    if (item.permission) return checkPermission(item.permission)
    return true
  })

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-in-out',
        'lg:translate-x-0 lg:static lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600 shrink-0">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-sidebar-foreground truncate">Tyla Shop</h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">MIS v1.0</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info */}
        {user && (
          <div className="px-4 py-3 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <Avatar className="w-9 h-9 shrink-0">
                <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">
                  {getInitials(user.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user.fullName}</p>
                <Badge variant="info" className="text-xs mt-0.5">{user.role?.name}</Badge>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 scrollbar-hide">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/60 group-hover:text-sidebar-accent-foreground')} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && <Badge variant="destructive" className="text-xs py-0 px-1">{item.badge}</Badge>}
                {isActive && <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </aside>
    </>
  )
}
