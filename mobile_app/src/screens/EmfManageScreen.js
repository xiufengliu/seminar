import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Divider, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';
import { format, parseISO } from 'date-fns';
import { listEmfSessions, lookupEmfPresentation, updateEmfPresentation, deleteEmfPresentation } from '../services/api';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import { EMF_SLOT_OPTIONS } from '../ui/emfSlots';

export default function EmfManageScreen() {
  const [accessCode, setAccessCode] = useState('');
  const [email, setEmail] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [presentation, setPresentation] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedPresentationId, setSelectedPresentationId] = useState(null);
  const [form, setForm] = useState({ presenter_name: '', presenter_email: '', title: '', abstract: '', preferred_slot: 'slot1' });
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteState, setDeleteState] = useState({ loading: false, error: '' });
  const [superMode, setSuperMode] = useState(false);
  const [superPresentations, setSuperPresentations] = useState([]);

  const loadSessions = async () => {
    try {
      const data = await listEmfSessions();
      setSessions(data);
    } catch (e) {
      console.warn('Unable to load sessions', e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const onLookup = async () => {
    if (!accessCode) {
      setLookupError('Please enter your access code.');
      return;
    }
    setLookupError('');
    setLoading(true);
    try {
      const res = await lookupEmfPresentation(accessCode.trim(), email.trim());
      if (Array.isArray(res.presentations)) {
        setSuperMode(true);
        setSuperPresentations(res.presentations);
        setPresentation(null);
        setSelectedPresentationId(null);
        setSelectedSessionId(null);
        setForm({ presenter_name: '', presenter_email: '', title: '', abstract: '', preferred_slot: 'slot1' });
        setSuccessMessage('Super access granted. Select a presentation below to manage.');
      } else if (res.presentation) {
        const pres = res.presentation;
        setSuperMode(!!res.super);
        setSuperPresentations([]);
        setPresentation(pres);
        setSelectedPresentationId(pres.id);
        setSelectedSessionId(pres.session_id);
        setForm({
          presenter_name: pres.presenter_name,
          presenter_email: pres.presenter_email,
          title: pres.title,
          abstract: pres.abstract || '',
          preferred_slot: pres.preferred_slot || 'slot1',
        });
        setSuccessMessage('');
      }
    } catch (e) {
      console.warn('lookup failed', e?.response?.data || e.message);
      setPresentation(null);
      const apiError = e?.response?.data?.error || 'Unable to find presentation with that access code.';
      setLookupError(apiError);
      setSuperMode(false);
      setSuperPresentations([]);
    }
    setLoading(false);
  };

  const handleSuperSelect = (id) => {
    const record = superPresentations.find((p) => p.id === Number(id));
    if (!record) return;
    setPresentation(record);
    setSelectedPresentationId(record.id);
    setSelectedSessionId(record.session_id);
    setForm({
      presenter_name: record.presenter_name,
      presenter_email: record.presenter_email,
      title: record.title,
      abstract: record.abstract || '',
      preferred_slot: record.preferred_slot || 'slot1',
    });
    setSuccessMessage('Loaded presentation. You can now edit or delete it.');
  };

  const onSave = async () => {
    if (!presentation) return;
    setLoading(true);
    setSuccessMessage('');
    try {
      const payload = {
        ...form,
        session_id: selectedSessionId,
        manage_token: accessCode,
      };
      const res = await updateEmfPresentation(presentation.id, payload);
      const updated = res.presentation;
      setPresentation(updated);
      setSelectedSessionId(updated.session_id);
      setForm({
        presenter_name: updated.presenter_name,
        presenter_email: updated.presenter_email,
        title: updated.title,
        abstract: updated.abstract || '',
        preferred_slot: updated.preferred_slot || 'slot1',
      });
      setSuccessMessage('Presentation updated.');
    } catch (e) {
      const apiError = e?.response?.data?.error || e.message;
      setLookupError(apiError);
    }
    setLoading(false);
  };

  const onDelete = async () => {
    if (!presentation) return;
    setDeleteState({ loading: true, error: '' });
    try {
      await deleteEmfPresentation(presentation.id, { manage_token: accessCode });
      setSuccessMessage('Presentation deleted.');
      if (superMode) {
        setSuperPresentations(prev => prev.filter(p => p.id !== presentation.id));
      }
      setPresentation(null);
      setSelectedPresentationId(null);
      setSelectedSessionId(null);
      setForm({ presenter_name: '', presenter_email: '', title: '', abstract: '', preferred_slot: 'slot1' });
    } catch (e) {
      const apiError = e?.response?.data?.error || e.message;
      setDeleteState({ loading: false, error: apiError });
      return;
    }
    setDeleteState({ loading: false, error: '' });
  };

  return (
    <ResponsiveContainer>
      <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Manage Submission</Text>
        <Text style={{ marginBottom: 12, color: '#475569' }}>Enter the access code you received after submitting your presentation. Optionally add your email for verification.</Text>
        <TextInput label="Access Code" value={accessCode} onChangeText={setAccessCode} autoCapitalize="characters" style={{ marginBottom: 12 }} />
        <TextInput label="Email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={{ marginBottom: 12 }} />
        {lookupError ? <Text style={{ color: '#b91c1c', marginBottom: 12 }}>{lookupError}</Text> : null}
        <Button mode="contained" onPress={onLookup} loading={loading} disabled={loading}>
          Lookup Presentation
        </Button>

        {superMode ? (
          <View style={{ marginTop: 24 }}>
            <Divider style={{ marginBottom: 16 }} />
            {successMessage ? <Text style={{ color: '#166534', marginBottom: 12 }}>{successMessage}</Text> : null}
            <Text variant="titleMedium" style={{ marginBottom: 8 }}>Select a Presentation</Text>
            <RadioButton.Group onValueChange={(value) => handleSuperSelect(Number(value))} value={selectedPresentationId?.toString() || ''}>
              {superPresentations.length === 0 ? (
                <HelperText type="info">No presentations available.</HelperText>
              ) : (
                superPresentations.map((p) => (
                  <RadioButton.Item
                    key={p.id}
                    value={p.id.toString()}
                    label={`${p.presenter_name} • ${p.title} (${(() => { try { return format(parseISO(p.session_date), 'MMM d'); } catch { return p.session_date; } })()})`}
                  />
                ))
              )}
            </RadioButton.Group>
          </View>
        ) : null}

        {presentation ? (
          <View style={{ marginTop: 24 }}>
            <Divider style={{ marginBottom: 16 }} />
            {successMessage && !superMode ? <Text style={{ color: '#166534', marginBottom: 12 }}>{successMessage}</Text> : null}
            <Text variant="titleMedium" style={{ marginBottom: 8 }}>Update Details</Text>
            <RadioButton.Group onValueChange={(value) => setSelectedSessionId(Number(value))} value={selectedSessionId?.toString() || ''}>
              {(sessions || []).map((session) => (
                <RadioButton.Item
                  key={session.id}
                  value={session.id.toString()}
                  label={`${(() => { try { return format(parseISO(session.session_date), 'EEE, MMM d'); } catch { return session.session_date; } })()} • ${session.start_time} - ${session.end_time}`}
                />
              ))}
            </RadioButton.Group>
            {!sessions.length ? <HelperText type="info">No sessions available yet.</HelperText> : null}
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
            <Button mode="contained" onPress={onSave} loading={loading} disabled={loading} style={{ marginTop: 8 }}>
              Save Changes
            </Button>
            <Button mode="outlined" textColor="#b91c1c" style={{ marginTop: 12 }} onPress={onDelete} loading={deleteState.loading}>
              Delete Presentation
            </Button>
            {deleteState.error ? <Text style={{ color: '#b91c1c', marginTop: 8 }}>{deleteState.error}</Text> : null}
          </View>
        ) : null}
      </ScrollView>
    </ResponsiveContainer>
  );
}
