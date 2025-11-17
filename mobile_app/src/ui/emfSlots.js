export const EMF_SLOT_OPTIONS = [
  { key: 'slot1', label: '1:00 – 1:10 PM' },
  { key: 'slot2', label: '1:10 – 1:20 PM' },
  { key: 'slot3', label: '1:20 – 1:30 PM' },
];

export const getSlotLabel = (key) => {
  const match = EMF_SLOT_OPTIONS.find((opt) => opt.key === key);
  return match ? match.label : '';
};
