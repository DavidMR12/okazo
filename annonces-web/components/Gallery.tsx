'use client';

/* eslint-disable @next/next/no-img-element -- photos déjà redimensionnées en WebP par l'API et servies par le CDN */
import { useCallback, useEffect, useState } from 'react';

interface Img { url: string; thumbUrl?: string; width?: number | null; height?: number | null }
const thumb = (url: string) => url.replace(/-1200\.webp$/, '-400.webp');

/**
 * Galerie de l'annonce : grande photo avec flèches et compteur, vignettes en dessous, et plein écran
 * au clic (flèches du clavier, Échap pour fermer). Sur téléphone, on fait aussi défiler du doigt.
 */
export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const n = images.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [full, go]);

  // Défilement au doigt : glisser vers la gauche ou la droite change de photo
  const [startX, setStartX] = useState<number | null>(null);
  const swipe = {
    onTouchStart: (e: React.TouchEvent) => setStartX(e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      setStartX(null);
    },
  };

  const img = images[i];
  return (
    <div className="gal">
      <div className="gal-main" {...swipe}>
        <button type="button" className="gal-open" onClick={() => setFull(true)} aria-label="Voir la photo en grand">
          <img src={img.url} alt={i === 0 ? title : `${title}, photo ${i + 1}`} width={img.width ?? 1200} height={img.height ?? 900} fetchPriority={i === 0 ? 'high' : 'auto'} decoding="async" />
        </button>
        {n > 1 ? (
          <>
            <button type="button" className="gal-nav gal-prev" onClick={() => go(-1)} aria-label="Photo précédente">‹</button>
            <button type="button" className="gal-nav gal-next" onClick={() => go(1)} aria-label="Photo suivante">›</button>
            <span className="gal-count">{i + 1} / {n}</span>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="gal-thumbs">
          {images.map((m, k) => (
            <button key={m.url} type="button" className="gal-thumb" aria-current={k === i} aria-label={`Photo ${k + 1}`} onClick={() => setI(k)}>
              <img src={m.thumbUrl ?? thumb(m.url)} alt="" width={96} height={72} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}

      {full ? (
        <div className="gal-full" role="dialog" aria-modal="true" aria-label="Photos de l’annonce" onClick={() => setFull(false)} {...swipe}>
          <img src={img.url} alt={`${title}, photo ${i + 1}`} onClick={(e) => e.stopPropagation()} />
          <button type="button" className="gal-close" onClick={() => setFull(false)} aria-label="Fermer">×</button>
          {n > 1 ? (
            <>
              <button type="button" className="gal-nav gal-prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Photo précédente">‹</button>
              <button type="button" className="gal-nav gal-next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Photo suivante">›</button>
              <span className="gal-count">{i + 1} / {n}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
