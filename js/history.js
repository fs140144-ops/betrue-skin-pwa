/**
 * 顧客ごとの肌測定履歴の保存・読み込み（Before/After比較・相対スコア算出の基盤）。
 * Python版 history.py の役割をIndexedDBで置き換え（完全にオンデバイス保存）。
 */

const DB_NAME = "betrue_skin_analysis";
const DB_VERSION = 1;
const STORE_NAME = "records";

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("customer_id", "customer_id", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

/** 指定顧客の全履歴レコードをtimestamp昇順で返す。 */
export async function loadHistory(customerId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("customer_id");
    const range = IDBKeyRange.only(customerId);
    const records = [];
    const req = index.openCursor(range);
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        records.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
        resolve(records);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/** 新しい測定レコードを保存する。 */
export async function saveRecord(customerId, record) {
  const db = await openDb();
  const toSave = { ...record, customer_id: customerId };
  if (!toSave.timestamp) {
    toSave.timestamp = new Date().toISOString();
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(toSave);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 直近2件のレコードを返す [prev, latest]。1件以下なら [null, latestOrNull]。 */
export async function getLatestTwo(customerId) {
  const records = await loadHistory(customerId);
  if (records.length < 2) {
    return [null, records.length ? records[records.length - 1] : null];
  }
  return [records[records.length - 2], records[records.length - 1]];
}

/** 保存済みの全顧客IDを重複なしで返す。 */
export async function allCustomerIds() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("customer_id");
    const ids = new Set();
    const req = index.openKeyCursor();
    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        ids.add(cursor.key);
        cursor.continue();
      } else {
        resolve(Array.from(ids));
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 全顧客の過去測定から、指定カテゴリの生値（raw_metrics[category_key]）を集める。
 * 相対（パーセンタイル）スコアリングの母集団として使用する。
 */
export async function collectHistoricalRawValues(categoryKey, excludeCustomerId = null) {
  const ids = await allCustomerIds();
  const values = [];
  for (const cid of ids) {
    if (cid === excludeCustomerId) continue;
    const records = await loadHistory(cid);
    for (const record of records) {
      const raw = record.raw_metrics || {};
      if (raw[categoryKey] !== undefined && raw[categoryKey] !== null) {
        values.push(raw[categoryKey]);
      }
    }
  }
  return values;
}

/** 診断画像などのBlobを保存する別ストア（写真そのものは巨大なのでrecordとは別管理も可能だが、
 * 今回はシンプルにrecordへdataURLとして含めず、呼び出し側でIndexedDBに保存する用途に備えて公開）。 */
export async function deleteAllHistory() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
