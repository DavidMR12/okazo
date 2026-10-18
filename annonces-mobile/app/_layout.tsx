import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { AuthProvider } from '../src/auth/AuthProvider';
import { PERSIST_MAX_AGE, persister, queryClient } from '../src/lib/queryClient';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { startNetworkWatch } from '../src/lib/network';

// Réseau suivi dès le démarrage : React Query attend le retour de la connexion au lieu d'échouer
startNetworkWatch();
import { colors, FONT } from '../src/theme';

// L'écran de démarrage reste affiché jusqu'au chargement de la police : jamais de texte dans la police système
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Police déjà embarquée dans l'app compilée ; chargée ici pour Expo Go et le web
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  // Rafraîchit les données quand l’application revient au premier plan
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (Platform.OS !== 'web') focusManager.setFocused(s === 'active');
    });
    return () => sub.remove();
  }, []);

  // En cas d'échec du chargement, l'app s'ouvre quand même (police système)
  if (!fontsLoaded && !fontError) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
      }}
    >
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.ink,
            headerBackTitle: 'Retour',
            headerTitleStyle: { fontFamily: FONT },
            headerBackTitleStyle: { fontFamily: FONT },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="listing/[id]" options={{ title: '' }} />
          <Stack.Screen name="seller/[id]" options={{ title: 'Vendeur' }} />
          <Stack.Screen name="login" options={{ title: 'Connexion', presentation: 'modal' }} />
          <Stack.Screen name="verify" options={{ title: 'Code de vérification', presentation: 'modal' }} />
          <Stack.Screen name="verify-phone" options={{ title: 'Vérifier mon numéro', presentation: 'modal' }} />
          <Stack.Screen name="accept-terms" options={{ title: 'Conditions d’utilisation', presentation: 'modal' }} />
          <Stack.Screen name="report" options={{ title: 'Signaler', presentation: 'modal' }} />
          <Stack.Screen name="my-listings" options={{ title: 'Mes annonces' }} />
          <Stack.Screen name="favorites" options={{ title: 'Mes favoris' }} />
          <Stack.Screen name="categories" options={{ title: 'Toutes les catégories' }} />
          <Stack.Screen name="search" options={{ title: 'Rechercher' }} />
          <Stack.Screen name="saved-searches" options={{ title: 'Mes recherches' }} />
          <Stack.Screen name="applications" options={{ title: 'Mes candidatures' }} />
          <Stack.Screen name="review/[id]" options={{ title: 'Donner mon avis', presentation: 'modal' }} />
          <Stack.Screen name="reviews/[id]" options={{ title: 'Avis' }} />
          <Stack.Screen name="apply/[id]" options={{ title: 'Postuler' }} />
          <Stack.Screen name="listing/applications/[id]" options={{ title: 'Candidatures' }} />
          <Stack.Screen name="category/[id]" options={{ title: '' }} />
          <Stack.Screen name="delete-account" options={{ title: 'Supprimer mon compte' }} />
          <Stack.Screen name="verify-identity" options={{ title: 'Vérifier mon identité' }} />
          <Stack.Screen name="conversation/[id]" options={{ title: '' }} />
          <Stack.Screen name="conversation/new" options={{ title: 'Écrire au vendeur' }} />
          <Stack.Screen name="listing/edit/[id]" options={{ title: 'Modifier l’annonce' }} />
        </Stack>
        <OfflineBanner />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
