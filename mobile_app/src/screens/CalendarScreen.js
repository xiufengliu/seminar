import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, RefreshControl, Platform } from 'react-native';
import { SegmentedButtons, Text, Dialog, Portal, TextInput, Button as PaperButton } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { listSeminars, updateSeminar, deleteSeminar } from '../services/api';
import SeminarCard from '../ui/SeminarCard';
import useBreakpoints from '../ui/useBreakpoints';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import { useAuth } from '../context/AuthContext';
import TimelineItem from '../ui/TimelineItem';
import { API_BASE_URL } from '../config';

export default function CalendarScreen({ navigation }) {
  // Default to 'future' to show upcoming seminars on first load
  const [scope, setScope] = useState('future');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { isMd } = useBreakpoints();
  const columns = 1; // Force single-column layout on web/desktop
  const { isAdmin } = useAuth();
  const [editing, setEditing] = useState(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [editPhoto, setEditPhoto] = useState(null); // { uri, name, type }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setError('');
      const rows = await listSeminars(scope === 'all' ? 'all' : scope);
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn(e?.message || e);
      setError('Unable to load seminars. Please check API.');
      setData([]);
    }
    setLoading(false);
  }, [scope]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doDelete = async (id) => {
    try { await deleteSeminar(id); await fetchData(); } catch (e) { alert(e.response?.data?.error || e.message); }
  };
  const openEditDialog = (item) => { setEditing({ ...item }); setEditPhoto(null); setOpenEdit(true); };
  const onChange = (k, v) => setEditing(prev => ({ ...prev, [k]: v }));
  const saveEdit = async () => {
    const s = editing;
    if (!s || !s.id || !s.date || !s.start_time || !s.end_time || !s.topic || !s.room) { alert('Missing fields'); return; }
    try {
      const fd = new FormData();
      fd.append('date', s.date);
      fd.append('start_time', s.start_time);
      fd.append('end_time', s.end_time);
      fd.append('room', s.room);
      fd.append('speaker_name', s.speaker_name || '');
      fd.append('speaker_email', s.speaker_email || '');
      fd.append('speaker_bio', s.speaker_bio || '');
      fd.append('seminar_type', s.seminar_type || 'Others');
      fd.append('topic', s.topic || '');
      fd.append('abstract', s.abstract || '');
      if (editPhoto && editPhoto.uri) {
        const name = editPhoto.name || 'speaker.jpg';
        const type = editPhoto.type || 'image/jpeg';
        if (Platform.OS === 'web') {
          const blob = await (await fetch(editPhoto.uri)).blob();
          // @ts-ignore
          fd.append('speaker_photo', blob, name);
        } else {
          // @ts-ignore
          fd.append('speaker_photo', { uri: editPhoto.uri, name, type });
        }
      }
      const runtimeBase = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? `${window.location.origin}/api`
        : API_BASE_URL;
      const res = await fetch(`${runtimeBase}/seminars/${s.id}`, { method: 'PUT', body: fd });
      if (!res.ok) { const t = await res.text(); throw new Error(t || 'Update failed'); }
      setOpenEdit(false); await fetchData();
    } catch (e) { alert(e.response?.data?.error || e.message); }
  };

  const isPastSeminar = (item) => {
    try {
      const endStr = item.end_time || item.start_time || '23:59:59';
      const dt = new Date(`${item.date}T${endStr}`);
      return dt.getTime() < Date.now();
    } catch {
      // Fallback: treat as non-editable if parsing fails
      return true;
    }
  };

  return (
    <ResponsiveContainer>
      <SegmentedButtons
        value={scope}
        onValueChange={setScope}
        buttons={[
          { value: 'future', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
          { value: 'all', label: 'All' }
        ]}
      />
      {error ? <Text style={{ color: '#b91c1c', marginTop: 12 }}>{error}</Text> : null}
      <FlatList
        style={{ marginTop: 16 }}
        data={data}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No seminars</Text>}
        renderItem={({ item }) => (
          <View style={{ width: '100%', marginBottom: 16 }}>
            <TimelineItem
              seminar={item}
              onPress={() => navigation.navigate('SeminarDetail', { seminar: item, fromCalendar: true })}
            />
          </View>
        )}
        numColumns={columns}
        columnWrapperStyle={undefined}
      />

      <Portal>
        <Dialog visible={openEdit} onDismiss={() => setOpenEdit(false)} style={{ maxWidth: 720, alignSelf: 'center', width: '100%', borderRadius: 8 }}>
          <Dialog.Title>Edit Seminar</Dialog.Title>
          <Dialog.Content>
            {editing && (
              <>
                <TextInput label="Date (YYYY-MM-DD)" value={editing.date} onChangeText={(v) => onChange('date', v)} style={{ marginTop: 8 }} />
                <View style={{ flexDirection: isMd ? 'row' : 'column' }}>
                  <TextInput label="Start (HH:MM:SS)" value={editing.start_time} onChangeText={(v) => onChange('start_time', v)} style={{ flex: 1, marginTop: 8, marginRight: isMd ? 6 : 0 }} />
                  <TextInput label="End (HH:MM:SS)" value={editing.end_time} onChangeText={(v) => onChange('end_time', v)} style={{ flex: 1, marginTop: 8, marginLeft: isMd ? 6 : 0 }} />
                </View>
                <TextInput label="Room" value={editing.room} onChangeText={(v) => onChange('room', v)} style={{ marginTop: 8 }} />
                <View style={{ flexDirection: isMd ? 'row' : 'column' }}>
                  <TextInput label="Speaker Name" value={editing.speaker_name} onChangeText={(v) => onChange('speaker_name', v)} style={{ flex: 1, marginTop: 8, marginRight: isMd ? 6 : 0 }} />
                  <TextInput label="Speaker Email" value={editing.speaker_email} onChangeText={(v) => onChange('speaker_email', v)} style={{ flex: 1, marginTop: 8, marginLeft: isMd ? 6 : 0 }} />
                </View>
                <TextInput label="Seminar Type" value={editing.seminar_type} onChangeText={(v) => onChange('seminar_type', v)} style={{ marginTop: 8 }} />
                <TextInput label="Topic" value={editing.topic} onChangeText={(v) => onChange('topic', v)} style={{ marginTop: 8 }} />
                <TextInput label="Abstract" value={editing.abstract} onChangeText={(v) => onChange('abstract', v)} style={{ marginTop: 8 }} multiline />
                <TextInput label="Speaker Bio" value={editing.speaker_bio} onChangeText={(v) => onChange('speaker_bio', v)} style={{ marginTop: 8 }} multiline />
                <PaperButton mode="outlined" icon="image" onPress={async () => {
                  try {
                    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                    if (perm.status !== 'granted') { alert('Permission required to pick image'); return; }
                    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
                    // @ts-ignore
                    if (result.cancelled || result.canceled) return;
                    const asset = (result.assets && result.assets[0]) || result;
                    const uri = asset.uri;
                    const name = (uri.split('/').pop() || 'speaker.jpg');
                    const type = asset.mimeType || 'image/jpeg';
                    setEditPhoto({ uri, name, type });
                  } catch (err) { alert(String(err)); }
                }} style={{ marginTop: 8 }}>
                  {editPhoto ? 'Change Speaker Photo' : 'Upload Speaker Photo'}
                </PaperButton>
                {editPhoto ? <Text style={{ marginTop: 6, color: '#334155' }}>Selected: {editPhoto.name || editPhoto.uri}</Text> : null}
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <PaperButton onPress={() => setOpenEdit(false)}>Cancel</PaperButton>
            <PaperButton mode="contained" onPress={saveEdit}>Save</PaperButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ResponsiveContainer>
  )
}
