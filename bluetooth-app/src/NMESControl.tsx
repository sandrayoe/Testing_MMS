import React, { useState, useEffect, useRef } from 'react'
import { useBluetooth } from './BluetoothContext'
import BluetoothControl from './BluetoothControl'
import styles from './NMESControlPanel.module.css'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const NMESControlPanel: React.FC = () => {
  const {
    isConnected,
    imuData,
    startIMU,
    stopIMU,
    initializeDevice,
    sendCommand,
    stopStimulation
  } = useBluetooth()

  const [sensor1Data, setSensor1Data] = useState<{ time: number; sensorValue: number }[]>([])
  const [sensor2Data, setSensor2Data] = useState<{ time: number; sensorValue: number }[]>([])

  const [isMeasuring, setIsMeasuring] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)

  // Stimulation control state
  const [electrodeA, setElectrodeA] = useState<number>(1)
  const [electrodeB, setElectrodeB] = useState<number>(2)
  const [current, setCurrent] = useState<number>(20)
  const [isStimulating, setIsStimulating] = useState<boolean>(false)
  const [lastPair, setLastPair] = useState<[number, number] | null>(null)
  const [lastCurrent, setLastCurrent] = useState<number | null>(null)

  // Optimization-related state removed

  const sampleCountRef = useRef(0)

  useEffect(() => {
    if (isConnected && isMeasuring) {
      const interval = setInterval(() => {
        sampleCountRef.current++

        let rawSensor1 = imuData.imu1_changes.length > 0 ? imuData.imu1_changes[imuData.imu1_changes.length - 1] : 0
        let rawSensor2 = imuData.imu2_changes.length > 0 ? imuData.imu2_changes[imuData.imu2_changes.length - 1] : 0

        setSensor1Data((prevData) => [
          ...prevData.slice(-99),
          { time: sampleCountRef.current, sensorValue: rawSensor1 }
        ])

        setSensor2Data((prevData) => [
          ...prevData.slice(-99),
          { time: sampleCountRef.current, sensorValue: rawSensor2 }
        ])

      }, 100)

      return () => clearInterval(interval)
    }
  }, [isConnected, isMeasuring, imuData])


  const handleInitialize = async () => {
    setIsInitializing(true)
    try {
      await initializeDevice()
      console.log('✅ Device initialization complete.')
    } catch (error) {
      console.error('❌ Device initialization failed:', error)
    }
    setIsInitializing(false)
  }

  // Optimization start/stop handlers removed

  const handleStartIMU = () => {
    setIsMeasuring(true)
    startIMU()
  }

  const handleStopIMU = () => {
    setIsMeasuring(false)
    stopIMU()
  }

  const handleStimulate = async () => {
    if (electrodeA === electrodeB) {
      console.warn('Select two different electrodes')
      return
    }

    try {
      setIsStimulating(true)
      setLastPair([electrodeA, electrodeB])
      setLastCurrent(current)
      // Send stimulation command: 'e' followed by current and electrode numbers (matches provider implementation)
      await sendCommand('e', current, electrodeA, electrodeB, 1, 0)
      console.log('✅ Stimulation command sent')
    } catch (error) {
      console.error('❌ Failed to send stimulation command', error)
      setIsStimulating(false)
    }
  }

  const handleStopStimulate = async () => {
    try {
      await stopStimulation()
      console.log('🔴 Stop stimulation sent')
    } catch (error) {
      console.error('❌ Failed to stop stimulation', error)
    } finally {
      setIsStimulating(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <img src="/mms_logo_2.png" className={styles.logo} />
  <h1 className={styles.heading}>MMS - NMES Control (Frontend Demo)</h1>
      </div>

      <div className={styles.topContainer}>
        <div className={styles.buttonContainer}>
          <BluetoothControl />
        </div>

        {isConnected && (
          <div className={styles.controlBox}>
            <h2>Stimulation & Sensor Control</h2>

            <div className={styles.inputGroup}>
              <label>
                Electrode A:
                <select
                  value={String(electrodeA)}
                  onChange={(e) => setElectrodeA(Number(e.target.value))}
                  className={styles.select}
                >
                  {[1,2,3,4,5,6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>

              <label>
                Electrode B:
                <select
                  value={String(electrodeB)}
                  onChange={(e) => setElectrodeB(Number(e.target.value))}
                  className={styles.select}
                >
                  {[1,2,3,4,5,6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>

              <label>
                Current (mA):
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={current}
                  onChange={(e) => setCurrent(Number(e.target.value))}
                  className={styles.input}
                />
              </label>
            </div>

            <div className={styles.buttonContainer} style={{ marginTop: '15px' }}>
              <button
                className={styles.button}
                onClick={handleInitialize}
                disabled={!isConnected || isInitializing}
              >
                Initialize Device
              </button>
            </div>

            <div className={styles.buttonContainer}>
              <button
                className={styles.button}
                onClick={handleStimulate}
                disabled={!isConnected || isStimulating || electrodeA === electrodeB}
              >
                Stimulate Pair
              </button>
              <button
                className={styles.button}
                onClick={handleStopStimulate}
                disabled={!isConnected || !isStimulating}
              >
                Stop Stimulation
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <strong>Last stimulation:</strong>
              <div>Pair: {lastPair ? `${lastPair[0]} - ${lastPair[1]}` : '—'}</div>
              <div>Current: {lastCurrent ?? '—'} mA</div>
              <div>Status: {isStimulating ? 'Stimulating' : 'Idle'}</div>
            </div>
          </div>
        )}
      </div>

      {isConnected && (
        <div className={styles.contentContainer}>
          <div className={styles.rightPanel}>
            <div className={styles.chartContainer}>
              <h3>Sensor 1 Readings </h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sensor1Data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sensorValue" stroke="#8884d8" strokeWidth={2} name="Raw Sensor 1" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.chartContainer}>
              <h3>Sensor 2 Readings </h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sensor2Data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[0, 10]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sensorValue" stroke="#82ca9d" strokeWidth={2} name="Raw Sensor 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NMESControlPanel
