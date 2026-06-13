'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { useAuthStore } from '@/lib/store'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { toast } from '@/hooks/use-toast'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sales': 'Sales',
  '/products': 'Products & Stock',
  '/expenses': 'Expenses',
  '/co-opera': 'Co-opera',
  '/analytics': 'Analytics',
  '/reports': 'Reports',
  '/capital': 'Capital Injection',
  '/users': 'User Management',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, token, refreshUser, logout, _hasHydrated } = useAuthStore()
  const permListenerAdded = useRef(false)

  // Wait for Zustand to rehydrate from localStorage before checking auth.
  // Without this guard, the first render always sees null and redirects to /login.
  useEffect(() => {
    if (!_hasHydrated) return
    if (!token || !user) {
      router.replace('/login')
    }
  }, [_hasHydrated, token, user, router])

  // Connect socket once and manage its full lifecycle
  useEffect(() => {
    if (!token) return

    const socket = connectSocket(token)

    // Listen for permission updates targeting this user — refresh immediately
    if (!permListenerAdded.current) {
      permListenerAdded.current = true

      socket.on('permissions:updated', async ({ userId }: { userId: number }) => {
        if (user && userId === user.id) {
          await refreshUser()
          toast({
            title: 'Permissions Updated',
            description: 'Your permissions have been updated by an administrator.',
          })
        }
      })

      // Force logout if account deactivated while logged in
      socket.on('user:deactivated', ({ userId }: { userId: number }) => {
        if (user && userId === user.id) {
          toast({
            title: 'Account Deactivated',
            description: 'Your account has been deactivated. Contact your administrator.',
            variant: 'destructive',
          })
          logout()
          router.replace('/login')
        }
      })
    }

    return () => {
      // Only disconnect when the entire dashboard unmounts (user navigates away from app)
      // NOT on every re-render or route change within the dashboard
    }
  }, [token]) // Only re-run if token changes

  // Refresh user data from server on mount to get latest permissions
  useEffect(() => {
    if (!token) return
    refreshUser()
  }, []) // Once on mount only

  // Force password change redirect
  useEffect(() => {
    if (user?.forcePasswordChange && pathname !== '/settings') {
      router.replace('/settings?forceChange=true')
    }
  }, [user?.forcePasswordChange, pathname, router])

  // Show nothing until the store has rehydrated (avoids flash-redirect on refresh)
  if (!_hasHydrated) return null
  if (!token || !user) return null

  const title =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(([k]) => k !== '/dashboard' && pathname.startsWith(k))?.[1] ??
    'Tyla Shop'

  return (
    <div className="flex h-screen bg-muted/30">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
