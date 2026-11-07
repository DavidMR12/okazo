import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

const DAY = 24 * 60 * 60 * 1000;
const MAX_SAVED_LISTINGS = 150; // fiches gardées sur le disque : le stockage Android refuse les très gros enregistrements

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: Infinity, // doit être ≥ maxAge ; jamais une durée en jours : au-delà de 24,8 jours le minuteur se déclenche aussitôt et vide le cache
      // Pas de nouvel essai sur une erreur 4xx (inutile), 2 essais sur une erreur réseau
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      // Affiche d’abord le cache disque : l’écran s’ouvre même sans réseau
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst', retry: 0 },
  },
});

// Cache sur disque : l’accueil et les annonces déjà vues s’affichent instantanément, même hors connexion
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'app-cache', throttleTime: 2000, serialize: (client) => JSON.stringify(keepRecentListings(client)) });
export const PERSIST_MAX_AGE = 30 * DAY; // tout ce qui a été récupéré depuis la dernière connexion reste consultable

/** Ne garde que les fiches d'annonces les plus récentes ; le reste du cache est conservé tel quel. */
function keepRecentListings(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries;
  const listings = queries.filter((q) => q.queryKey[0] === 'listing').sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  if (listings.length <= MAX_SAVED_LISTINGS) return client;
  const dropped = new Set(listings.slice(MAX_SAVED_LISTINGS));
  return { ...client, clientState: { ...client.clientState, queries: queries.filter((q) => !dropped.has(q)) } };
}

/** Données liées au compte, effacées à la déconnexion. */
export const PRIVATE_KEYS = ['me', 'favorite-ids', 'favorites', 'cart', 'cart-ids', 'saved-searches', 'my-applications', 'review-status', 'listing-applications', 'my-listings', 'my-verification', 'inbox', 'unread-count'];
