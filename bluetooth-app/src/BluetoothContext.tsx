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
  // Raw Web Bluetooth device/server refs (not exposed in context)
  // Use `any` here to avoid depending on lib typings in environments where web-bluetooth types
  // may not be available in the TypeScript lib configuration.
  const rawDeviceRef = useRef<any>(null)
  const rawServerRef = useRef<any>(null)

  const connect = async () => {
    // Use Web Bluetooth API to find and connect to devices named 'MMS nus'
    if (!navigator.bluetooth) {
      console.error('Web Bluetooth API is not available in this browser.')
      throw new Error('Web Bluetooth API not available')
    }

    try {
      // Prefer explicit name filter so the chooser only shows matching devices
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'MMS nus' }],
        // include the Nordic UART Service (NUS) UUID 
        optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
      })

      // Save raw device for disconnect handling
      rawDeviceRef.current = device

      // Connect to GATT server if available
      if (device.gatt) {
        const server = await device.gatt.connect()
        rawServerRef.current = server
      }

      setDevice({ id: device.id, name: device.name ?? 'MMS NUS' })
      setIsConnected(true)

      // Listen for unexpected disconnects and update state
      device.addEventListener?.('gattserverdisconnected', () => {
        console.log('Bluetooth device disconnected')
        stopIMU()
        setIsConnected(false)
        setDevice(null)
        rawDeviceRef.current = null
        rawServerRef.current = null
      })
    } catch (err) {
      // user cancelled chooser or other error
      console.error('Bluetooth connect failed:', err)
      throw err
    }
  }

  const disconnect = () => {
    stopIMU()
    // If a device is connected via GATT, disconnect it cleanly
    try {
      if (rawServerRef.current && rawServerRef.current.connected) {
        rawServerRef.current.disconnect()
      } else if (rawDeviceRef.current && rawDeviceRef.current.gatt?.connected) {
        rawDeviceRef.current.gatt.disconnect()
      }
    } catch (e) {
      console.warn('Error during Bluetooth disconnect', e)
    }

    setIsConnected(false)
    setDevice(null)
    rawDeviceRef.current = null
    rawServerRef.current = null
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
