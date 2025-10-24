import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CalendarScreen from '../screens/CalendarScreen';
import SeminarDetailScreen from '../screens/SeminarDetailScreen';

const Stack = createNativeStackNavigator();

export default function CalendarStack(){
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#6b21a8' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Stack.Screen name="CalendarHome" component={CalendarScreen} options={{ title: 'Seminars' }} />
      <Stack.Screen name="SeminarDetail" component={SeminarDetailScreen} options={{ title: 'Seminar' }} />
    </Stack.Navigator>
  )
}
