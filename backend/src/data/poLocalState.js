const fs   = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const NOTIFIED_FILE = path.join(
  process.env.UPLOAD_DIR || './uploads',
  'notified_pos.json'
);
const LOCAL_STATE_FILE = path.join(UPLOAD_DIR, 'po_local_state.json');

function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {}
}

function _load() {
  try {
    if (fs.existsSync(NOTIFIED_FILE)) {
      const { ids } = JSON.parse(fs.readFileSync(NOTIFIED_FILE, 'utf8'));
      return new Set(Array.isArray(ids) ? ids : []);
    }
  } catch {}
  return new Set();
}

function _save(set) {
  try {
    ensureUploadDir();
    fs.writeFileSync(NOTIFIED_FILE, JSON.stringify({ ids: [...set] }, null, 2));
  } catch (err) {
    console.warn('[poLocalState] Could not persist notifiedPoIds:', err.message);
  }
}

const notifiedPoIds = _load();

/** Add a PO ID to the notified set and persist to disk immediately. */
function addNotifiedPoId(id) {
  notifiedPoIds.add(id);
  _save(notifiedPoIds);
}

function loadLocalState() {
  try {
    if (fs.existsSync(LOCAL_STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    }
  } catch (err) {
    console.warn('[poLocalState] Could not load local PO state:', err.message);
  }
  return {};
}

function toEntriesMap(entries) {
  return new Map(Array.isArray(entries) ? entries : []);
}

const loadedState = loadLocalState();

function saveLocalState() {
  try {
    ensureUploadDir();
    const snapshot = {
      poLocalStatus: [...poLocalStatus.entries()],
      poLineDeliveryDates: [...poLineDeliveryDates.entries()],
      poRTDData: [...poRTDData.entries()],
      poActivityLog: [...poActivityLog.entries()],
    };
    fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(snapshot, null, 2));
  } catch (err) {
    console.warn('[poLocalState] Could not persist local PO state:', err.message);
  }
}

function createPersistentMap(initialEntries) {
  const base = new Map(initialEntries);
  return {
    clear() {
      base.clear();
      saveLocalState();
    },
    delete(key) {
      const deleted = base.delete(key);
      saveLocalState();
      return deleted;
    },
    entries() {
      return base.entries();
    },
    forEach(callback, thisArg) {
      return base.forEach(callback, thisArg);
    },
    get(key) {
      return base.get(key);
    },
    has(key) {
      return base.has(key);
    },
    keys() {
      return base.keys();
    },
    set(key, value) {
      base.set(key, value);
      saveLocalState();
      return this;
    },
    values() {
      return base.values();
    },
    [Symbol.iterator]() {
      return base[Symbol.iterator]();
    },
    get size() {
      return base.size;
    },
  };
}

const poLocalStatus = createPersistentMap(toEntriesMap(loadedState.poLocalStatus));
const poLineDeliveryDates = createPersistentMap(toEntriesMap(loadedState.poLineDeliveryDates));
const poRTDData = createPersistentMap(toEntriesMap(loadedState.poRTDData));
const poActivityLog = createPersistentMap(toEntriesMap(loadedState.poActivityLog));

module.exports = {
  poLocalStatus,
  notifiedPoIds,
  addNotifiedPoId,
  poLineDeliveryDates,
  poRTDData,
  poActivityLog,
  saveLocalState,
};
