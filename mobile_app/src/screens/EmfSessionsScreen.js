import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, RefreshControl, View } from 'react-native';
import { Button, Card, Chip, Text, ActivityIndicator, SegmentedButtons } from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import { useFocusEffect } from '@react-navigation/native';
import { listEmfSessions } from '../services/api';
import ResponsiveContainer from '../ui/ResponsiveContainer';

export default function EmfSessionsScreen({ navigation }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('future');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listEmfSessions(scope);
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to load EMF sessions', e);
      setError('Unable to load sessions');
      setSessions([]);
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useFocusEffect(useCallback(() => {
    fetchSessions();
  }, [fetchSessions]));

  return (
    <ResponsiveContainer>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSessions} />}
        contentContainerStyle={{ paddingVertical: 16 }}
      >
        <SegmentedButtons
          value={scope}
          onValueChange={setScope}
          style={{ marginBottom: 16 }}
          buttons={[
            { value: 'future', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Button
          mode="contained"
          onPress={() => navigation.navigate('EmfSubmit', { sessions })}
          style={{ marginBottom: 16 }}
        >
          Submit Your Presentation
        </Button>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('EmfManage')}
          style={{ marginBottom: 16 }}
        >
          Manage Existing Submission
        </Button>
        <Text style={{ marginBottom: 12, color: '#475569' }}>
          EMF sessions run the first Tuesday of each month from 1:00–2:30 PM and support up to six 15-minute presentation slots.
        </Text>
        {error ? <Text style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</Text> : null}
        {!sessions.length && !loading ? <Text>No scheduled EMF sessions yet.</Text> : null}
        {sessions.map((session) => {
          let dateLabel = session.session_date;
          try { dateLabel = format(parseISO(session.session_date), 'EEEE, MMM d'); } catch {}
          const remaining = Math.max(0, (session.capacity || 3) - (session.presentations?.length || 0));
          return (
            <Card key={session.id} style={{ marginBottom: 16 }}>
              <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 16, paddingVertical: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                <Text style={{ fontWeight: '600', fontSize: 16 }}>{dateLabel}</Text>
                <Text style={{ color: '#4b5563', marginTop: 4 }}>{`${session.start_time} - ${session.end_time} · ${session.room}`}</Text>
              </View>
              <Card.Content style={{ paddingTop: 12 }}>
                <Text style={{ marginBottom: 8 }}>Slots remaining: {remaining}</Text>
                {(session.presentations || []).length === 0 ? (
                  <Text style={{ color: '#475569' }}>No presenters yet.</Text>
                ) : (
                  <View>
                {(session.presentations || []).map((p) => (
                  <Chip key={p.id} style={{ marginBottom: 6 }} icon="account">
                    {p.slot_label ? `${p.slot_label} · ` : ''}
                    {p.presenter_name}
                    {p.title ? ` – ${p.title}` : ''}
                  </Chip>
                ))}
              </View>
            )}
              </Card.Content>
            </Card>
          );
        })}
        {loading ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
      </ScrollView>
    </ResponsiveContainer>
  );
}
