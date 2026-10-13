import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function ArenaDialog({ title, onClose, children, locked = false, className = "", eyebrow, heading }: {
  title: string; onClose: () => void; children: React.ReactNode; locked?: boolean;
  className?: string; eyebrow?: string; heading?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`arena-dialog arena-theme ${className}`} aria-label={title}
    onCancel={e => { e.preventDefault(); if (!locked) onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && !locked) onClose(); }}>
    <header><div>{eyebrow && <small className="arena-eyebrow">{eyebrow}</small>}<h2>{heading ?? title}</h2></div><button type="button" aria-label="Stäng" disabled={locked} onClick={onClose}><X /></button></header>
    {children}
  </dialog>;
}
