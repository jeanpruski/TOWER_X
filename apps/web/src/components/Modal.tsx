import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { gamepadMenu } from '../game/gamepad-menu';
export function Modal({ title, children, onClose, wide = false, className = '' }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!; dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    const stop = gamepadMenu(dialog, () => close.current());
    return () => { stop(); dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}
