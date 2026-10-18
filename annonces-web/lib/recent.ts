'use client';

import { useEffect, useState } from 'react';
import type { ListingCard } from './types';

/**
 * Annonces récemment consultées, gardées dans ce navigateur seulement (rien n'est envoyé au serveur) :
 * section « Vous avez consulté » de l'accueil. 12 au plus, la plus récente en premier.
 */
const KEY = 'app.recentlyViewed';
const MAX = 12;

export function readRecent(): ListingCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ListingCard[]) : [];
  } catch {
    return [];
  }
}

export function rememberListing(card: ListingCard) {
  try {
    const list = [card, ...readRecent().filter((c) => c.id !== card.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible : on s'en passe */
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignoré */
  }
}

export function useRecent(): [ListingCard[], () => void] {
  const [items, setItems] = useState<ListingCard[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du navigateur après l'affichage (la page reste en cache)
    setItems(readRecent());
  }, []);
  return [items, () => { clearRecent(); setItems([]); }];
}
