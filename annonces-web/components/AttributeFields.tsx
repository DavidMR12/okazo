'use client';

import type { FormField } from '@/lib/types';

/**
 * Champs propres à la catégorie (contrat, kilométrage, surface…), décrits par l'API.
 * Les valeurs restent du texte pendant la saisie ; elles sont converties à l'envoi.
 */
export function AttributeFields({
  fields,
  values,
  onChange,
  errors,
  showRequired,
}: {
  fields: FormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string | undefined) => void;
  errors: Record<string, string>;
  showRequired: boolean; // « Je propose » : les champs obligatoires le sont ; « Je recherche » : tout est facultatif
}) {
  return (
    <div className="attr-grid">
      {fields.map((f) => {
        const id = `attr-${f.key}`;
        const optional = !(f.required && showRequired) ? <span className="muted"> · facultatif</span> : null;
        return (
          <div key={f.key} className="field">
            {f.type === 'select' ? (
              <>
                <h2 id={id}>{f.label}{optional}</h2>
                <div className="chip-wrap" role="group" aria-labelledby={id}>
                  {f.options.map((o) => (
                    <button key={o.value} type="button" className="chip" aria-pressed={values[f.key] === o.value}
                      onClick={() => onChange(f.key, values[f.key] === o.value ? undefined : o.value)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label htmlFor={id}><h2>{f.label}{optional}</h2></label>
                {f.type === 'number' ? (
                  <div className="unit-input">
                    <input id={id} inputMode="numeric" value={values[f.key] ?? ''}
                      onChange={(e) => onChange(f.key, e.target.value.replace(/\D/g, '').slice(0, 9) || undefined)} />
                    {f.unit ? <span>{f.unit}</span> : null}
                  </div>
                ) : (
                  <input id={id} value={values[f.key] ?? ''} maxLength={f.maxLength ?? 120} placeholder={f.placeholder}
                    onChange={(e) => onChange(f.key, e.target.value || undefined)} />
                )}
              </>
            )}
            {errors[f.key] ? <p className="error">{errors[f.key]}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
