import React from 'react'
import { BluetoothProvider } from './BluetoothContext'
import BluetoothControl from './BluetoothControl'
import NMESControlPanel from './NMESControl'
import './index.css'

export default function App() {
  return (
    <BluetoothProvider>
      <div className="app">
        <h1>NMES Frontend — Demo (no backend)</h1>
        <div className="panel">
          <BluetoothControl />
        </div>
        <div className="panel">
          <NMESControlPanel />
        </div>
      </div>
    </BluetoothProvider>
  )
}
