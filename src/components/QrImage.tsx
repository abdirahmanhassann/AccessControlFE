import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({
  value,
  size = 160,
  alt,
}: {
  value: string;
  size?: number;
  alt?: string;
}) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: "#16181c", light: "#fffcf6" },
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);
  if (!src) {
    return <div className="sg-qr-thumb" style={{ width: size, height: size }} />;
  }
  return <img src={src} width={size} height={size} alt={alt ?? `QR ${value}`} />;
}
