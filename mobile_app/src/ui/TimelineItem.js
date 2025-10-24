import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { Text, IconButton, Button } from 'react-native-paper';
import { API_BASE_URL } from '../config';

function avatarUrl(name, email, size=48){
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

export default function TimelineItem({ seminar, onPress, onEdit, onDelete }){
  const dateStr = seminar.date || '';
  const timeStr = `${seminar.start_time || ''} - ${seminar.end_time || ''}`;
  const speaker = seminar.speaker_name || '';
  const email = seminar.speaker_email || '';
  const room = seminar.room || '';
  const type = seminar.seminar_type || '';
  const topic = seminar.topic || '';
  // Build photo URL: prefer current origin + /api to avoid stale bases
  const runtimeBase = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? `${window.location.origin}/api`
    : API_BASE_URL;
  const avatar = seminar.speaker_photo
    ? `${runtimeBase.replace(/\/$/, '')}${seminar.speaker_photo.startsWith('/') ? '' : '/'}${seminar.speaker_photo}`
    : avatarUrl(speaker, email, 40);

  return (
    <Pressable onPress={onPress} style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', width: '100%' }}>
        {/* Timeline column */}
        <View style={{ width: 28, alignItems: 'center' }}>
          <View style={{ flex: 1, width: 2, backgroundColor: '#cbd5e1' }} />
          <View style={{ position: 'absolute', top: 18, width: 12, height: 12, borderRadius: 6, backgroundColor: '#6b21a8' }} />
        </View>

        {/* Content card-like area */}
        <View style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', padding: 12, backgroundColor: '#ffffff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginRight: 12 }}>{dateStr}</Text>
            <Text style={{ color: '#334155' }}>{timeStr}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Image source={{ uri: avatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontWeight: '600' }}>{topic}</Text>
              <Text style={{ color: '#334155' }}>Speaker: {speaker}</Text>
              <Text style={{ color: '#64748b' }}>{type} • Room: {room}</Text>
            </View>
            {onEdit ? <IconButton icon="pencil" onPress={(e)=>{ e.stopPropagation(); onEdit(); }} /> : null}
            {onDelete ? <IconButton icon="delete" onPress={(e)=>{ e.stopPropagation(); onDelete(); }} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
