"use client";
import { useEffect, useRef, useState } from "react";
import { X, CameraOff } from "lucide-react";

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

function isFrontCamera(label: string) {
  const l = label.toLowerCase();
  return l.includes("front") || l.includes("face") || l.includes("전면") || l.includes("user");
}

export default function BarcodeCameraScanner({ onDetected, onClose }: Props) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const mountedRef   = useRef(true);
  const detectedRef  = useRef(false);

  const [error,     setError]     = useState<string | null>(null);
  const [started,   setStarted]   = useState(false);
  const [switching, setSwitching] = useState(false);
  const [cameras,   setCameras]   = useState<MediaDeviceInfo[]>([]);
  const [camIdx,    setCamIdx]    = useState(-1);
  const [showHint,  setShowHint]  = useState(false);

  const stopAll = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const pickDefaultIdx = (list: MediaDeviceInfo[]): number => {
    const rearCams = list
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => !isFrontCamera(d.label));
    if (rearCams.length >= 2) return rearCams[1].i;
    if (rearCams.length === 1) return rearCams[0].i;
    return 0;
  };

  useEffect(() => {
    mountedRef.current = true;
    const setup = async () => {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        tmp.getTracks().forEach(t => t.stop());
        if (!mountedRef.current) return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const vids = all.filter(d => d.kind === "videoinput" && d.deviceId);
        if (!mountedRef.current) return;
        setCameras(vids);
        setCamIdx(pickDefaultIdx(vids));
        if (vids.filter(d => !isFrontCamera(d.label)).length > 1) {
          setTimeout(() => { if (mountedRef.current) setShowHint(true); }, 3000);
        }
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          msg.includes("NotAllowedError") || msg.includes("Permission")
            ? "카메라 권한이 거부되었습니다.\n브라우저 주소창 옆 카메라 아이콘을 클릭해 권한을 허용해주세요."
            : "카메라를 시작할 수 없습니다."
        );
      }
    };
    setup();
    return () => { mountedRef.current = false; stopAll(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (camIdx < 0 || cameras.length === 0) return;
    mountedRef.current = true;
    detectedRef.current = false;
    setError(null);
    setStarted(false);
    const start = async () => {
      try {
        if (!videoRef.current || !mountedRef.current) return;
        const device = cameras[camIdx];
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: device.deviceId } },
        });
        streamRef.current = stream;
        if (!mountedRef.current) { stopAll(); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), 10000);
          video.addEventListener("playing", () => { clearTimeout(t); resolve(); }, { once: true });
          video.play().catch(reject);
        });
        if (!mountedRef.current) { stopAll(); return; }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        setStarted(true);
        setSwitching(false);
        const scan = () => {
          if (!mountedRef.current || detectedRef.current) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            try {
              const result = reader.decodeFromCanvas(canvas);
              if (result && mountedRef.current && !detectedRef.current) {
                detectedRef.current = true;
                onDetected(result.getText());
                return;
              }
            } catch { /* NotFoundException — 정상 */ }
          }
          animFrameRef.current = requestAnimationFrame(scan);
        };
        animFrameRef.current = requestAnimationFrame(scan);
      } catch {
        if (!mountedRef.current) return;
        setSwitching(false);
        setError("카메라를 시작할 수 없습니다.");
      }
    };
    start();
    return () => stopAll();
  }, [camIdx, cameras]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchCamera = () => {
    if (!started || cameras.length <= 1) return;
    setSwitching(true);
    setStarted(false);
    setShowHint(false);
    stopAll();
    setCamIdx(i => (i + 1) % cameras.length);
  };

  const camNumber = camIdx >= 0 ? `카메라 ${camIdx + 1}/${cameras.length}` : "";

  if (error) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-sm">
          <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center gap-3 py-6 px-4">
            <CameraOff size={28} className="text-gray-400" />
            <p className="text-xs text-gray-500 text-center whitespace-pre-line leading-relaxed">{error}</p>
            <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 text-gray-700 rounded-xl text-xs font-medium hover:bg-gray-300">닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm space-y-2">
        {showHint && cameras.length > 1 && (
          <div className="bg-yellow-400/90 text-yellow-900 text-xs font-medium px-4 py-2 rounded-xl text-center">
            📷 화면이 흐리거나 인식이 안 되면 아래 카메라 전환 버튼을 눌러보세요
          </div>
        )}
        <div className="rounded-xl border border-blue-200 overflow-hidden relative bg-black">
          <video ref={videoRef} className="w-full" playsInline muted />
          {cameras.length > 1 && (
            <button
              onClick={switchCamera}
              disabled={switching || !started}
              className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2.5 py-1.5 bg-white/90 rounded-full shadow hover:bg-white disabled:opacity-40 text-xs font-semibold text-gray-700"
            >
              <span>📷</span>
              <span>카메라 전환</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 rounded-full shadow hover:bg-white"
          >
            <X size={16} className="text-gray-700" />
          </button>
          <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-white/80 py-1.5 bg-black/50">
            {switching ? "카메라 전환 중..." : started ? `${camNumber} · 바코드를 비춰주세요` : "카메라 시작 중..."}
          </p>
        </div>
      </div>
    </div>
  );
}
