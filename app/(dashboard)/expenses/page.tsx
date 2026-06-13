'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Edit, Trash2, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import api from '@/lib/api'

interface ExpenseCategory { id: number; name: string }
interface Expense {
  id: number; categoryId: number; amount: number; description: string; date: string
  status: string; category: ExpenseCategory; user: { fullName: string; id: number }
}

function ExpenseForm({ expense, categories, onSave, onClose }: {
  expense?: Expense | null
  categories: ExpenseCategory[]
  onSave: () => void
  onClose: () => void
}) {
  const { toast } = useToast()
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    categoryId: String(expense?.categoryId || ''),
    amount: String(expense?.amount || ''),
    description: expense?.description || '',
    date: expense?.date ? expense.date.split('T')[0] : today,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.categoryId || !form.amount || !form.description || !form.date) {
      toast({ title: 'Error', description: 'All fields are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = expense
        ? await api.put(`/expenses/${expense.id}`, form)
        : await api.post('/expenses', form)
      if (!res.success) { toast({ title: 'Error', description: res.message, variant: 'destructive' }); return }
      toast({ title: 'Success', description: expense ? 'Expense updated' : 'Expense created' })
      onSave()
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
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
        <Label>Amount (FRW) *</Label>
        <Input type="number" min={0} placeholder="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Description *</Label>
        <Input placeholder="Expense description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Date *</Label>
        <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : expense ? 'Update' : 'Create'}</Button>
      </DialogFooter>
    </div>
  )
}

export default function ExpensesPage() {
  const { toast } = useToast()
  const { checkPermission } = usePermissions()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)

  const canCreate = checkPermission('create_expense')
  const canEdit = checkPermission('edit_expense')
  const canDelete = checkPermission('delete_expense')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [expRes, catRes] = await Promise.all([
        api.get<{ expenses: Expense[]; total: number }>(`/expenses?page=${page}&limit=20`),
        api.get<ExpenseCategory[]>('/categories/expense'),
      ])
      if (expRes.success) { setExpenses(expRes.data.expenses); setTotal(expRes.data.total) }
      if (catRes.success) setCategories(catRes.data)
    } finally { setLoading(false) }
  }, [page])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: number) => {
    try {
      const res = await api.delete(`/expenses/${id}`)
      if (res.success) { toast({ title: 'Deleted', description: 'Expense deleted' }); load() }
      else toast({ title: 'Error', description: res.message, variant: 'destructive' })
    } catch { toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' }) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-muted-foreground text-sm">{total} total expenses</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditExpense(null); setShowForm(true) }}>
            <Plus className="w-4 h-4 mr-2" />New Expense
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No expenses recorded</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden sm:table-cell">Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Recorded By</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map(expense => (
                  <TableRow key={expense.id}>
                    <TableCell className="text-sm">{formatDate(expense.date)}</TableCell>
                    <TableCell className="hidden sm:table-cell"><Badge variant="secondary">{expense.category?.name}</Badge></TableCell>
                    <TableCell className="text-sm max-w-[180px] truncate">
                      <p className="truncate">{expense.description}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{expense.category?.name}</p>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-red-600">{formatCurrency(expense.amount)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{expense.user?.fullName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditExpense(expense); setShowForm(true) }}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="w-4 h-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(expense.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
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

      {total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 20)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editExpense ? 'Edit Expense' : 'New Expense'}</DialogTitle>
            <DialogDescription>Record an expense</DialogDescription>
          </DialogHeader>
          <ExpenseForm expense={editExpense} categories={categories} onSave={load} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
