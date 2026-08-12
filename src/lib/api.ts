import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (identifier: string, password: string) =>
    api.post('/auth/login', { identifier, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.put('/auth/change-password', data),
};

export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id: number) => api.get(`/users/${id}`),
  create: (data: object) => api.post('/users', data),
  update: (id: number, data: object) => api.put(`/users/${id}`, data),
  remove: (id: number) => api.delete(`/users/${id}`),
  permanentDelete: (id: number) => api.delete(`/users/${id}/permanent`),
  getRoles: () => api.get('/users/roles'),
  getManagers: () => api.get('/users/managers'),
};

export const productsApi = {
  getAll: (params?: object) => api.get('/products', { params }),
  getOne: (id: number) => api.get(`/products/${id}`),
  create: (data: object) => api.post('/products', data),
  update: (id: number, data: object) => api.put(`/products/${id}`, data),
  remove: (id: number) => api.delete(`/products/${id}`),
  adjustStock: (id: number, data: object) => api.post(`/products/${id}/stock`, data),
  getLowStock: () => api.get('/products/low-stock'),
  importCSV: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/products/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const salesApi = {
  getAll: (params?: object) => api.get('/sales', { params }),
  getOne: (id: number) => api.get(`/sales/${id}`),
  create: (data: object) => api.post('/sales', data),
  getDailySummary: (params?: object) => api.get('/sales/daily-summary', { params }),
  remove: (id: number) => api.delete(`/sales/${id}`),
};

export const expensesApi = {
  getAll: (params?: object) => api.get('/expenses', { params }),
  getOne: (id: number) => api.get(`/expenses/${id}`),
  create: (data: object) => api.post('/expenses', data),
  update: (id: number, data: object) => api.put(`/expenses/${id}`, data),
  remove: (id: number) => api.delete(`/expenses/${id}`),
  getCategories: () => api.get('/expenses/categories'),
  getApprovalRequests: (params?: object) => api.get('/expenses/approval-requests', { params }),
  reviewRequest: (id: number, data: { action: 'approve' | 'reject'; review_note?: string }) =>
    api.put(`/expenses/approval-requests/${id}`, data),
  getMyRequests: () => api.get('/expenses/my-requests'),
};

export const analyticsApi = {
  getDashboard:       ()             => api.get('/analytics/dashboard'),
  getSellerDashboard: ()             => api.get('/analytics/seller-dashboard'),
  getReport:          (params?: object) => api.get('/analytics/report', { params }),
  getSellers:         ()             => api.get('/analytics/sellers'),
};

export const auditApi = {
  getAll: (params?: object) => api.get('/audit', { params }),
  getModules: () => api.get('/audit/modules'),
};

export const categoriesApi = {
  getAll: () => api.get('/categories'),
  create: (data: object) => api.post('/categories', data),
};

export const capitalApi = {
  getAll: () => api.get('/capital'),
  add: (data: { amount: number; description?: string; date?: string }) => api.post('/capital', data),
  remove: (id: number) => api.delete(`/capital/${id}`),
};


export const settingsApi = {
  getRolePermissions:    () => api.get('/settings/role-permissions'),
  toggleRolePermission:  (data: { role_id: number; permission_id: number; grant: boolean }) =>
    api.post('/settings/role-permissions/toggle', data),
};

export const superadminApi = {
  getCompanies: () => api.get('/superadmin/companies'),
  createCompany: (data: { company_name: string; admin_name: string; admin_email: string; admin_password: string }) =>
    api.post('/superadmin/companies', data),
  toggleCompany: (id: number) => api.patch(`/superadmin/companies/${id}/toggle`),
  getCompanyDashboard: (id: number, params?: { period?: string; start_date?: string; end_date?: string }) =>
    api.get(`/superadmin/companies/${id}/dashboard`, { params }),
  getAuditLogs: (params?: object) => api.get('/superadmin/audit-logs', { params }),
  getRolePermissions: () => api.get('/superadmin/role-permissions'),
};

export default api;
