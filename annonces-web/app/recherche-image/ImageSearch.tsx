'use client';

/* eslint-disable @next/next/no-img-element -- aperçu local de la photo choisie */
import { cameraOutline, imagesOutline, scanOutline } from 'ionicons/icons';
import { ChangeEvent, useRef, useState } from 'react';
import { Ion } from '@/components/Ion';
import { ListingList } from '@/components/ListingList';
import type { ListingCard } from '@/lib/types';

const SIDE = 512; // assez pour reconnaître un objet, et léger sur un petit forfait

/** Réduit la photo dans le navigateur : quelques dizaines de Ko partent vers le serveur, pas plusieurs Mo. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** Recherche par image, comme Google Lens : une photo, et les articles qui lui ressemblent. */
export function ImageSearch({ country }: { country: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<ListingCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // la même photo peut être reprise
    if (!file) return;
    setBusy(true);
    setError(null);
    setItems(null);
    try {
      const dataUrl = await shrink(file);
      setPreview(dataUrl);
      const res = await fetch('/api/image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, image: dataUrl.split(',')[1] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'La recherche a échoué. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section stack-lg image-search">
      <div className="stack image-search-head">
        <h1 className="pill-title">Rechercher par image</h1>
        <p className="muted">Photographiez un objet : nous trouvons les articles qui lui ressemblent.</p>
      </div>

      <div className="image-search-box">
        {preview ? (
          <span className="image-search-preview">
            <img src={preview} alt="Votre photo" />
            {busy ? <span className="image-search-scan"><Ion icon={scanOutline} size={44} /></span> : null}
          </span>
        ) : (
          <span className="image-search-empty" aria-hidden><Ion icon={scanOutline} size={56} /></span>
        )}
        <div className="image-search-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => camera.current?.click()}><Ion icon={cameraOutline} size={20} />Prendre une photo</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => gallery.current?.click()}><Ion icon={imagesOutline} size={20} />Choisir une image</button>
        </div>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={onFile} />
      </div>

      {busy ? <p className="muted image-search-status" role="status">Recherche des articles ressemblants…</p> : null}
      {error ? <p className="error image-search-status" role="alert">{error}</p> : null}
      {items?.length === 0 ? <p className="muted image-search-status" role="status">Aucun article ressemblant pour le moment. Essayez une photo plus nette, avec l’objet bien au centre.</p> : null}
      {items?.length ? (
        <section className="stack" aria-label="Articles ressemblants">
          <h2>Articles ressemblants</h2>
          <ListingList items={items} />
        </section>
      ) : null}
    </div>
  );
}
