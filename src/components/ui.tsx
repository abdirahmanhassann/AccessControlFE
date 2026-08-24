import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

export function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="sg-mark" style={light ? { color: "#f4f1ea" } : undefined}>
      <span className="sg-mark-glyph" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 3h3M3 3v3M13 3h-3M13 3v3M3 13h3M3 13v-3M13 13h-3M13 13v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
          <rect x="7" y="7" width="2" height="2" fill="currentColor" />
        </svg>
      </span>
      <span className="sg-mark-name">SiteGate</span>
    </Link>
  );
}

export function Button({
  variant = "ghost",
  block,
  size,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "ok";
  block?: boolean;
  size?: "sm";
}) {
  const cls = [
    "sg-btn",
    variant === "primary" && "sg-btn-primary",
    variant === "danger" && "sg-btn-danger",
    variant === "ok" && "sg-btn-ok",
    variant === "ghost" && "sg-btn-ghost",
    block && "sg-btn-block",
    size === "sm" && "sg-btn-sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button className={cls} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="sg-field">
      <span className="sg-label">{label}</span>
      {children}
      {hint && !error ? <span className="sg-help">{hint}</span> : null}
      {error ? <span className="sg-error">{error}</span> : null}
    </label>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`sg-input ${className}`} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="sg-select" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="sg-textarea" {...props} />;
}

export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "ok" | "warn" | "danger" | "accent" | "muted";
  children: ReactNode;
}) {
  return <span className={`sg-badge sg-badge-${tone}`}>{children}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="sg-empty">
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sg-overlay" onClick={onClose} role="presentation">
      <div
        className="sg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sg-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sg-modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

type ToastFn = (message: string) => void;
let toastFn: ToastFn = () => {};

export function toast(message: string) {
  toastFn(message);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: number | undefined;
    toastFn = (m) => {
      setMsg(m);
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 2800);
    };
    return () => {
      toastFn = () => {};
      window.clearTimeout(t);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="sg-toast" role="status">
      {msg}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="sg-content">
      <div className="sg-skel" style={{ height: 28, width: 180 }} />
      <div className="sg-skel" style={{ height: 120 }} />
      <div className="sg-skel" style={{ height: 220 }} />
    </div>
  );
}
