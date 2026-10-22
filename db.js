// Almacenamiento local. Todo vive en el teléfono hasta que se publica.
// Las fotos se guardan como Blob dentro del informe: IndexedDB las soporta
// nativamente y evita convertir a base64 (que infla ~33% la memoria).

const DB_NAME = 'informes-obra';
const DB_VERSION = 1;

let _db = null;

function abrir() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('informes')) {
        const s = db.createObjectStore('informes', { keyPath: 'id' });
        s.createIndex('actualizado', 'actualizado');
      }
      if (!db.objectStoreNames.contains('ajustes')) {
        db.createObjectStore('ajustes');
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, modo, fn) {
  return abrir().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let resultado;
    try { resultado = fn(s); } catch (e) { reject(e); return; }
    // Ojo: cuando la clave no existe, `result` es undefined. Hay que devolver
    // ese undefined y no la petición, o termina guardándose un objeto de
    // IndexedDB dentro del informe y el guardado falla.
    t.oncomplete = () => resolve(resultado instanceof IDBRequest ? resultado.result : resultado);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {

  nuevoId() {
    return 'inf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  async listar() {
    const r = await tx('informes', 'readonly', s => s.getAll());
    return (r || []).sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0));
  },

  async obtener(id) {
    return tx('informes', 'readonly', s => s.get(id));
  },

  async guardar(informe) {
    informe.actualizado = Date.now();
    await tx('informes', 'readwrite', s => s.put(informe));
    return informe;
  },

  async borrar(id) {
    return tx('informes', 'readwrite', s => s.delete(id));
  },

  async ajuste(clave, valor) {
    if (valor === undefined) return tx('ajustes', 'readonly', s => s.get(clave));
    return tx('ajustes', 'readwrite', s => s.put(valor, clave));
  },

  // Pide al navegador que no borre los datos si se queda sin espacio.
  // En iOS esto es lo que evita que se pierda un informe sin publicar.
  async protegerAlmacenamiento() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  },

  async espacio() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usado: usage || 0, total: quota || 0 };
  }
};
