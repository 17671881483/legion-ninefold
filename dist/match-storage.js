// Keep practice progress separate from the existing v14 match slot.
export const MATCH_STORAGE_KEYS = Object.freeze({
  normal: 'legion-v14-1a5-x9-match-v1',
  sandbox: 'legion-v14-1a5-x9-sandbox-v1',
});

export const matchMode = state => state?.mode === 'sandbox' ? 'sandbox' : 'normal';

export function readMatch(storage, mode = 'normal') {
  try {
    const snapshot = JSON.parse(storage.getItem(MATCH_STORAGE_KEYS[mode]) || 'null');
    return snapshot?.state && matchMode(snapshot.state) === mode ? snapshot : null;
  } catch {
    return null;
  }
}

export function writeMatch(storage, snapshot) {
  const key = MATCH_STORAGE_KEYS[matchMode(snapshot.state)];
  storage.setItem(key, JSON.stringify(snapshot));
  return key;
}
