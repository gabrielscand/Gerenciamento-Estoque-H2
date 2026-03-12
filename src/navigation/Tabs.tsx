import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DailyScreen } from '../screens/DailyScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ItemsScreen } from '../screens/ItemsScreen';

type RootTabParamList = {
  Items: undefined;
  Daily: undefined;
  History: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function Tabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator
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
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
            backgroundColor: '#FAF5FF',
            borderTopColor: '#DDD6FE',
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: '#6D28D9',
          tabBarInactiveTintColor: '#7E22CE',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '700',
          },
        }}
      >
        <Tab.Screen name="Items" component={ItemsScreen} options={{ title: 'Itens' }} />
        <Tab.Screen name="Daily" component={DailyScreen} options={{ title: 'Diario' }} />
        <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'Historico' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
