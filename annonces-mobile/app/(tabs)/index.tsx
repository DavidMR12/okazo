import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { useCategories, useCountries, useFavoriteIds, useFeed, useToggleFavorite, useUnreadCount } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { BRAND_NAME } from '../../src/brand';
import { CategoryGrid } from '../../src/components/CategoryGrid';
import { CityPicker } from '../../src/components/CityPicker';
import { CountryChooser } from '../../src/components/CountryChooser';
import { ListingFeed } from '../../src/components/ListingFeed';
import { ListingTile } from '../../src/components/ListingTile';
import { Text } from '../../src/components/Typography';
import { setPendingAction } from '../../src/lib/pendingAction';
import { Place, setPlace } from '../../src/lib/place';
import { placeIn, useRegionInfo } from '../../src/lib/region';
import { colors, space } from '../../src/theme';
import { dialog } from '../../src/components/Dialog';

/**
 * Accueil (direction artistique d'octobre 2026) : nom et lieu en haut, recherche, grille de catégories,
 * annonces près de vous en cartes, puis les dernières annonces du pays.
 */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const countries = useCountries();
  const categories = useCategories();
  const unread = useUnreadCount();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [changingCountry, setChangingCountry] = useState(false);

  // Comme Uber : seulement le pays de l'utilisateur, et par défaut sa ville (src/lib/region.ts)
  const { place, needsChoice } = useRegionInfo();
  const countryName = countries.data?.find((c) => c.code === place?.country)?.name.replace(/\s*\(.*\)$/, '');

  const filters = useMemo(() => ({ country: place?.country }), [place?.country]);

  const header = (
    <View style={{ paddingTop: insets.top + space.sm, gap: space.lg, paddingBottom: space.md }}>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Image source={require('../../src/assets/okazo-logo.png')} style={styles.logo} contentFit="contain" accessibilityLabel={BRAND_NAME} />
        </View>
        <Pressable onPress={() => setPickerOpen(true)} style={styles.place} accessibilityRole="button" accessibilityLabel="Choisir la ville">
          <Ionicons name="location" size={18} color={colors.primary} />
          <Text style={styles.placeText} numberOfLines={1}>{place?.cityName ?? countryName ?? 'Lieu'}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.ink} />
        </Pressable>
        <Pressable onPress={() => router.push('/messages')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Messages">
          <Ionicons name="notifications-outline" size={24} color={colors.ink} />
          {unread.data ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>

      <View style={styles.search}>
        <Pressable onPress={() => router.push('/search')} style={styles.searchTap} accessibilityRole="search" accessibilityLabel="Rechercher une annonce">
          <Ionicons name="search" size={20} color={colors.inkMuted} />
          <Text style={styles.searchPlaceholder}>Que recherchez-vous ?</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/visual-search', params: { country: place?.country ?? '' } })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Rechercher par image">
          <Ionicons name="camera-outline" size={24} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/search', params: { openFilters: '1' } })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Filtres">
          <Ionicons name="options-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {categories.data ? <CategoryGrid categories={categories.data} /> : null}
      {place?.cityId ? <Nearby place={place} /> : null}

      <View style={[styles.sectionHead, { paddingHorizontal: space.lg }]}>
        <Text style={styles.sectionTitle}>Dernières annonces {placeIn(place?.country ? { country: place.country } : null, countryName)}</Text>
        <Pressable onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'all', country: place?.country ?? '' } })} hitSlop={8} style={styles.seeAllRow} accessibilityRole="link">
          <Text style={styles.seeAll}>Voir tout</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <>
      <ListingFeed
        filters={filters}
        header={header}
        empty={{
          title: `Pas encore d’annonce ${place?.cityName ? `à ${place.cityName}` : 'dans ce pays'}`,
          body: 'Soyez le premier à publier, ou cherchez ailleurs.',
          actionLabel: 'Changer de lieu',
          onAction: () => setPickerOpen(true),
        }}
      />
      <CityPicker
        visible={pickerOpen}
        current={place}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => {
          setPlace({ ...p, abroad: place?.abroad });
          setPickerOpen(false);
        }}
        onChangeCountry={
          place?.abroad && (countries.data?.length ?? 0) > 1
            ? () => {
                setPickerOpen(false);
                setChangingCountry(true);
              }
            : undefined
        }
      />
      {/* Hors des pays ouverts : on lui demande où il cherche (comme Louam) ; ensuite « Changer de pays » */}
      <CountryChooser
        visible={needsChoice || changingCountry}
        current={changingCountry ? place?.country : undefined}
        onPick={(p) => {
          setPlace(p);
          setChangingCountry(false);
        }}
        onClose={changingCountry ? () => setChangingCountry(false) : undefined}
      />
    </>
  );
}

/** « Annonces près de vous » : cartes horizontales de la ville choisie. */
function Nearby({ place }: { place: Place }) {
  const feed = useFeed({ country: place.country, cityId: place.cityId });
  const favoriteIds = useFavoriteIds();
  const toggle = useToggleFavorite();
  const { status } = useAuth();
  const items = feed.data?.pages[0]?.items.slice(0, 10) ?? [];

  const onToggleFavorite = useCallback(
    (id: string, on: boolean) => {
      if (status !== 'signedIn') {
        setPendingAction('favorite', id, 'feed');
        router.push('/login');
        return;
      }
      toggle.mutate({ id, on }, { onError: (e) => dialog('Favoris', e instanceof ApiError ? e.message : 'Action impossible.') });
    },
    [status, toggle],
  );

  if (!items.length) return null;
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Annonces {placeIn(place)}</Text>
        <Pressable onPress={() => router.push({ pathname: '/category/[id]', params: { id: 'all', cityId: String(place.cityId), country: place.country } })} hitSlop={8}>
          <Text style={styles.seeAll}>Voir tout ›</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ListingTile item={item} favorited={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite} />}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: 2, paddingBottom: space.md, gap: space.md }}
        showsHorizontalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  brand: { flex: 1 },
  logo: { height: 34, width: Math.round((34 * 426) / 123) }, // logo Okazo (image 426 × 123), calé à gauche
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 160 },
  placeText: { fontSize: 15, color: colors.ink, flexShrink: 1 },
  dot: { position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.bg },
  search: {
    marginHorizontal: space.lg,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.tintLine,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    gap: space.sm,
    shadowColor: colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, height: '100%' },
  searchPlaceholder: { fontSize: 16, color: colors.inkMuted },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingHorizontal: space.lg },
  sectionTitle: { flex: 1, fontSize: 21, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 }, // flex : le titre passe à la ligne, « Voir tout » reste visible
  seeAll: { fontSize: 15, fontWeight: '500', color: colors.primary },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
});
