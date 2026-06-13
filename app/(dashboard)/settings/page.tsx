'use client'
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Settings, Key, User, Bell, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/lib/store'
import { getInitials, formatDateTime } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import api from '@/lib/api'

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const { user, setUser } = useAuthStore()
  const forceChange = searchParams.get('forceChange') === 'true'

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (forceChange) {
      toast({
        title: 'Password Change Required',
        description: 'You must change your password before continuing.',
        variant: 'destructive',
      })
    }
  }, [forceChange])

  const handleChangePassword = async () => {
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      toast({ title: 'Error', description: 'All password fields are required', variant: 'destructive' })
      return
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match', variant: 'destructive' })
      return
    }
    if (passwords.newPassword.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }

    setChangingPassword(true)
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      })
      if (!res.success) {
        toast({ title: 'Error', description: res.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Success', description: 'Password changed successfully' })
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })

      // Update user in store if force change was required
      if (forceChange && user) {
        setUser({ ...user, forcePasswordChange: false })
        router.push('/dashboard')
      }
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {forceChange && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            ⚠️ You must change your password to continue. This is required by your administrator.
          </p>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" />Settings
        </h1>
        <p className="text-muted-foreground text-sm">Manage your account settings</p>
      </div>

      {/* Profile */}
      {!forceChange && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="w-4 h-4" />My Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-blue-600 text-white text-xl font-bold">
                  {user ? getInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xl font-bold">{user?.fullName}</p>
                <p className="text-muted-foreground">{user?.email}</p>
                <Badge variant="info" className="mt-1">{user?.role?.name}</Badge>
              </div>
            </div>
            <Separator className="mb-4" />
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Phone Number</p>
                <p className="font-medium">{user?.phoneNumber}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Branch</p>
                <p className="font-medium">{user?.branch?.name || 'Not assigned'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Login</p>
                <p className="font-medium">{user?.lastLogin ? formatDateTime(user.lastLogin) : 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Permissions</p>
                <p className="font-medium">{user?.permissions?.length || 0} assigned</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Change password */}
      <Card className={forceChange ? 'border-red-200 dark:border-red-800' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="w-4 h-4" />
            {forceChange ? 'Change Password (Required)' : 'Change Password'}
          </CardTitle>
          <CardDescription>
            {forceChange ? 'You must change your password to access the system' : 'Update your account password'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Current Password</Label>
            <Input
              type="password"
              placeholder="Enter current password"
              value={passwords.currentPassword}
              onChange={e => setPasswords(p => ({ ...p, currentPassword: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>New Password</Label>
            <Input
              type="password"
              placeholder="Min. 8 characters"
              value={passwords.newPassword}
              onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              placeholder="Repeat new password"
              value={passwords.confirmPassword}
              onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))}
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full sm:w-auto">
            {changingPassword ? 'Changing...' : 'Change Password'}
          </Button>
        </CardContent>
      </Card>

      {/* Permissions */}
      {!forceChange && user?.permissions && user.permissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-4 h-4" />My Permissions
            </CardTitle>
            <CardDescription>Your assigned system permissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(new Set(user.permissions.map(p => p.permission.module))).map(module => (
                <div key={module}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{module}</p>
                  <div className="flex flex-wrap gap-2">
                    {user.permissions.filter(p => p.permission.module === module).map(p => (
                      <Badge key={p.id} variant="secondary" className="text-xs">{p.permission.description}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
