const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('auth_token')
}

async function request<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data: T; message: string }> {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(`${BASE_URL}/api${endpoint}`, {
    ...options,
    headers,
  })

  // 401 = token invalid/expired → force logout
  if (res.status === 401) {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  // 403 = permission denied → return structured error, don't logout
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}))
    return {
      success: false,
      data: null as T,
      message: body.message || 'Permission denied. You do not have access to this action.',
    }
  }

  return res.json()
}

export const api = {
  get: <T = unknown>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T = unknown>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = unknown>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = unknown>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
  patch: <T = unknown>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
}

export default api
