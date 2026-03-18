import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { canAccessTab } from '../database/auth.repository';
import type { AppUser, AppTabPermissionKey } from '../types/inventory';
import { AdminPanelScreen } from '../screens/AdminPanelScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { EntryScreen, ExitScreen } from '../screens/MovementScreen';
import { StockScreen } from '../screens/StockScreen';

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

function TabLabel({ focused, title }: { focused: boolean; title: string }) {
  return (
    <View style={[styles.labelContainer, focused ? styles.labelContainerActive : undefined]}>
      <View style={[styles.indicator, focused ? styles.indicatorActive : undefined]} />
      <Text style={[styles.labelText, focused ? styles.labelTextActive : undefined]}>{title}</Text>
    </View>
  );
}

function NoAccessScreen() {
  return (
    <View style={styles.noAccessContainer}>
      <Text style={styles.noAccessTitle}>Sem abas liberadas</Text>
      <Text style={styles.noAccessText}>
        Sua conta ainda nao tem permissao para visualizar abas do sistema.
      </Text>
    </View>
  );
}

type ScreenConfig = {
  name: keyof RootTabParamList;
  title: string;
  permission?: AppTabPermissionKey;
  render: () => ReactNode;
};

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
          headerTitleAlign: 'center',
          headerStyle: {
            backgroundColor: '#F5F3FF',
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            color: '#4C1D95',
          },
          tabBarStyle: {
            height: 82,
            paddingBottom: 12,
            paddingTop: 12,
            paddingHorizontal: 12,
            backgroundColor: '#F3E8FF',
            borderTopColor: '#E9D5FF',
            borderTopWidth: 1,
          },
          tabBarItemStyle: {
            borderRadius: 16,
            marginHorizontal: 4,
          },
          tabBarIcon: () => null,
          tabBarShowLabel: true,
          tabBarLabel: ({ focused, children }) => (
            <TabLabel focused={focused} title={String(children)} />
          ),
          headerRight: () => (
            <View style={styles.headerUserActions}>
              <View style={styles.currentUserBadge}>
                <Text
                  style={styles.currentUserText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Usuario: {currentUser.username}
                </Text>
              </View>
              <Pressable
                style={styles.logoutButton}
                onPress={() => {
                  void onLogout();
                }}
              >
                <Text style={styles.logoutButtonText}>Sair</Text>
              </Pressable>
            </View>
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
  labelContainer: {
    minWidth: 68,
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 4,
  },
  labelContainerActive: {
    backgroundColor: '#6D28D9',
    borderColor: '#5B21B6',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 3,
  },
  indicator: {
    width: 16,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: '#DDD6FE',
  },
  labelText: {
    color: '#6D28D9',
    fontSize: 11,
    fontWeight: '700',
  },
  labelTextActive: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  logoutButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  logoutButtonText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '700',
  },
  headerUserActions: {
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 250,
  },
  currentUserBadge: {
    maxWidth: 160,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currentUserText: {
    color: '#5B21B6',
    fontSize: 12,
    fontWeight: '700',
  },
  noAccessContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: '#F5F3FF',
  },
  noAccessTitle: {
    color: '#4C1D95',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  noAccessText: {
    color: '#6D28D9',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
