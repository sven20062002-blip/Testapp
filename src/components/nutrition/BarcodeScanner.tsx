import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flashlight, Keyboard, Loader2, ScanLine, X } from 'lucide-react';
import clsx from 'clsx';
import type { Food } from '@/db/types';
import { Button } from '@/components/ui/Button';
import { fetchProduct, normalizeBarcode, OffError } from '@/nutrition/off';
import { findByBarcode, saveOffProduct } from '@/nutrition/repo';

type Phase = 'starting' | 'scanning' | 'lookup' | 'error' | 'manual';

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function createNativeDetector(): Promise<DetectorLike | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const supported = (await BD.getSupportedFormats?.()) ?? FORMATS;
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    return new BD({ formats });
  } catch {
    return null;
  }
}

/**
 * Full-screen barcode scanner.
 * - Camera via getUserMedia (rear camera), only works on HTTPS / localhost.
 * - Native BarcodeDetector where available (Chrome/Android), otherwise ZXing (lazy-loaded, works on iOS Safari).
 * - Lookup order: own/local library first (works offline) → Open Food Facts.
 */
export function BarcodeScanner({
  open,
  onClose,
  onFood,
  onNotFound,
}: {
  open: boolean;
  onClose: () => void;
  onFood: (f: Food) => void;
  onNotFound: (barcode: string, message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const handledRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [manual, setManual] = useState('');
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null);

  const stopCamera = useCallback(() => {
    stopRef.current();
    stopRef.current = () => {};
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      const code = normalizeBarcode(raw);
      if (!code) {
        setError('Ungültiger Barcode – bitte 8 bis 14 Ziffern.');
        return;
      }
      if (handledRef.current) return;
      handledRef.current = true;
      stopCamera();
      setPhase('lookup');
      setError(null);
      try {
        const local = await findByBarcode(code);
        if (local) {
          onFood(local);
          return;
        }
        const p = await fetchProduct(code);
        if (p.per100.kcal == null) {
          // product exists but without nutrition data – user must add values themselves
          onNotFound(code, `„${p.name}“ ist bei Open Food Facts ohne Nährwerte eingetragen. Bitte Werte von der Verpackung übernehmen.`);
          return;
        }
        onFood(await saveOffProduct(p));
      } catch (e) {
        const err = e as OffError;
        if (err.kind === 'notfound') onNotFound(code, 'Produkt nicht gefunden – lege es einmalig selbst an. Es ist danach dauerhaft in deiner Bibliothek.');
        else if (err.kind === 'offline') onNotFound(code, 'Offline: Das Produkt ist noch nicht lokal gespeichert. Du kannst es manuell anlegen oder später online scannen.');
        else {
          handledRef.current = false;
          setPhase('error');
          setError(err.message || 'Suche fehlgeschlagen.');
        }
      }
    },
    [onFood, onNotFound, stopCamera],
  );

  const start = useCallback(async () => {
    handledRef.current = false;
    setError(null);
    setPhase('starting');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setPhase('manual');
      setError('Die Kamera ist nur über eine sichere Verbindung (HTTPS) verfügbar. Gib den Barcode manuell ein.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      const track = stream.getVideoTracks()[0];
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setPhase('scanning');

      const native = await createNativeDetector();
      if (native) {
        setEngine('native');
        let alive = true;
        stopRef.current = () => {
          alive = false;
        };
        const loop = async () => {
          if (!alive) return;
          try {
            if (video.readyState >= 2) {
              const codes = await native.detect(video);
              if (codes[0]?.rawValue && alive) return void lookup(codes[0].rawValue);
            }
          } catch {
            /* frame not ready */
          }
          setTimeout(loop, 180);
        };
        void loop();
      } else {
        setEngine('zxing');
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) void lookup(result.getText());
        });
        stopRef.current = () => controls.stop();
      }
    } catch (e) {
      const name = (e as DOMException).name;
      stopCamera();
      setPhase('manual');
      setError(
        name === 'NotAllowedError'
          ? 'Kamerazugriff wurde verweigert. Erlaube den Zugriff in den Browser-/App-Einstellungen oder gib den Barcode manuell ein.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'Keine Kamera gefunden. Gib den Barcode manuell ein.'
            : 'Die Kamera konnte nicht gestartet werden. Gib den Barcode manuell ein.',
      );
    }
  }, [lookup, stopCamera]);

  useEffect(() => {
    if (!open) return;
    setManual('');
    void start();
    return () => stopCamera();
  }, [open, start, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch == null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Barcode scannen">
      <div className="flex items-center justify-between px-4 pb-3" style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}>
        <button onClick={onClose} aria-label="Scanner schließen" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
          <X size={20} />
        </button>
        <span className="text-[14px] font-bold">Barcode scannen</span>
        {torch != null ? (
          <button onClick={toggleTorch} aria-label="Taschenlampe" aria-pressed={torch} className={clsx('flex h-10 w-10 items-center justify-center rounded-full', torch ? 'bg-accent text-accent-fg' : 'bg-white/15')}>
            <Flashlight size={18} />
          </button>
        ) : (
          <span className="w-10" />
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} muted playsInline className={clsx('absolute inset-0 h-full w-full object-cover', phase !== 'scanning' && 'opacity-30')} />
        {phase === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-40 w-72 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.45)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-accent" />
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4 text-center">
          {phase === 'starting' && (
            <p className="flex items-center justify-center gap-2 text-[13px]">
              <Loader2 size={16} className="animate-spin" /> Kamera wird gestartet …
            </p>
          )}
          {phase === 'scanning' && (
            <p className="flex items-center justify-center gap-2 text-[13px] text-white/80">
              <ScanLine size={16} /> Barcode in den Rahmen halten{engine === 'zxing' ? '' : ''}
            </p>
          )}
          {phase === 'lookup' && (
            <p className="flex items-center justify-center gap-2 text-[13px]">
              <Loader2 size={16} className="animate-spin" /> Produkt wird gesucht …
            </p>
          )}
          {error && <p className="mx-auto mt-2 max-w-sm rounded-xl bg-white/10 p-3 text-[13px]">{error}</p>}
          {phase === 'error' && (
            <Button className="mt-3" onClick={() => void start()}>
              Erneut scannen
            </Button>
          )}
        </div>
      </div>

      <form
        className="flex gap-2 bg-black px-4 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 14px)' }}
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(manual);
        }}
      >
        <div className="relative flex-1">
          <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            className="h-12 w-full rounded-xl bg-white/10 pl-9 pr-3 text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-accent"
            inputMode="numeric"
            placeholder="Barcode manuell eingeben"
            aria-label="Barcode manuell eingeben"
            value={manual}
            onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button type="submit" variant="primary" size="lg" disabled={manual.length < 8 || phase === 'lookup'}>
          Suchen
        </Button>
      </form>
    </div>,
    document.body,
  );
}
