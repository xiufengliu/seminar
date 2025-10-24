import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Platform } from 'react-native';
import { TextInput, Button, Text, Snackbar } from 'react-native-paper';
import { createRequest } from '../services/api';
import { API_BASE_URL } from '../config';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import useBreakpoints from '../ui/useBreakpoints';
import { DatePickerModal, TimePickerModal, en, registerTranslation } from 'react-native-paper-dates';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';

registerTranslation('en', en);

function pad2(n){ return String(n).padStart(2,'0'); }

export default function NewRequestScreen(){
  const initialForm = { date: '', start_time: '', end_time: '', seminar_type: 'Others', room: '', speaker_name: '', speaker_email: '', speaker_bio: '', topic: '', abstract: '', submitter_name: '', submitter_email: '' };
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const { isMd } = useBreakpoints();
  const [openDate, setOpenDate] = useState(false);
  const [openStart, setOpenStart] = useState(false);
  const [openEnd, setOpenEnd] = useState(false);
  const [snack, setSnack] = useState(false);
  const [photo, setPhoto] = useState(null); // { uri, name, type }

  const set = (k,v) => setForm(prev => ({ ...prev, [k]: v }));
  const dateLabel = useMemo(() => form.date ? form.date : 'Select date', [form.date]);
  const startLabel = useMemo(() => form.start_time ? form.start_time.slice(0,5) : 'Select start', [form.start_time]);
  const endLabel = useMemo(() => form.end_time ? form.end_time.slice(0,5) : 'Select end', [form.end_time]);
  const submit = async () => {
    if (!form.date || !form.start_time || !form.end_time || !form.room || !form.topic || !form.submitter_name || !form.submitter_email) {
      alert('Please fill in all mandatory fields'); return;
    }
    setBusy(true);
    try {
      // Always send as multipart to support photo upload
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => fd.append(k, String(v||'')));
      if (photo && photo.uri) {
        const name = photo.name || 'speaker.jpg';
        const type = photo.type || 'image/jpeg';
        if (Platform.OS === 'web') {
          const blob = await (await fetch(photo.uri)).blob();
          // @ts-ignore
          fd.append('speaker_photo', blob, name);
        } else {
          // @ts-ignore
          fd.append('speaker_photo', { uri: photo.uri, name, type });
        }
      }
      const res = await fetch(`${API_BASE_URL}/requests`, { method: 'POST', body: fd });
      if (!res.ok) {
        const t = await res.text(); throw new Error(t || 'Submit failed');
      }
      setSnack(true);
      setForm(initialForm);
      setPhoto(null);
    } catch(e){
      alert(e.response?.data?.error || e.message);
    }
    setBusy(false);
  };

  return (
    <ResponsiveContainer>
      <ScrollView>
        <Text variant="headlineSmall">Request a Seminar</Text>
        <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 16, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Button mode="outlined" icon="calendar" onPress={() => setOpenDate(true)}>
              {dateLabel} *
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <TextInput mode="outlined" label="Seminar Type" value={form.seminar_type} onChangeText={v=>set('seminar_type', v)} />
          </View>
        </View>
        <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 16, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <Button mode="outlined" icon="clock-outline" onPress={() => setOpenStart(true)}>
              {`Start ${startLabel}`} *
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button mode="outlined" icon="clock-outline" onPress={() => setOpenEnd(true)}>
              {`End ${endLabel}`} *
            </Button>
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <TextInput mode="outlined" label="Room *" value={form.room} onChangeText={v=>set('room', v)} />
        </View>
        <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 16, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <TextInput mode="outlined" label="Speaker Name" value={form.speaker_name} onChangeText={v=>set('speaker_name', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput mode="outlined" label="Speaker Email" value={form.speaker_email} onChangeText={v=>set('speaker_email', v)} />
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <TextInput mode="outlined" label="Speaker Bio" value={form.speaker_bio} onChangeText={v=>set('speaker_bio', v)} multiline />
        </View>
        <View style={{ marginTop: 16 }}>
          <Button mode="outlined" icon="image" onPress={async ()=>{
            try{
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (perm.status !== 'granted') { alert('Permission required to pick image'); return; }
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
              // @ts-ignore web returns canceled
              if (result.cancelled || result.canceled) return;
              const asset = (result.assets && result.assets[0]) || result;
              const uri = asset.uri;
              const name = (uri.split('/').pop() || 'speaker.jpg');
              const type = asset.mimeType || 'image/jpeg';
              setPhoto({ uri, name, type });
            }catch(err){ alert(String(err)); }
          }}>
            {photo ? 'Change Speaker Photo' : 'Upload Speaker Photo'}
          </Button>
          {photo ? <Text style={{ marginTop: 8, color: '#334155' }}>Selected: {photo.name || photo.uri}</Text> : null}
        </View>
        <View style={{ marginTop: 16 }}>
          <TextInput mode="outlined" label="Topic *" value={form.topic} onChangeText={v=>set('topic', v)} />
        </View>
        <View style={{ marginTop: 16 }}>
          <TextInput mode="outlined" label="Abstract" value={form.abstract} onChangeText={v=>set('abstract', v)} multiline />
        </View>
        <View style={{ flexDirection: isMd ? 'row' : 'column', gap: 16, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <TextInput mode="outlined" label="Your Name *" value={form.submitter_name} onChangeText={v=>set('submitter_name', v)} />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput mode="outlined" label="Your Email *" value={form.submitter_email} onChangeText={v=>set('submitter_email', v)} />
          </View>
        </View>
        <Button mode="contained" onPress={submit} loading={busy} disabled={busy} style={{ marginTop: 20 }} contentStyle={{ height: 48 }}>Submit</Button>

        {/* Date Picker */}
        <DatePickerModal
          locale="en"
          mode="single"
          visible={openDate}
          onDismiss={() => setOpenDate(false)}
          date={form.date ? new Date(`${form.date}T12:00:00`) : new Date()}
          onConfirm={({ date }) => {
            if (date) set('date', format(date, 'yyyy-MM-dd'));
            setOpenDate(false);
          }}
        />

        {/* Time Pickers */}
        <TimePickerModal
          visible={openStart}
          onDismiss={() => setOpenStart(false)}
          onConfirm={({ hours, minutes }) => {
            set('start_time', `${pad2(hours)}:${pad2(minutes)}:00`);
            setOpenStart(false);
          }}
          hours={parseInt(form.start_time.slice(0,2) || '12',10)}
          minutes={parseInt(form.start_time.slice(3,5) || '00',10)}
          label="Start time"
        />
        <TimePickerModal
          visible={openEnd}
          onDismiss={() => setOpenEnd(false)}
          onConfirm={({ hours, minutes }) => {
            set('end_time', `${pad2(hours)}:${pad2(minutes)}:00`);
            setOpenEnd(false);
          }}
          hours={parseInt(form.end_time.slice(0,2) || '13',10)}
          minutes={parseInt(form.end_time.slice(3,5) || '00',10)}
          label="End time"
        />
      </ScrollView>
      <Snackbar visible={snack} onDismiss={() => setSnack(false)} duration={3000} style={{ margin: 12 }}>
        Request submitted successfully.
      </Snackbar>
    </ResponsiveContainer>
  );
}
