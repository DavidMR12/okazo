import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY, // doit être ≥ maxAge de la persistance
      // Pas de nouvel essai sur une erreur 4xx (inutile), 2 essais sur une erreur réseau
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      // Affiche d’abord le cache disque : l’écran s’ouvre même sans réseau
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst', retry: 0 },
  },
});

// Cache sur disque : l’accueil et les annonces déjà vues s’affichent instantanément, même hors connexion
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'app-cache', throttleTime: 2000 });
export const PERSIST_MAX_AGE = DAY;

/** Données liées au compte, effacées à la déconnexion. */
export const PRIVATE_KEYS = ['me', 'favorite-ids', 'favorites', 'cart', 'cart-ids', 'saved-searches', 'my-applications', 'review-status', 'listing-applications', 'my-listings', 'my-verification', 'inbox', 'unread-count'];
