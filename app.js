import { db, CAMPOS_OBS } from './db.js';
import { auth, acc, urlRetorno, motivoSinNombre } from './acc.js';
import { generarPdf, nombreArchivo } from './pdf.js';

const $ = s => document.querySelector(s);
const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };

const estado = {
  pantalla: 'entrar',
  informe: null,
  nav: null,
  instalador: null,
  logo: null
};

// El logo es opcional: si no existe logo.png en el servidor, el PDF sale con
// el nombre de la empresa en texto. Se guarda para que funcione sin señal.
async function cargarLogo() {
  try {
    const guardado = await db.ajuste('logo');
    if (guardado) estado.logo = guardado;
  } catch { /* sin logo guardado */ }
  if (!CONFIG.LOGO) return;
  try {
    const r = await fetch(CONFIG.LOGO, { cache: 'no-cache' });
    if (!r.ok) return;
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength < 64) return;
    estado.logo = bytes;
    db.ajuste('logo', bytes);
  } catch { /* sin red: se usa el guardado */ }
}

// ========================================================== arranque

// Se invoca al final del archivo, cuando ya están definidas todas las
// funciones y constantes. Si se llamara aquí mismo, el camino de "falta el
// Client ID" usaría PANTALLAS antes de existir y la app no mostraría el aviso.
async function iniciar() {
  registrarServiceWorker();
  vigilarRed();

  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID.startsWith('PEGA-AQUI')) {
    mostrarPantalla('entrar');
    errorEntrar(
      'Falta configurar la app',
      `Abre el archivo <code>config.js</code> y pega el Client ID de tu aplicación de Autodesk.
       Además, registra esta dirección como Callback URL:<br><code>${urlRetorno()}</code>`
    );
    $('#btn-entrar').disabled = true;
    return;
  }

  try {
    await auth.procesarRetorno();
  } catch (e) {
    mostrarPantalla('entrar');
    errorEntrar('No se pudo entrar', esc(e.message));
    return;
  }

  if (auth.haySesion()) {
    db.protegerAlmacenamiento();
    cargarLogo();
    auth.asegurarUsuario().catch(() => {});
    irALista();
  } else {
    mostrarPantalla('entrar');
  }
}

$('#btn-entrar').addEventListener('click', () => {
  $('#btn-entrar').disabled = true;
  $('#btn-entrar').textContent = 'Abriendo Autodesk…';
  auth.entrar().catch(e => {
    $('#btn-entrar').disabled = false;
    $('#btn-entrar').textContent = 'Entrar con mi cuenta de Autodesk';
    errorEntrar('No se pudo entrar', esc(e.message));
  });
});

function errorEntrar(titulo, html) {
  const c = $('#error-entrar');
  c.hidden = false;
  c.innerHTML = `<strong>${titulo}</strong>${html}`;
}

// ========================================================== pantallas

const PANTALLAS = { entrar: '#p-entrar', lista: '#p-lista', destino: '#p-destino', informe: '#p-informe' };

function mostrarPantalla(nombre) {
  estado.pantalla = nombre;
  for (const [k, sel] of Object.entries(PANTALLAS)) $(sel).hidden = (k !== nombre);
  if (nombre === 'entrar') accion(null);
  $('#btn-atras').hidden = (nombre === 'lista' || nombre === 'entrar');
  $('#btn-cuenta').hidden = (nombre === 'entrar');
  window.scrollTo(0, 0);
}

// Reserva abajo exactamente el alto de la barra de acción (uno o dos botones,
// más la franja segura del iPhone), para que no tape lo último de la pantalla.
if ('ResizeObserver' in window) {
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--alto-accion', $('#accion').offsetHeight + 'px');
  }).observe($('#accion'));
}

function ponerTitulo(t) { $('#barra-titulo').textContent = t; }

function accion(texto, fn, { secundario } = {}) {
  const b = $('#btn-accion'), s = $('#btn-accion-sec');
  $('#accion').hidden = !texto;
  document.body.classList.toggle('sin-accion', !texto);
  if (texto) { b.textContent = texto; b.onclick = fn; b.disabled = false; }
  if (secundario) { s.hidden = false; s.textContent = secundario.texto; s.onclick = secundario.fn; }
  else s.hidden = true;
}

$('#btn-atras').addEventListener('click', () => {
  if (estado.pantalla === 'informe') return irALista();
  if (estado.pantalla === 'destino') {
    if (estado.nav && estado.nav.pila.length) { estado.nav.pila.pop(); return pintarDestino(); }
    if (estado.nav && estado.nav.proyecto) { estado.nav.proyecto = null; return pintarDestino(); }
    if (estado.nav && estado.nav.hub) { estado.nav.hub = null; return pintarDestino(); }
    return estado.nav && estado.nav.volverA === 'informe' ? abrirInforme(estado.nav.informeId) : irALista();
  }
  irALista();
});

// ========================================================== lista

async function irALista() {
  mostrarPantalla('lista');
  ponerTitulo('Informes de obra');
  accion('Nuevo informe', () => iniciarDestino({ volverA: 'lista' }));
  await pintarLista();
}

async function pintarLista() {
  const cont = $('#lista-informes');
  cont.innerHTML = '';
  const informes = await db.listar();
  $('#lista-vacia').hidden = informes.length > 0;

  for (const inf of informes) {
    const fila = el('button', 'fila');
    fila.type = 'button';
    const txt = el('span', 'fila__texto');
    txt.appendChild(el('span', 'fila__titulo', inf.proyecto?.proyectoNombre || 'Sin proyecto'));
    // Se cuentan igual que en el PDF: una observación vacía no cuenta.
    const obs = (inf.observaciones || []).filter(o => o.fotos.length || CAMPOS_OBS.some(k => (o[k] || '').trim()));
    const nFotos = obs.reduce((n, o) => n + (o.fotos || []).length, 0);
    const partes = [
      inf.cabecera?.frente,
      fechaCorta(inf.cabecera?.fecha),
      `${obs.length} ${obs.length === 1 ? 'observación' : 'observaciones'}`,
      `${nFotos} foto${nFotos === 1 ? '' : 's'}`
    ].filter(Boolean);
    txt.appendChild(el('span', 'fila__detalle', partes.join(' · ')));
    fila.appendChild(txt);
    fila.appendChild(el('span', `marca marca--${inf.estado}`, inf.estado === 'publicado' ? 'Publicado' : 'Borrador'));
    fila.appendChild(el('span', 'fila__flecha', '›'));
    fila.addEventListener('click', () => abrirInforme(inf.id));
    cont.appendChild(fila);
  }

  const esp = await db.espacio();
  $('#pie-espacio').textContent = esp && esp.total
    ? `${informes.length} informe${informes.length === 1 ? '' : 's'} en el teléfono · ${mb(esp.usado)} de ${mb(esp.total)} usados`
    : '';
}

// ========================================================== elegir destino

function iniciarDestino({ volverA, informeId }) {
  estado.nav = { hub: null, proyecto: null, pila: [], volverA, informeId };
  mostrarPantalla('destino');
  ponerTitulo('Dónde publicar');
  pintarDestino();
}

async function pintarDestino() {
  const n = estado.nav;
  const lista = $('#destino-lista');
  const ruta = $('#destino-ruta');
  lista.innerHTML = '';
  lista.hidden = false;
  $('#destino-error').hidden = true;
  $('#destino-cargando').hidden = false;
  $('#destino-sin-resultados').hidden = true;
  $('#destino-buscador').hidden = true;
  $('#destino-buscar').value = '';
  accion(null);

  // Migas de pan
  ruta.innerHTML = '';
  ruta.hidden = !n.hub;
  if (n.hub) {
    agregarMiga(ruta, n.hub.nombre, () => { n.hub = null; n.proyecto = null; n.pila = []; pintarDestino(); }, !n.proyecto);
    if (n.proyecto) {
      agregarMiga(ruta, n.proyecto.nombre, () => { n.proyecto = null; n.pila = []; pintarDestino(); }, n.pila.length === 0);
      n.pila.forEach((c, i) => {
        agregarMiga(ruta, c.nombre, () => { n.pila = n.pila.slice(0, i + 1); pintarDestino(); }, i === n.pila.length - 1);
      });
    }
  }

  try {
    if (!n.hub) {
      $('#destino-ayuda').textContent = 'Elige la cuenta de Autodesk Construction Cloud.';
      const cuentas = await acc.cuentas();
      if (!cuentas.length) {
        $('#destino-cargando').hidden = true;
        return errorDestino(
          'No apareció ninguna cuenta de ACC',
          `Casi siempre significa que el Client ID de esta app todavía no está aprobado en ACC.
           Pídele a un administrador de la cuenta que entre a <strong>Account Admin → Custom Integrations</strong>,
           agregue el Client ID y lo apruebe. También revisa que tu usuario tenga acceso a algún proyecto.`
        );
      }
      cuentas.forEach(c => lista.appendChild(filaNav('🏢', c.nombre, null, () => { n.hub = c; pintarDestino(); })));

    } else if (!n.proyecto) {
      $('#destino-ayuda').textContent = 'Elige el proyecto.';
      const proyectos = await acc.proyectos(n.hub.id);
      if (!proyectos.length) {
        $('#destino-cargando').hidden = true;
        return errorDestino('Esta cuenta no tiene proyectos visibles para tu usuario', 'Pide que te agreguen al proyecto en ACC.');
      }
      proyectos.forEach(p => {
        const f = filaNav('📁', p.nombre, null, () => { n.proyecto = p; n.pila = []; pintarDestino(); });
        f.dataset.buscar = paraBuscar(p.nombre);
        lista.appendChild(f);
      });
      $('#destino-buscador').hidden = false;

    } else {
      $('#destino-ayuda').textContent = n.pila.length
        ? 'Entra a la subcarpeta o publica aquí mismo.'
        : 'Elige la carpeta del proyecto.';

      const carpetas = n.pila.length
        ? await acc.subcarpetas(n.proyecto.id, n.pila[n.pila.length - 1].id)
        : await acc.carpetasRaiz(n.hub.id, n.proyecto.id);

      carpetas.forEach(c => lista.appendChild(filaNav('📂', c.nombre, null, () => { n.pila.push(c); pintarDestino(); })));

      if (!carpetas.length && !n.pila.length) {
        $('#destino-cargando').hidden = true;
        return errorDestino('El proyecto no mostró carpetas', 'Revisa que tengas acceso al módulo de archivos de ese proyecto.');
      }
      if (!carpetas.length) lista.appendChild(filaNav('·', 'No hay subcarpetas', null, null));

      if (n.pila.length) {
        const actual = n.pila[n.pila.length - 1];
        accion(`Publicar en "${recortar(actual.nombre, 22)}"`, () => confirmarDestino(actual));
      }
    }
  } catch (e) {
    if (e.message === 'SIN_SESION') return cerrarSesion();
    errorDestino('ACC respondió con un error', esc(e.message));
  } finally {
    $('#destino-cargando').hidden = true;
  }
}

// Filtra la lista de proyectos mientras se escribe. Sin tildes ni mayúsculas:
// "raquira" encuentra "AIV2202_Ráquira".
function paraBuscar(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

$('#destino-buscar').addEventListener('input', () => {
  const q = paraBuscar($('#destino-buscar').value).trim();
  const palabras = q.split(/\s+/).filter(Boolean);
  let visibles = 0;
  for (const f of $('#destino-lista').children) {
    const ok = !palabras.length || palabras.every(w => (f.dataset.buscar || '').includes(w));
    f.hidden = !ok;
    if (ok) visibles++;
  }
  $('#destino-lista').hidden = visibles === 0;
  $('#destino-sin-resultados').hidden = visibles > 0;
});

function agregarMiga(cont, texto, fn, actual) {
  if (cont.children.length) cont.appendChild(el('span', 'ruta__sep', '›'));
  if (actual) { cont.appendChild(el('span', 'ruta__actual', recortar(texto, 26))); return; }
  const b = el('button', 'ruta__item', recortar(texto, 20));
  b.type = 'button'; b.onclick = fn;
  cont.appendChild(b);
}

function filaNav(icono, titulo, detalle, fn) {
  const f = el('button', 'fila'); f.type = 'button';
  f.appendChild(el('span', 'fila__icono', icono));
  const t = el('span', 'fila__texto');
  t.appendChild(el('span', 'fila__titulo', titulo));
  if (detalle) t.appendChild(el('span', 'fila__detalle', detalle));
  f.appendChild(t);
  if (fn) { f.appendChild(el('span', 'fila__flecha', '›')); f.addEventListener('click', fn); }
  else f.disabled = true;
  return f;
}

function errorDestino(titulo, html) {
  const c = $('#destino-error');
  c.hidden = false;
  c.innerHTML = `<strong>${titulo}</strong>${html}`;
}

async function confirmarDestino(carpeta) {
  const n = estado.nav;
  const destino = {
    hubId: n.hub.id, hubNombre: n.hub.nombre,
    proyectoId: n.proyecto.id, proyectoNombre: n.proyecto.nombre,
    carpetaId: carpeta.id,
    carpetaRuta: n.pila.map(c => c.nombre).join(' / ')
  };
  await db.ajuste('ultimoDestino', destino);

  if (n.volverA === 'informe' && n.informeId) {
    const inf = await db.obtener(n.informeId);
    inf.proyecto = destino;
    await db.guardar(inf);
    return abrirInforme(inf.id);
  }

  const inf = {
    id: db.nuevoId(),
    creado: Date.now(),
    estado: 'borrador',
    proyecto: destino,
    cabecera: { frente: '', fecha: hoy(), responsable: await nombreAutor() },
    observaciones: [obsVacia()]
  };
  await db.guardar(inf);
  abrirInforme(inf.id);
}

// "Elaborado por" se llena con el nombre de quien inició sesión en Autodesk.
// Si no se pudo leer (sin señal, por ejemplo), se usa el último nombre escrito
// en este teléfono. El campo sigue siendo editable.
async function nombreAutor() {
  let u = auth.usuario();
  if (!u || !u.nombre) { try { u = await auth.asegurarUsuario(); } catch { u = null; } }
  if (u && u.nombre) return u.nombre;
  return (await db.ajuste('ultimoAutor')) || '';
}

function obsVacia() {
  const o = { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), fotos: [] };
  for (const k of CAMPOS_OBS) o[k] = '';
  return o;
}

// ========================================================== editor

async function abrirInforme(id) {
  const inf = await db.obtener(id);
  if (!inf) return irALista();
  estado.informe = inf;
  mostrarPantalla('informe');
  ponerTitulo(inf.estado === 'publicado' ? 'Informe publicado' : 'Nuevo informe');

  if (inf.estado !== 'publicado' && !inf.cabecera.responsable) {
    inf.cabecera.responsable = await nombreAutor();
    if (inf.cabecera.responsable) await db.guardar(inf);
  }

  $('#f-frente').value = inf.cabecera.frente || '';
  $('#f-fecha').value = inf.cabecera.fecha || hoy();
  $('#f-responsable').value = inf.cabecera.responsable || '';

  pintarDestinoInforme();
  pintarObservaciones();
  actualizarAccionInforme();
}

function pintarDestinoInforme() {
  const inf = estado.informe;
  const c = $('#informe-destino');
  c.innerHTML = '';
  const t = el('span', 'destino__texto');
  t.appendChild(el('span', 'destino__proyecto', inf.proyecto.proyectoNombre));
  t.appendChild(el('span', 'destino__carpeta', inf.proyecto.carpetaRuta || 'Carpeta del proyecto'));
  c.appendChild(t);
  const b = el('button', 'destino__cambiar', 'Cambiar');
  b.type = 'button';
  b.onclick = () => iniciarDestino({ volverA: 'informe', informeId: inf.id });
  c.appendChild(b);
}

// --- autoguardado

let temporizador = null;
function guardarPronto() {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    const inf = estado.informe;
    if (!inf) return;
    inf.cabecera.frente = $('#f-frente').value.trim();
    inf.cabecera.fecha = $('#f-fecha').value;
    inf.cabecera.responsable = $('#f-responsable').value.trim();
    await db.guardar(inf);
    if (inf.cabecera.responsable) db.ajuste('ultimoAutor', inf.cabecera.responsable);
    actualizarAccionInforme();
  }, 400);
}
['#f-frente', '#f-fecha', '#f-responsable']
  .forEach(s => $(s).addEventListener('input', guardarPronto));
$('#f-frente').addEventListener('input', () => actualizarAccionInforme());

// --- fotos

// La observación a la que se le van a pegar las fotos que lleguen.
let obsActiva = 0;

$('#btn-nueva-obs').addEventListener('click', () => agregarObservacion());
$('#in-camara').addEventListener('change', e => agregarFotos(e.target));
$('#in-galeria').addEventListener('change', e => agregarFotos(e.target));

async function agregarFotos(input) {
  const archivos = Array.from(input.files || []).filter(f => f.type.startsWith('image/'));
  input.value = '';
  if (!archivos.length) return;

  const aviso = $('#procesando');
  aviso.hidden = false;

  for (let i = 0; i < archivos.length; i++) {
    aviso.textContent = archivos.length > 1 ? `Preparando foto ${i + 1} de ${archivos.length}…` : 'Preparando la foto…';
    try {
      const blob = await comprimir(archivos[i]);
      const obs = estado.informe.observaciones[obsActiva];
      if (!obs) break;
      obs.fotos.push({ id: 'f' + Date.now() + i, blob, ts: Date.now() });
    } catch {
      aviso.textContent = 'Una de las imágenes no se pudo leer. Tómala de nuevo.';
      await esperar(1800);
    }
  }

  await db.guardar(estado.informe);
  aviso.hidden = true;
  pintarObservaciones();
  actualizarAccionInforme();
}

// Las fotos de celular pesan 4-8 MB. Sin esto, un informe de 30 fotos
// sería imposible de subir con la señal de una obra.
async function comprimir(archivo) {
  let bitmap;
  try { bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); }
  catch { try { bitmap = await createImageBitmap(archivo); } catch { bitmap = await viaImagen(archivo); } }

  const lado = Math.max(bitmap.width, bitmap.height);
  const escala = Math.min(1, CONFIG.FOTO_LADO_MAX / lado);
  const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);

  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  // Siempre JPEG: es lo único que pdf-lib incrusta sin recomprimir.
  return new Promise((res, rej) =>
    lienzo.toBlob(b => b ? res(b) : rej(new Error('sin blob')), 'image/jpeg', CONFIG.FOTO_CALIDAD));
}

function viaImagen(archivo) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('imagen ilegible')); };
    img.src = url;
  });
}

async function agregarObservacion() {
  estado.informe.observaciones.push(obsVacia());
  await db.guardar(estado.informe);
  pintarObservaciones();
  actualizarAccionInforme();
  // Lleva el foco al título de la observación recién creada.
  const campos = document.querySelectorAll('.obs__titulo');
  const ultimo = campos[campos.length - 1];
  if (ultimo) { ultimo.focus(); ultimo.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

function pintarObservaciones() {
  const cont = $('#observaciones');
  cont.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
  cont.innerHTML = '';

  const obs = estado.informe.observaciones;
  $('#conteo-obs').textContent = obs.length;
  $('#obs-vacio').hidden = obs.length > 0;

  obs.forEach((o, i) => {
    const caja = el('div', 'obs');

    // --- barra con número y controles
    const barra = el('div', 'obs__barra');
    barra.appendChild(el('span', 'obs__num', String(i + 1)));
    barra.appendChild(el('span', 'obs__relleno'));
    barra.appendChild(botonIcono('↑', 'Subir', i === 0, () => moverObs(i, -1)));
    barra.appendChild(botonIcono('↓', 'Bajar', i === obs.length - 1, () => moverObs(i, 1)));
    barra.appendChild(botonIcono('✕', 'Eliminar observación', false, () => quitarObs(i)));
    caja.appendChild(barra);

    // --- campos de texto. Solo el título es obligatorio.
    for (const c of CAMPOS_EDITOR) {
      const id = `obs-${o.id}-${c.clave}`;
      const etiqueta = el('label', 'obs__etiqueta', c.etiqueta);
      etiqueta.htmlFor = id;
      if (c.obligatorio) {
        const req = el('span', 'obs__requerido', ' *');
        req.setAttribute('aria-hidden', 'true');
        etiqueta.appendChild(req);
      }
      caja.appendChild(etiqueta);

      const campo = c.area ? el('textarea', 'obs__campo obs__campo--area') : el('input', 'obs__campo obs__campo--linea');
      if (c.area) campo.rows = 2; else campo.type = 'text';
      if (c.clase) campo.classList.add(c.clase);
      if (c.obligatorio) campo.required = true;
      campo.id = id;
      campo.placeholder = c.ayuda;
      campo.value = o[c.clave] || '';
      campo.addEventListener('input', () => {
        o[c.clave] = campo.value;
        guardarObsPronto();
        // Cualquier campo cuenta: escribir en una observación sin título
        // debe bloquear la publicación hasta que se le ponga uno.
        actualizarAccionInforme();
      });
      caja.appendChild(campo);
    }

    // --- fotos
    if (o.fotos.length) {
      const rejilla = el('div', 'obs__fotos');
      o.fotos.forEach((foto, f) => {
        const celda = el('div', 'miniatura');
        const img = el('img', 'miniatura__img');
        img.src = URL.createObjectURL(foto.blob);
        img.alt = `Foto ${i + 1}.${f + 1}`;
        img.loading = 'lazy';
        celda.appendChild(img);
        celda.appendChild(el('span', 'miniatura__etiqueta', `${i + 1}.${f + 1}`));
        const quitar = el('button', 'miniatura__quitar', '✕');
        quitar.type = 'button';
        quitar.setAttribute('aria-label', `Quitar foto ${i + 1}.${f + 1}`);
        quitar.onclick = () => quitarFoto(i, f);
        celda.appendChild(quitar);
        rejilla.appendChild(celda);
      });
      caja.appendChild(rejilla);
    }

    // --- captura
    const botones = el('div', 'obs__captura');
    const camara = el('button', 'boton boton--negro boton--chico', o.fotos.length ? 'Otra foto' : 'Tomar foto');
    camara.type = 'button';
    camara.onclick = () => { obsActiva = i; $('#in-camara').click(); };
    const galeria = el('button', 'boton boton--borde boton--chico', 'Galería');
    galeria.type = 'button';
    galeria.onclick = () => { obsActiva = i; $('#in-galeria').click(); };
    botones.appendChild(camara);
    botones.appendChild(galeria);
    caja.appendChild(botones);

    cont.appendChild(caja);
  });
}

// Campos de cada observación, en el orden en que se muestran.
const CAMPOS_EDITOR = [
  { clave: 'titulo',          etiqueta: 'Título',           ayuda: 'Qué se encontró', obligatorio: true, clase: 'obs__titulo' },
  { clave: 'actividad',       etiqueta: 'Actividad',        ayuda: 'Ej.: mampostería, instalaciones eléctricas' },
  { clave: 'condicionActual', etiqueta: 'Condición actual', ayuda: 'Cómo está hoy', area: true },
  { clave: 'condicionIdeal',  etiqueta: 'Condición ideal',  ayuda: 'Cómo debería estar', area: true },
  { clave: 'notas',           etiqueta: 'Observaciones',    ayuda: 'Comentarios adicionales', area: true }
];

// Guardado diferido de los campos de las observaciones. No vuelve a pintar,
// para no sacarle el teclado al residente mientras escribe.
let tObs = null;
function guardarObsPronto() {
  clearTimeout(tObs);
  tObs = setTimeout(() => db.guardar(estado.informe), 400);
}

function botonIcono(simbolo, etiqueta, deshabilitado, fn) {
  const b = el('button', 'obs__accion', simbolo);
  b.type = 'button'; b.disabled = deshabilitado; b.title = etiqueta;
  b.setAttribute('aria-label', etiqueta);
  b.onclick = fn;
  return b;
}

async function moverObs(i, paso) {
  const o = estado.informe.observaciones;
  [o[i], o[i + paso]] = [o[i + paso], o[i]];
  await db.guardar(estado.informe);
  pintarObservaciones();
}

function quitarObs(i) {
  const o = estado.informe.observaciones[i];
  const tiene = o.fotos.length || CAMPOS_OBS.some(k => (o[k] || '').trim());
  const borrar = async () => {
    estado.informe.observaciones.splice(i, 1);
    await db.guardar(estado.informe);
    cerrarHoja();
    pintarObservaciones();
    actualizarAccionInforme();
  };
  if (!tiene) return borrar();
  abrirHoja('Eliminar la observación',
    `<p>Se borra el texto y ${o.fotos.length} foto${o.fotos.length === 1 ? '' : 's'} de este informe.</p>`, [
    { texto: 'Eliminar', clase: 'boton--primario', fn: borrar },
    { texto: 'Conservar', clase: 'boton--borde', fn: cerrarHoja }
  ]);
}

async function quitarFoto(i, f) {
  estado.informe.observaciones[i].fotos.splice(f, 1);
  await db.guardar(estado.informe);
  pintarObservaciones();
  actualizarAccionInforme();
}

$('#btn-borrar').addEventListener('click', () => {
  abrirHoja('Eliminar el informe', '<p>Se borran las fotos y los comentarios de este teléfono. Lo que ya esté publicado en ACC no se toca.</p>', [
    { texto: 'Eliminar', clase: 'boton--primario', fn: async () => { await db.borrar(estado.informe.id); cerrarHoja(); irALista(); } },
    { texto: 'Conservar', clase: 'boton--borde', fn: cerrarHoja }
  ]);
});

// --- acción principal del editor

function actualizarAccionInforme() {
  if (estado.pantalla !== 'informe') return;
  const inf = estado.informe;
  const obs = inf.observaciones || [];
  // Obligatorios: el frente o área del informe y el título de cada
  // observación. Una observación completamente vacía no cuenta (y no sale en
  // el PDF).
  const conContenido = obs.filter(o => o.fotos.length || CAMPOS_OBS.some(k => (o[k] || '').trim()));
  const sinTitulo = obs.findIndex(o => !(o.titulo || '').trim() && conContenido.includes(o));
  const faltan = [];
  if (!$('#f-frente').value.trim()) faltan.push('el frente o área');
  if (!conContenido.length) faltan.push(obs.length ? 'el título de la observación' : 'al menos una observación');
  else if (sinTitulo >= 0) faltan.push(obs.length > 1 ? `el título de la observación ${sinTitulo + 1}` : 'el título de la observación');

  const b = $('#btn-accion');
  if (faltan.length) {
    accion(`Falta ${faltan[0]}`, null);
    b.disabled = true;
  } else {
    accion(inf.estado === 'publicado' ? 'Publicar de nuevo' : 'Publicar en ACC', publicar,
      { secundario: { texto: 'Ver el PDF', fn: verPdf } });
  }
}

async function verPdf() {
  const b = $('#btn-accion-sec');
  b.disabled = true; b.textContent = 'Armando el PDF…';
  try {
    await sincronizarCampos();
    const blob = await generarPdf(estado.informe, { empresa: CONFIG.EMPRESA, logo: estado.logo });
    const nombre = nombreArchivo(estado.informe, new Date());
    const archivo = new File([blob], nombre, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: nombre });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('No se pudo armar el PDF: ' + e.message);
  } finally {
    b.disabled = false; b.textContent = 'Ver el PDF';
  }
}

async function sincronizarCampos() {
  clearTimeout(temporizador);
  const inf = estado.informe;
  inf.cabecera.frente = $('#f-frente').value.trim();
  inf.cabecera.fecha = $('#f-fecha').value;
  inf.cabecera.responsable = $('#f-responsable').value.trim();
  await db.guardar(inf);
}

// ========================================================== publicar

async function publicar() {
  await sincronizarCampos();
  const inf = estado.informe;
  const nombre = nombreArchivo(inf, new Date());

  abrirHoja('Publicando en ACC', `
    <p>Carpeta: <strong>${esc(inf.proyecto.carpetaRuta || 'Project Files')}</strong><br>
       Archivo: <strong>${esc(nombre)}</strong></p>
    <div class="progreso">
      <div class="progreso__via"><div class="progreso__barra" id="barra"></div></div>
      <p class="progreso__texto" id="progreso-texto">Armando el PDF…</p>
    </div>`, []);

  const avance = (t, p) => {
    const barra = $('#barra'), txt = $('#progreso-texto');
    if (barra) barra.style.width = p + '%';
    if (txt) txt.textContent = t + '…';
  };

  try {
    avance('Armando el PDF', 3);
    const blob = await generarPdf(inf, { empresa: CONFIG.EMPRESA, logo: estado.logo });

    const r = await acc.publicar({
      projectId: inf.proyecto.proyectoId,
      folderId: inf.proyecto.carpetaId,
      nombre, blob,
      onPaso: avance
    });

    inf.estado = 'publicado';
    inf.publicacion = {
      fecha: Date.now(), nombre,
      itemId: r.itemId, versionId: r.versionId,
      version: r.nuevaVersion ? 'nueva versión' : 'primera versión'
    };
    await db.guardar(inf);

    abrirHoja('Listo', `
      <p class="exito">✓ ${esc(nombre)}</p>
      <p>Quedó en <strong>${esc(inf.proyecto.proyectoNombre)}</strong>,
         carpeta <strong>${esc(inf.proyecto.carpetaRuta || 'Project Files')}</strong>,
         como ${r.nuevaVersion ? 'una versión nueva del archivo' : 'un archivo nuevo'}.</p>
      <p>Ábrelo desde ACC Docs para verlo o compartirlo con el equipo.</p>`, [
      { texto: 'Volver a mis informes', clase: 'boton--primario', fn: () => { cerrarHoja(); irALista(); } },
      { texto: 'Seguir en este informe', clase: 'boton--borde', fn: () => { cerrarHoja(); abrirInforme(inf.id); } }
    ]);

  } catch (e) {
    if (e.message === 'SIN_SESION') { cerrarHoja(); return cerrarSesion(); }
    abrirHoja('No se pudo publicar', `
      <p>${esc(e.message)}</p>
      <p>El informe sigue guardado completo en el teléfono. Puedes reintentar cuando tengas mejor señal.</p>`, [
      { texto: 'Reintentar', clase: 'boton--primario', fn: () => { cerrarHoja(); publicar(); } },
      { texto: 'Más tarde', clase: 'boton--borde', fn: cerrarHoja }
    ]);
  }
}

// ========================================================== menú de cuenta

$('#btn-cuenta').addEventListener('click', async () => {
  const u = auth.usuario();
  const esp = await db.espacio();
  const iosSinInstalar = esIOS() && !enModoApp();

  const acciones = [];
  if (estado.instalador) {
    acciones.push({ texto: 'Instalar la app', clase: 'boton--primario', fn: instalar });
  }
  acciones.push({ texto: 'Cerrar sesión', clase: 'boton--borde', fn: () => { cerrarHoja(); cerrarSesion(); } });
  acciones.push({ texto: 'Volver', clase: 'boton--texto', fn: cerrarHoja });

  const sinNombre = !(u && u.nombre);
  abrirHoja('Cuenta', `
    <p>${u ? `<strong>${esc(u.nombre || '')}</strong><br>${esc(u.correo || '')}` : 'Sesión activa con Autodesk.'}</p>
    ${sinNombre ? `<p>No se pudo leer tu nombre de Autodesk, así que "Elaborado por" no se llena solo.
       Cierra sesión y vuelve a entrar para darle ese permiso a la app.
       ${motivoSinNombre() ? `<br><small>Detalle: ${esc(motivoSinNombre())}</small>` : ''}</p>` : ''}
    ${esp && esp.total ? `<p>Espacio usado en el teléfono: ${mb(esp.usado)} de ${mb(esp.total)}.</p>` : ''}
    ${iosSinInstalar ? `<p><strong>Para instalarla en iPhone:</strong> abre esta página en Safari, toca el botón de compartir y elige "Agregar a pantalla de inicio".</p>` : ''}
  `, acciones);
});

function cerrarSesion() {
  auth.salir();
  estado.informe = null;
  mostrarPantalla('entrar');
  accion(null);
  $('#btn-entrar').disabled = false;
  $('#btn-entrar').textContent = 'Entrar con mi cuenta de Autodesk';
  $('#error-entrar').hidden = true;
  toast('Sesión cerrada. Tus informes siguen en el teléfono.');
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); estado.instalador = e; });

async function instalar() {
  cerrarHoja();
  if (!estado.instalador) return;
  estado.instalador.prompt();
  await estado.instalador.userChoice;
  estado.instalador = null;
}

// ========================================================== hoja y avisos

function abrirHoja(tit, html, acciones) {
  $('#hoja-titulo').textContent = tit;
  $('#hoja-cuerpo').innerHTML = html;
  const cont = $('#hoja-acciones');
  cont.innerHTML = '';
  (acciones || []).forEach(a => {
    const b = el('button', `boton ${a.clase} boton--ancho`, a.texto);
    b.type = 'button'; b.onclick = a.fn;
    cont.appendChild(b);
  });
  $('#hoja').hidden = false;
}
function cerrarHoja() { $('#hoja').hidden = true; }

let tToast = null;
function toast(texto) {
  const t = $('#toast');
  t.textContent = texto; t.hidden = false;
  clearTimeout(tToast);
  tToast = setTimeout(() => { t.hidden = true; }, 3600);
}

// ========================================================== varios

function vigilarRed() {
  const pintar = () => { $('#aviso-sin-red').hidden = navigator.onLine; };
  addEventListener('online', pintar); addEventListener('offline', pintar); pintar();
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function esperar(ms) { return new Promise(r => setTimeout(r, ms)); }
function mb(b) { return (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + ' MB'; }
function recortar(s, n) { return (s || '').length > n ? s.slice(0, n - 1) + '…' : (s || ''); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function esIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function enModoApp() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }

function fechaCorta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

iniciar();
