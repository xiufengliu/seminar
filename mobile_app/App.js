import * as React from 'react';
import { Provider as PaperProvider, MD3LightTheme as DefaultTheme } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CalendarStack from './src/navigation/CalendarStack';
import AdminStack from './src/navigation/AdminStack';
import RequestsStack from './src/navigation/RequestsStack';
import { AuthProvider } from './src/context/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

export default function App() {
  const theme = {
    ...DefaultTheme,
    roundness: 8,
    colors: {
      ...DefaultTheme.colors,
      primary: '#6b21a8',
      secondary: '#2c3e50',
    },
  };
  return (
    <PaperProvider theme={theme}>
      <AuthProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => {
                let iconName = 'circle-outline';
                if (route.name === 'Calendar') {
                  iconName = focused ? 'calendar-month' : 'calendar-month-outline';
                } else if (route.name === 'Requests') {
                  iconName = focused ? 'book-edit' : 'book-edit-outline';
                } else if (route.name === 'Admin') {
                  iconName = focused ? 'account-group' : 'account-group-outline';
                }
                return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
              },
              tabBarActiveTintColor: theme.colors.primary,
              tabBarInactiveTintColor: '#6b7280',
            })}
          >
            <Tab.Screen name="Calendar" component={CalendarStack} options={{ title: 'Calendar' }} />
            <Tab.Screen name="Requests" component={RequestsStack} options={{ title: 'Requests' }} />
            <Tab.Screen name="Admin" component={AdminStack} options={{ title: 'Admin' }} />
          </Tab.Navigator>
        </NavigationContainer>
      </AuthProvider>
    </PaperProvider>
  );
}
