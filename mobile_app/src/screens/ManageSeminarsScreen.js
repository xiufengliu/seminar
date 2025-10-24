import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, Platform } from 'react-native';
import { Text, Button, Dialog, Portal, TextInput } from 'react-native-paper';
import { listSeminars, createSeminar, updateSeminar, deleteSeminar, inviteSeminar } from '../services/api';
import TimelineItem from '../ui/TimelineItem';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import useBreakpoints from '../ui/useBreakpoints';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerModal, TimePickerModal, en, registerTranslation } from 'react-native-paper-dates';
import { API_BASE_URL } from '../config';

registerTranslation('en', en);

function pad2(n){ return String(n).padStart(2,'0'); }

export default function ManageSeminarsScreen({ navigation }){
  const [data, setData] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openDate, setOpenDate] = useState(false);
  const [openStart, setOpenStart] = useState(false);
  const [openEnd, setOpenEnd] = useState(false);
  const [editPhoto, setEditPhoto] = useState(null); // { uri, name, type }
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSeminar, setInviteSeminarItem] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const { isMd } = useBreakpoints();
  const { isAdmin } = useAuth();

  const refresh = async () => { setData(await listSeminars('all')); };
  useEffect(()=>{ refresh(); }, []);

  const openNew = () => { setEditing({ date:'', start_time:'12:00:00', end_time:'13:00:00', room:'', speaker_name:'', speaker_email:'', speaker_bio:'', topic:'', abstract:'', seminar_type:'Others' }); setEditPhoto(null); setShowEdit(true); };
  const openEditDialog = (s) => { setEditing({ ...s }); setEditPhoto(null); setShowEdit(true); };
  const openInviteDialog = (s) => {
    // Check if seminar is upcoming
    try {
      const now = new Date();
      const endStr = s.end_time || s.start_time || '23:59:59';
      const dt = new Date(`${s.date}T${endStr}`);
      if (dt.getTime() >= now.getTime()) {
        setInviteSeminarItem(s);
        setInviteEmail('');
        setInviteOpen(true);
      } else {
        alert('Can only send invitations for upcoming seminars');
      }
    } catch {
      alert('Error checking seminar time');
    }
  };

  const save = async () => {
    const s = editing;
    if (!s.date || !s.start_time || !s.end_time || !s.topic || !s.room) { alert('Missing fields'); return; }
    try {
      if (s.id) {
        if (editPhoto && editPhoto.uri) {
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
          const runtimeBase = (typeof window !== 'undefined' && window.location && window.location.origin)
            ? `${window.location.origin}/api`
            : API_BASE_URL;
          const res = await fetch(`${runtimeBase}/seminars/${s.id}`, { method: 'PUT', body: fd });
          if (!res.ok) { const t = await res.text(); throw new Error(t || 'Update failed'); }
        } else {
          await updateSeminar(s.id, s);
        }
      } else {
        // Create first via JSON
        const created = await createSeminar(s);
        const newId = created?.id;
        // If a photo is selected, immediately upload it via update endpoint
        if (newId && editPhoto && editPhoto.uri) {
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
          const runtimeBase = (typeof window !== 'undefined' && window.location && window.location.origin)
            ? `${window.location.origin}/api`
            : API_BASE_URL;
          const res = await fetch(`${runtimeBase}/seminars/${newId}`, { method: 'PUT', body: fd });
          if (!res.ok) { const t = await res.text(); throw new Error(t || 'Photo upload failed'); }
        }
      }
      setShowEdit(false); setEditPhoto(null); await refresh();
    } catch(e){ alert(e.response?.data?.error || e.message); }
  };
  const remove = async (id) => { await deleteSeminar(id); await refresh(); };
  
  const isValidEmail = (email) => /.+@.+\..+/.test(String(email).trim());
  
  const sendInvite = async () => {
    const email = inviteEmail.trim();
    if (!isValidEmail(email)) { alert('Please enter a valid email address'); return; }
    setInviteSending(true);
    try {
      await inviteSeminar(inviteSeminar.id, [email]);
      alert('Invitation sent');
      setInviteOpen(false);
      setInviteEmail('');
      setInviteSeminarItem(null);
    } catch (e) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setInviteSending(false);
    }
  };
  
  const dateLabel = useMemo(() => editing?.date ? editing.date : 'Select date', [editing?.date]);
  const startLabel = useMemo(() => editing?.start_time ? editing.start_time.slice(0,5) : 'Select start', [editing?.start_time]);
  const endLabel = useMemo(() => editing?.end_time ? editing.end_time.slice(0,5) : 'Select end', [editing?.end_time]);

  return (
    <ResponsiveContainer>
      <View style={{ flexDirection: isMd ? 'row' : 'column', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Button mode="contained" onPress={openNew} contentStyle={{ height: 48 }}>Add Seminar</Button>
        {isAdmin ? (
          <Button
            mode="outlined"
            onPress={() => {
              const parent = navigation.getParent?.();
              if (parent && typeof parent.navigate === 'function') {
                parent.navigate('Admin', { screen: 'PendingRequests' });
              } else {
                navigation.navigate('PendingRequests');
              }
            }}
            contentStyle={{ height: 44 }}
          >
            View Pending Requests
          </Button>
        ) : null}
      </View>
      <FlatList
        style={{ marginTop: 16 }}
        data={data}
        keyExtractor={i=>String(i.id)}
        renderItem={({item}) => (
          <View style={{ width: '100%', marginBottom: 16 }}>
            <TimelineItem
              seminar={item}
              onPress={() => openInviteDialog(item)}
              onEdit={() => openEditDialog(item)}
              onDelete={() => remove(item.id)}
            />
          </View>
        )}
        numColumns={1}
        columnWrapperStyle={undefined}
      />
      <Portal>
        <Dialog visible={showEdit} onDismiss={()=>setShowEdit(false)} style={{ maxWidth: 720, alignSelf: 'center', width: '100%', borderRadius: 8 }}>
          <Dialog.Title>Edit Seminar</Dialog.Title>
          <Dialog.Content>
            <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 12 }}>
              <Button mode="outlined" icon="calendar" onPress={() => setOpenDate(true)} style={{ flex: 1 }}>
                {dateLabel} {editing ? '*' : ''}
              </Button>
              <TextInput mode="outlined" label="Type" value={editing?.seminar_type} onChangeText={v=>setEditing(p=>({ ...p, seminar_type:v }))} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 12, marginTop: 12 }}>
              <Button mode="outlined" icon="clock-outline" onPress={() => setOpenStart(true)} style={{ flex: 1 }}>
                {`Start ${startLabel}`} *
              </Button>
              <Button mode="outlined" icon="clock-outline" onPress={() => setOpenEnd(true)} style={{ flex: 1 }}>
                {`End ${endLabel}`} *
              </Button>
              <TextInput mode="outlined" label="Room" value={editing?.room} onChangeText={v=>setEditing(p=>({ ...p, room:v }))} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 12, marginTop: 12 }}>
              <TextInput mode="outlined" label="Speaker Name" value={editing?.speaker_name} onChangeText={v=>setEditing(p=>({ ...p, speaker_name:v }))} style={{ flex: 1 }} />
              <TextInput mode="outlined" label="Speaker Email" value={editing?.speaker_email} onChangeText={v=>setEditing(p=>({ ...p, speaker_email:v }))} style={{ flex: 1 }} />
            </View>
            <Button mode="outlined" icon="image" onPress={async ()=>{
              try{
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
              }catch(err){ alert(String(err)); }
            }} style={{ marginTop: 12 }}>
              {editPhoto ? 'Change Speaker Photo' : 'Upload Speaker Photo'}
            </Button>
            {editPhoto ? <Text style={{ marginTop: 6, color: '#334155' }}>Selected: {editPhoto.name || editPhoto.uri}</Text> : null}
            <TextInput mode="outlined" label="Topic" value={editing?.topic} onChangeText={v=>setEditing(p=>({ ...p, topic:v }))} style={{ marginTop: 12 }} />
            <TextInput mode="outlined" label="Abstract" value={editing?.abstract} onChangeText={v=>setEditing(p=>({ ...p, abstract:v }))} style={{ marginTop: 12 }} multiline />
            <TextInput mode="outlined" label="Speaker Bio" value={editing?.speaker_bio} onChangeText={v=>setEditing(p=>({ ...p, speaker_bio:v }))} style={{ marginTop: 12 }} multiline />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={()=>setShowEdit(false)}>Cancel</Button>
            <Button onPress={save} mode="contained">Save</Button>
          </Dialog.Actions>

          {/* Date and Time Pickers */}
          <DatePickerModal
            locale="en"
            mode="single"
            visible={openDate}
            onDismiss={() => setOpenDate(false)}
            date={editing?.date ? new Date(`${editing.date}T12:00:00`) : new Date()}
            onConfirm={({ date }) => {
              if (date) setEditing(p => ({ ...p, date: `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}` }));
              setOpenDate(false);
            }}
          />
          <TimePickerModal
            visible={openStart}
            onDismiss={() => setOpenStart(false)}
            onConfirm={({ hours, minutes }) => {
              setEditing(p => ({ ...p, start_time: `${pad2(hours)}:${pad2(minutes)}:00` }));
              setOpenStart(false);
            }}
            hours={parseInt((editing?.start_time || '12:00:00').slice(0,2),10)}
            minutes={parseInt((editing?.start_time || '12:00:00').slice(3,5),10)}
            label="Start time"
          />
          <TimePickerModal
            visible={openEnd}
            onDismiss={() => setOpenEnd(false)}
            onConfirm={({ hours, minutes }) => {
              setEditing(p => ({ ...p, end_time: `${pad2(hours)}:${pad2(minutes)}:00` }));
              setOpenEnd(false);
            }}
            hours={parseInt((editing?.end_time || '13:00:00').slice(0,2),10)}
            minutes={parseInt((editing?.end_time || '13:00:00').slice(3,5),10)}
            label="End time"
          />
        </Dialog>
        
        {/* Invitation Dialog */}
        <Dialog visible={inviteOpen} onDismiss={() => setInviteOpen(false)} style={{ maxWidth: 520, alignSelf: 'center', width: '100%', borderRadius: 8 }}>
          <Dialog.Title>Send Invitation</Dialog.Title>
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
            <Button mode="contained" onPress={sendInvite} loading={inviteSending} disabled={inviteSending}>Send</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ResponsiveContainer>
  );
}
