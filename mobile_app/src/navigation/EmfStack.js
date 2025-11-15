import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HeaderBackButton } from '@react-navigation/elements';
import EmfSessionsScreen from '../screens/EmfSessionsScreen';
import EmfSubmitScreen from '../screens/EmfSubmitScreen';
import EmfManageScreen from '../screens/EmfManageScreen';

const Stack = createNativeStackNavigator();

export default function EmfStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#6b21a8' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
      }}
    >
      <Stack.Screen name="EmfSessions" component={EmfSessionsScreen} options={{ title: 'EMF Presentations' }} />
      <Stack.Screen
        name="EmfSubmit"
        component={EmfSubmitScreen}
        options={({ navigation }) => ({
          title: 'Submit Presentation',
          headerLeft: (props) => (
            <HeaderBackButton
              {...props}
              label="Back to EMF Presentations"
              onPress={() => navigation.navigate('EmfSessions')}
            />
          ),
        })}
      />
      <Stack.Screen
        name="EmfManage"
        component={EmfManageScreen}
        options={({ navigation }) => ({
          title: 'Manage Presentation',
          headerLeft: (props) => (
            <HeaderBackButton
              {...props}
              label="Back to EMF Presentations"
              onPress={() => navigation.navigate('EmfSessions')}
            />
          ),
        })}
      />
    </Stack.Navigator>
  );
}
