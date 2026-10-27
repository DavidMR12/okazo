'use client';

import { useEffect, useRef, useState } from 'react';
import { alertCircleOutline, helpCircleOutline } from 'ionicons/icons';
import { Ion } from './Ion';

/**
 * Boîte de confirmation d'Okazo, à la place de window.confirm dont la police, la langue des boutons et l'en-tête
 * (« localhost indique ») dépendent du navigateur (demande du porteur, 20 octobre 2026). Même rôle que dans l'application.
 * Usage : if (!(await confirmDialog('Effacer le brouillon ?', { confirm: 'Effacer', danger: true }))) return;
 */
interface Request {
  title: string;
  message?: string;
  confirm: string;
  cancel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

let push: ((r: Request) => void) | null = null;

export function confirmDialog(title: string, opts: { message?: string; confirm?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const r = { title, message: opts.message, confirm: opts.confirm ?? 'Confirmer', cancel: opts.cancel ?? 'Annuler', danger: opts.danger ?? false, resolve };
    if (push) push(r);
    else resolve(window.confirm(title)); // hôte pas encore monté : repli sur la boîte du navigateur
  });
}

/** À placer une fois dans la mise en page (app/layout.tsx). */
export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    return () => {
      push = null;
    };
  }, []);
  const current = queue[0];
  const answer = (value: boolean) => {
    current?.resolve(value);
    setQueue((q) => q.slice(1));
  };
  useEffect(() => {
    if (!current) return;
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  if (!current) return null;
  return (
    <div className="dialog-backdrop" onClick={() => answer(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" onClick={(e) => e.stopPropagation()}>
        <span className={`dialog-icon${current.danger ? ' danger' : ''}`}><Ion icon={current.danger ? alertCircleOutline : helpCircleOutline} size={28} /></span>
        <h2 id="dialog-title">{current.title}</h2>
        {current.message ? <p>{current.message}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="dialog-btn cancel" onClick={() => answer(false)}>{current.cancel}</button>
          <button type="button" ref={ok} className={`dialog-btn ${current.danger ? 'danger' : 'primary'}`} onClick={() => answer(true)}>{current.confirm}</button>
        </div>
      </div>
    </div>
  );
}
