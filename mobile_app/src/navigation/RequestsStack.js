import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NewRequestScreen from '../screens/NewRequestScreen';

const Stack = createNativeStackNavigator();

export default function RequestsStack(){
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#6b21a8' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Stack.Screen name="NewRequest" component={NewRequestScreen} options={{ title: 'Request Seminar' }} />
    </Stack.Navigator>
  )
}
