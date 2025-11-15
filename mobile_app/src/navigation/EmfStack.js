import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EmfSessionsScreen from '../screens/EmfSessionsScreen';
import EmfSubmitScreen from '../screens/EmfSubmitScreen';
import EmfManageScreen from '../screens/EmfManageScreen';

const Stack = createNativeStackNavigator();

export default function EmfStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Stack.Screen name="EmfSessions" component={EmfSessionsScreen} options={{ title: 'EMF Presentations' }} />
      <Stack.Screen name="EmfSubmit" component={EmfSubmitScreen} options={{ title: 'Submit Presentation' }} />
      <Stack.Screen name="EmfManage" component={EmfManageScreen} options={{ title: 'Manage Presentation' }} />
    </Stack.Navigator>
  );
}
