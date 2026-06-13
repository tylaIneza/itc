'use client'
import { useAuthStore } from '@/lib/store'

export function usePermissions() {
  const { user, hasPermission } = useAuthStore()

  const checkPermission = (permissionName: string): boolean => {
    return hasPermission(permissionName)
  }

  const isAdmin = (): boolean => {
    return user?.role?.name === 'Admin'
  }

  const isManager = (): boolean => {
    return user?.role?.name === 'Manager' || isAdmin()
  }

  return { checkPermission, isAdmin, isManager, user }
}
