import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentToken: string | null = null

export function getSocket(): Socket | null {
  return socket
}

export function connectSocket(token: string): Socket {
  // Reuse existing connected socket if same token
  if (socket?.connected && currentToken === token) return socket

  // Disconnect stale socket before creating new
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }

  currentToken = token
  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
  })

  socket.on('connect', () => console.log('🔌 Socket connected:', socket?.id))
  socket.on('disconnect', (reason) => console.log('🔌 Socket disconnected:', reason))
  socket.on('connect_error', (err) => console.error('🔌 Socket error:', err.message))

  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
    currentToken = null
  }
}
