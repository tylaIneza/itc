'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Edit, UserX, Key, Shield, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { getInitials } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import api from '@/lib/api'

interface Role { id: number; name: string }
interface Permission { id: number; name: string; module: string; description: string }
interface UserPermission { id: number; permission: Permission }
interface User {
  id: number; fullName: string; email: string; phoneNumber: string; roleId: number
  isActive: boolean; forcePasswordChange: boolean; lastLogin: string | null
  role: Role; permissions: UserPermission[]
}

function PermissionsDialog({ user, allPermissions, onSaved, onClose }: {
  user: User
  allPermissions: Permission[]
  onSaved: () => void
  onClose: () => void
}) {
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<number>>(new Set(user.permissions.map(p => p.permission.id)))
  const [saving, setSaving] = useState(false)

  const modules = Array.from(new Set(allPermissions.map(p => p.module)))

  const togglePerm = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await api.put(`/users/${user.id}/permissions`, { permissionIds: Array.from(selected) })
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: 'Permissions updated' })
      onSaved()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-muted rounded-lg text-sm">
        Managing permissions for <strong>{user.fullName}</strong> ({user.role?.name})
      </div>
      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
        {modules.map(module => {
          const perms = allPermissions.filter(p => p.module === module)
          return (
            <div key={module}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{module}</p>
              <div className="space-y-2">
                {perms.map(perm => (
                  <label key={perm.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer">
                    <Switch checked={selected.has(perm.id)} onCheckedChange={() => togglePerm(perm.id)} />
                    <div>
                      <p className="text-sm font-medium">{perm.description}</p>
                      <p className="text-xs text-muted-foreground">{perm.name}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Permissions'}</Button>
      </DialogFooter>
    </div>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ newPassword: '', forceChange: true })
  const [saving, setSaving] = useState(false)

  const handleReset = async () => {
    if (!form.newPassword || form.newPassword.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await api.post(`/users/${user.id}/reset-password`, form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: 'Password reset successfully' })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Reset password for <strong>{user.fullName}</strong></p>
      <div className="space-y-1">
        <Label>New Password</Label>
        <Input type="password" placeholder="Min. 8 characters" value={form.newPassword} onChange={e => setForm(p => ({ ...p, newPassword: e.target.value }))} />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={form.forceChange} onCheckedChange={v => setForm(p => ({ ...p, forceChange: v }))} />
        <Label>Require password change on login</Label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleReset} disabled={saving}>{saving ? 'Resetting...' : 'Reset Password'}</Button>
      </DialogFooter>
    </div>
  )
}

function UserForm({ user, roles, onSave, onClose }: {
  user?: User | null; roles: Role[]; onSave: () => void; onClose: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    fullName: user?.fullName || '', email: user?.email || '', phoneNumber: user?.phoneNumber || '',
    password: '', roleId: String(user?.roleId || ''), isActive: user?.isActive ?? true,
    forcePasswordChange: user?.forcePasswordChange ?? false,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!user && (!form.fullName || !form.email || !form.phoneNumber || !form.password || !form.roleId)) {
      toast({ title: 'Error', description: 'All fields are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = user
        ? await api.put(`/users/${user.id}`, { fullName: form.fullName, email: form.email, phoneNumber: form.phoneNumber, roleId: form.roleId, isActive: form.isActive })
        : await api.post('/users', form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: user ? 'User updated' : 'User created' })
      onSave()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Full Name *</Label>
          <Input placeholder="John Doe" value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Email *</Label>
          <Input type="email" placeholder="john@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Phone Number *</Label>
          <Input placeholder="+250780000000" value={form.phoneNumber} onChange={e => setForm(p => ({ ...p, phoneNumber: e.target.value }))} />
        </div>
        {!user && (
          <div className="space-y-1">
            <Label>Password *</Label>
            <Input type="password" placeholder="Min. 8 characters" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </div>
        )}
        <div className="space-y-1">
          <Label>Role *</Label>
          <Select value={form.roleId} onValueChange={v => setForm(p => ({ ...p, roleId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!user && (
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <Switch checked={form.forcePasswordChange} onCheckedChange={v => setForm(p => ({ ...p, forcePasswordChange: v }))} />
            <Label>Force password change</Label>
          </div>
        )}
        {user && (
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} />
            <Label>Active Account</Label>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : user ? 'Update User' : 'Create User'}</Button>
      </DialogFooter>
    </div>
  )
}

export default function UsersPage() {
  const { toast } = useToast()
  const { checkPermission } = usePermissions()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [allPermissions, setAllPermissions] = useState<Permission[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [permUser, setPermUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)

  const canCreate = checkPermission('create_users')
  const canEdit = checkPermission('edit_users')
  const canManagePerms = checkPermission('manage_permissions')
  const canDeactivate = checkPermission('deactivate_users')
  const canDelete = checkPermission('delete_users')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      const [usersRes, rolesRes, permsRes] = await Promise.all([
        api.get<{ users: User[]; total: number }>(`/users?${params}&limit=50`),
        api.get<Role[]>('/users/roles'),
        api.get<Permission[]>('/users/permissions'),
      ])
      if (usersRes.success) { setUsers(usersRes.data.users); setTotal(usersRes.data.total) }
      else toast({ title: 'Error', description: usersRes.message || 'Failed to load users', variant: 'destructive' })
      if (rolesRes.success) setRoles(rolesRes.data)
      if (permsRes.success) setAllPermissions(permsRes.data)
    } catch {
      toast({ title: 'Network Error', description: 'Could not connect to server. Please refresh.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { load() }, [load])

  const handleDeactivate = async (userId: number) => {
    try {
      const res = await api.delete(`/users/${userId}`)
      if (res.success) { toast({ title: 'User deactivated' }); load() }
      else toast({ title: 'Error', description: res.message, variant: 'destructive' })
    } catch { toast({ title: 'Error', description: 'Failed to deactivate', variant: 'destructive' }) }
  }

  const handleDelete = async (userId: number) => {
    try {
      const res = await api.delete(`/users/${userId}/delete`)
      if (res.success) { toast({ title: 'User deleted' }); load() }
      else toast({ title: 'Error', description: res.message, variant: 'destructive' })
    } catch { toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' }) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground text-sm">{total} users</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditUser(null); setShowForm(true) }}>
            <Plus className="w-4 h-4 mr-2" />New User
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Permissions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id} className={!user.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarFallback className="bg-blue-600 text-white text-xs">{getInitials(user.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{user.fullName}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          <p className="text-xs text-muted-foreground lg:hidden">{user.phoneNumber}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{user.phoneNumber}</TableCell>
                    <TableCell><Badge variant="info">{user.role?.name}</Badge></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{user.permissions?.length || 0} perms</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'success' : 'secondary'}>{user.isActive ? 'Active' : 'Inactive'}</Badge>
                      {user.forcePasswordChange && <Badge variant="warning" className="ml-1 text-xs">Force Change</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditUser(user); setShowForm(true) }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {canManagePerms && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Permissions" onClick={() => setPermUser(user)}>
                            <Shield className="w-4 h-4" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset Password" onClick={() => setResetUser(user)}>
                            <Key className="w-4 h-4" />
                          </Button>
                        )}
                        {canDeactivate && user.isActive && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Deactivate"><UserX className="w-4 h-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deactivate User?</AlertDialogTitle>
                                <AlertDialogDescription>This will prevent {user.fullName} from logging in.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeactivate(user.id)} className="bg-destructive">Deactivate</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Delete permanently"><Trash2 className="w-4 h-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User Permanently?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently remove <strong>{user.fullName}</strong> from the system. This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(user.id)} className="bg-destructive">Delete Permanently</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>Manage user account details</DialogDescription>
          </DialogHeader>
          <UserForm user={editUser} roles={roles} onSave={load} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      {permUser && (
        <Dialog open={!!permUser} onOpenChange={() => setPermUser(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Manage Permissions</DialogTitle>
              <DialogDescription>Assign or remove permissions for this user</DialogDescription>
            </DialogHeader>
            <PermissionsDialog user={permUser} allPermissions={allPermissions} onSaved={load} onClose={() => setPermUser(null)} />
          </DialogContent>
        </Dialog>
      )}

      {resetUser && (
        <Dialog open={!!resetUser} onOpenChange={() => setResetUser(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>Set a new password for the user</DialogDescription>
            </DialogHeader>
            <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
