export const EMF_SLOT_OPTIONS = [
  { key: 'slot1', label: '1:00 – 1:15 PM' },
  { key: 'slot2', label: '1:15 – 1:30 PM' },
  { key: 'slot3', label: '1:30 – 1:45 PM' },
];

export const getSlotLabel = (key) => {
  const match = EMF_SLOT_OPTIONS.find((opt) => opt.key === key);
  return match ? match.label : '';
};
