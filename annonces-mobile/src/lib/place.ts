import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Lieu choisi dans l'en-tête de l'accueil (« 📍 Douala ▾ ») : un pays, et éventuellement une ville.
 * Gardé sur le téléphone pour les prochaines ouvertures.
 */
export interface Place {
  country: string; // code ISO, ex. CM
  cityId?: number;
  cityName?: string;
}

const KEY = 'app.place';
let place: Place | null = null;
let restored = false;
const listeners = new Set<() => void>();

export function setPlace(next: Place) {
  place = next;
  listeners.forEach((l) => l());
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

/** Lieu choisi, ou null tant qu'aucun n'a été choisi (l'accueil prend alors le pays du compte). */
export function usePlace(): Place | null {
  useEffect(() => {
    if (restored) return;
    restored = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw && !place) setPlace(JSON.parse(raw) as Place);
      })
      .catch(() => undefined);
  }, []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => place,
    () => place,
  );
}
