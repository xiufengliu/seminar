import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton } from 'react-native-paper';
import AdminLoginScreen from '../screens/AdminLoginScreen';
import ManageSeminarsScreen from '../screens/ManageSeminarsScreen';
import PendingRequestsScreen from '../screens/PendingRequestsScreen';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const Stack = createNativeStackNavigator();

function LogoutButton() {
  const { logout } = useAuth();
  const navigation = useNavigation();
  
  const handleLogout = async () => {
    await logout();
    navigation.navigate('AdminLogin');
  };
  
  return (
    <IconButton
      icon="logout"
      iconColor="#fff"
      size={24}
      onPress={handleLogout}
      style={{ marginRight: 8 }}
    />
  );
}

export default function AdminStack(){
  const { isAdmin } = useAuth();
  
  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: '#6b21a8' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600', fontSize: 18 },
        headerRight: isAdmin ? () => <LogoutButton /> : undefined,
      })}
    >
      {!isAdmin ? (
        <Stack.Screen name="AdminLogin" component={AdminLoginScreen} options={{ title: 'Admin Login', headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="ManageSeminars" component={ManageSeminarsScreen} options={{ title: 'Manage Seminars' }} />
          <Stack.Screen name="PendingRequests" component={PendingRequestsScreen} options={{ title: 'Pending Requests' }} />
        </>
      )}
    </Stack.Navigator>
  )
}
