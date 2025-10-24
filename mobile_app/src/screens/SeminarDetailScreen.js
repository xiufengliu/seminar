import React, { useMemo, useState } from 'react';
import { ScrollView, View, Image } from 'react-native';
import { Text, Button, Divider, Dialog, Portal, TextInput, Card, Chip } from 'react-native-paper';
import { inviteSeminar } from '../services/api';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import useBreakpoints from '../ui/useBreakpoints';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

function avatarUrl(name, email, size=128){
  const base = 'https://ui-avatars.com/api/';
  const params = new URLSearchParams({
    name: (name || email || 'Speaker'),
    size: String(size),
    background: '6b21a8',
    color: 'fff',
    bold: 'true',
  });
  return `${base}?${params.toString()}`;
}

export default function SeminarDetailScreen({ route }){
  const { seminar, fromCalendar } = route.params;
  const { isMd } = useBreakpoints();
  const { isAdmin } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);

  const onInvite = () => {
    setInviteOpen(true);
  };

  const isValidEmail = (email) => /.+@.+\..+/.test(String(email).trim());

  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!isValidEmail(email)) { alert('Please enter a valid email address'); return; }
    setSending(true);
    try {
      await inviteSeminar(seminar.id, [email]);
      alert('Invitation sent');
      setInviteOpen(false);
      setInviteEmail('');
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setSending(false);
    }
  };

  const showInvite = useMemo(() => {
    if (fromCalendar) return false;
    if (!isAdmin) return false;
    try {
      const now = new Date();
      const endStr = seminar.end_time || seminar.start_time || '23:59:59';
      const dt = new Date(`${seminar.date}T${endStr}`);
      return dt.getTime() >= now.getTime();
    } catch {
      return false;
    }
  }, [fromCalendar, isAdmin, seminar.date, seminar.start_time, seminar.end_time]);

  const runtimeBase = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? `${window.location.origin}/api`
    : API_BASE_URL;
  const avatar = seminar.speaker_photo
    ? `${runtimeBase.replace(/\/$/, '')}${seminar.speaker_photo.startsWith('/') ? '' : '/'}${seminar.speaker_photo}`
    : avatarUrl(seminar.speaker_name, seminar.speaker_email, 128);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f5f5f5' }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
      {/* Header Background - Deep Purple */}
      <View style={{ backgroundColor: '#6b21a8', paddingTop: 24, paddingBottom: 40, paddingHorizontal: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 12 }}>{seminar.topic}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Chip icon="calendar" mode="flat" textStyle={{ color: '#fff' }} style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
            {seminar.date}
          </Chip>
          <Chip icon="clock-outline" mode="flat" textStyle={{ color: '#fff' }} style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
            {seminar.start_time}
          </Chip>
        </View>
      </View>

      <ResponsiveContainer style={{ marginTop: -10 }}>
        {/* Speaker Card */}
        <Card style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden', elevation: 4 }}>
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Image source={{ uri: avatar }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 16 }} />
            <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>{seminar.speaker_name}</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, textAlign: 'center' }}>{seminar.speaker_email}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Chip icon="map-marker" style={{ backgroundColor: '#f3f4f6' }}>
                {seminar.room}
              </Chip>
              <Chip icon="label" style={{ backgroundColor: '#f3f4f6' }}>
                {seminar.seminar_type || 'Others'}
              </Chip>
            </View>
          </View>
        </Card>

        {/* Time & Location */}
        <Card style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 16 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20 }}>🕐</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Time</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{seminar.start_time} - {seminar.end_time}</Text>
                </View>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#ede9fe', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20 }}>📍</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>Room</Text>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{seminar.room}</Text>
                </View>
              </View>
            </View>
          </View>
        </Card>

        {/* Speaker Bio */}
        {seminar.speaker_bio ? (
          <Card style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden' }}>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Speaker Bio</Text>
              <Text style={{ fontSize: 14, color: '#334155', lineHeight: 22 }}>{seminar.speaker_bio}</Text>
            </View>
          </Card>
        ) : null}

        {/* Abstract */}
        {seminar.abstract ? (
          <Card style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden' }}>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Abstract</Text>
              <Text style={{ fontSize: 14, color: '#334155', lineHeight: 22 }}>{seminar.abstract}</Text>
            </View>
          </Card>
        ) : null}

        {/* Invitation Button */}
        {showInvite ? (
          <View style={{ marginBottom: 20 }}>
            <Button mode="contained" onPress={onInvite} contentStyle={{ height: 48, borderRadius: 8 }} style={{ borderRadius: 8 }}>
              Send Invitation
            </Button>
            <Portal>
              <Dialog visible={inviteOpen} onDismiss={() => setInviteOpen(false)} style={{ maxWidth: 520, alignSelf: 'center', width: '100%', borderRadius: 8 }}>
                <Dialog.Title>Send Calendar Invitation</Dialog.Title>
                <Dialog.Content>
                  <TextInput
                    mode="outlined"
                    label="Recipient Email"
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </Dialog.Content>
                <Dialog.Actions>
                  <Button onPress={() => setInviteOpen(false)}>Cancel</Button>
                  <Button mode="contained" onPress={sendInvite} loading={sending} disabled={sending}>Send</Button>
                </Dialog.Actions>
              </Dialog>
            </Portal>
          </View>
        ) : null}
      </ResponsiveContainer>
    </ScrollView>
  )
}
