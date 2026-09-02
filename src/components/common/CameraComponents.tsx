import { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';

// ─── Photo Camera ─────────────────────────────────────────────────────────────

export function CameraView({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError(true));
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  function capture() {
    if (!videoRef.current || !videoReady) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 1280;
    canvas.height = v.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob(blob => {
      if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.85);
  }

  return (
    <>
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {error ? (
          <p className="text-white text-sm px-6 text-center">Camera not available. Please allow camera access and try again.</p>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              onLoadedMetadata={() => setVideoReady(true)}
            />
            {!videoReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white text-sm">Starting camera...</p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-center items-center p-6 bg-black">
        <button
          onClick={capture}
          disabled={!videoReady}
          className={`w-16 h-16 rounded-full bg-white flex items-center justify-center ring-4 ring-white/30 transition-opacity ${videoReady ? 'opacity-100' : 'opacity-30'}`}
        >
          <div className="w-12 h-12 rounded-full bg-white border-4 border-gray-900" />
        </button>
      </div>
    </>
  );
}

// ─── Video Recorder ───────────────────────────────────────────────────────────

interface VideoRecorderProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  title?: string;
}

export function VideoRecorderView({ onCapture, onClose, title = 'Record Video' }: VideoRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    startCamera();
    // Fail gracefully if camera never responds after 8s
    const timeout = setTimeout(() => { if (!streamRef.current) setError(true); }, 8000);
    return () => {
      clearTimeout(timeout);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  async function startCamera() {
    if (typeof MediaRecorder === 'undefined') {
      setError(true);
      return;
    }
    try {
      // Try video-only first — iOS Chrome often blocks audio+video together
      const stream = await navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
        .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true }))
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError(true);
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType =
      ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t =>
        MediaRecorder.isTypeSupported(t)
      ) || '';
    const recorder = new MediaRecorder(
      streamRef.current,
      mimeType ? { mimeType } : undefined
    );
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function useVideo() {
    if (!previewBlob) return;
    const ext = previewBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([previewBlob], `video-${Date.now()}.${ext}`, { type: previewBlob.type });
    onCapture(file);
  }

  function reRecord() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setPreviewBlob(null);
    setDuration(0);
    setCameraReady(false);
    startCamera();
  }

  const fmtDur = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 text-white">
        <button onClick={onClose}><X className="w-6 h-6" /></button>
        <span className="font-medium">
          {previewUrl ? 'Preview Recording' : recording ? `Recording ${fmtDur(duration)}` : title}
        </span>
        <div className="w-10" />
      </div>

      {previewUrl ? (
        <>
          <div className="flex-1 bg-black flex items-center justify-center">
            <video src={previewUrl} controls className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-3 p-5 bg-black">
            <button
              onClick={reRecord}
              className="flex-1 py-3.5 rounded-xl border border-white/30 text-white font-medium flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Re-record
            </button>
            <button
              onClick={useVideo}
              className="flex-1 py-3.5 rounded-xl bg-success-600 hover:bg-success-700 text-white font-semibold flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" /> Use Video
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 relative bg-black flex items-center justify-center">
            {error ? (
              <div className="px-6 text-center">
                <p className="text-white text-sm mb-2">
                  Video recording is not available on this device or browser.
                </p>
                <p className="text-white/50 text-xs mb-6">
                  Try allowing camera access in your browser settings, or use Safari on iPhone.
                </p>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-white/20 text-white rounded-xl text-sm font-medium"
                >
                  Continue without video
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={() => setCameraReady(true)}
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white text-sm">Starting camera...</p>
                  </div>
                )}
                {recording && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm font-bold px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    REC {fmtDur(duration)}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-2 p-6 bg-black">
            {!recording ? (
              <>
                <button
                  onClick={startRecording}
                  disabled={!cameraReady}
                  className={`w-16 h-16 rounded-full border-4 border-red-500 flex items-center justify-center transition-opacity ${cameraReady ? 'opacity-100' : 'opacity-30'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-red-500" />
                </button>
                <p className="text-white/50 text-xs">Tap to start recording</p>
              </>
            ) : (
              <>
                <button
                  onClick={stopRecording}
                  className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center"
                >
                  <div className="w-7 h-7 rounded-md bg-white" />
                </button>
                <p className="text-white/50 text-xs">Tap to stop</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Info Tooltip ─────────────────────────────────────────────────────────────

export function SectionHelp({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 mt-0.5 font-normal normal-case tracking-normal">{text}</p>;
}
