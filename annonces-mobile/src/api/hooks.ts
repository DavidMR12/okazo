import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { api, qs } from './client';
import { toQuery } from '../lib/filters';
import type {
  CartPayload,
  SavedSearch,
  Category,
  City,
  Country,
  District,
  FavoriteItem,
  FeedFilters,
  InboxItem,
  ListingDetail,
  ListingsPage,
  Me,
  MyApplication,
  MyListing,
  ReceivedApplication,
  ReviewsPage,
  ReviewStatus,
  ReportReason,
  SellerProfile,
  VerificationStatus,
} from './types';

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------- données de référence
export const useCountries = () =>
  useQuery({
    queryKey: ['countries'],
    queryFn: () => api<{ countries: Country[] }>('/geo/countries').then((r) => r.countries),
    staleTime: HOUR,
  });

export const useCities = (country?: string) =>
  useQuery({
    queryKey: ['cities', country],
    queryFn: () => api<{ cities: City[] }>(`/geo/cities${qs({ country })}`).then((r) => r.cities),
    staleTime: HOUR,
    enabled: !!country,
  });

/** Quartiers d'une ville (choix facultatif à la publication, filtre dans la recherche). */
export const useDistricts = (cityId?: number) =>
  useQuery({
    queryKey: ['districts', cityId],
    queryFn: () => api<{ districts: District[] }>(`/geo/districts${qs({ cityId })}`).then((r) => r.districts),
    staleTime: HOUR,
    enabled: !!cityId,
  });

/** Modes de connexion proposés par l'API (SMS ou WhatsApp, Google, Facebook). */
export const useAuthMethods = () =>
  useQuery({
    queryKey: ['auth-methods'],
    queryFn: () => api<{ otpChannels: ('sms' | 'whatsapp')[]; google: boolean; facebook: boolean; email?: boolean }>('/auth/methods'),
    staleTime: HOUR,
  });

export const useCategories = () =>
  useQuery({
    // « v2 » : les catégories portent désormais leur formulaire ; l'ancien cache (sans formulaire) est ignoré
    queryKey: ['categories', 'v2'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((r) => r.categories),
    staleTime: HOUR,
  });

// ---------------------------------------------------------------- annonces
export const useFeed = (filters: FeedFilters) =>
  useInfiniteQuery({
    queryKey: ['listings', filters],
    queryFn: ({ pageParam }) =>
      api<ListingsPage>(`/listings${qs({ ...toQuery(filters), cursor: pageParam ?? undefined, limit: 20 })}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/** Nombre de résultats (« Voir les N annonces ») : léger, rafraîchi pendant le réglage des filtres. */
export const useListingCount = (filters: FeedFilters, enabled = true) =>
  useQuery({
    queryKey: ['listing-count', filters],
    queryFn: () => api<{ count: number }>(`/listings/count${qs(toQuery(filters))}`).then((r) => r.count),
    enabled,
    placeholderData: (prev) => prev, // garde l'ancien nombre pendant le calcul
  });

export const useListing = (id: string) =>
  useQuery({ queryKey: ['listing', id], queryFn: () => api<ListingDetail>(`/listings/${id}`) });

export const useSeller = (id: string) =>
  useQuery({ queryKey: ['seller', id], queryFn: () => api<SellerProfile>(`/users/${id}`) });

/** Le numéro n’est jamais dans l’annonce : il est demandé au moment du contact (limité par jour). */
export const useContactSeller = () =>
  useMutation({
    mutationFn: (listingId: string) =>
      api<{ phone: string; whatsappUrl: string }>(`/listings/${listingId}/contact`, { auth: true }),
  });

// ---------------------------------------------------------------- compte
export const useMe = () => {
  const { status } = useAuth();
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me', { auth: true }), enabled: status === 'signedIn' });
};

export const useMyVerification = () => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['my-verification'],
    queryFn: () => api<VerificationStatus>('/me/verification', { auth: true }),
    enabled: status === 'signedIn',
  });
};

export const useUpdateProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName?: string; cityId?: number | null; contactPreference?: 'all' | 'messages_only' }) =>
      api<{ displayName: string; cityId: number | null; contactPreference: 'all' | 'messages_only' }>('/me', { method: 'PATCH', body, auth: true }),
    onSuccess: (data) => qc.setQueryData<Me>(['me'], (prev) => (prev ? { ...prev, ...data } : prev)),
  });
};

export const useMyListings = () => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['my-listings'],
    queryFn: () => api<{ items: MyListing[] }>('/me/listings', { auth: true }).then((r) => r.items),
    enabled: status === 'signedIn',
  });
};

export const useListingAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'sold' | 'delete' }) =>
      action === 'sold'
        ? api(`/listings/${id}/mark-sold`, { method: 'POST', auth: true })
        : api(`/listings/${id}`, { method: 'DELETE', auth: true }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
      void qc.invalidateQueries({ queryKey: ['listings'] });
    },
  });
};

// ---------------------------------------------------------------- favoris
export const useFavoriteIds = () => {
  const { status } = useAuth();
  const q = useQuery({
    queryKey: ['favorite-ids'],
    queryFn: () => api<{ ids: string[] }>('/me/favorites/ids', { auth: true }),
    enabled: status === 'signedIn',
  });
  return useMemo(() => new Set(q.data?.ids ?? []), [q.data]);
};

export const useFavorites = () => {
  const { status } = useAuth();
  return useInfiniteQuery({
    queryKey: ['favorites'],
    queryFn: ({ pageParam }) =>
      api<{ items: FavoriteItem[]; nextCursor: string | null }>(`/me/favorites${qs({ cursor: pageParam ?? undefined })}`, { auth: true }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: status === 'signedIn',
  });
};

/** Mise à jour optimiste : le cœur change immédiatement, puis revient en arrière si l’appel échoue. */
export const useToggleFavorite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      api(`/favorites/${id}`, { method: on ? 'PUT' : 'DELETE', auth: true }),
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: ['favorite-ids'] });
      const prev = qc.getQueryData<{ ids: string[] }>(['favorite-ids']);
      const ids = prev?.ids ?? [];
      qc.setQueryData(['favorite-ids'], { ids: on ? [...ids, id] : ids.filter((x) => x !== id) });
      if (!on) {
        qc.setQueryData<InfiniteData<{ items: FavoriteItem[]; nextCursor: string | null }>>(['favorites'], (d) =>
          d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) })) } : d,
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['favorite-ids'], ctx?.prev),
    onSettled: (_d, _e, vars) => {
      if (vars.on) void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
};

// ---------------------------------------------------------------- panier
export const useCartIds = () => {
  const { status } = useAuth();
  const q = useQuery({
    queryKey: ['cart-ids'],
    queryFn: () => api<{ ids: string[] }>('/me/cart/ids', { auth: true }),
    enabled: status === 'signedIn',
  });
  return useMemo(() => new Set(q.data?.ids ?? []), [q.data]);
};

export const useCart = () => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => api<CartPayload>('/me/cart', { auth: true }),
    enabled: status === 'signedIn',
  });
};

/** Ajout ou retrait immédiat à l'écran, annulé si l'appel échoue. */
export const useToggleCart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api(`/cart/${id}`, { method: on ? 'PUT' : 'DELETE', auth: true }),
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: ['cart-ids'] });
      const prev = qc.getQueryData<{ ids: string[] }>(['cart-ids']);
      const ids = prev?.ids ?? [];
      qc.setQueryData(['cart-ids'], { ids: on ? [...ids, id] : ids.filter((x) => x !== id) });
      return { prev };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['cart-ids'], ctx?.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['cart'] }),
  });
};

// ---------------------------------------------------------------- recherches sauvegardées
export const useSavedSearches = () => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => api<{ items: SavedSearch[] }>('/me/searches', { auth: true }).then((r) => r.items),
    enabled: status === 'signedIn',
  });
};

export const useSaveSearch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, filters }: { name: string; filters: FeedFilters }) =>
      api<SavedSearch>('/me/searches', { method: 'POST', auth: true, body: { name, query: toQuery(filters) } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
};

export const useDeleteSearch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/me/searches/${id}`, { method: 'DELETE', auth: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
};

/** Ouverture d'une recherche : ses nouveautés repartent de zéro. */
export const useMarkSearchSeen = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/me/searches/${id}/seen`, { method: 'POST', auth: true }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });
};

// ---------------------------------------------------------------- signalement
export const useReport = () =>
  useMutation({
    mutationFn: (body: { listingId?: string; userId?: string; reason: ReportReason; details?: string }) =>
      api<{ message: string }>('/reports', { method: 'POST', body, auth: true }),
  });

// ---------------------------------------------------------------- messagerie
/** Boîte de réception, relevée toutes les 20 s quand l’écran est affiché. */
export const useInbox = (active: boolean) => {
  const { status } = useAuth();
  return useInfiniteQuery({
    queryKey: ['inbox'],
    queryFn: ({ pageParam }) =>
      api<{ items: InboxItem[]; nextCursor: string | null }>(`/conversations${qs({ cursor: pageParam ?? undefined })}`, { auth: true }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: status === 'signedIn',
    refetchInterval: active ? 20_000 : false,
  });
};

/** Pastille de l’onglet Messages : une requête légère par minute. */
export const useUnreadCount = () => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['unread-count'],
    queryFn: () => api<{ count: number }>('/conversations/unread-count', { auth: true }).then((r) => r.count),
    enabled: status === 'signedIn',
    refetchInterval: 60_000,
  });
};

// ------------------------------------------------------------------ candidatures (offres d'emploi)
export const useMyApplications = (listingId?: string, enabled = true) => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['my-applications', listingId ?? 'all'],
    queryFn: () => api<{ items: MyApplication[] }>(`/me/applications${qs({ listingId })}`, { auth: true }).then((r) => r.items),
    enabled: status === 'signedIn' && enabled,
  });
};

export const useApply = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, message, cvKey }: { listingId: string; message: string; cvKey?: string }) =>
      api<{ id: string; conversationId: string }>(`/listings/${listingId}/applications`, { method: 'POST', auth: true, body: { message, cvKey } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-applications'] });
      void qc.invalidateQueries({ queryKey: ['inbox'] });
    },
  });
};

export const useListingApplications = (listingId: string) =>
  useQuery({
    queryKey: ['listing-applications', listingId],
    queryFn: () => api<{ listing: { id: string; title: string }; items: ReceivedApplication[] }>(`/me/listings/${listingId}/applications`, { auth: true }),
  });

export const useSetApplicationStatus = (listingId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'shortlisted' | 'rejected' | 'viewed' }) =>
      api(`/me/applications/${id}`, { method: 'PATCH', auth: true, body: { status } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['listing-applications', listingId] }),
  });
};

// ------------------------------------------------------------------ avis et notes
export const useSellerReviews = (userId: string) =>
  useInfiniteQuery({
    queryKey: ['reviews', userId],
    queryFn: ({ pageParam }) => api<ReviewsPage>(`/users/${userId}/reviews${qs({ cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useReviewStatus = (conversationId: string) => {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['review-status', conversationId],
    queryFn: () => api<ReviewStatus>(`/conversations/${conversationId}/review`, { auth: true }),
    enabled: status === 'signedIn',
  });
};

export const useCreateReview = (conversationId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; comment?: string }) => api(`/conversations/${conversationId}/review`, { method: 'POST', auth: true, body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['review-status', conversationId] });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      void qc.invalidateQueries({ queryKey: ['seller'] });
    },
  });
};

export const useReportReview = () =>
  useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: 'fake_review' | 'harassment' }) =>
      api(`/reviews/${id}/report`, { method: 'POST', auth: true, body: { reason } }),
  });
