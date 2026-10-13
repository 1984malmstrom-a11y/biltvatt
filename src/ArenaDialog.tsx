import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function ArenaDialog({ title, onClose, children, locked = false }: {
  title: string; onClose: () => void; children: React.ReactNode; locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="arena-dialog arena-theme" aria-label={title}
    onCancel={e => { e.preventDefault(); if (!locked) onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && !locked) onClose(); }}>
    <header><h2>{title}</h2><button type="button" aria-label="Stäng" disabled={locked} onClick={onClose}><X /></button></header>
    {children}
  </dialog>;
}
