'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, Trash2, Eye, Loader2, Minus, ShoppingBag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useSocketEvent } from '@/hooks/use-socket'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'

interface Product {
  id: number
  name: string
  sellingPrice: number
  wholesalePrice: number
  quantity: number
  lowStockThreshold: number
  category: { name: string }
}

interface SaleItem {
  productId: number
  product: Product
  quantity: number
  unitPrice: number
  totalPrice: number
}

interface Sale {
  id: number
  invoiceNumber: string
  totalAmount: number
  createdAt: string
  user: { fullName: string }
  items: Array<{ product: { name: string }; quantity: number; unitPrice: number; totalPrice: number }>
}

interface Category { id: number; name: string }

function NewSaleDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [cartItems, setCartItems] = useState<SaleItem[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadProducts = useCallback(async (q: string, cat: string) => {
    setLoadingProducts(true)
    try {
      const params = new URLSearchParams({ isActive: 'true', limit: '60' })
      if (q.trim()) params.append('search', q.trim())
      if (cat !== 'all') params.append('categoryId', cat)
      const res = await api.get<{ products: Product[] }>(`/products?${params}`)
      if (res.success) setProducts(res.data.products)
    } finally { setLoadingProducts(false) }
  }, [])

  const loadCategories = useCallback(async () => {
    const res = await api.get<Category[]>('/categories')
    if (res.success) setCategories(res.data)
  }, [])

  useEffect(() => {
    if (!open) return
    loadCategories()
    loadProducts('', 'all')
  }, [open, loadCategories, loadProducts])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => loadProducts(search, selectedCategory), 250)
    return () => clearTimeout(t)
  }, [search, selectedCategory, open, loadProducts])

  const addToCart = (product: Product) => {
    if (product.quantity === 0) {
      toast({ title: 'Out of stock', description: `${product.name} has no stock`, variant: 'destructive' })
      return
    }
    setCartItems(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) return prev // already in cart — user fills qty/price manually
      return [...prev, {
        productId: product.id,
        product,
        quantity: 0,
        unitPrice: 0,
        totalPrice: 0,
      }]
    })
  }

  const updateQty = (productId: number, delta: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const q = Math.max(0, Math.min(i.quantity + delta, i.product.quantity))
      return { ...i, quantity: q, totalPrice: q * i.unitPrice }
    }))
  }

  const setQty = (productId: number, val: string) => {
    setCartItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const q = val === '' ? 0 : Math.min(parseInt(val) || 0, i.product.quantity)
      return { ...i, quantity: q, totalPrice: q * i.unitPrice }
    }))
  }

  const updatePrice = (productId: number, val: string) => {
    setCartItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const price = val === '' ? 0 : parseFloat(val) || 0
      return { ...i, unitPrice: price, totalPrice: i.quantity * price }
    }))
  }

  const enforceMinPrice = (productId: number) => {
    setCartItems(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const minPrice = parseFloat(String(i.product.wholesalePrice))
      if (i.unitPrice > 0 && i.unitPrice < minPrice) {
        toast({ title: 'Price too low', description: `Min price for ${i.product.name} is ${formatCurrency(minPrice)}`, variant: 'destructive' })
        return { ...i, unitPrice: minPrice, totalPrice: i.quantity * minPrice }
      }
      return i
    }))
  }

  const removeItem = (productId: number) => setCartItems(prev => prev.filter(i => i.productId !== productId))
  const total = cartItems.reduce((s, i) => s + i.totalPrice, 0)
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0)

  const handleClose = (v: boolean) => {
    if (!v) { setSearch(''); setCartItems([]); setSelectedCategory('all'); setProducts([]) }
    setOpen(v)
  }

  const handleSubmit = async () => {
    if (cartItems.length === 0) {
      toast({ title: 'Cart is empty', description: 'Add at least one product', variant: 'destructive' })
      return
    }
    for (const item of cartItems) {
      if (item.quantity <= 0) {
        toast({ title: 'Missing quantity', description: `Enter a quantity for ${item.product.name}`, variant: 'destructive' })
        return
      }
      if (item.unitPrice <= 0) {
        toast({ title: 'Missing price', description: `Enter a price for ${item.product.name}`, variant: 'destructive' })
        return
      }
      if (item.quantity > item.product.quantity) {
        toast({ title: 'Insufficient stock', description: `Only ${item.product.quantity} units of ${item.product.name} available`, variant: 'destructive' })
        return
      }
      if (item.unitPrice < parseFloat(String(item.product.wholesalePrice))) {
        toast({ title: 'Price too low', description: `${item.product.name} cannot be sold below wholesale price`, variant: 'destructive' })
        return
      }
    }
    setSubmitting(true)
    try {
      const res = await api.post('/sales', {
        items: cartItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
      })
      if (!res.success) {
        toast({ title: 'Failed', description: res.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Sale Created!', description: `Invoice ${(res.data as Sale).invoiceNumber}` })
      handleClose(false)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" />New Sale
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-5xl w-full p-0 gap-0 h-[90vh] flex flex-col overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-background shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-600">
                <ShoppingBag className="w-4 h-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold leading-none">New Sale</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">Select products and confirm</DialogDescription>
              </div>
            </div>
            <button onClick={() => handleClose(false)} className="rounded-md p-1.5 hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main split layout */}
          <div className="flex flex-1 min-h-0">

            {/* LEFT — Products */}
            <div className="flex flex-col flex-1 min-w-0 border-r">
              {/* Filters */}
              <div className="px-4 py-3 border-b bg-muted/30 flex gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  {loadingProducts && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  <Input
                    ref={searchRef}
                    placeholder="Search products..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm bg-background"
                    autoComplete="off"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingProducts && products.length === 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : products.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <Search className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">No products found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {products.map(product => {
                      const inCart = cartItems.find(i => i.productId === product.id)
                      const outOfStock = product.quantity === 0
                      return (
                        <button
                          key={product.id}
                          onClick={() => addToCart(product)}
                          disabled={outOfStock}
                          className={`relative rounded-xl border text-left p-3 transition-all duration-150 group
                            ${outOfStock ? 'opacity-40 cursor-not-allowed bg-muted/30' :
                              inCart ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm' :
                              'hover:border-blue-300 hover:bg-muted/40 hover:shadow-sm bg-background'}`}
                        >
                          {inCart && (
                            <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                              {inCart.quantity}
                            </span>
                          )}
                          <div className="mb-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/50 dark:to-blue-800/50 flex items-center justify-center mb-2">
                              <ShoppingBag className="w-4 h-4 text-blue-600" />
                            </div>
                          </div>
                          <p className="font-medium text-sm leading-tight line-clamp-2 mb-1">{product.name}</p>
                          <p className="text-xs text-muted-foreground mb-2">{product.category?.name}</p>
                          <p className="font-bold text-blue-600 text-sm">{formatCurrency(product.sellingPrice)}</p>
                          <p className={`text-xs mt-0.5 ${product.quantity <= product.lowStockThreshold ? 'text-amber-500' : 'text-muted-foreground'}`}>
                            {outOfStock ? 'Out of stock' : `${product.quantity} in stock`}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Cart */}
            <div className="w-72 shrink-0 flex flex-col bg-muted/20">
              {/* Cart header */}
              <div className="px-4 py-3 border-b bg-background shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-sm">Order</span>
                  {totalItems > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5">{totalItems}</span>
                  )}
                </div>
                {cartItems.length > 0 && (
                  <button onClick={() => setCartItems([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                    Clear all
                  </button>
                )}
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                      <ShoppingBag className="w-6 h-6 opacity-40" />
                    </div>
                    <p className="text-sm font-medium">Cart is empty</p>
                    <p className="text-xs mt-1 text-center">Click products on the left to add them</p>
                  </div>
                ) : cartItems.map(item => {
                  const belowWholesale = item.unitPrice > 0 && item.unitPrice < parseFloat(String(item.product.wholesalePrice))
                  const missingQty = item.quantity <= 0
                  const missingPrice = item.unitPrice <= 0
                  const hasError = belowWholesale || missingQty || missingPrice
                  return (
                    <div key={item.productId} className={`rounded-xl border bg-background p-3 ${hasError ? 'border-amber-300' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-xs leading-tight">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">Max: {item.product.quantity} · Min price: {formatCurrency(item.product.wholesalePrice)}</p>
                        </div>
                        <button onClick={() => removeItem(item.productId)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Qty</p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQty(item.productId, -1)}
                              disabled={item.quantity <= 0}
                              className="w-6 h-7 rounded border flex items-center justify-center hover:bg-muted transition-colors shrink-0 disabled:opacity-30"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <Input
                              type="number"
                              min={0}
                              max={item.product.quantity}
                              placeholder="0"
                              value={item.quantity === 0 ? '' : item.quantity}
                              onChange={e => setQty(item.productId, e.target.value)}
                              className={`h-7 text-xs px-2 text-center w-full ${missingQty ? 'border-amber-400 placeholder:text-amber-400' : ''}`}
                            />
                            <button
                              onClick={() => updateQty(item.productId, 1)}
                              disabled={item.quantity >= item.product.quantity}
                              className="w-6 h-7 rounded border flex items-center justify-center hover:bg-muted transition-colors shrink-0 disabled:opacity-30"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Price (FRW)</p>
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={item.unitPrice === 0 ? '' : item.unitPrice}
                            onChange={e => updatePrice(item.productId, e.target.value)}
                            onBlur={() => enforceMinPrice(item.productId)}
                            className={`h-7 text-xs px-2 ${missingPrice ? 'border-amber-400 placeholder:text-amber-400' : ''} ${belowWholesale ? 'border-red-400' : ''}`}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">
                          {item.quantity > 0 && item.unitPrice > 0 ? `${item.quantity} × ${formatCurrency(item.unitPrice)}` : 'Enter qty & price'}
                        </span>
                        <span className={`font-bold text-sm ${item.totalPrice > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {item.totalPrice > 0 ? formatCurrency(item.totalPrice) : '—'}
                        </span>
                      </div>
                      {belowWholesale && <p className="text-xs text-red-500 mt-1">Below min price ({formatCurrency(item.product.wholesalePrice)})</p>}
                    </div>
                  )
                })}
              </div>

              {/* Cart footer */}
              <div className="px-4 py-4 border-t bg-background shrink-0 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Subtotal ({cartItems.length} item{cartItems.length !== 1 ? 's' : ''})</span>
                  <span className="font-bold text-lg text-green-600">{formatCurrency(total)}</span>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || cartItems.length === 0}
                  className="w-full h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                    : `Confirm Sale · ${formatCurrency(total)}`}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function SalesPage() {
  const { toast } = useToast()
  const { checkPermission } = usePermissions()
  const { user } = useAuthStore()
  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

  const roleName = user?.role?.name
  const canCreate = checkPermission('create_sale') && roleName !== 'Admin' && roleName !== 'Manager'
  const canDelete = checkPermission('delete_sale')
  const canView = checkPermission('view_sales')

  const loadSales = useCallback(async () => {
    if (!canView) { setLoading(false); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.append('search', search)
      const res = await api.get<{ sales: Sale[]; total: number }>(`/sales?${params}`)
      if (res.success) {
        setSales(res.data.sales)
        setTotal(res.data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, canView])

  useEffect(() => { loadSales() }, [loadSales])
  useSocketEvent('sale:created', useCallback(() => { loadSales() }, [loadSales]))
  useSocketEvent('sale:deleted', useCallback(() => { loadSales() }, [loadSales]))

  const handleDelete = async (saleId: number) => {
    try {
      const res = await api.delete(`/sales/${saleId}`)
      if (res.success) {
        toast({ title: 'Sale deleted', description: 'Stock has been restored' })
        loadSales()
      } else {
        toast({ title: 'Error', description: res.message, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete sale', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-muted-foreground text-sm">{total} total sales</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canCreate && <NewSaleDialog onCreated={loadSales} />}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search invoice number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {!canView ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">You don&apos;t have permission to view the sales list.</p>
              {canCreate && <p className="text-xs mt-1">You can still create new sales using the button above.</p>}
            </div>
          ) : loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No sales found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="hidden sm:table-cell">Seller</TableHead>
                  <TableHead className="hidden sm:table-cell">Items</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map(sale => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <p className="font-mono text-sm font-medium text-blue-600">{sale.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{sale.user?.fullName} · {formatDateTime(sale.createdAt)}</p>
                    </TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">{sale.user?.fullName}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="secondary">{sale.items?.length || 0} item(s)</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">{formatCurrency(sale.totalAmount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{formatDateTime(sale.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedSale(sale)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Sale?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete {sale.invoiceNumber} and restore the stock. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(sale.id)} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
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

      {/* Pagination */}
      {canView && total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Sale detail dialog */}
      {selectedSale && (
        <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-mono">{selectedSale.invoiceNumber}</DialogTitle>
              <DialogDescription>Sale details and items</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Seller</p>
                  <p className="font-medium">{selectedSale.user?.fullName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDateTime(selectedSale.createdAt)}</p>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.items?.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">{item.product?.name}</TableCell>
                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatCurrency(item.totalPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold text-green-600">{formatCurrency(selectedSale.totalAmount)}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

