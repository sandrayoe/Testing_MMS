import React, { useState, useEffect, useRef } from "react";
import { useBluetooth } from "./BluetoothContext";
import BluetoothControl from "./BluetoothControl";
import styles from "./NMESControlPanel.module.css";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";

const NMESControlPanel: React.FC = () => {
  const { isConnected, imuData, startIMU, stopIMU, clearIMU, sendCommand, stopStimulation } = useBluetooth();

  const [sensor1Data, setSensor1Data] = useState<{ time: number; sensorValue: number }[]>([]);
  const [sensor2Data, setSensor2Data] = useState<{ time: number; sensorValue: number }[]>([]);
  const CHART_WINDOW_SIZE = 200;
  const CHART_Y_MAX = 250;

  const [isMeasuring, setIsMeasuring] = useState(false);
  // Track last processed timestamps per sensor to survive provider-side pruning
  const lastSeenTsRef = useRef<{ s1: number | null; s2: number | null }>({ s1: null, s2: null });
  const sampleIndexRef = useRef<number>(0);
  const sessionStartRef = useRef<number | null>(null);

  const queuedS1Ref = useRef<{ time: number; sensorValue: number }[]>([]);
  const queuedS2Ref = useRef<{ time: number; sensorValue: number }[]>([]);
  const flushingRef = useRef(false);
  // Raw-hash dedupe window map (rawHash -> lastSeenMs)
  const rawHashSeenRef = useRef<Map<string, number>>(new Map());
  const DUP_WINDOW_MS = 250; // if same raw-hash seen within this window, skip
  const BASE_FLUSH = 8; // minimum points to flush per frame
  const MAX_FLUSH = 256; // hard upper bound to avoid giant frames

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

  // Use last-processed timestamps so pruning on the provider won't cause
  // index-based replays or gaps. This handles the case where the provider
  // replaces arrays (prunes older samples) and their lengths shrink.
  const last1 = lastSeenTsRef.current.s1 ?? -Infinity;
  const last2 = lastSeenTsRef.current.s2 ?? -Infinity;

  const newS1 = s1.length ? s1.filter((x) => x.ts > last1) : [];
  const newS2 = s2.length ? s2.filter((x) => x.ts > last2) : [];
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

      // RAW-WINDOW DEBOUNCE (stage 1)
      try {
        const raw1s = newS1.map((s: any) => String(s.value));
        const raw2s = newS2.map((s: any) => String(s.value));
        const rawHash = raw1s.join(",") + "|" + raw2s.join(",");
        const lastSeen = rawHashSeenRef.current.get(rawHash) ?? 0;
        if (tickNow - lastSeen <= DUP_WINDOW_MS) {
          // skip this notification entirely as a duplicate
          return;
        }
        // record last seen and also purge old entries occasionally
        rawHashSeenRef.current.set(rawHash, tickNow);
        // purge entries older than DUP_WINDOW_MS*4 to keep map small
        if (rawHashSeenRef.current.size > 256) {
          const cutoff = tickNow - DUP_WINDOW_MS * 4;
          rawHashSeenRef.current.forEach((v, k) => {
            if (v < cutoff) rawHashSeenRef.current.delete(k);
          });
        }
      } catch (e) {
        // non-fatal: if hashing fails, continue processing normally
      }

      // Remove consecutive duplicate samples (same ts and same value)
      const dedupeSamples = (samples: { ts: number; value: number }[]) => {
        const out: typeof samples = [];
        let lastTs: number | null = null;
        let lastVal: number | null = null;
        for (const s of samples) {
          if (lastTs !== null && s.ts === lastTs && s.value === lastVal) continue;
          out.push(s);
          lastTs = s.ts;
          lastVal = s.value;
        }
        return out;
      };

      const pushWithTs = (samples: any[]) => {
        if (samples.length === 0) return [];
        const sessionStart = sessionStartRef.current ?? minTs ?? tickNow;
        const deduped = dedupeSamples(samples as { ts: number; value: number }[]);
        return deduped.map((s) => ({ time: (s.ts - (sessionStart as number)) / 1000, sensorValue: s.value }));
      };

      const toAppend1 = pushWithTs(newS1 as any[]);
      const toAppend2 = pushWithTs(newS2 as any[]);

      const appendUniqueToQueue = (queueRef: React.MutableRefObject<{ time: number; sensorValue: number }[]>, pts: { time: number; sensorValue: number }[]) => {
        if (!pts || pts.length === 0) return;
        for (const p of pts) {
          const lastQueued = queueRef.current.length ? queueRef.current[queueRef.current.length - 1] : null;
          if (lastQueued) {
            const lastMs = Math.round(lastQueued.time * 1000);
            const pMs = Math.round(p.time * 1000);
            if (lastMs === pMs && lastQueued.sensorValue === p.sensorValue) continue;
          }
          queueRef.current.push(p);
        }
      };

      if (toAppend1.length) appendUniqueToQueue(queuedS1Ref, toAppend1.map((p) => ({ time: p.time, sensorValue: p.sensorValue })));
      if (toAppend2.length) appendUniqueToQueue(queuedS2Ref, toAppend2.map((p) => ({ time: p.time, sensorValue: p.sensorValue })));

  if (!flushingRef.current) {
        flushingRef.current = true;
        const flush = () => {
          let didWork = false;
          if (queuedS1Ref.current.length) {
            const take = Math.min(MAX_FLUSH, Math.max(BASE_FLUSH, Math.ceil(queuedS1Ref.current.length / 4)));
            let chunk = queuedS1Ref.current.splice(0, take);
            // TAIL-PAIR DEDUPE (stage 2): avoid appending a chunk whose first point
            // is identical to the previous last point shown in state
            setSensor1Data((prev) => {
              if (!chunk || chunk.length === 0) return prev;
              const lastPrev = prev.length ? prev[prev.length - 1] : null;
              if (lastPrev) {
                const firstChunk = chunk[0];
                const lastMs = Math.round(lastPrev.time * 1000);
                const firstMs = Math.round(firstChunk.time * 1000);
                if (lastMs === firstMs && lastPrev.sensorValue === firstChunk.sensorValue) {
                  // drop the leading identical sample
                  chunk = chunk.slice(1);
                }
              }
              if (!chunk || chunk.length === 0) return prev;
              // update last seen ts for sensor1 using absolute timestamps
              const sessionStart = sessionStartRef.current ?? 0;
              const maxRel = Math.max(...chunk.map((c) => c.time * 1000)); // ms since sessionStart
              const maxAbs = sessionStart + maxRel; // absolute ms timestamp
              lastSeenTsRef.current.s1 = Math.max(lastSeenTsRef.current.s1 ?? -Infinity, maxAbs);
              return clampAppend(prev, chunk);
            });
            didWork = true;
          }
          if (queuedS2Ref.current.length) {
            const take = Math.min(MAX_FLUSH, Math.max(BASE_FLUSH, Math.ceil(queuedS2Ref.current.length / 4)));
            let chunk = queuedS2Ref.current.splice(0, take);
            setSensor2Data((prev) => {
              if (!chunk || chunk.length === 0) return prev;
              const lastPrev = prev.length ? prev[prev.length - 1] : null;
              if (lastPrev) {
                const firstChunk = chunk[0];
                const lastMs = Math.round(lastPrev.time * 1000);
                const firstMs = Math.round(firstChunk.time * 1000);
                if (lastMs === firstMs && lastPrev.sensorValue === firstChunk.sensorValue) {
                  chunk = chunk.slice(1);
                }
              }
              if (!chunk || chunk.length === 0) return prev;
              const sessionStart = sessionStartRef.current ?? 0;
              const maxRel = Math.max(...chunk.map((c) => c.time * 1000));
              const maxAbs = sessionStart + maxRel;
              lastSeenTsRef.current.s2 = Math.max(lastSeenTsRef.current.s2 ?? -Infinity, maxAbs);
              return clampAppend(prev, chunk);
            });
            didWork = true;
          }
          if (didWork) requestAnimationFrame(flush);
          else flushingRef.current = false;
        };
        requestAnimationFrame(flush);
      }

      // no index-based pointers to update (we track last-seen timestamps)
      sampleIndexRef.current += Math.max(toAppend1.length, toAppend2.length);
    };

  const id = setInterval(tick, 50);
    return () => clearInterval(id);
  }, [isConnected, isMeasuring]);

  useEffect(() => {
    if (!isConnected) {
      setIsMeasuring(false);
      setSensor1Data([]);
      setSensor2Data([]);
      lastSeenTsRef.current = { s1: null, s2: null };
      sampleIndexRef.current = 0;
    }
  }, [isConnected]);

  const handleStartIMU = () => {
    setSensor1Data([]);
    setSensor2Data([]);
    clearIMU();
    lastSeenTsRef.current = { s1: null, s2: null };
    sampleIndexRef.current = 0;
    sessionStartRef.current = null;
    setIsMeasuring(true);
    startIMU();
  };

  const handleStopIMU = () => {
    setIsMeasuring(false);
    stopIMU();
  };

  // Stimulation controls: one input box for electrode pair (e.g. "1,2")
  const [pairInput, setPairInput] = useState<string>("1,2");
  const [amplitude, setAmplitude] = useState<number>(20);
  const DEFAULT_CURRENT = 20; // default fallback mA used when stimulating from UI

  const padValue = (num: number): string => (num < 10 ? "0" + num : num.toString());
  const encodeElectrode = (n: number): string => {
    if (n >= 0 && n <= 9) return String(n);
    // 10 -> 'A' (65), so 55 + n maps 10->65
    return String.fromCharCode(55 + n);
  };

  const handleStimulate = async () => {
    if (!isConnected) return;
    const txt = pairInput.trim();
    const parts = txt.split(/\s*,\s*/);
    if (parts.length < 2) {
      console.warn("Invalid pair input, expected format 'a,b'");
      return;
    }
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      console.warn("Invalid electrode numbers");
      return;
    }
    try {
      // Build electrode pattern repeated to fill B1-B8 (4 repeats of the pair)
      const chA = encodeElectrode(a);
      const chB = encodeElectrode(b);
      const electrodePattern = `${chA}${chB}${chA}${chB}${chA}${chB}${chA}${chB}`;
      const ampVal = Number.isFinite(amplitude) ? amplitude : DEFAULT_CURRENT;
      const ampStr = padValue(Math.max(0, Math.min(120, Math.round(ampVal))));
      const payload = electrodePattern + ampStr + "1"; // run = '1'
      // Send uppercase 'E' command followed by payload characters
      await sendCommand("E", payload);
      console.log(`E command sent: ${payload}`);
    } catch (e) {
      console.error("Failed to send E stimulation command:", e);
    }
  };

  const handleStopStim = async () => {
    if (!isConnected) return;
    try {
      const txt = pairInput.trim();
      const parts = txt.split(/\s*,\s*/);
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      const chA = encodeElectrode(a);
      const chB = encodeElectrode(b);
      const electrodePattern = `${chA}${chB}${chA}${chB}${chA}${chB}${chA}${chB}`;
      const ampStr = padValue(Math.max(0, Math.min(120, Math.round(amplitude))));
      const payload = electrodePattern + ampStr + "0"; // run = '0' to stop
      await sendCommand("E", payload);
      console.log(`E stop sent: ${payload}`);
    } catch (e) {
      console.error("Failed to send E stop command:", e);
    }
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
              <div style={{ height: 8 }} />
              <div className={styles.controlsRow}>
                <label style={{ marginRight: 8 }}>Electrode pair:</label>
                <input value={pairInput} onChange={(e) => setPairInput(e.target.value)} style={{ width: 80, marginRight: 8 }} />
                <label style={{ marginRight: 8 }}>Current (mA):</label>
                <input type="number" value={amplitude} onChange={(e) => setAmplitude(Number(e.target.value))} style={{ width: 80, marginRight: 8 }} min={0} max={120} />
                <button className={styles.button} onClick={handleStimulate} disabled={!isConnected}>
                  Stimulate
                </button>
                <button className={styles.button} onClick={handleStopStim} disabled={!isConnected}>
                  Stop Stim
                </button>
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
