import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Permission {
  id: number
  name: string
  module: string
  description: string | null
}

interface UserPermission {
  id: number
  userId: number
  permissionId: number
  permission: Permission
}

interface Role {
  id: number
  name: string
}

interface Branch {
  id: number
  name: string
}

export interface User {
  id: number
  fullName: string
  email: string
  phoneNumber: string
  roleId: number
  branchId: number | null
  isActive: boolean
  forcePasswordChange: boolean
  lastLogin: string | null
  role: Role
  branch: Branch | null
  permissions: UserPermission[]
}

interface AuthState {
  user: User | null
  token: string | null
  _hasHydrated: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setHasHydrated: (v: boolean) => void
  logout: () => void
  hasPermission: (permissionName: string) => boolean
  refreshUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      _hasHydrated: false,

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      logout: () => {
        set({ user: null, token: null })
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
      },

      hasPermission: (permissionName: string) => {
        const { user } = get()
        if (!user) return false
        return user.permissions?.some(p => p.permission.name === permissionName) ?? false
      },

      // Fetch latest user data (including permissions) from the server
      refreshUser: async () => {
        const { token } = get()
        if (!token) return
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const data = await res.json()
            if (data.success) {
              set({ user: data.data })
            }
          } else if (res.status === 401) {
            // Token is truly invalid — log out
            set({ user: null, token: null })
            localStorage.removeItem('auth_token')
            window.location.href = '/login'
          }
        } catch {
          // Network error — keep current state
        }
      },
    }),
    {
      name: 'tyla-shop-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
