'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { salesApi, productsApi } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Sale, Product } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  ShoppingCart, Trash2, CheckCircle, AlertCircle,
  Search, X, Package, Receipt, Loader2, RefreshCw, Plus, Eye,
} from 'lucide-react';

const C = {
  bg:     '#07071a',
  card:   'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  muted:  'rgba(255,255,255,0.35)',
  dim:    'rgba(255,255,255,0.18)',
};

interface CartItem {
  product: Product;
  qty:     string;
  price:   string;
}

export default function SalesPage() {
  const { hasPermission, isAdmin } = useAuth();
  const canSell = hasPermission('create_sale') && !isAdmin;

  const [products,   setProducts]   = useState<Product[]>([]);
  const [sales,      setSales]      = useState<Sale[]>([]);
  const [cart,       setCart]       = useState<CartItem[]>([]);
  const [tab,        setTab]        = useState<'new' | 'history'>('new');
  const [saving,     setSaving]     = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [query,      setQuery]      = useState('');
  const [viewSale,   setViewSale]   = useState<Sale | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadProducts = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const r = await productsApi.getAll({ limit: 500 });
      setProducts(r.data.products);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  const loadSales = useCallback(() => {
    salesApi.getAll({ limit: 100 }).then(r => setSales(r.data.sales)).catch(() => {});
  }, []);

  useEffect(() => {
    loadProducts();
    loadSales();
    const t = setInterval(() => loadProducts(true), 30_000);
    return () => clearInterval(t);
  }, [loadProducts, loadSales]);

  const filtered = useMemo(() =>
    products.filter(p =>
      query.trim() === '' ||
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(query.toLowerCase()),
    ), [products, query]);

  const inCart = (id: number) => cart.some(c => c.product.id === id);

  const addToCart = (p: Product) => {
    if (p.quantity === 0 || inCart(p.id)) return;
    setCart(prev => [...prev, { product: p, qty: '', price: '' }]);
    setError(''); setSuccess('');
  };

  const updateCart = (id: number, field: 'qty' | 'price', val: string) =>
    setCart(prev => prev.map(c => {
      if (c.product.id !== id) return c;
      if (field === 'qty') {
        if (val === '') return { ...c, qty: '' };
        return { ...c, qty: String(Math.min(parseInt(val) || 1, c.product.quantity)) };
      }
      return { ...c, price: val };
    }));

  const removeFromCart = (id: number) => setCart(prev => prev.filter(c => c.product.id !== id));

  const cartTotal  = cart.reduce((s, c) => s + (parseFloat(c.price) || 0) * (parseInt(c.qty) || 0), 0);
  const totalUnits = cart.reduce((s, c) => s + (parseInt(c.qty) || 0), 0);

  const submit = async () => {
    if (!cart.length) return;
    const empty = cart.filter(c => !c.qty || !c.price);
    if (empty.length) {
      setError(`Fill qty & price for: ${empty.map(e => e.product.name).join(', ')}`);
      return;
    }
    const belowWholesale = cart.filter(c => {
      const wholesale = c.product.wholesale_price ?? 0;
      return wholesale > 0 && parseFloat(c.price) < wholesale;
    });
    if (belowWholesale.length) {
      setError(`Price below wholesale for: ${belowWholesale.map(c => c.product.name).join(', ')}`);
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      await salesApi.create({
        items: cart.map(c => ({
          product_id: c.product.id,
          quantity: parseInt(c.qty),
          selling_price: parseFloat(c.price),
          discount: 0,
        })),
        payment_method: 'CASH',
        discount: 0,
      });
      setSuccess(`Sale complete! Total collected: ${formatCurrency(cartTotal)}`);
      setCart([]);
      loadProducts(true);
      loadSales();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to record sale');
    } finally { setSaving(false); }
  };

  const openView = async (id: number) => {
    try {
      const res = await salesApi.getOne(id);
      setViewSale(res.data.sale);
    } catch { toast.error('Failed to load sale'); }
  };

  const handleDelete = async (sale: Sale) => {
    if (!confirm(`Delete sale ${sale.invoice_number} (${formatCurrency(sale.total_amount)})?\n\nStock will be restored automatically.`)) return;
    setDeletingId(sale.id);
    try {
      const r = await salesApi.remove(sale.id);
      toast.success(r.data.message);
      loadSales();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to delete sale');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="-mx-4 lg:-mx-6 -my-4 lg:-my-6 flex flex-col"
      style={{ background: C.bg, height: 'calc(100vh - 4rem)' }}
    >
      {/* ── Page header ── */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#8b5cf6)', boxShadow: '0 4px 14px rgba(29,78,216,0.4)' }}
            >
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-none">Sales</h1>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                {products.filter(p => p.quantity > 0).length} products available
              </p>
            </div>
          </div>
          <button
            onClick={() => loadProducts()}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
            style={{ color: C.muted, border: `1px solid ${C.border}`, background: C.card }}
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(isAdmin ? ['history'] as const : ['new', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: tab === t ? 'rgba(29,78,216,0.2)' : 'transparent',
                color:      tab === t ? '#60a5fa' : C.muted,
                border:     `1px solid ${tab === t ? 'rgba(29,78,216,0.4)' : 'transparent'}`,
              }}
            >
              {t === 'new' ? 'New Sale' : (
                <span className="flex items-center gap-1.5">
                  History
                  {sales.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(29,78,216,0.2)', color: '#60a5fa' }}>
                      {sales.length}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── New Sale tab ── */}
      {tab === 'new' && canSell && (
        <div className="flex flex-1 min-h-0">

          {/* LEFT — product grid */}
          <div className="flex-1 flex flex-col min-h-0" style={{ borderRight: `1px solid ${C.border}` }}>

            {/* Search */}
            <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: C.dim }} />
                <input
                  className="w-full pl-10 pr-9 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-600/40"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}` }}
                  placeholder="Filter by product name, SKU or category…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.dim }}>
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-[11px] mt-1.5 px-0.5" style={{ color: C.dim }}>
                {filtered.length} product{filtered.length !== 1 ? 's' : ''} · click card to add to cart
              </p>
            </div>

            {/* Cards grid */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(29,78,216,0.08)' }}>
                    <Package className="w-6 h-6 text-blue-400" />
                  </div>
                  <p className="text-sm font-semibold text-white">No products found</p>
                  <p className="text-xs" style={{ color: C.muted }}>Try a different search term</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.map(p => {
                    const added    = inCart(p.id);
                    const oos      = p.quantity === 0;
                    const lowStock = p.quantity > 0 && p.quantity <= p.low_stock_threshold;
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p)}
                        disabled={oos || added}
                        className="relative flex flex-col gap-2 p-3.5 rounded-2xl text-left transition-all duration-150 group"
                        style={{
                          background: added ? 'rgba(29,78,216,0.15)' : oos ? 'rgba(255,255,255,0.02)' : C.card,
                          border: `1px solid ${added ? 'rgba(29,78,216,0.4)' : oos ? 'rgba(255,255,255,0.05)' : C.border}`,
                          opacity: oos ? 0.45 : 1,
                          cursor: oos || added ? 'default' : 'pointer',
                        }}
                        onMouseEnter={e => { if (!oos && !added) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(29,78,216,0.5)'; }}
                        onMouseLeave={e => { if (!oos && !added) (e.currentTarget as HTMLElement).style.borderColor = C.border; }}
                      >
                        {/* status badge */}
                        <div className="absolute top-2.5 right-2.5">
                          {added
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(29,78,216,0.25)', color: '#60a5fa' }}>In cart</span>
                            : oos
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400">Out</span>
                            : lowStock
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400">{p.quantity} left</span>
                            : null}
                        </div>

                        {/* icon */}
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: added ? 'rgba(29,78,216,0.25)' : 'rgba(29,78,216,0.12)' }}>
                          {added
                            ? <CheckCircle className="w-4 h-4 text-blue-400" />
                            : <Package className="w-4 h-4 text-blue-400" />}
                        </div>

                        {/* name */}
                        <div>
                          <p className="text-sm font-semibold text-white leading-tight line-clamp-2">{p.name}</p>
                        </div>

                        {/* stock */}
                        <div className="mt-auto pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          {!oos && !added && (
                            <p className="text-[11px]" style={{ color: 'rgba(52,211,153,0.7)' }}>{p.quantity} in stock</p>
                          )}
                        </div>

                        {/* hover overlay */}
                        {!oos && !added && (
                          <div className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: 'rgba(29,78,216,0.06)' }}>
                            <Plus className="w-5 h-5 text-blue-400" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — cart */}
          <div className="w-80 xl:w-96 flex flex-col flex-shrink-0" style={{ background: 'rgba(255,255,255,0.02)' }}>

            {/* Cart header */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-white text-sm">Cart</span>
                {cart.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ background: 'rgba(29,78,216,0.2)', color: '#60a5fa' }}>
                    {cart.length}
                  </span>
                )}
              </div>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs transition-colors hover:text-red-400" style={{ color: 'rgba(248,113,113,0.6)' }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Alerts */}
            {(error || success) && (
              <div className="px-4 pt-3 space-y-2 flex-shrink-0">
                {error && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl text-xs text-red-400 border border-red-500/20" style={{ background: 'rgba(239,68,68,0.07)' }}>
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
                  </div>
                )}
                {success && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl text-xs text-emerald-400 border border-emerald-500/20" style={{ background: 'rgba(52,211,153,0.07)' }}>
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{success}
                  </div>
                )}
              </div>
            )}

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2">
                  <ShoppingCart className="w-8 h-8" style={{ color: C.dim }} />
                  <p className="text-sm" style={{ color: C.muted }}>Cart is empty</p>
                  <p className="text-xs text-center" style={{ color: C.dim }}>Click a product card on the left</p>
                </div>
              ) : (
                cart.map(item => {
                  const subtotal  = (parseFloat(item.price) || 0) * (parseInt(item.qty) || 0);
                  const wholesale     = item.product.wholesale_price ?? 0;
                  const priceVal      = parseFloat(item.price) || 0;
                  const belowCost     = wholesale > 0 && priceVal > 0 && priceVal < wholesale;
                  const profit        = priceVal > 0 && parseInt(item.qty) > 0
                    ? (priceVal - wholesale) * parseInt(item.qty) : null;

                  return (
                    <div key={item.product.id} className="rounded-xl p-3 space-y-2.5"
                      style={{
                        background: belowCost ? 'rgba(239,68,68,0.06)' : C.card,
                        border: `1px solid ${belowCost ? 'rgba(239,68,68,0.35)' : C.border}`,
                      }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{item.product.name}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: C.muted }}>
                            {item.product.quantity} in stock
                            {wholesale > 0 && <span style={{ color: 'rgba(251,191,36,0.7)' }}> · wholesale: RWF {wholesale.toLocaleString()}</span>}
                          </p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                          style={{ color: 'rgba(248,113,113,0.5)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(248,113,113,0.5)'; }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] mb-1 font-medium" style={{ color: C.dim }}>Quantity</label>
                          <input
                            type="number" min="1" max={item.product.quantity}
                            className="w-full text-center py-1.5 rounded-lg text-xs font-semibold text-white outline-none focus:ring-1 focus:ring-blue-600/40"
                            style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${C.border}` }}
                            value={item.qty}
                            placeholder=""
                            onChange={e => updateCart(item.product.id, 'qty', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] mb-1 font-medium" style={{ color: belowCost ? '#f87171' : C.dim }}>
                            Price {belowCost && '⚠ below wholesale'}
                          </label>
                          <input
                            type="number" min="0" step="0.01"
                            className="w-full text-right py-1.5 rounded-lg text-xs font-semibold text-white outline-none focus:ring-1"
                            style={{
                              background: belowCost ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)',
                              border: `1px solid ${belowCost ? 'rgba(239,68,68,0.5)' : C.border}`,
                            }}
                            value={item.price}
                            placeholder="0"
                            onChange={e => updateCart(item.product.id, 'price', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between text-xs">
                        <span style={{ color: C.muted }}>Subtotal</span>
                        <span className="font-black" style={{ color: '#60a5fa' }}>{formatCurrency(subtotal)}</span>
                      </div>
                      {profit !== null && wholesale > 0 && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: C.muted }}>Profit</span>
                          <span className="font-semibold" style={{ color: profit >= 0 ? 'rgba(52,211,153,0.85)' : '#f87171' }}>
                            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Total + submit */}
            <div className="px-4 pb-5 pt-3 flex-shrink-0 space-y-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <div className="flex justify-between items-center text-sm" style={{ color: C.muted }}>
                <span>Products</span><span className="text-white font-semibold">{cart.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm" style={{ color: C.muted }}>
                <span>Total Units</span><span className="text-white font-semibold">{totalUnits}</span>
              </div>
              <div className="flex justify-between items-center" style={{ borderTop: `1px solid ${C.border}`, paddingTop: '12px' }}>
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-2xl font-black" style={{ color: '#60a5fa' }}>{formatCurrency(cartTotal)}</span>
              </div>
              <button
                onClick={submit}
                disabled={saving || cart.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#8b5cf6)', boxShadow: cart.length ? '0 4px 14px rgba(29,78,216,0.35)' : 'none' }}
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
                  : <><CheckCircle className="w-4 h-4" />Complete Sale</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No permission */}
      {tab === 'new' && !canSell && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <ShoppingCart className="w-10 h-10" style={{ color: C.dim }} />
          <p className="text-sm font-semibold text-white">No permission to sell</p>
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <p className="font-bold text-white">Sales History</p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>{sales.length} records</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Invoice', 'Seller', 'Customer', 'Payment', 'Date', 'Total', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-left ${h === 'Total' ? 'text-right' : ''}`}
                        style={{ color: C.dim }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(29,78,216,0.08)' }}>
                            <ShoppingCart className="w-5 h-5 text-blue-400" />
                          </div>
                          <p className="text-sm font-semibold text-white">No sales yet</p>
                          <p className="text-xs" style={{ color: C.muted }}>Completed sales will appear here</p>
                        </div>
                      </td>
                    </tr>
                  ) : sales.map(s => (
                    <tr key={s.id}
                      style={{ borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(29,78,216,0.04)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                      <td className="px-4 py-3 font-semibold" style={{ color: '#60a5fa' }}>{s.invoice_number}</td>
                      <td className="px-4 py-3" style={{ color: C.muted }}>{s.seller_name}</td>
                      <td className="px-4 py-3" style={{ color: C.muted }}>{s.customer_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: s.payment_method === 'CASH' ? 'rgba(52,211,153,0.15)' : 'rgba(29,78,216,0.15)', color: s.payment_method === 'CASH' ? '#34d399' : '#60a5fa' }}>
                          {s.payment_method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.muted }}>{formatDateTime(s.created_at)}</td>
                      <td className="px-4 py-3 text-right font-black" style={{ color: '#60a5fa' }}>{formatCurrency(s.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openView(s.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                            style={{ color: C.dim }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(29,78,216,0.12)'; (e.currentTarget as HTMLElement).style.color = '#60a5fa'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.dim; }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button onClick={() => handleDelete(s)}
                              disabled={deletingId === s.id}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
                              style={{ color: C.dim }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = C.dim; }}
                              title="Delete sale"
                            >
                              {deletingId === s.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* View Sale Modal */}
      <Modal open={!!viewSale} onClose={() => setViewSale(null)} title="Sale Details" size="md"
        footer={<button onClick={() => setViewSale(null)} className="btn-secondary">Close</button>}
      >
        {viewSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Invoice</span><p className="font-semibold text-blue-700">{viewSale.invoice_number}</p></div>
              <div><span className="text-gray-500">Date</span><p className="font-medium">{formatDateTime(viewSale.created_at)}</p></div>
              <div><span className="text-gray-500">Seller</span><p className="font-medium">{viewSale.seller_name}</p></div>
              <div><span className="text-gray-500">Payment</span><p className="font-medium">{viewSale.payment_method}</p></div>
              {viewSale.customer_name && <div><span className="text-gray-500">Customer</span><p className="font-medium">{viewSale.customer_name}</p></div>}
            </div>
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3 text-gray-900 dark:text-white">Items</h4>
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-center px-3 py-2">Qty</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {viewSale.items?.map((item, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{item.product_name}</td>
                        <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(item.selling_price!)}</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-white">{formatCurrency(item.line_total!)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(viewSale.subtotal)}</span></div>
              {viewSale.discount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>−{formatCurrency(viewSale.discount)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Total</span><span className="text-blue-700">{formatCurrency(viewSale.total_amount)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
