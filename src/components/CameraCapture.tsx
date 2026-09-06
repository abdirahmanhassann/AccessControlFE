import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui";

export type CapturedPhoto = {
  dataUrl: string;
  name: string;
  size: number;
  type: string;
};

export function CameraCapture({
  onCapture,
}: {
  onCapture: (photo: CapturedPhoto) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This phone cannot open the camera in the browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setReady(true);
        setError("");
      } catch {
        setError("Camera is required to sign out. Allow camera access and try again.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Wait for the camera to start, then take the photo.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const size = Math.round((dataUrl.length * 3) / 4);
    onCapture({
      dataUrl,
      name: `clockout-${Date.now()}.jpg`,
      size,
      type: "image/jpeg",
    });
  }

  return (
    <div className="sg-camera">
      <video ref={videoRef} className="sg-camera-video" autoPlay playsInline muted />
      {error ? <p className="sg-error">{error}</p> : null}
      <Button type="button" variant="primary" disabled={!ready} onClick={snap}>
        <Camera size={16} />
        Take photo
      </Button>
      <p className="sg-help">Use the camera. Gallery is turned off for sign-out.</p>
    </div>
  );
}
