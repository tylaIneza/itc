export interface User {
  id: number;
  name: string;
  email: string;
  role: 'superadmin' | 'admin' | 'manager' | 'seller';
  company_id: number | null;
  permissions: string[];
  avatar_url?: string;
  phone?: string;
  is_active?: boolean;
  last_login?: string;
  created_at?: string;
}

export interface Company {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  branch: string | null;
}

export interface Product {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  wholesale_price: number;
  low_stock_threshold: number;
  unit?: string;
  description?: string;
  is_active?: boolean;
}

export interface SaleItem {
  product_id: number;
  product_name?: string;
  quantity: number;
  selling_price?: number;
  purchase_price?: number;
  discount?: number;
  line_total?: number;
}

export interface Sale {
  id: number;
  invoice_number: string;
  seller_id: number;
  seller_name?: string;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  items?: SaleItem[];
  created_at: string;
}

export interface Expense {
  id: number;
  title: string;
  amount: number;
  category_id: number;
  category_name?: string;
  category_color?: string;
  expense_date: string;
  description?: string;
  created_by_name?: string;
  created_at?: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  description?: string;
  color?: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
}

export interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  module: string;
  entity_type?: string;
  entity_id?: number;
  description?: string;
  ip_address?: string;
  created_at: string;
  company_name?: string;
}

export interface DashboardData {
  today: { revenue: number; expenses: number; net_profit: number; transactions: number };
  weekly: { revenue: number; expenses: number; net_profit: number; transactions: number };
  monthly: { revenue: number; expenses: number; net_profit: number; transactions: number };
  all_time: { revenue: number; expenses: number; capital: number; net_profit: number; transactions: number };
  top_products: Array<{ product_name: string; qty_sold: number; revenue: number }>;
  seller_performance: Array<{ seller_name: string; transactions: number; revenue: number }>;
  seller_breakdown: Array<{ seller_id: number; seller_name: string; transactions: number; revenue: number; expenses: number; expense_count: number }>;
  user_analytics: Array<{
    seller_id: number; seller_name: string;
    today_revenue: number; today_sales: number; today_expenses: number;
    weekly_revenue: number; weekly_sales: number; weekly_expenses: number;
    monthly_revenue: number; monthly_sales: number; monthly_expenses: number;
    total_revenue: number; total_sales: number;
  }>;
  expense_breakdown: Array<{ name: string; color: string; total: number }>;
  low_stock: Product[];
  stock_stats: { total_products: number; total_items: number };
  recent_sales: Sale[];
}

export interface ReportData {
  period: string;
  start_date: string;
  end_date: string;
  summary: {
    revenue: number;
    expenses: number;
    net_profit: number;
    transactions: number;
    profit_margin: string;
  };
  daily_trend: Array<{ date: string; revenue: number; transactions: number }>;
  top_products: Array<{ product_name: string; qty_sold: number; revenue: number }>;
  seller_performance: Array<{ seller_name: string; transactions: number; revenue: number }>;
}

export interface CompanyDashboardData extends ReportData {
  company: {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    user_count: number;
    branches: Array<{ id: number; name: string }>;
  };
  stock_stats: { total_products: number; total_items: number; low_stock_count: number };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
