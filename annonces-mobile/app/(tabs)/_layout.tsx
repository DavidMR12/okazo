import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View, type ColorValue } from 'react-native';
import { Text } from '../../src/components/Typography';
import { BRAND_NAME } from '../../src/brand';
import { useCartIds, useUnreadCount } from '../../src/api/hooks';
import { PublishTabButton } from '../../src/components/PublishTabButton';
import { colors, FONT } from '../../src/theme';
import { PillTitle } from '../../src/components/Blocks';

// Titre centré dans un ovale (« Mon panier », « Messages », « Mon compte » : demande du porteur, 20 octobre 2026)
const pillHeader = (text: string) => ({ headerTitle: () => <PillTitle text={text} />, headerTitleAlign: 'center' as const });

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName, active: IconName) =>
  function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : name} size={size} color={color} />;
  };

// Libellé d'onglet ; l'onglet actif est souligné d'un trait bleu (maquette du porteur, 18 octobre 2026)
const label = (text: string) =>
  function TabLabel({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontWeight: focused ? '600' : '500', color }}>{text}</Text>
        <View style={{ height: 3, width: 44, marginTop: 3, borderRadius: 2, backgroundColor: focused ? colors.primary : 'transparent' }} />
      </View>
    );
  };

export default function TabsLayout() {
  const unread = useUnreadCount();
  const cartCount = useCartIds().size;
  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: colors.bg }, // fond blanc des écrans (gris par défaut)
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 12, fontFamily: FONT },
        tabBarStyle: { height: 70, paddingTop: 6, borderTopColor: colors.line },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: FONT, fontSize: 20, color: colors.ink },
      }}
    >
      {/* L'accueil dessine son propre en-tête (nom, lieu, notifications) */}
      <Tabs.Screen name="index" options={{ title: BRAND_NAME, headerShown: false, tabBarLabel: label('Accueil'), tabBarIcon: icon('home-outline', 'home') }} />
      {/* Le panier remplace les favoris (les favoris sont dans Compte) */}
      <Tabs.Screen name="cart" options={{ title: 'Mon panier', ...pillHeader('Mon panier'), tabBarLabel: label('Panier'), tabBarIcon: icon('cart-outline', 'cart'), tabBarBadge: cartCount || undefined }} />
      {/* Gros bouton rond bleu « + » au centre */}
      <Tabs.Screen
        name="publish"
        options={{
          title: 'Publier une annonce',
          tabBarLabel: 'Publier',
          tabBarButton: (props) => <PublishTabButton onPress={props.onPress ?? undefined} focused={props['aria-selected'] ?? false} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', ...pillHeader('Messages'), tabBarLabel: label('Messages'), tabBarIcon: icon('chatbubble-outline', 'chatbubble'), tabBarBadge: unread.data ? unread.data : undefined }}
      />
      <Tabs.Screen name="account" options={{ title: 'Mon compte', ...pillHeader('Mon compte'), tabBarLabel: label('Profil'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
