import React, { createContext, useState, useRef } from 'react'

type DeviceInfo = { id: string; name: string }

type BluetoothContextType = {
  isConnected: boolean
  device?: DeviceInfo | null
  connect: () => Promise<void>
  disconnect: () => void
  startIMU: () => void
  stopIMU: () => void
  imuData: { imu1_changes: number[]; imu2_changes: number[] }
  // Optimization features removed for this build - previously exposed optimization control functions
  initializeDevice: () => Promise<void>
}

export const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined)

// Mock implementation: no backend, simulate IMU updates and algorithm behavior
export const BluetoothProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false)
  const [device, setDevice] = useState<DeviceInfo | null>(null)

  const imuRef = useRef({ imu1_changes: [] as number[], imu2_changes: [] as number[] })
  const imuIntervalRef = useRef<number | null>(null)

  const connect = async () => {
    // simulate discovery / connect
    await new Promise((r) => setTimeout(r, 300))
    setDevice({ id: 'mock-1', name: 'Mock NMES Device' })
    setIsConnected(true)
  }

  const disconnect = () => {
    stopIMU()
    setIsConnected(false)
    setDevice(null)
  }

  const startIMU = () => {
    // simulate IMU generating random changes
    if (imuIntervalRef.current) return
    imuIntervalRef.current = window.setInterval(() => {
      const a = Math.random() * 3
      const b = Math.random() * 3
      imuRef.current.imu1_changes.push(a)
      imuRef.current.imu2_changes.push(b)
      // keep short history
      if (imuRef.current.imu1_changes.length > 500) imuRef.current.imu1_changes.shift()
      if (imuRef.current.imu2_changes.length > 500) imuRef.current.imu2_changes.shift()
    }, 100)
  }

  const stopIMU = () => {
    if (imuIntervalRef.current) {
      clearInterval(imuIntervalRef.current)
      imuIntervalRef.current = null
    }
  }


  // Optimization loop removed — this frontend demo no longer exposes algorithm control.

  const initializeDevice = async () => {
    // no-op for frontend-only demo
    await new Promise((r) => setTimeout(r, 200))
    return
  }

  return (
    <BluetoothContext.Provider value={{
      isConnected,
      device,
      connect,
      disconnect,
      startIMU: () => startIMU(),
      stopIMU: () => stopIMU(),
      imuData: imuRef.current,
      initializeDevice
    }}>
      {children}
    </BluetoothContext.Provider>
  )
}

export const useBluetooth = () => {
  const ctx = React.useContext(BluetoothContext)
  if (!ctx) {
    throw new Error('useBluetooth must be used inside BluetoothProvider')
  }
  return ctx
}
