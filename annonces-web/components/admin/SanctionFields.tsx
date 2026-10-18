'use client';

import { useAdminMe } from '@/lib/admin';

export interface SanctionDraft { type: '' | 'warning' | 'suspension' | 'ban'; reason: string; durationDays: number }
export const EMPTY_SANCTION: SanctionDraft = { type: '', reason: '', durationDays: 7 };

/** Choix de sanction. Le bannissement n'est proposé qu'aux admins (l'API l'impose aussi). */
export function SanctionFields({ value, onChange, idPrefix }: { value: SanctionDraft; onChange: (v: SanctionDraft) => void; idPrefix: string }) {
  const me = useAdminMe();
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`${idPrefix}-type`}>Sanction</label>
        <select id={`${idPrefix}-type`} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as SanctionDraft['type'] })}>
          <option value="">Aucune</option>
          <option value="warning">Avertissement</option>
          <option value="suspension">Suspension</option>
          {me?.role === 'admin' ? <option value="ban">Bannissement (définitif)</option> : null}
        </select>
      </div>
      {value.type === 'suspension' ? (
        <div className="field">
          <label htmlFor={`${idPrefix}-days`}>Durée (jours)</label>
          <input id={`${idPrefix}-days`} type="number" min={1} max={me?.role === 'admin' ? 365 : 30} value={value.durationDays}
            onChange={(e) => onChange({ ...value, durationDays: Number(e.target.value) || 1 })} />
        </div>
      ) : null}
      {value.type ? (
        <div className="field">
          <label htmlFor={`${idPrefix}-reason`}>Motif de la sanction (interne)</label>
          <input id={`${idPrefix}-reason`} value={value.reason} maxLength={500} onChange={(e) => onChange({ ...value, reason: e.target.value })} />
        </div>
      ) : null}
    </div>
  );
}

export function sanctionPayload(s: SanctionDraft) {
  if (!s.type) return undefined;
  return { type: s.type, reason: s.reason.trim(), ...(s.type === 'suspension' ? { durationDays: s.durationDays } : {}) };
}
export const sanctionIncomplete = (s: SanctionDraft) => !!s.type && s.reason.trim().length < 3;
