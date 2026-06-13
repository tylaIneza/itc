'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, Edit, AlertTriangle, Package, ChevronDown, Upload, Download, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { useSocketEvent } from '@/hooks/use-socket'
import api from '@/lib/api'

interface Category { id: number; name: string }
interface Product {
  id: number; name: string; categoryId: number; wholesalePrice: number; sellingPrice: number
  quantity: number; lowStockThreshold: number; isActive: boolean; isLowStock: boolean
  category: Category
}

const STOCK_TYPES = [
  { value: 'IN', label: 'Stock In', color: 'text-green-600' },
  { value: 'OUT', label: 'Stock Out', color: 'text-red-500' },
  { value: 'ADJUSTMENT', label: 'Set Quantity', color: 'text-blue-600' },
]

interface ImportRow {
  name: string
  quantity: number
  low_stock_threshold: number
  wholesale_price?: number
  selling_price?: number
  category?: string
  _status?: 'ok' | 'error'
  _error?: string
}

function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const REQUIRED_COLS = ['name', 'quantity', 'low_stock_threshold']

  const parseFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast({ title: 'Invalid file', description: 'Please upload an .xlsx, .xls, or .csv file', variant: 'destructive' })
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        if (json.length === 0) {
          toast({ title: 'Empty file', description: 'No rows found in the file', variant: 'destructive' })
          return
        }

        // Normalize column keys: lowercase + trim + replace spaces with _
        const normalized = json.map(raw => {
          const row: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(raw)) {
            row[k.toLowerCase().trim().replace(/\s+/g, '_')] = v
          }
          return row
        })

        const missing = REQUIRED_COLS.filter(c => !Object.keys(normalized[0]).includes(c))
        if (missing.length > 0) {
          toast({ title: 'Missing columns', description: `Required: ${missing.join(', ')}`, variant: 'destructive' })
          setRows([])
          return
        }

        const parsed: ImportRow[] = normalized.map(r => {
          const name = String(r.name || '').trim()
          const quantity = parseInt(String(r.quantity)) || 0
          const low_stock_threshold = parseInt(String(r.low_stock_threshold)) || 5
          const wholesale_price = r.wholesale_price ? parseFloat(String(r.wholesale_price)) : undefined
          const selling_price = r.selling_price ? parseFloat(String(r.selling_price)) : undefined
          const category = r.category ? String(r.category).trim() : undefined

          let _status: 'ok' | 'error' = 'ok'
          let _error = ''
          if (!name) { _status = 'error'; _error = 'Name is empty' }
          else if (quantity < 0) { _status = 'error'; _error = 'Quantity cannot be negative' }

          return { name, quantity, low_stock_threshold, wholesale_price, selling_price, category, _status, _error }
        })

        setRows(parsed)
      } catch {
        toast({ title: 'Parse error', description: 'Could not read the file', variant: 'destructive' })
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'quantity', 'low_stock_threshold'],
      ['Samsung Galaxy A55', 20, 5],
      ['iPhone 15 128GB', 10, 3],
      ['Tecno Spark 20 Pro', 15, 5],
      ['Samsung 55" QLED TV', 4, 2],
      ['LG 43" Full HD TV', 6, 2],
      ['HP Laptop 15s i5', 8, 2],
      ['Dell Inspiron 14 i3', 5, 2],
      ['JBL Charge 5 Speaker', 12, 3],
      ['Airpods Pro 2nd Gen', 7, 3],
      ['Anker PowerBank 20000mAh', 20, 5],
      ['USB-C Charging Cable 1m', 50, 10],
      ['Wireless Charger 15W', 15, 5],
      ['HDMI Cable 2m', 25, 5],
      ['Memory Card 128GB', 30, 10],
    ])
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 22 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'products_import_template.xlsx')
  }

  const handleImport = async () => {
    const validRows = rows.filter(r => r._status === 'ok')
    if (validRows.length === 0) {
      toast({ title: 'No valid rows', description: 'Fix errors before importing', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post('/products/import', { rows: validRows })
      if (!res.success) {
        toast({ title: 'Import failed', description: res.message, variant: 'destructive' })
        return
      }
      const { created, updated, errors } = res.data as { created: number; updated: number; errors: string[] }
      toast({
        title: 'Import complete',
        description: `${created} created · ${updated} updated${errors.length > 0 ? ` · ${errors.length} skipped` : ''}`,
      })
      onImported()
      handleClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setRows([]); setFileName(''); onClose()
  }

  const validCount = rows.filter(r => r._status === 'ok').length
  const errorCount = rows.filter(r => r._status === 'error').length

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col gap-0 p-0">
        <div className="px-6 pt-5 pb-4 border-b flex items-center justify-between">
          <div>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Import Products from Excel
            </DialogTitle>
            <DialogDescription className="text-xs mt-0.5">
              Upload .xlsx / .xls / .csv with columns: <code className="bg-muted px-1 rounded text-xs">name</code> · <code className="bg-muted px-1 rounded text-xs">quantity</code> · <code className="bg-muted px-1 rounded text-xs">low_stock_threshold</code>
            </DialogDescription>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Drop zone */}
          {rows.length === 0 && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                ${dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/30'}`}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-60" />
              <p className="font-medium text-sm">Drop your Excel file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Template download */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
            <FileSpreadsheet className="w-5 h-5 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Need a template?</p>
              <p className="text-xs text-muted-foreground">Download the sample file with correct column names</p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Template
            </Button>
          </div>

          {/* File loaded — show summary + preview */}
          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <span className="font-medium">{fileName}</span>
                  <button onClick={() => { setRows([]); setFileName('') }} className="ml-1 text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {validCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{validCount} valid row{validCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Low Stock</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Wholesale</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Selling</TableHead>
                        <TableHead className="hidden sm:table-cell">Category</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, i) => (
                        <TableRow key={i} className={row._status === 'error' ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{row.name || <span className="text-red-400 italic">empty</span>}</TableCell>
                          <TableCell className="text-right text-sm">{row.quantity}</TableCell>
                          <TableCell className="text-right text-sm">{row.low_stock_threshold}</TableCell>
                          <TableCell className="text-right text-sm hidden sm:table-cell">
                            {row.wholesale_price != null ? formatCurrency(row.wholesale_price) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm hidden sm:table-cell">
                            {row.selling_price != null ? formatCurrency(row.selling_price) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm hidden sm:table-cell">{row.category || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>
                            {row._status === 'ok'
                              ? <Badge variant="success" className="text-xs">Ready</Badge>
                              : <span className="text-xs text-red-500">{row._error}</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-background flex items-center justify-between gap-4 shrink-0">
          <p className="text-xs text-muted-foreground">
            {rows.length > 0
              ? `${validCount} of ${rows.length} rows will be imported`
              : 'No file selected'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={submitting || validCount === 0}
              className="min-w-[120px]"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                : <><Upload className="w-4 h-4 mr-2" />Import {validCount > 0 ? validCount : ''} Rows</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ProductForm({ product, categories, onSave, onClose }: {
  product?: Product | null
  categories: Category[]
  onSave: () => void
  onClose: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    name: product?.name || '',
    categoryId: String(product?.categoryId || ''),
    wholesalePrice: String(product?.wholesalePrice || ''),
    sellingPrice: String(product?.sellingPrice || ''),
    quantity: String(product?.quantity || '0'),
    lowStockThreshold: String(product?.lowStockThreshold || '5'),
    isActive: product?.isActive ?? true,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name || !form.categoryId || !form.wholesalePrice || !form.sellingPrice) {
      toast({ title: 'Error', description: 'Fill all required fields', variant: 'destructive' })
      return
    }
    if (parseFloat(form.sellingPrice) < parseFloat(form.wholesalePrice)) {
      toast({ title: 'Error', description: 'Selling price cannot be below wholesale price', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = product
        ? await api.put(`/products/${product.id}`, form)
        : await api.post('/products', form)
      if (!res.success) {
        toast({ title: 'Error', description: res.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Success', description: product ? 'Product updated' : 'Product created' })
      onSave()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Product Name *</Label>
          <Input placeholder="e.g. Samsung Galaxy A54" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Category *</Label>
          <Select value={form.categoryId} onValueChange={v => setForm(p => ({ ...p, categoryId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Low Stock Threshold</Label>
          <Input type="number" min={0} value={form.lowStockThreshold} onChange={e => setForm(p => ({ ...p, lowStockThreshold: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Wholesale Price (FRW) *</Label>
          <Input type="number" min={0} placeholder="0" value={form.wholesalePrice} onChange={e => setForm(p => ({ ...p, wholesalePrice: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Selling Price (FRW) *</Label>
          <Input type="number" min={0} placeholder="0" value={form.sellingPrice} onChange={e => setForm(p => ({ ...p, sellingPrice: e.target.value }))} />
        </div>
        {!product && (
          <div className="space-y-1">
            <Label>Initial Quantity</Label>
            <Input type="number" min={0} placeholder="0" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
          </div>
        )}
        {product && (
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} />
            <Label>Active Product</Label>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : product ? 'Update Product' : 'Create Product'}</Button>
      </DialogFooter>
    </div>
  )
}

function StockAdjustDialog({ product, onClose, onAdjusted }: { product: Product; onClose: () => void; onAdjusted: () => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ type: 'IN', quantity: '', reason: '' })
  const [saving, setSaving] = useState(false)

  const handleAdjust = async () => {
    if (!form.quantity || !form.reason) {
      toast({ title: 'Error', description: 'All fields required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await api.post(`/products/${product.id}/adjust-stock`, form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: 'Stock adjusted' })
      onAdjusted()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-muted rounded-lg text-sm">
        <span className="font-medium">{product.name}</span> · Current stock: <span className="font-bold">{product.quantity}</span>
      </div>
      <div className="space-y-1">
        <Label>Adjustment Type</Label>
        <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STOCK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>{form.type === 'ADJUSTMENT' ? 'New Quantity' : 'Quantity'}</Label>
        <Input type="number" min={1} placeholder="0" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Reason *</Label>
        <Input placeholder="Reason for adjustment" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleAdjust} disabled={saving}>{saving ? 'Adjusting...' : 'Adjust Stock'}</Button>
      </DialogFooter>
    </div>
  )
}

export default function ProductsPage() {
  const { toast } = useToast()
  const { checkPermission } = usePermissions()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [lowStockFilter, setLowStockFilter] = useState(false)

  const [showImport, setShowImport] = useState(false)

  const canCreate = checkPermission('create_product')
  const canEdit = checkPermission('edit_product')
  const canAdjust = checkPermission('adjust_stock')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.append('search', search)
      if (lowStockFilter) params.append('lowStock', 'true')
      const [prodRes, catRes] = await Promise.all([
        api.get<{ products: Product[]; total: number }>(`/products?${params}`),
        api.get<Category[]>('/categories'),
      ])
      if (prodRes.success) { setProducts(prodRes.data.products); setTotal(prodRes.data.total) }
      else toast({ title: 'Error', description: prodRes.message || 'Failed to load products', variant: 'destructive' })
      if (catRes.success) setCategories(catRes.data)
    } catch (err) {
      toast({ title: 'Network Error', description: 'Could not connect to server. Please refresh.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [page, search, lowStockFilter])

  useEffect(() => { load() }, [load])
  useSocketEvent('product:created', useCallback(() => load(), [load]))
  useSocketEvent('product:updated', useCallback(() => load(), [load]))
  useSocketEvent('stock:updated', useCallback(() => load(), [load]))

  const lowStockCount = products.filter(p => p.isLowStock).length

  const exportToExcel = async () => {
    const res = await api.get<{ products: Product[] }>('/products?limit=1000')
    if (!res.success) return
    const rows = res.data.products.map(p => ({
      name: p.name,
      category: p.category?.name || '',
      wholesale_price: p.wholesalePrice,
      selling_price: p.sellingPrice,
      quantity: p.quantity,
      low_stock_threshold: p.lowStockThreshold,
      status: p.isActive ? 'Active' : 'Inactive',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 28 }, { wch: 15 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, `products_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Products & Stock</h1>
          <p className="text-muted-foreground text-sm">{total} products</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="w-4 h-4 mr-2" />Import
          </Button>
          {canCreate && (
            <Button onClick={() => { setEditProduct(null); setShowForm(true) }}>
              <Plus className="w-4 h-4 mr-2" />New Product
            </Button>
          )}
        </div>
      </div>

      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <strong>{lowStockCount}</strong> product(s) are running low on stock
          </p>
          <Button variant="warning" size="sm" className="ml-auto" onClick={() => setLowStockFilter(!lowStockFilter)}>
            {lowStockFilter ? 'Show All' : 'Show Low Stock'}
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No products found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Wholesale</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map(product => (
                  <TableRow key={product.id} className={!product.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <p className="font-medium text-sm">{product.name}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{product.category?.name}</p>
                      {product.isLowStock && (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />Low Stock
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{product.category?.name}</TableCell>
                    <TableCell className="text-right text-sm hidden md:table-cell">{formatCurrency(product.wholesalePrice)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCurrency(product.sellingPrice)}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold text-sm ${product.isLowStock ? 'text-amber-600' : product.quantity === 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {product.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={product.isActive ? 'success' : 'secondary'}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditProduct(product); setShowForm(true) }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {canAdjust && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Adjust Stock" onClick={() => setStockProduct(product)}>
                            <ChevronDown className="w-4 h-4" />
                          </Button>
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
      {total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Product form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editProduct ? 'Edit Product' : 'New Product'}</DialogTitle>
            <DialogDescription>Fill in the product details</DialogDescription>
          </DialogHeader>
          <ProductForm product={editProduct} categories={categories} onSave={load} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>

      {/* Stock adjust dialog */}
      {stockProduct && (
        <Dialog open={!!stockProduct} onOpenChange={() => setStockProduct(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adjust Stock</DialogTitle>
              <DialogDescription>Modify stock levels for this product</DialogDescription>
            </DialogHeader>
            <StockAdjustDialog product={stockProduct} onClose={() => setStockProduct(null)} onAdjusted={load} />
          </DialogContent>
        </Dialog>
      )}

      {/* Import dialog */}
      <ImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={load} />
    </div>
  )
}
