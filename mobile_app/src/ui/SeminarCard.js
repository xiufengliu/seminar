import React from 'react';
import { View } from 'react-native';
import { Card, Text, IconButton, Button } from 'react-native-paper';
import useBreakpoints from './useBreakpoints';

export default function SeminarCard({ seminar, onPress, onDelete, onEdit }){
  const { isMd } = useBreakpoints();
  const horizontal = isMd;
  return (
    <Card onPress={onPress} style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {/* Left Timeline only */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 8, width: 36 }}>
          <View style={{ width: 28, alignItems: 'center', alignSelf: 'stretch' }}>
            <View style={{ flex: 1, width: 2, backgroundColor: '#cbd5e1' }} />
            <View style={{ position: 'absolute', top: 18, width: 12, height: 12, borderRadius: 6, backgroundColor: '#6b21a8' }} />
          </View>
        </View>

        {/* Content */}
        <View style={{ flex: 1, padding: horizontal ? 16 : 12, flexDirection: horizontal ? 'row' : 'column', alignItems: horizontal ? 'center' : 'flex-start' }}>
          <View style={{ flex: 1, paddingRight: horizontal ? 12 : 0 }}>
            <Text variant="titleMedium" style={{ marginBottom: 6 }}>{seminar.topic}</Text>
            <Text style={{ opacity: 0.8 }}>{seminar.date} {seminar.start_time}-{seminar.end_time} • {seminar.room}</Text>
            <Text style={{ marginTop: 6 }}>Speaker: {seminar.speaker_name}</Text>
            <Text>Type: {seminar.seminar_type || 'Others'}</Text>
          </View>
          {(onEdit || onDelete) ? (
            <View style={{ justifyContent: 'center', flexDirection: 'row', alignItems: 'center' }}>
              {onEdit ? (
                <IconButton
                  icon="pencil"
                  onPress={(e)=>{ e.stopPropagation(); onEdit(); }}
                  mode="contained-tonal"
                  containerColor="#e5e7eb"
                  style={{ marginRight: 4 }}
                />
              ) : null}
              {onDelete ? (
                <IconButton
                  icon="delete"
                  onPress={(e)=>{ e.stopPropagation(); onDelete(); }}
                  mode="contained"
                  containerColor="#dc2626"
                  iconColor="#ffffff"
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
