import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { SvgUri } from 'react-native-svg';
import { canAccessTab } from '../database/auth.repository';
import type { AppUser } from '../types/inventory';
import { AdminPanelScreen } from '../screens/AdminPanelScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { HomeMenuScreen, type HomeMenuCard } from '../screens/HomeMenuScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { EntryScreen, ExitScreen } from '../screens/MovementScreen';
import { PurchaseListScreen } from '../screens/PurchaseListScreen';
import { StockScreen } from '../screens/StockScreen';
import { MotionEntrance, ScreenShell, SectionSurface } from '../components/ui-kit';
import { tokens } from '../theme/tokens';

type RootTabParamList = {
  Home: undefined;
  Admin: undefined;
  Dashboard: undefined;
  PurchaseList: undefined;
  Stock: undefined;
  Items: undefined;
  Entry: undefined;
  Exit: undefined;
  History: undefined;
  NoAccess: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const h2LogoAsset = Asset.fromModule(require('../../assets/logo-2024.svg'));

type TabsProps = {
  currentUser: AppUser;
  onLogout: () => Promise<void> | void;
  onUsersChanged?: () => Promise<void> | void;
};

function NoAccessScreen() {
  return (
    <ScreenShell>
      <View style={styles.noAccessContainer}>
        <MotionEntrance>
          <SectionSurface>
            <View style={styles.noAccessContent}>
              <Text style={styles.noAccessTitle}>Sem abas liberadas</Text>
              <Text style={styles.noAccessText}>
                Sua conta ainda nao tem permissao para visualizar abas do sistema.
              </Text>
            </View>
          </SectionSurface>
        </MotionEntrance>
      </View>
    </ScreenShell>
  );
}

export function Tabs({ currentUser, onLogout, onUsersChanged }: TabsProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const canDashboard = canAccessTab(currentUser, 'dashboard');
  const canStock = canAccessTab(currentUser, 'stock');
  const canItems = canAccessTab(currentUser, 'items');
  const canEntry = canAccessTab(currentUser, 'entry');
  const canExit = canAccessTab(currentUser, 'exit');
  const canHistory = canAccessTab(currentUser, 'history');
  const canAdmin = currentUser.isAdmin;
  const hasAnyAccess = canDashboard || canStock || canItems || canEntry || canExit || canHistory || canAdmin;
  const isCompactHeader = viewportWidth < 430;
  const isTabletHeader = viewportWidth >= 900;
  const logoSize = isCompactHeader
    ? { width: 38, height: 26 }
    : isTabletHeader
      ? { width: 56, height: 38 }
      : { width: 50, height: 34 };

  const initialRouteName: keyof RootTabParamList = hasAnyAccess ? 'Home' : 'NoAccess';

  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName={initialRouteName}
        screenOptions={({ navigation, route }) => ({
          headerTitleAlign: 'left',
          headerStyle: {
            backgroundColor: tokens.colors.accentSoft,
          },
          headerTitleStyle: {
            color: tokens.colors.accentDeep,
            fontWeight: '800',
            fontSize: 18,
          },
          headerShadowVisible: false,
          headerLeft:
            route.name === 'Home' || route.name === 'NoAccess'
              ? undefined
              : () => (
                <Pressable
                  style={({ pressed }) => [styles.menuButton, pressed ? styles.headerButtonPressed : undefined]}
                  onPress={() => {
                    navigation.navigate('Home');
                  }}
                >
                  <Ionicons name="grid-outline" size={16} color={tokens.colors.accentStrong} />
                  <Text style={styles.menuButtonText}>Menu</Text>
                </Pressable>
              ),
          headerRight: () => (
            <View
              style={[
                styles.headerUserActions,
                isCompactHeader ? styles.headerUserActionsCompact : styles.headerUserActionsDefault,
              ]}
            >
              <View style={[styles.headerBrand, isCompactHeader ? styles.headerBrandCompact : undefined]}>
                <SvgUri uri={h2LogoAsset?.uri ?? ''} width={logoSize.width} height={logoSize.height} />
                <Text style={styles.headerBrandText}>{'sports\nbar &\npoker'}</Text>
              </View>
              {canHistory && route.name !== 'History' ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.historyButton,
                    pressed ? styles.headerButtonPressed : undefined,
                  ]}
                  onPress={() => {
                    navigation.navigate('History');
                  }}
                >
                  <Ionicons name="time-outline" size={14} color={tokens.colors.accentStrong} />
                  <Text style={styles.historyButtonText}>Histórico</Text>
                </Pressable>
              ) : null}
              <View style={styles.currentUserBadge}>
                <Ionicons name="person-circle-outline" size={14} color={tokens.colors.accentStrong} />
                <Text style={styles.currentUserText} numberOfLines={1} ellipsizeMode="tail">
                  {currentUser.username}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.logoutButton, pressed ? styles.headerButtonPressed : undefined]}
                onPress={() => {
                  void onLogout();
                }}
              >
                <Text style={styles.logoutButtonText}>Sair</Text>
              </Pressable>
            </View>
          ),
          tabBarStyle: {
            display: 'none',
          },
        })}
      >
        {hasAnyAccess ? (
          <Tab.Screen
            name="Home"
            options={{
              title: 'Menu principal',
            }}
          >
            {({ navigation }) => {
              const cards: HomeMenuCard[] = [];

              if (canEntry) {
                cards.push({
                  key: 'entry',
                  title: 'Entradas',
                  icon: 'cart-outline',
                  onPress: () => navigation.navigate('Entry'),
                });
              }

              if (canExit) {
                cards.push({
                  key: 'exit',
                  title: 'Saídas',
                  icon: 'storefront-outline',
                  onPress: () => navigation.navigate('Exit'),
                });
              }

              if (canItems) {
                cards.push({
                  key: 'items',
                  title: 'Itens',
                  icon: 'briefcase-outline',
                  onPress: () => navigation.navigate('Items'),
                });
              }

              if (canStock) {
                cards.push({
                  key: 'stock',
                  title: 'Estoque',
                  icon: 'cube-outline',
                  onPress: () => navigation.navigate('Stock'),
                });
              }

              if (canDashboard) {
                cards.push({
                  key: 'dashboard',
                  title: 'Dashboard',
                  icon: 'pricetag-outline',
                  onPress: () => navigation.navigate('Dashboard'),
                });
              }

              if (canAdmin) {
                cards.push({
                  key: 'admin',
                  title: 'Painel ADM',
                  icon: 'book-outline',
                  onPress: () => navigation.navigate('Admin'),
                });
              }

              if (canStock) {
                cards.push({
                  key: 'purchase-list',
                  title: 'Lista de compras',
                  icon: 'cart-outline',
                  onPress: () => navigation.navigate('PurchaseList'),
                });
              }

              return <HomeMenuScreen cards={cards} />;
            }}
          </Tab.Screen>

        ) : null}

        {canEntry ? (
          <Tab.Screen name="Entry" options={{ title: 'Entradas' }}>
            {() => <EntryScreen />}
          </Tab.Screen>
        ) : null}

        {canExit ? (
          <Tab.Screen name="Exit" options={{ title: 'Saídas' }}>
            {() => <ExitScreen />}
          </Tab.Screen>
        ) : null}

        {canItems ? (
          <Tab.Screen name="Items" options={{ title: 'Itens' }}>
            {() => <ItemsScreen canImportData={currentUser.isAdmin} />}
          </Tab.Screen>
        ) : null}

        {canStock ? (
          <Tab.Screen name="Stock" options={{ title: 'Estoque' }}>
            {() => <StockScreen />}
          </Tab.Screen>
        ) : null}

        {canDashboard ? (
          <Tab.Screen name="Dashboard" options={{ title: 'Dashboard' }}>
            {() => <DashboardScreen />}
          </Tab.Screen>
        ) : null}

        {canStock ? (
          <Tab.Screen name="PurchaseList" options={{ title: 'Lista de compras' }}>
            {() => <PurchaseListScreen />}
          </Tab.Screen>
        ) : null}

        {canAdmin ? (
          <Tab.Screen name="Admin" options={{ title: 'Painel ADM' }}>
            {() => <AdminPanelScreen currentUser={currentUser} onUsersChanged={onUsersChanged} />}
          </Tab.Screen>
        ) : null}

        {canHistory ? (
          <Tab.Screen name="History" options={{ title: 'Histórico' }}>
            {() => <HistoryScreen canManageHistoryActions={currentUser.isAdmin} />}
          </Tab.Screen>
        ) : null}

        {!hasAnyAccess ? (
          <Tab.Screen name="NoAccess" options={{ title: 'Sem acesso' }}>
            {() => <NoAccessScreen />}
          </Tab.Screen>
        ) : null}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerUserActions: {
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerUserActionsCompact: {
    gap: 6,
    maxWidth: 360,
  },
  headerUserActionsDefault: {
    gap: 8,
    maxWidth: 480,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerBrandCompact: {
    gap: 4,
  },
  headerBrandText: {
    color: tokens.colors.accentStrong,
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  menuButton: {
    marginLeft: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  menuButtonText: {
    color: tokens.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  historyButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  historyButtonText: {
    color: tokens.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  currentUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 140,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    backgroundColor: tokens.colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currentUserText: {
    color: tokens.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  logoutButton: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonPressed: {
    opacity: 0.8,
  },
  logoutButtonText: {
    color: tokens.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  noAccessContent: {
    alignItems: 'center',
    gap: 8,
  },
  noAccessTitle: {
    color: tokens.colors.accentDeep,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  noAccessText: {
    color: tokens.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
