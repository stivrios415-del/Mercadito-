import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Camera, Keyboard, ScanLine, Square } from 'lucide-react'

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
]

function beep() {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.value = 880
    gain.gain.value = 0.05
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
    oscillator.onended = () => void context.close()
  } catch {
    // Sonido opcional.
  }
}

export default function ScannerView({
  onResult,
  onToast,
}: {
  onResult: (barcode: string) => void
  onToast: (message: string, error?: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const callbackRef = useRef(onResult)
  callbackRef.current = onResult

  const [scanning, setScanning] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [manual, setManual] = useState('')
  const [last, setLast] = useState('')

  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => () => {
    controlsRef.current?.stop()
    controlsRef.current = null
  }, [])

  const start = async (preferred?: string) => {
    stop()
    try {
      const hints = new Map<DecodeHintType, unknown>()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
      const reader = new BrowserMultiFormatReader(hints as never)
      const found = await BrowserMultiFormatReader.listVideoInputDevices()
      setDevices(found)
      const chosen = preferred || deviceId || found[0]?.deviceId
      if (!videoRef.current) return
      const controls = await reader.decodeFromVideoDevice(chosen, videoRef.current, (result) => {
        if (!result) return
        const code = result.getText().trim()
        if (!code) return
        setLast(code)
        beep()
        stop()
        callbackRef.current(code)
      })
      controlsRef.current = controls
      if (chosen) setDeviceId(chosen)
      setScanning(true)
    } catch (error) {
      stop()
      onToast(
        error instanceof Error && /permission|denied|NotAllowed/i.test(error.message)
          ? 'Permite el acceso a la cámara para escanear.'
          : 'No se pudo iniciar la cámara. Puedes escribir el código manualmente.',
        true,
      )
    }
  }

  return (
    <div className="stack">
      {devices.length > 1 && (
        <div className="field">
          <label htmlFor="camera-select">Cámara</label>
          <select id="camera-select" className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Cámara ${index + 1}`}</option>
            ))}
          </select>
        </div>
      )}

      <div className="scanner-box">
        <video ref={videoRef} muted playsInline autoPlay />
        {scanning && <div className="scan-frame" />}
        <div className="scanner-overlay">
          {scanning ? (
            <button className="btn" onClick={stop}><Square size={15} /> Detener</button>
          ) : (
            <button className="btn btn-gold" onClick={() => start()}><Camera size={16} /> Activar cámara</button>
          )}
        </div>
      </div>

      {last && (
        <div className="row spread">
          <span className="badge ok"><ScanLine size={13} /> Último código: {last}</span>
          <button className="btn sm" onClick={() => start()}>Escanear otro</button>
        </div>
      )}

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          const code = manual.trim()
          if (!code) return
          setLast(code)
          setManual('')
          onResult(code)
        }}
      >
        <div className="input-with-icon" style={{ flex: 1 }}>
          <Keyboard size={16} />
          <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Escribir código manualmente" inputMode="numeric" />
        </div>
        <button className="btn" type="submit" disabled={!manual.trim()}>Agregar</button>
      </form>
      <p className="file-hint" style={{ margin: 0 }}>
        Funciona con EAN-13, UPC, Code 128, Code 39, ITF y QR. En HTTPS o localhost el navegador pedirá permiso de cámara.
      </p>
    </div>
  )
}
