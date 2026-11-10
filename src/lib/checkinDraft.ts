export type CheckinDraftMediaKind = 'photo' | 'video';

export interface CheckinDraftState<TForm = Record<string, unknown>> {
  version: 1;
  saved_at: number;
  step: 1 | 2;
  form: TForm;
  assigned_tech_id: string;
  custom_make: boolean;
  custom_model: boolean;
  photo_ids: string[];
  video_id: string | null;
}

interface DraftMediaRecord {
  key: string;
  user_id: string;
  media_id: string;
  kind: CheckinDraftMediaKind;
  file: File;
  saved_at: number;
}

const DB_NAME = 'socal-inspection-local-drafts';
const DB_VERSION = 1;
const MEDIA_STORE = 'checkin-media';
const STATE_PREFIX = 'socal-checkin-draft:';

function stateKey(userId: string) {
  return STATE_PREFIX + userId;
}

function mediaKey(userId: string, mediaId: string, kind: CheckinDraftMediaKind) {
  return `${userId}:${kind}:${mediaId}`;
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available on this device.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'key' });
        store.createIndex('user_id', 'user_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the local check-in draft store.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDraftDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, mode);
      const store = tx.objectStore(MEDIA_STORE);
      let request: IDBRequest<T>;
      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || tx.error || new Error('Local draft media operation failed.'));
      tx.onabort = () => reject(tx.error || new Error('Local draft media transaction was aborted.'));
    });
  } finally {
    db.close();
  }
}

export function saveCheckinDraftState<TForm>(userId: string, state: CheckinDraftState<TForm>) {
  if (!userId || typeof localStorage === 'undefined') return;
  localStorage.setItem(stateKey(userId), JSON.stringify(state));
}

export function loadCheckinDraftState<TForm>(userId: string): CheckinDraftState<TForm> | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(stateKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CheckinDraftState<TForm>;
    if (
      parsed?.version !== 1 ||
      (parsed.step !== 1 && parsed.step !== 2) ||
      !parsed.form ||
      !Array.isArray(parsed.photo_ids)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCheckinDraftMedia(
  userId: string,
  mediaId: string,
  kind: CheckinDraftMediaKind,
  file: File,
) {
  const record: DraftMediaRecord = {
    key: mediaKey(userId, mediaId, kind),
    user_id: userId,
    media_id: mediaId,
    kind,
    file,
    saved_at: Date.now(),
  };
  await withStore('readwrite', store => store.put(record));
}

export async function loadCheckinDraftMedia(
  userId: string,
  mediaId: string,
  kind: CheckinDraftMediaKind,
): Promise<File | null> {
  const record = await withStore<DraftMediaRecord | undefined>(
    'readonly',
    store => store.get(mediaKey(userId, mediaId, kind)),
  );
  return record?.file instanceof File ? record.file : null;
}

export async function removeCheckinDraftMedia(
  userId: string,
  mediaId: string,
  kind: CheckinDraftMediaKind,
) {
  await withStore('readwrite', store => store.delete(mediaKey(userId, mediaId, kind)));
}

export async function clearCheckinDraft(userId: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(stateKey(userId));
  }
  if (!userId || typeof indexedDB === 'undefined') return;

  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE);
      const index = store.index('user_id');
      const request = index.openCursor(IDBKeyRange.only(userId));

      request.onerror = () => reject(request.error || tx.error || new Error('Could not clear local draft media.'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not clear local draft media.'));
      tx.onabort = () => reject(tx.error || new Error('Could not clear local draft media.'));
    });
  } finally {
    db.close();
  }
}
