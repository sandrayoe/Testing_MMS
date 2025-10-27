import React from 'react'
import { BluetoothProvider, useBluetooth } from './BluetoothContext'
import BluetoothControl from './BluetoothControl'
import NMESControlPanel from './NMESControl'
import './index.css'

function AppContent() {
  const { isConnected } = useBluetooth()

  return (
    <div className="app">
      <h1>MMS Frontend — Demo/Testing</h1>
      <div className="panel">
        {/* Show the BluetoothControl as the starting page. After connection, show the full NMES control page. */}
        {!isConnected ? <BluetoothControl /> : <NMESControlPanel />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BluetoothProvider>
      <AppContent />
    </BluetoothProvider>
  )
}
