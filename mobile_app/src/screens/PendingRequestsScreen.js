import React, { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { Text, Button, Dialog, Portal, IconButton } from 'react-native-paper';
import { listRequests, approveRequest, rejectRequest } from '../services/api';
import ResponsiveContainer from '../ui/ResponsiveContainer';
import useBreakpoints from '../ui/useBreakpoints';

export default function PendingRequestsScreen({ navigation }){
  const [data, setData] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' or 'reject'
  const [confirmItem, setConfirmItem] = useState(null);
  const { isMd } = useBreakpoints();

  const refresh = async () => { setData(await listRequests('pending')); };
  useEffect(()=>{ refresh(); }, []);

  const doApprove = async (req) => {
    try {
      await approveRequest(req.id);
      await refresh();
    } catch(e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const doReject = async (req) => {
    try {
      await rejectRequest(req.id);
      await refresh();
    } catch(e) {
      alert(e.response?.data?.error || e.message);
    }
  };

  const requestConfirm = (action, item) => {
    setConfirmAction(action);
    setConfirmItem(item);
    setConfirmOpen(true);
  };

  const confirmHandler = async () => {
    if (confirmAction === 'approve') await doApprove(confirmItem);
    else if (confirmAction === 'reject') await doReject(confirmItem);
    setConfirmOpen(false);
    setConfirmAction(null);
    setConfirmItem(null);
  };

  return (
    <ResponsiveContainer>
      <Button mode="outlined" onPress={() => navigation.navigate('ManageSeminars')} style={{ marginBottom: 16 }}>
        ← Back to Manage Seminars
      </Button>
      <FlatList
        data={data}
        keyExtractor={i=>String(i.id)}
        renderItem={({item})=>(
          <View style={{ padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#f9fafb' }}>
            <Text style={{ fontWeight: '600' }}>{item.topic}</Text>
            <Text style={{ marginTop: 4, color: '#64748b' }}>From: {item.submitter_name}</Text>
            <Text style={{ color: '#64748b' }}>Requested by: {item.submitter_email}</Text>
            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
              <Button
                mode="contained"
                onPress={() => requestConfirm('approve', item)}
                contentStyle={{ height: 40 }}
              >
                Approve
              </Button>
              <Button
                mode="outlined"
                onPress={() => requestConfirm('reject', item)}
                contentStyle={{ height: 40 }}
              >
                Reject
              </Button>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No pending requests</Text>}
      />
      <Portal>
        <Dialog visible={confirmOpen} onDismiss={() => setConfirmOpen(false)} style={{ borderRadius: 8 }}>
          <Dialog.Title>{confirmAction === 'approve' ? 'Approve Request?' : 'Reject Request?'}</Dialog.Title>
          <Dialog.Content>
            <Text>{confirmAction === 'approve' ? 'Approve this seminar request?' : 'Reject this seminar request?'}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={confirmHandler}>{confirmAction === 'approve' ? 'Approve' : 'Reject'}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ResponsiveContainer>
  );
}
