import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { EntryScreen, ExitScreen } from '../screens/MovementScreen';
import { StockScreen } from '../screens/StockScreen';

type RootTabParamList = {
  Dashboard: undefined;
  Stock: undefined;
  Items: undefined;
  Entry: undefined;
  Exit: undefined;
  History: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabLabel({ focused, title }: { focused: boolean; title: string }) {
  return (
    <View style={[styles.labelContainer, focused ? styles.labelContainerActive : undefined]}>
      <View style={[styles.indicator, focused ? styles.indicatorActive : undefined]} />
      <Text style={[styles.labelText, focused ? styles.labelTextActive : undefined]}>{title}</Text>
    </View>
  );
}

export function Tabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Stock"
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
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            title: 'Dashboard',
            tabBarLabel: ({ focused }) => <TabLabel focused={focused} title="Dashboard" />,
          }}
        />
        <Tab.Screen
          name="Stock"
          component={StockScreen}
          options={{
            title: 'Estoque',
            tabBarLabel: ({ focused }) => <TabLabel focused={focused} title="Estoque" />,
          }}
        />
        <Tab.Screen
          name="Items"
          component={ItemsScreen}
          options={{
            title: 'Itens',
            tabBarLabel: ({ focused }) => <TabLabel focused={focused} title="Itens" />,
          }}
        />
        <Tab.Screen
          name="Entry"
          component={EntryScreen}
          options={{
            title: 'Entrada',
            tabBarLabel: ({ focused }) => <TabLabel focused={focused} title="Entrada" />,
          }}
        />
        <Tab.Screen
          name="Exit"
          component={ExitScreen}
          options={{
            title: 'Saida',
            tabBarLabel: ({ focused }) => <TabLabel focused={focused} title="Saida" />,
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            title: 'Historico',
            tabBarLabel: ({ focused }) => <TabLabel focused={focused} title="Historico" />,
          }}
        />
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
});
