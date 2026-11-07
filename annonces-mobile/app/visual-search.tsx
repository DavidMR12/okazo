import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { api, ApiError } from '../src/api/client';
import { useFavoriteIds, useToggleFavorite } from '../src/api/hooks';
import type { ListingCard } from '../src/api/types';
import { useAuth } from '../src/auth/AuthProvider';
import { Button } from '../src/components/Button';
import { dialog } from '../src/components/Dialog';
import { ListingTile } from '../src/components/ListingTile';
import { Text } from '../src/components/Typography';
import { ensureCamera, ensurePhotos } from '../src/lib/permissions';
import { setPendingAction } from '../src/lib/pendingAction';
import { colors, space, type } from '../src/theme';

const SIDE = 512; // assez pour reconnaître un objet, et léger sur un petit forfait

/** Recherche par image, comme Google Lens : une photo, et les articles qui lui ressemblent. */
export default function VisualSearchScreen() {
  const { country } = useLocalSearchParams<{ country?: string }>();
  const { status } = useAuth();
  const favoriteIds = useFavoriteIds();
  const toggle = useToggleFavorite();
  const [preview, setPreview] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - space.lg * 2 - space.md) / 2);

  const search = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const ctx = ImageManipulator.manipulate(asset.uri);
      if (asset.width >= asset.height) ctx.resize({ width: Math.min(asset.width || SIDE, SIDE) });
      else ctx.resize({ height: Math.min(asset.height || SIDE, SIDE) });
      const rendered = await ctx.renderAsync();
      const out = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
      const image = (out.base64 ?? '').replace(/^data:[^,]*,/, '');
      return api<{ items: ListingCard[] }>('/listings/search-by-image', { method: 'POST', body: { country: country || 'CM', image } });
    },
  });

  const pick = async (source: 'camera' | 'library') => {
    if (source === 'camera' && !(await ensureCamera('Okazo a besoin de l’appareil photo pour rechercher un article à partir d’une photo.'))) return;
    if (source === 'library' && Platform.OS !== 'web' && !(await ensurePhotos('Okazo a besoin d’accéder à vos photos pour rechercher un article à partir d’une image.'))) return;
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled) return;
    setPreview(res.assets[0].uri);
    search.mutate(res.assets[0]);
  };

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

  const items = search.data?.items ?? [];
  const header = (
    <View style={styles.head}>
      <Text style={[type.small, styles.intro]}>Photographiez un objet : nous trouvons les articles qui lui ressemblent.</Text>
      <View style={styles.box}>
        {preview ? (
          <Image source={preview} style={styles.preview} contentFit="cover" />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="scan-outline" size={56} color={colors.primary} />
          </View>
        )}
        <Button label="Prendre une photo" icon="camera-outline" onPress={() => void pick('camera')} disabled={search.isPending} />
        <Button label="Choisir une image" icon="images-outline" variant="secondary" onPress={() => void pick('library')} disabled={search.isPending} />
      </View>
      {search.isPending ? <ActivityIndicator color={colors.primary} /> : null}
      {search.isError ? <Text style={[type.small, styles.error]}>{search.error instanceof ApiError ? search.error.message : 'La recherche a échoué. Réessayez.'}</Text> : null}
      {search.isSuccess && !items.length ? <Text style={[type.small, styles.intro]}>Aucun article ressemblant pour le moment. Essayez une photo plus nette, avec l’objet bien au centre.</Text> : null}
      {items.length ? <Text style={type.heading}>Articles ressemblants</Text> : null}
    </View>
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ListingTile item={item} width={tileWidth} favorited={favoriteIds.has(item.id)} onToggleFavorite={onToggleFavorite} />}
      style={styles.screen}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xxl },
  head: { padding: space.lg, gap: space.md },
  intro: { textAlign: 'center' },
  error: { textAlign: 'center', color: colors.danger },
  box: { gap: space.sm, padding: space.md, borderRadius: 22, borderWidth: 1, borderColor: colors.tintLine, backgroundColor: colors.tint },
  empty: { height: 150, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: 220, borderRadius: 14, backgroundColor: colors.surface },
  row: { paddingHorizontal: space.lg, gap: space.md, marginBottom: 14 },
});
