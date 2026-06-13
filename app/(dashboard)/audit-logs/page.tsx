'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'
import api from '@/lib/api'

interface AuditLog {
  id: number
  action: string
  module: string
  entityId: number | null
  oldValues: unknown
  newValues: unknown
  ipAddress: string | null
  createdAt: string
  user: { fullName: string; email: string } | null
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'info',
  LOGOUT: 'secondary',
  CREATE_SALE: 'success',
  DELETE_SALE: 'destructive',
  CREATE_EXPENSE: 'warning',
  DELETE_EXPENSE: 'destructive',
  RECORD_CO_OPERA: 'success',
  CREATE_USER: 'info',
  EDIT_USER: 'warning',
  PERMISSION_CHANGE: 'warning',
  RESET_PASSWORD: 'warning',
  STOCK_ADJUSTMENT: 'info',
  CREATE_PRODUCT: 'success',
  DEACTIVATE_USER: 'destructive',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [module, setModule] = useState('')

  const modules = ['Auth', 'Sales', 'Products', 'Expenses', 'Co-opera', 'Users', 'Capital']

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (search) params.append('action', search)
      if (module) params.append('module', module)
      const res = await api.get<{ logs: AuditLog[]; total: number }>(`/audit-logs?${params}`)
      if (res.success) { setLogs(res.data.logs); setTotal(res.data.total) }
    } finally { setLoading(false) }
  }, [page, search, module])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground text-sm">{total} total log entries</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by action..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-10" />
        </div>
        <Select value={module} onValueChange={v => { setModule(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {modules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No audit logs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden sm:table-cell">Module</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden lg:table-cell">Details</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={(ACTION_COLORS[log.action] as Parameters<typeof Badge>[0]['variant']) || 'secondary'} className="text-xs">
                        {log.action.replace(/_/g, ' ')}
                      </Badge>
                      <p className="text-xs text-muted-foreground sm:hidden mt-0.5">{log.module}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{log.module}</TableCell>
                    <TableCell className="text-sm">
                      {log.user ? (
                        <div>
                          <p className="font-medium">{log.user.fullName}</p>
                          <p className="text-xs text-muted-foreground">{log.user.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                      {log.entityId && `ID: ${log.entityId}`}
                      {log.newValues ? <span className="ml-2">{JSON.stringify(log.newValues).slice(0, 60)}...</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">{log.ipAddress || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {total > 50 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / 50)}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
