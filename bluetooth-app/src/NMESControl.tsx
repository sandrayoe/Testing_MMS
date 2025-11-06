import React, { useState, useEffect, useRef } from "react";
import { useBluetooth } from "./BluetoothContext";
import BluetoothControl from "./BluetoothControl";
import styles from "./NMESControlPanel.module.css";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";

const NMESControlPanel: React.FC = () => {
  const { isConnected, imuData, startIMU, stopIMU, clearIMU } = useBluetooth();

  const [sensor1Data, setSensor1Data] = useState<{ time: number; sensorValue: number }[]>([]);
  const [sensor2Data, setSensor2Data] = useState<{ time: number; sensorValue: number }[]>([]);
  const CHART_WINDOW_SIZE = 200;
  const CHART_Y_MAX = 250;

  const [isMeasuring, setIsMeasuring] = useState(false);
  const prevImuLenRef = useRef({ s1: 0, s2: 0 });
  const sampleIndexRef = useRef<number>(0);
  const sessionStartRef = useRef<number | null>(null);

  const queuedS1Ref = useRef<{ time: number; sensorValue: number }[]>([]);
  const queuedS2Ref = useRef<{ time: number; sensorValue: number }[]>([]);
  const flushingRef = useRef(false);
  const FLUSH_PER_FRAME = 8;

  const EPS_SEC = 0.0005;
  const clampAppend = (prevArr: { time: number; sensorValue: number }[], newPts: { time: number; sensorValue: number }[]) => {
    if (!newPts || newPts.length === 0) return prevArr.slice(-CHART_WINDOW_SIZE);
    const out: { time: number; sensorValue: number }[] = [];
    let lastTime = prevArr.length ? prevArr[prevArr.length - 1].time : -Infinity;
    for (const p of newPts) {
      const copy = { ...p };
      if (!(copy.time > lastTime)) {
        copy.time = lastTime + EPS_SEC;
      }
      lastTime = copy.time;
      out.push(copy);
    }
    return [...prevArr, ...out].slice(-CHART_WINDOW_SIZE);
  };

  // No parameter inputs: sensor control only exposes Start/Stop

  // Keep local ref of imuData for polling
  const imuDataRefLocal = useRef(imuData);
  useEffect(() => {
    imuDataRefLocal.current = imuData;
  }, [imuData]);

  // Poll and batch append to UI queues
  useEffect(() => {
    if (!isConnected || !isMeasuring) return;
    const sampleIntervalMs = 20;
    const BIN_MS = 0;

    const tick = () => {
      const tickNow = performance.now();
      const s1 = imuDataRefLocal.current.imu1_changes;
      const s2 = imuDataRefLocal.current.imu2_changes;

      let prevS1 = prevImuLenRef.current.s1;
      let prevS2 = prevImuLenRef.current.s2;
      if (s1.length < prevS1) prevS1 = 0;
      if (s2.length < prevS2) prevS2 = 0;

      const newS1 = s1.length > prevS1 ? s1.slice(prevS1) : [];
      const newS2 = s2.length > prevS2 ? s2.slice(prevS2) : [];
      if (newS1.length === 0 && newS2.length === 0) return;

      const getMinMaxTs = (arr1: any[], arr2: any[]) => {
        const all: number[] = [];
        if (arr1 && arr1.length) all.push(...arr1.map((s) => s.ts));
        if (arr2 && arr2.length) all.push(...arr2.map((s) => s.ts));
        if (all.length === 0) return { minTs: null as number | null, maxTs: null as number | null };
        return { minTs: Math.min(...all), maxTs: Math.max(...all) };
      };

      const { minTs } = getMinMaxTs(newS1 as any[], newS2 as any[]);
      if (minTs !== null && sessionStartRef.current === null) sessionStartRef.current = minTs;

      const pushWithTs = (samples: any[]) => {
        if (samples.length === 0) return [];
        const sessionStart = sessionStartRef.current ?? minTs ?? tickNow;
        return samples.map((s) => ({ time: (s.ts - (sessionStart as number)) / 1000, sensorValue: s.value }));
      };

      const toAppend1 = pushWithTs(newS1 as any[]);
      const toAppend2 = pushWithTs(newS2 as any[]);

      if (toAppend1.length) queuedS1Ref.current.push(...toAppend1.map((p) => ({ time: p.time, sensorValue: p.sensorValue })));
      if (toAppend2.length) queuedS2Ref.current.push(...toAppend2.map((p) => ({ time: p.time, sensorValue: p.sensorValue })));

      if (!flushingRef.current) {
        flushingRef.current = true;
        const flush = () => {
          let didWork = false;
          if (queuedS1Ref.current.length) {
            const chunk = queuedS1Ref.current.splice(0, FLUSH_PER_FRAME);
            setSensor1Data((prev) => clampAppend(prev, chunk));
            didWork = true;
          }
          if (queuedS2Ref.current.length) {
            const chunk = queuedS2Ref.current.splice(0, FLUSH_PER_FRAME);
            setSensor2Data((prev) => clampAppend(prev, chunk));
            didWork = true;
          }
          if (didWork) requestAnimationFrame(flush);
          else flushingRef.current = false;
        };
        requestAnimationFrame(flush);
      }

      prevImuLenRef.current.s1 = s1.length;
      prevImuLenRef.current.s2 = s2.length;
      sampleIndexRef.current += Math.max(toAppend1.length, toAppend2.length);
    };

    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [isConnected, isMeasuring]);

  useEffect(() => {
    if (!isConnected) {
      setIsMeasuring(false);
      setSensor1Data([]);
      setSensor2Data([]);
      prevImuLenRef.current = { s1: 0, s2: 0 };
      sampleIndexRef.current = 0;
    }
  }, [isConnected]);

  const handleStartIMU = () => {
    setSensor1Data([]);
    setSensor2Data([]);
    clearIMU();
    prevImuLenRef.current = { s1: 0, s2: 0 };
    sampleIndexRef.current = 0;
    sessionStartRef.current = null;
    setIsMeasuring(true);
    startIMU();
  };

  const handleStopIMU = () => {
    setIsMeasuring(false);
    stopIMU();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <img src="/mms_logo_2.png" className={styles.logo} />
        <h1 className={styles.heading}>MMS - Sensor Readings</h1>
      </div>

      <div style={{ height: 8 }} />
      <div className={styles.topContainer}>
        <div className={styles.controlCard}>
          <h3>Bluetooth</h3>
          <div className={styles.buttonContainer}>
            <BluetoothControl />
          </div>
        </div>

        {isConnected && (
          <>
            <div className={styles.controlBox}>
              <h3>Sensor Control</h3>
              {/* Parameter inputs removed — only Start/Stop sensor controls remain */}

              <div className={styles.controlsRow}>
                <div className={styles.buttonContainer}>
                  <button className={styles.button} onClick={handleStartIMU} disabled={!isConnected || isMeasuring}>
                    Start Sensor(s)
                  </button>
                  <button className={styles.button} onClick={handleStopIMU} disabled={!isConnected || !isMeasuring}>
                    Stop Sensor(s)
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {isConnected && (
        <div className={styles.contentContainer}>
          <div className={styles.rightPanel}>
            <div className={styles.chartsGrid}>
              <div className={styles.chartContainer}>
                <h3>Sensor 1 Readings (0-{CHART_Y_MAX})</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={sensor1Data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(s) => Number(s).toFixed(1)} />
                    <YAxis domain={[0, CHART_Y_MAX]} tickCount={6} tickFormatter={(v) => String(Math.round(Number(v)))} />
                    <Tooltip labelFormatter={(label) => `${Number(label).toFixed(2)}s`} formatter={(value) => Number(value).toFixed(2)} />
                    <Legend />
                    <Line type="linear" dataKey="sensorValue" stroke="#8884d8" strokeWidth={2} name="Sensor 1" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartContainer}>
                <h3>Sensor 2 Readings (0-{CHART_Y_MAX})</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={sensor2Data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(s) => Number(s).toFixed(1)} />
                    <YAxis domain={[0, CHART_Y_MAX]} tickCount={6} tickFormatter={(v) => String(Math.round(Number(v)))} />
                    <Tooltip labelFormatter={(label) => `${Number(label).toFixed(2)}s`} formatter={(value) => Number(value).toFixed(2)} />
                    <Legend />
                    <Line type="linear" dataKey="sensorValue" stroke="#82ca9d" strokeWidth={2} name="Sensor 2" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NMESControlPanel;
