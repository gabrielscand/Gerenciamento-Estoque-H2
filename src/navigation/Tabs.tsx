import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { canAccessTab } from '../database/auth.repository';
import type { AppUser, AppTabPermissionKey } from '../types/inventory';
import { AdminPanelScreen } from '../screens/AdminPanelScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { EntryScreen, ExitScreen } from '../screens/MovementScreen';
import { StockScreen } from '../screens/StockScreen';
import { MotionEntrance, ScreenShell, SectionSurface } from '../components/ui-kit';
import { tokens } from '../theme/tokens';

type RootTabParamList = {
  Admin: undefined;
  Dashboard: undefined;
  Stock: undefined;
  Items: undefined;
  Entry: undefined;
  Exit: undefined;
  History: undefined;
  NoAccess: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

type TabsProps = {
  currentUser: AppUser;
  onLogout: () => Promise<void> | void;
  onUsersChanged?: () => Promise<void> | void;
};

type ScreenConfig = {
  name: keyof RootTabParamList;
  title: string;
  permission?: AppTabPermissionKey;
  render: () => ReactNode;
};

function getTabIcon(tabName: string): keyof typeof Ionicons.glyphMap {
  if (tabName === 'Painel ADM') {
    return 'shield-checkmark-outline';
  }
  if (tabName === 'Dashboard') {
    return 'grid-outline';
  }
  if (tabName === 'Estoque') {
    return 'cube-outline';
  }
  if (tabName === 'Itens') {
    return 'albums-outline';
  }
  if (tabName === 'Entrada') {
    return 'arrow-down-circle-outline';
  }
  if (tabName === 'Saida') {
    return 'arrow-up-circle-outline';
  }
  if (tabName === 'Historico') {
    return 'time-outline';
  }

  return 'ellipse-outline';
}

function TabLabel({ focused, title }: { focused: boolean; title: string }) {
  const icon = getTabIcon(title);

  if (focused) {
    return (
      <LinearGradient
        colors={[tokens.colors.accentStrong, tokens.colors.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tabLabelActive}
      >
        <View style={styles.tabLabelIndicator} />
        <Ionicons name={icon} size={17} color={tokens.colors.white} />
        <Text style={styles.tabLabelTextActive}>{title}</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.tabLabelIdle}>
      <Ionicons name={icon} size={16} color={tokens.colors.accent} />
      <Text style={styles.tabLabelTextIdle}>{title}</Text>
    </View>
  );
}

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
  const screenConfigs: ScreenConfig[] = [];

  if (currentUser.isAdmin) {
    screenConfigs.push({
      name: 'Admin',
      title: 'Painel ADM',
      render: () => (
        <AdminPanelScreen
          currentUser={currentUser}
          onUsersChanged={onUsersChanged}
        />
      ),
    });
  }

  const operationalScreens: ScreenConfig[] = [
    {
      name: 'Dashboard',
      title: 'Dashboard',
      permission: 'dashboard',
      render: () => <DashboardScreen />,
    },
    {
      name: 'Stock',
      title: 'Estoque',
      permission: 'stock',
      render: () => <StockScreen />,
    },
    {
      name: 'Items',
      title: 'Itens',
      permission: 'items',
      render: () => <ItemsScreen />,
    },
    {
      name: 'Entry',
      title: 'Entrada',
      permission: 'entry',
      render: () => <EntryScreen />,
    },
    {
      name: 'Exit',
      title: 'Saida',
      permission: 'exit',
      render: () => <ExitScreen />,
    },
    {
      name: 'History',
      title: 'Historico',
      permission: 'history',
      render: () => <HistoryScreen canManageHistoryActions={currentUser.isAdmin} />,
    },
  ];

  for (const config of operationalScreens) {
    if (config.permission && canAccessTab(currentUser, config.permission)) {
      screenConfigs.push(config);
    }
  }

  if (screenConfigs.length === 0) {
    screenConfigs.push({
      name: 'NoAccess',
      title: 'Sem acesso',
      render: () => <NoAccessScreen />,
    });
  }

  const initialRouteName = screenConfigs[0]?.name ?? 'NoAccess';

  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName={initialRouteName}
        screenOptions={{
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
          headerRight: () => (
            <View style={styles.headerUserActions}>
              <View style={styles.currentUserBadge}>
                <Ionicons name="person-circle-outline" size={14} color={tokens.colors.accentStrong} />
                <Text
                  style={styles.currentUserText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {currentUser.username}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.logoutButton, pressed ? styles.logoutButtonPressed : undefined]}
                onPress={() => {
                  void onLogout();
                }}
              >
                <Text style={styles.logoutButtonText}>Sair</Text>
              </Pressable>
            </View>
          ),
          tabBarStyle: {
            height: 88,
            paddingTop: 10,
            paddingBottom: 12,
            paddingHorizontal: 12,
            backgroundColor: tokens.colors.surface,
            borderTopColor: tokens.colors.borderSoft,
            borderTopWidth: 1,
          },
          tabBarItemStyle: {
            marginHorizontal: 3,
            borderRadius: tokens.radius.lg,
          },
          tabBarShowLabel: true,
          tabBarIcon: () => null,
          tabBarLabel: ({ focused, children }) => (
            <TabLabel focused={focused} title={String(children)} />
          ),
        }}
      >
        {screenConfigs.map((screen) => (
          <Tab.Screen
            key={screen.name}
            name={screen.name}
            options={{
              title: screen.title,
              tabBarLabel: ({ focused }) => <TabLabel focused={focused} title={screen.title} />,
            }}
          >
            {() => screen.render()}
          </Tab.Screen>
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerUserActions: {
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 260,
  },
  currentUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 140,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    backgroundColor: '#f7f0fc',
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
  logoutButtonPressed: {
    opacity: 0.8,
  },
  logoutButtonText: {
    color: tokens.colors.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  tabLabelActive: {
    minWidth: 74,
    minHeight: 50,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabelIndicator: {
    width: 20,
    height: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  tabLabelTextActive: {
    color: tokens.colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  tabLabelIdle: {
    minWidth: 72,
    minHeight: 48,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.borderSoft,
    backgroundColor: '#f8f2fd',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
  },
  tabLabelTextIdle: {
    color: tokens.colors.accent,
    fontSize: 11,
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
