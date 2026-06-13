'use client'
import { useState, useEffect, useCallback } from 'react'
import { Menu, Bell, Sun, Moon, Wifi, WifiOff } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/lib/store'
import { formatDateTime } from '@/lib/utils'
import { useSocketEvent } from '@/hooks/use-socket'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { getSocket } from '@/lib/socket'

interface HeaderProps {
  onMenuClick: () => void
  title: string
}

interface Notification {
  id: string
  message: string
  time: Date
  type: string
  read: boolean
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const { user } = useAuthStore()
  const [time, setTime] = useState(new Date())
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isConnected, setIsConnected] = useState(false)

  // Clock tick
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  // Poll socket connected status every 2s (avoids stale isConnected)
  useEffect(() => {
    const iv = setInterval(() => {
      const s = getSocket()
      setIsConnected(s?.connected ?? false)
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  const addNotification = useCallback((message: string, type: string) => {
    setNotifications(prev => [
      { id: Date.now().toString(), message, time: new Date(), type, read: false },
      ...prev,
    ].slice(0, 15))
  }, [])

  useSocketEvent('sale:created', useCallback((data: unknown) => {
    const sale = (data as { sale?: { invoiceNumber?: string } })?.sale
    addNotification(`New sale: ${sale?.invoiceNumber ?? ''}`, 'sale')
  }, [addNotification]))

  useSocketEvent('stock:updated', useCallback(() => {
    addNotification('Stock levels updated', 'stock')
  }, [addNotification]))

  useSocketEvent('expense:created', useCallback(() => {
    addNotification('New expense recorded', 'expense')
  }, [addNotification]))

  useSocketEvent('co-opera:recorded', useCallback(() => {
    addNotification('Co-opera recorded for today', 'co-opera')
  }, [addNotification]))

  useSocketEvent('connect', useCallback(() => setIsConnected(true), []))
  useSocketEvent('disconnect', useCallback(() => setIsConnected(false), []))

  const unreadCount = notifications.filter(n => !n.read).length
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))

  const greeting = () => {
    const h = time.getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1">
        <h2 className="font-semibold text-base lg:text-lg">{title}</h2>
        <p className="text-xs text-muted-foreground hidden sm:block">
          {greeting()}, {user?.fullName?.split(' ')[0]} &middot;{' '}
          {time.toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Connection status */}
        <div className={`hidden sm:flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isConnected ? 'text-green-600 bg-green-50 dark:bg-green-950/50' : 'text-red-500 bg-red-50 dark:bg-red-950/50'}`}>
          {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isConnected ? 'Live' : 'Offline'}
        </div>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs rounded-full">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No notifications</div>
            ) : (
              notifications.slice(0, 6).map(n => (
                <DropdownMenuItem key={n.id} className={`flex flex-col items-start gap-0.5 ${!n.read ? 'bg-primary/5' : ''}`}>
                  <span className="text-sm">{n.message}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(n.time)}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
