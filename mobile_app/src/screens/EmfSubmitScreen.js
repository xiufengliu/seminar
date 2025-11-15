import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Divider, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import { listEmfSessions, submitEmfPresentation } from '../services/api';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import { EMF_SLOT_OPTIONS } from '../ui/emfSlots';

export default function EmfSubmitScreen({ route, navigation }) {
  const initialSessions = route?.params?.sessions || [];
  const [sessions, setSessions] = useState(initialSessions);
  const initialSelected = route?.params?.selectedSessionId ? Number(route?.params?.selectedSessionId) : (initialSessions[0]?.id || null);
  const [selectedSessionId, setSelectedSessionId] = useState(initialSelected);
  const [form, setForm] = useState({ presenter_name: '', presenter_email: '', title: '', abstract: '', preferred_slot: 'slot1' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialSessions.length) return;
    const load = async () => {
      try {
        const data = await listEmfSessions();
        setSessions(data);
        if (data?.length) {
          setSelectedSessionId((prev) => (prev ? prev : data[0].id));
        }
      } catch (e) {
        console.warn('Unable to load EMF sessions', e);
        setError('Unable to load sessions');
      }
    };
    load();
  }, []);

  const onSubmit = async () => {
    if (!form.presenter_name || !form.presenter_email || !form.title) {
      setError('Name, email, and title are required.');
      return;
    }
    if (!selectedSessionId) {
      setError('Please pick a session.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = { ...form, session_id: selectedSessionId };
      const res = await submitEmfPresentation(payload);
      setResult(res?.presentation || null);
      setForm({ presenter_name: '', presenter_email: '', title: '', abstract: '', preferred_slot: 'slot1' });
    } catch (e) {
      console.warn('submit presentation failed', e?.response?.data || e.message);
      const apiError = e?.response?.data?.error || e.message;
      setError(apiError || 'Unable to submit presentation.');
    }
    setSubmitting(false);
  };

  return (
    <ResponsiveContainer>
      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        {result ? (
          <View style={{ padding: 16, borderRadius: 8, backgroundColor: '#dcfce7', marginBottom: 20 }}>
            <Text variant="titleMedium" style={{ marginBottom: 6 }}>Submission Received!</Text>
            <Text style={{ marginBottom: 4 }}>We emailed the organizers. You can return later and manage this submission using the email {result.presenter_email || 'you provided'}.</Text>
          </View>
        ) : null}
        {error ? <Text style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</Text> : null}
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Choose Session</Text>
        <RadioButton.Group onValueChange={(value) => setSelectedSessionId(Number(value))} value={selectedSessionId?.toString() || ''}>
          {(sessions || []).map((session) => (
            <RadioButton.Item
              key={session.id}
              value={session.id.toString()}
              label={`${(() => { try { return format(parseISO(session.session_date), 'EEE, MMM d'); } catch { return session.session_date; } })()} • ${session.start_time} - ${session.end_time}`}
            />
          ))}
        </RadioButton.Group>
        {!sessions.length ? <HelperText type="info">No sessions available yet. The organizer will add one shortly.</HelperText> : null}

        <Divider style={{ marginVertical: 16 }} />

        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Presenter Info</Text>
        <TextInput label="Full Name" value={form.presenter_name} onChangeText={(v) => setForm({ ...form, presenter_name: v })} style={{ marginBottom: 12 }} />
        <TextInput label="Email" keyboardType="email-address" autoCapitalize="none" value={form.presenter_email} onChangeText={(v) => setForm({ ...form, presenter_email: v })} style={{ marginBottom: 12 }} />
        <TextInput label="Presentation Title" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} style={{ marginBottom: 12 }} />
        <TextInput label="Abstract / Notes" value={form.abstract} onChangeText={(v) => setForm({ ...form, abstract: v })} multiline style={{ marginBottom: 12 }} />

        <Text variant="titleMedium" style={{ marginBottom: 4 }}>Preferred Slot</Text>
        <RadioButton.Group onValueChange={(value) => setForm({ ...form, preferred_slot: value })} value={form.preferred_slot}>
          {EMF_SLOT_OPTIONS.map(opt => (
            <RadioButton.Item key={opt.key} value={opt.key} label={opt.label} />
          ))}
        </RadioButton.Group>

        <Button mode="contained" onPress={onSubmit} loading={submitting} disabled={submitting} style={{ marginTop: 12 }}>
          Submit Presentation
        </Button>
      </ScrollView>
    </ResponsiveContainer>
  );
}
