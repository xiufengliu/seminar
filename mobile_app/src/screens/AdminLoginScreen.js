import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { TextInput, Button, Text, Card } from 'react-native-paper';
import { login } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ResponsiveContainer from '../ui/ResponsiveContainer';

export default function AdminLoginScreen({ navigation }){
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { isAdmin, setIsAdmin } = useAuth();

  // If already authenticated (from persisted state), redirect to PendingRequests
  useEffect(() => {
    if (isAdmin) {
      navigation.replace('PendingRequests');
    }
  }, [isAdmin, navigation]);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await login(username, password);
      // Persist bearer token as fallback for cross-origin dev
      try { if (res?.token && typeof window !== 'undefined' && window.localStorage) { window.localStorage.setItem('admin_token', res.token); } } catch {}
      // Server also sets HttpOnly cookie; mark admin true locally
      setIsAdmin(true);
      navigation.replace('PendingRequests');
    }
    catch(e){ alert('Invalid credentials'); }
    setBusy(false);
  };
  const goToSeminarList = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent && typeof parent.navigate === 'function') {
        parent.navigate('Calendar', { screen: 'CalendarHome' });
      } else {
        // Fallback: try navigating within current stack
        navigation.navigate('CalendarHome');
      }
    } catch {}
  };
  return (
    <ResponsiveContainer>
      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Card style={{ width: '100%', maxWidth: 520, padding: 16 }}>
          <Text variant="headlineSmall">Admin Login</Text>
          <TextInput mode="outlined" label="Username" value={username} onChangeText={setUsername} style={{ marginTop: 16 }} />
          <TextInput mode="outlined" label="Password" value={password} onChangeText={setPassword} secureTextEntry style={{ marginTop: 12 }} />
          <Button mode="contained" onPress={submit} loading={busy} disabled={busy} style={{ marginTop: 16 }} contentStyle={{ height: 48 }}>Login</Button>
          <Button onPress={goToSeminarList} style={{ marginTop: 8 }}>Return to Seminar List</Button>
        </Card>
      </View>
    </ResponsiveContainer>
  );
}
