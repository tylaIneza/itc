'use client'
import { useEffect, useRef, useCallback } from 'react'
import { getSocket } from '@/lib/socket'

// Only use this to get the active socket reference — connection lifecycle is managed by layout.tsx
export function useSocket() {
  return getSocket()
}

// Register/unregister a socket event listener safely
export function useSocketEvent(event: string, handler: (...args: unknown[]) => void) {
  // Stable reference so we don't re-register on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const stableHandler = useCallback((...args: unknown[]) => {
    handlerRef.current(...args)
  }, [])

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    socket.on(event, stableHandler)
    return () => {
      socket.off(event, stableHandler)
    }
  }, [event, stableHandler])
}
