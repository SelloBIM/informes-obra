// Conexión con Autodesk Construction Cloud.
//
// Autenticación: OAuth 2.0 "authorization code + PKCE". Es el flujo pensado
// para apps que viven en el navegador: no hay client secret, no hay servidor.
// Cada persona entra con su propia cuenta de Autodesk, así que la app solo
// puede escribir donde esa persona ya tiene permiso en ACC.
//
// Publicación: Data Management API v2 (gratuita en el tier Free de APS).

const BASE = 'https://developer.api.autodesk.com';
const AUTH = BASE + '/authentication/v2';
const CLAVE_SESION = 'acc.sesion';
const CLAVE_PKCE = 'acc.pkce';

// ---------------------------------------------------------------- utilidades

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function retoPkce() {
  const verificador = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador));
  return { verificador, reto: b64url(new Uint8Array(hash)) };
}

// La URL que debes registrar como Callback URL en aps.autodesk.com/myapps.
// Tiene que coincidir carácter por carácter con lo que se registre allá.
export function urlRetorno() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null'); }
  catch { return null; }
}

function escribirSesion(s) {
  if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
  else localStorage.removeItem(CLAVE_SESION);
}

function guardarTokens(data) {
  const prev = leerSesion() || {};
  escribirSesion({
    access_token: data.access_token,
    refresh_token: data.refresh_token || prev.refresh_token,
    expira: Date.now() + (data.expires_in || 3600) * 1000 - 120000,
    usuario: prev.usuario || null
  });
}

// ------------------------------------------------------------ autenticación

export const auth = {

  haySesion() {
    const s = leerSesion();
    return !!(s && (s.refresh_token || s.expira > Date.now()));
  },

  usuario() {
    const s = leerSesion();
    return s ? s.usuario : null;
  },

  // Las sesiones abiertas con versiones anteriores no guardaron el nombre.
  // Se consulta una vez y queda guardado.
  async asegurarUsuario() {
    const u = this.usuario();
    if (u && u.nombre) return u;
    return cargarPerfil();
  },

  async entrar() {
    const { verificador, reto } = await retoPkce();
    const estado = b64url(crypto.getRandomValues(new Uint8Array(12)));
    // Autodesk exige un nonce cuando se pide "openid" (para recibir el nombre
    // de la persona en el id_token). Se compara al volver.
    const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)));
    // En localStorage y no en sessionStorage: cuando la PWA está instalada,
    // el regreso desde Autodesk puede llegar en un contexto distinto.
    localStorage.setItem(CLAVE_PKCE, JSON.stringify({ verificador, estado, nonce, ts: Date.now() }));

    const p = new URLSearchParams({
      response_type: 'code',
      client_id: CONFIG.CLIENT_ID,
      redirect_uri: urlRetorno(),
      scope: CONFIG.SCOPES,
      state: estado,
      code_challenge: reto,
      code_challenge_method: 'S256',
      nonce,
      prompt: 'login'
    });
    location.href = `${AUTH}/authorize?${p}`;
  },

  // Se llama al arrancar. Si venimos de vuelta de Autodesk, canjea el código.
  // Devuelve true si acabamos de iniciar sesión.
  async procesarRetorno() {
    const q = new URLSearchParams(location.search);
    const codigo = q.get('code');
    const error = q.get('error');

    if (error) {
      limpiarUrl();
      throw new Error(q.get('error_description') || error);
    }
    if (!codigo) return false;

    const pkce = JSON.parse(localStorage.getItem(CLAVE_PKCE) || 'null');
    localStorage.removeItem(CLAVE_PKCE);
    limpiarUrl();

    if (!pkce) throw new Error('La sesión de ingreso expiró. Vuelve a entrar.');
    if (pkce.estado !== q.get('state')) throw new Error('La respuesta de Autodesk no coincide con la solicitud. Vuelve a entrar.');

    const cuerpo = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CONFIG.CLIENT_ID,
      code: codigo,
      code_verifier: pkce.verificador,
      redirect_uri: urlRetorno()
    });

    const r = await fetch(`${AUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.error || 'No se pudo completar el ingreso.');

    guardarTokens(data);
    const delToken = usuarioDeIdToken(data.id_token, pkce.nonce);
    if (delToken) {
      const s = leerSesion();
      s.usuario = delToken;
      escribirSesion(s);
    } else {
      await cargarPerfil();
    }
    return true;
  },

  salir() {
    escribirSesion(null);
    localStorage.removeItem(CLAVE_PKCE);
  },

  async token() {
    const s = leerSesion();
    if (!s) throw new Error('SIN_SESION');
    if (s.expira > Date.now()) return s.access_token;
    if (!s.refresh_token) { escribirSesion(null); throw new Error('SIN_SESION'); }

    const r = await fetch(`${AUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CONFIG.CLIENT_ID,
        refresh_token: s.refresh_token
        // Sin "scope": así se renuevan los mismos permisos con que se entró.
        // Si se enviara la lista de config.js y esta tiene permisos nuevos,
        // Autodesk rechazaría la renovación y cerraría la sesión.
      })
    });
    if (!r.ok) { escribirSesion(null); throw new Error('SIN_SESION'); }
    guardarTokens(await r.json());
    return leerSesion().access_token;
  }
};

function limpiarUrl() {
  history.replaceState(null, '', urlRetorno());
}

// Nombre y correo de quien inició sesión, para llenar "Elaborado por".
// /userinfo es el endpoint vigente y no pide permisos adicionales. El
// anterior (/userprofile/v1/users/@me) está obsoleto y exige un permiso que
// la app no pide; se deja solo como respaldo.
async function cargarPerfil() {
  const s = leerSesion();
  if (!s) return null;
  let usuario = null;
  const fallas = [];
  try {
    usuario = usuarioDeClaims(await api('GET', '/userinfo'));
  } catch (e) { fallas.push('userinfo: ' + (e.status || e.message)); }
  if (!usuario) {
    try {
      const p = await api('GET', '/userprofile/v1/users/@me');
      usuario = { nombre: p.firstName ? `${p.firstName} ${p.lastName || ''}`.trim() : (p.userName || ''), correo: p.emailId || '' };
    } catch (e) { fallas.push('users/@me: ' + (e.status || e.message)); }
  }
  // Se deja anotado por qué no se pudo, para mostrarlo en el menú ⋯.
  perfilFalla = usuario ? '' : fallas.join(' · ');
  if (usuario) {
    const actual = leerSesion();
    if (actual) { actual.usuario = usuario; escribirSesion(actual); }
  }
  return usuario;
}

let perfilFalla = '';
export function motivoSinNombre() { return perfilFalla; }

function usuarioDeClaims(c) {
  if (!c) return null;
  const nombre = (c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || c.preferred_username || '').trim();
  return (nombre || c.email) ? { nombre, correo: c.email || '' } : null;
}

// El id_token es un JWT: tres partes en base64 separadas por puntos. La del
// medio trae los datos de la persona. No hace falta verificar la firma: llegó
// directo de Autodesk por HTTPS y solo se usa para prellenar un campo.
function usuarioDeIdToken(idToken, nonceEsperado) {
  if (!idToken) return null;
  try {
    const parte = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(parte).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const c = JSON.parse(json);
    if (nonceEsperado && c.nonce && c.nonce !== nonceEsperado) return null;
    return usuarioDeClaims(c);
  } catch { return null; }
}

// ------------------------------------------------------------------ API base

async function api(metodo, ruta, cuerpo, tipo) {
  const token = await auth.token();
  const cab = { Authorization: 'Bearer ' + token };
  if (cuerpo) cab['Content-Type'] = tipo || 'application/vnd.api+json';

  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: cab,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });

  if (r.status === 204) return null;
  const texto = await r.text();
  const data = texto ? JSON.parse(texto) : null;

  if (!r.ok) {
    const e = new Error(mensajeError(r.status, data));
    e.status = r.status;
    e.data = data;
    throw e;
  }
  return data;
}

function mensajeError(status, data) {
  const det = data && (
    (data.errors && data.errors[0] && (data.errors[0].detail || data.errors[0].title)) ||
    data.detail || data.reason || data.developerMessage || data.errorMessage
  );
  if (status === 401) return 'La sesión con Autodesk venció. Vuelve a entrar.';
  if (status === 403) return det || 'Autodesk negó el acceso. Revisa que el Client ID esté aprobado en Custom Integrations y que tengas permiso de carga en esa carpeta.';
  if (status === 409) return 'CONFLICTO';
  return det ? `${det} (HTTP ${status})` : `Autodesk respondió con un error HTTP ${status}.`;
}

// ----------------------------------------------------- navegación de ACC

export const acc = {

  // Cuentas de ACC / BIM 360 visibles para esta persona.
  async cuentas() {
    const r = await api('GET', '/project/v1/hubs');
    return (r.data || [])
      .filter(h => h.id.startsWith('b.'))
      .map(h => ({ id: h.id, nombre: h.attributes.name }));
  },

  async proyectos(hubId) {
    const salida = [];
    let ruta = `/project/v1/hubs/${encodeURIComponent(hubId)}/projects?page[limit]=200`;
    while (ruta) {
      const r = await api('GET', ruta);
      for (const p of (r.data || [])) salida.push({ id: p.id, nombre: p.attributes.name });
      const sig = r.links && r.links.next && r.links.next.href;
      ruta = sig ? sig.replace(BASE, '') : null;
    }
    return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },

  // Carpetas de primer nivel del proyecto (normalmente "Project Files").
  async carpetasRaiz(hubId, projectId) {
    const r = await api('GET', `/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`);
    return (r.data || []).map(f => ({ id: f.id, nombre: f.attributes.displayName || f.attributes.name }));
  },

  async subcarpetas(projectId, folderId) {
    const r = await api('GET',
      `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents` +
      `?filter[type]=folders&page[limit]=200`);
    return (r.data || [])
      .filter(f => !f.attributes.hidden)
      .map(f => ({ id: f.id, nombre: f.attributes.displayName || f.attributes.name }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },

  // ¿Ya existe un archivo con ese nombre? Si existe subimos una versión nueva
  // en vez de crear un duplicado. Se consulta el contenido de la carpeta y no
  // el endpoint de búsqueda, porque ese devuelve versiones y aquí hace falta
  // el ítem.
  async buscarArchivo(projectId, folderId, nombre) {
    const base = `/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents`;

    try {
      const r = await api('GET', `${base}?filter[type]=items&filter[attributes.displayName]=${encodeURIComponent(nombre)}&page[limit]=10`);
      const hit = (r.data || []).find(d => d.type === 'items');
      if (hit) return hit.id;
    } catch { /* el filtro por nombre no siempre está disponible */ }

    // Respaldo: recorrer la carpeta y comparar nombres. Se limita a unas pocas
    // páginas para no castigar la conexión de la obra.
    try {
      let ruta = `${base}?filter[type]=items&page[limit]=200`;
      for (let pagina = 0; ruta && pagina < 5; pagina++) {
        const r = await api('GET', ruta);
        const hit = (r.data || []).find(d =>
          d.type === 'items' && (d.attributes.displayName || d.attributes.name) === nombre);
        if (hit) return hit.id;
        const sig = r.links && r.links.next && r.links.next.href;
        ruta = sig ? sig.replace(BASE, '') : null;
      }
    } catch { /* si no se puede listar, se intenta crear y se maneja el 409 */ }

    return null;
  },

  // Sube el PDF y lo deja como archivo del proyecto.
  // onPaso(texto, porcentaje) reporta avance para la barra de progreso.
  async publicar({ projectId, folderId, nombre, blob, onPaso }) {
    const paso = (t, p) => onPaso && onPaso(t, p);

    paso('Reservando el espacio en el proyecto', 5);
    const st = await api('POST', `/data/v1/projects/${encodeURIComponent(projectId)}/storage`, {
      jsonapi: { version: '1.0' },
      data: {
        type: 'objects',
        attributes: { name: nombre },
        relationships: { target: { data: { type: 'folders', id: folderId } } }
      }
    });

    const objectId = st.data.id; // urn:adsk.objects:os.object:<bucket>/<clave>
    const m = /^urn:adsk\.objects:os\.object:([^/]+)\/(.+)$/.exec(objectId);
    if (!m) throw new Error('Autodesk devolvió un destino de carga que la app no reconoce.');
    const bucket = m[1], clave = encodeURIComponent(m[2]);

    paso('Pidiendo permiso de carga', 12);
    const firma = await api('GET',
      `/oss/v2/buckets/${bucket}/objects/${clave}/signeds3upload?minutesExpiration=60`);

    paso('Subiendo el PDF', 15);
    await subirConProgreso(firma.urls[0], blob, pct => paso('Subiendo el PDF', 15 + Math.round(pct * 0.65)));

    paso('Cerrando la carga', 82);
    await api('POST', `/oss/v2/buckets/${bucket}/objects/${clave}/signeds3upload`,
      { uploadKey: firma.uploadKey }, 'application/json');

    paso('Registrando el archivo en ACC', 90);
    const existente = await this.buscarArchivo(projectId, folderId, nombre);

    if (existente) {
      const v = await api('POST', `/data/v1/projects/${encodeURIComponent(projectId)}/versions`, {
        jsonapi: { version: '1.0' },
        data: {
          type: 'versions',
          attributes: { name: nombre, extension: { type: 'versions:autodesk.bim360:File', version: '1.0' } },
          relationships: {
            item: { data: { type: 'items', id: existente } },
            storage: { data: { type: 'objects', id: objectId } }
          }
        }
      });
      paso('Publicado', 100);
      return { itemId: existente, versionId: v.data.id, nuevaVersion: true };
    }

    try {
      const it = await api('POST', `/data/v1/projects/${encodeURIComponent(projectId)}/items`, {
        jsonapi: { version: '1.0' },
        data: {
          type: 'items',
          attributes: { displayName: nombre, extension: { type: 'items:autodesk.bim360:File', version: '1.0' } },
          relationships: {
            tip: { data: { type: 'versions', id: '1' } },
            parent: { data: { type: 'folders', id: folderId } }
          }
        },
        included: [{
          type: 'versions',
          id: '1',
          attributes: { name: nombre, extension: { type: 'versions:autodesk.bim360:File', version: '1.0' } },
          relationships: { storage: { data: { type: 'objects', id: objectId } } }
        }]
      });
      paso('Publicado', 100);
      return { itemId: it.data.id, versionId: (it.included && it.included[0] && it.included[0].id) || null, nuevaVersion: false };
    } catch (e) {
      // Carrera: alguien creó el archivo entre la búsqueda y la creación.
      if (e.status !== 409) throw e;
      const id = await this.buscarArchivo(projectId, folderId, nombre);
      if (!id) throw new Error('Ya existe un archivo con ese nombre en la carpeta y la app no pudo abrirlo para versionar.');
      const v = await api('POST', `/data/v1/projects/${encodeURIComponent(projectId)}/versions`, {
        jsonapi: { version: '1.0' },
        data: {
          type: 'versions',
          attributes: { name: nombre, extension: { type: 'versions:autodesk.bim360:File', version: '1.0' } },
          relationships: {
            item: { data: { type: 'items', id } },
            storage: { data: { type: 'objects', id: objectId } }
          }
        }
      });
      paso('Publicado', 100);
      return { itemId: id, versionId: v.data.id, nuevaVersion: true };
    }
  }
};

// fetch no reporta avance de subida; XHR sí, y en obra la barra importa.
function subirConProgreso(url, blob, onPct) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.upload.onprogress = e => { if (e.lengthComputable) onPct(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300)
      ? resolve()
      : reject(new Error(`La carga del archivo falló (HTTP ${x.status}).`));
    x.onerror = () => reject(new Error('Se perdió la conexión mientras se subía el PDF.'));
    x.ontimeout = () => reject(new Error('La carga tardó demasiado. Intenta con mejor señal.'));
    x.send(blob);
  });
}
