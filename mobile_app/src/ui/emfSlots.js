export const EMF_SLOT_OPTIONS = [
  { key: 'slot1', label: '1:00 – 1:15 PM' },
  { key: 'slot2', label: '1:15 – 1:30 PM' },
  { key: 'slot3', label: '1:30 – 1:45 PM' },
  { key: 'slot4', label: '1:45 – 2:00 PM' },
  { key: 'slot5', label: '2:00 – 2:15 PM' },
  { key: 'slot6', label: '2:15 – 2:30 PM' },
];

export const getSlotLabel = (key) => {
  const match = EMF_SLOT_OPTIONS.find((opt) => opt.key === key);
  return match ? match.label : '';
};
