import React, { useState, useEffect, useRef } from 'react'
import { useBluetooth } from './BluetoothContext'
import BluetoothControl from './BluetoothControl'
import styles from './NMESControlPanel.module.css'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'

const NMESControlPanel: React.FC = () => {
  const {
    isConnected,
    imuData,
    startIMU,
    stopIMU,
    initializeDevice
  } = useBluetooth()

  const [sensor1Data, setSensor1Data] = useState<{ time: number; sensorValue: number }[]>([])
  const [sensor2Data, setSensor2Data] = useState<{ time: number; sensorValue: number }[]>([])

  const [isMeasuring, setIsMeasuring] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)

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
            <h2>Search Algorithm & Sensor Control</h2>

            <div className={styles.inputGroup}>
              {/* Optimization inputs removed */}
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

            {/* Optimization controls removed */}

            <div className={styles.buttonContainer}>
              <button className={styles.button} onClick={handleStartIMU} disabled={!isConnected || isMeasuring}>
                Start Sensor(s)
              </button>
              <button className={styles.button} onClick={handleStopIMU} disabled={!isConnected || !isMeasuring}>
                Stop Sensor(s)
              </button>
            </div>
          </div>
        )}
      </div>

      {isConnected && (
        <div className={styles.contentContainer}>
          <div className={styles.leftPanel}>
            <div className={styles.electrodeBox}>
              <h2>Device Status</h2>
              <p>Simple sensor dashboard and device controls (optimization features removed).</p>
              <div>
                <span>Sensor samples: </span>
                <span className="valueBox">{sensor1Data.length + sensor2Data.length}</span>
              </div>
            </div>
          </div>

          <div className={styles.rightPanel}>
            <div className={styles.chartContainer}>
              <h3>Sensor 1 Readings </h3>
              <LineChart width={600} height={200} data={sensor1Data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sensorValue" stroke="#8884d8" strokeWidth={2} name="Raw Sensor 1" />
              </LineChart>
            </div>

            <div className={styles.chartContainer}>
              <h3>Sensor 2 Readings </h3>
              <LineChart width={600} height={200} data={sensor2Data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sensorValue" stroke="#82ca9d" strokeWidth={2} name="Raw Sensor 2" />
              </LineChart>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NMESControlPanel
