// Armado del PDF. Todo ocurre en el teléfono: ninguna foto sale del equipo
// hasta que la persona pulsa "Publicar en ACC".
//
// Estructura: portada con logo y datos, luego una sección por observación
// (número, título, actividad, condición actual, condición ideal,
// observaciones y sus fotos en cuadrícula de dos columnas).

const { PDFDocument, StandardFonts, rgb } = PDFLib;

const HOJA = { ancho: 612, alto: 792 };      // Carta vertical
const MARGEN = 48;
const ANCHO = HOJA.ancho - MARGEN * 2;       // 516
const SANGRIA = 32;                          // texto de la observación

const ROJO    = rgb(0.929, 0.110, 0.141);    // #ED1C24
const NEGRO   = rgb(0.137, 0.122, 0.125);    // #231F20
const TEXTO   = rgb(0.231, 0.220, 0.224);
const GRIS    = rgb(0.455, 0.459, 0.467);
const LINEA   = rgb(0.851, 0.851, 0.855);
const FONDO   = rgb(0.945, 0.945, 0.945);
const BLANCO  = rgb(1, 1, 1);

// Rejilla de fotos
const COLS  = 2;
const HUECO = 12;
const CELDA_W = (ANCHO - HUECO * (COLS - 1)) / COLS;   // 252
const CELDA_H = Math.round(CELDA_W * 0.75);            // 189
const PIE_FOTO = 12;
const FILA_H = CELDA_H + PIE_FOTO;

// Helvetica usa codificación WinAnsi: las tildes y la ñ entran bien, pero
// un emoji o un guion raro rompen el documento. Se limpian antes.
function limpiar(t) {
  return String(t == null ? '' : t)
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .split('')
    .filter(c => { const n = c.charCodeAt(0); return n === 10 || (n >= 32 && n <= 255); })
    .join('');
}

function cortar(texto, fuente, tam, anchoMax) {
  const lineas = [];
  for (const parrafo of limpiar(texto).split('\n')) {
    if (!parrafo.trim()) { lineas.push(''); continue; }
    let linea = '';
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? linea + ' ' + palabra : palabra;
      if (fuente.widthOfTextAtSize(prueba, tam) <= anchoMax) { linea = prueba; continue; }
      if (linea) lineas.push(linea);
      if (fuente.widthOfTextAtSize(palabra, tam) > anchoMax) {
        let trozo = '';
        for (const c of palabra) {
          if (fuente.widthOfTextAtSize(trozo + c, tam) > anchoMax) { lineas.push(trozo); trozo = c; }
          else trozo += c;
        }
        linea = trozo;
      } else linea = palabra;
    }
    lineas.push(linea);
  }
  return lineas;
}

// Campos de texto de cada observación, en el orden en que se imprimen.
const CAMPOS_TEXTO = [
  ['actividad', 'Actividad'],
  ['condicionActual', 'Condición actual'],
  ['condicionIdeal', 'Condición ideal'],
  ['notas', 'Observaciones']
];

function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

export async function generarPdf(informe, { empresa, logo }) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fuerte = await doc.embedFont(StandardFonts.HelveticaBold);

  const observaciones = (informe.observaciones || []).filter(o =>
    (o.fotos || []).length || CAMPOS_TEXTO.some(([k]) => (o[k] || '').trim()) || (o.titulo || '').trim());
  const totalFotos = observaciones.reduce((n, o) => n + (o.fotos || []).length, 0);
  const proyecto = informe.proyecto?.proyectoNombre || 'Proyecto';

  doc.setTitle(limpiar(`Informe de obra - ${proyecto} - ${fecha(informe.cabecera?.fecha)}`));
  doc.setAuthor(limpiar(informe.cabecera?.responsable || empresa));
  doc.setProducer(limpiar(empresa));
  doc.setCreationDate(new Date());

  // Logo opcional: PNG o JPG, se encoge para no pasar de 40 pt de alto.
  let marca = null;
  if (logo) {
    try {
      const bytes = new Uint8Array(logo);
      marca = (bytes[0] === 0x89 && bytes[1] === 0x50)
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);
    } catch { marca = null; }
  }
  const marcaAlto = marca ? Math.min(34, marca.height) : 0;
  const marcaEscala = marca ? marcaAlto / marca.height : 1;
  const marcaAncho = marca ? Math.min(marca.width * marcaEscala, 150) : 0;

  const paginas = [];

  function nuevaPagina() {
    const p = doc.addPage([HOJA.ancho, HOJA.alto]);
    paginas.push(p);
    p.drawRectangle({ x: 0, y: HOJA.alto - 5, width: HOJA.ancho, height: 5, color: ROJO });
    return p;
  }

  // Cabecera de página de contenido. Devuelve la Y donde empieza el cuerpo.
  function encabezado(p) {
    const yTop = HOJA.alto - 34;
    if (marca) {
      p.drawImage(marca, { x: MARGEN, y: yTop - marcaAlto + 9, width: marcaAncho, height: marcaAlto });
    } else {
      p.drawText(limpiar(empresa), { x: MARGEN, y: yTop, size: 9, font: fuerte, color: NEGRO });
    }
    const der = limpiar([proyecto, informe.cabecera?.frente, fecha(informe.cabecera?.fecha)].filter(Boolean).join('  ·  '));
    const anchoDer = normal.widthOfTextAtSize(der, 8.5);
    p.drawText(der, { x: HOJA.ancho - MARGEN - Math.min(anchoDer, ANCHO), y: yTop, size: 8.5, font: normal, color: GRIS });
    const yLinea = yTop - (marca ? marcaAlto - 4 : 10);
    p.drawLine({ start: { x: MARGEN, y: yLinea }, end: { x: HOJA.ancho - MARGEN, y: yLinea }, thickness: 0.75, color: LINEA });
    return yLinea - 30;
  }

  // ------------------------------------------------------------- portada
  const pc = nuevaPagina();
  let y = HOJA.alto - 60;

  if (marca) {
    pc.drawImage(marca, { x: MARGEN, y: y - marcaAlto, width: marcaAncho, height: marcaAlto });
    y -= marcaAlto + 46;
  } else {
    pc.drawText(limpiar(empresa).toUpperCase(), { x: MARGEN, y, size: 10, font: fuerte, color: NEGRO });
    y -= 46;
  }

  pc.drawText('Informe de obra', { x: MARGEN, y: y - 26, size: 34, font: fuerte, color: NEGRO });
  y -= 36;

  for (const l of cortar(proyecto, normal, 16, ANCHO)) {
    y -= 21;
    pc.drawText(l, { x: MARGEN, y, size: 16, font: normal, color: ROJO });
  }

  y -= 14;
  pc.drawLine({ start: { x: MARGEN, y }, end: { x: HOJA.ancho - MARGEN, y }, thickness: 2.5, color: NEGRO });
  y -= 30;

  // Datos en dos columnas
  const datos = [
    ['Frente o área', informe.cabecera?.frente],
    ['Fecha de visita', fechaLarga(informe.cabecera?.fecha)],
    ['Elaborado por', informe.cabecera?.responsable],
    // Clima ya no se pide; se conserva solo para informes viejos que lo tengan.
    ['Clima', informe.cabecera?.clima],
    ['Carpeta en ACC', informe.proyecto?.carpetaRuta],
    ['Contenido', `${observaciones.length} ${observaciones.length === 1 ? 'observación' : 'observaciones'} · ${totalFotos} foto${totalFotos === 1 ? '' : 's'}`]
  ].filter(([, v]) => v);

  const colW = (ANCHO - 24) / 2;
  let fila = 0;
  for (let i = 0; i < datos.length; i += 2) {
    const yFila = y - fila * 44;
    for (let c = 0; c < 2 && i + c < datos.length; c++) {
      const [etiqueta, valor] = datos[i + c];
      const x = MARGEN + c * (colW + 24);
      pc.drawText(limpiar(etiqueta), { x, y: yFila, size: 8, font: normal, color: GRIS });
      const lineas = cortar(valor, fuerte, 11, colW).slice(0, 2);
      lineas.forEach((l, k) => pc.drawText(l, { x, y: yFila - 14 - k * 13, size: 11, font: fuerte, color: NEGRO }));
    }
    fila++;
  }
  y -= fila * 44 + 6;

  // Observaciones generales ya no se piden; solo salen en informes viejos.
  if (informe.cabecera?.resumen) {
    pc.drawLine({ start: { x: MARGEN, y }, end: { x: HOJA.ancho - MARGEN, y }, thickness: 0.75, color: LINEA });
    y -= 26;
    pc.drawText('Observaciones generales', { x: MARGEN, y, size: 9.5, font: fuerte, color: NEGRO });
    y -= 19;
    for (const l of cortar(informe.cabecera.resumen, normal, 11, ANCHO)) {
      if (y < 90) break;
      pc.drawText(l, { x: MARGEN, y, size: 11, font: normal, color: TEXTO });
      y -= 15.5;
    }
  }

  // --------------------------------------------------------- observaciones
  if (observaciones.length) {
    let p = nuevaPagina();
    let cursor = encabezado(p);

    const saltar = () => { p = nuevaPagina(); cursor = encabezado(p); };

    for (let i = 0; i < observaciones.length; i++) {
      const obs = observaciones[i];
      const fotos = obs.fotos || [];
      const titulo = (obs.titulo || '').trim() || `Observación ${i + 1}`;
      const lineasTitulo = cortar(titulo, fuerte, 13, ANCHO - SANGRIA);

      // Bloques de texto con su etiqueta. Los campos vacíos no se imprimen.
      const bloques = CAMPOS_TEXTO
        .filter(([k]) => (obs[k] || '').trim())
        .map(([k, etiqueta]) => ({ etiqueta, lineas: cortar(obs[k].trim(), normal, 10.5, ANCHO - SANGRIA) }));
      const altoBloques = bloques.reduce((h, b) => h + 13 + b.lineas.length * 14 + 6, 0);

      // El encabezado de la observación no se separa de su primera fila de fotos.
      const altoCabeza = lineasTitulo.length * 16 + (bloques.length ? altoBloques + 4 : 0) + 14;
      const minimo = Math.min(altoCabeza + (fotos.length ? FILA_H : 0), HOJA.alto - 200);
      if (cursor - minimo < 78) saltar();

      // Número en cuadro rojo
      p.drawRectangle({ x: MARGEN, y: cursor - 17, width: 22, height: 22, color: ROJO });
      const num = String(i + 1);
      p.drawText(num, {
        x: MARGEN + 11 - fuerte.widthOfTextAtSize(num, 12) / 2,
        y: cursor - 11, size: 12, font: fuerte, color: BLANCO
      });

      lineasTitulo.forEach((l, k) => {
        p.drawText(l, { x: MARGEN + SANGRIA, y: cursor - 10 - k * 16, size: 13, font: fuerte, color: NEGRO });
      });
      cursor -= lineasTitulo.length * 16 + 8;

      if (bloques.length) {
        cursor -= 4;
        for (const b of bloques) {
          if (cursor < 100) saltar();
          p.drawText(limpiar(b.etiqueta).toUpperCase(), { x: MARGEN + SANGRIA, y: cursor - 8, size: 7.5, font: fuerte, color: GRIS });
          cursor -= 13;
          b.lineas.forEach(l => {
            if (cursor < 86) saltar();
            p.drawText(l, { x: MARGEN + SANGRIA, y: cursor - 8, size: 10.5, font: normal, color: TEXTO });
            cursor -= 14;
          });
          cursor -= 6;
        }
      }
      cursor -= 8;

      // Cuadrícula de fotos
      for (let f = 0; f < fotos.length; f += COLS) {
        if (cursor - FILA_H < 70) saltar();
        for (let c = 0; c < COLS && f + c < fotos.length; c++) {
          const x = MARGEN + c * (CELDA_W + HUECO);
          const yCelda = cursor - CELDA_H;

          p.drawRectangle({ x, y: yCelda, width: CELDA_W, height: CELDA_H, color: FONDO });

          const bytes = new Uint8Array(await fotos[f + c].blob.arrayBuffer());
          const img = await doc.embedJpg(bytes);
          const esc = Math.min(CELDA_W / img.width, CELDA_H / img.height);
          const w = img.width * esc, h = img.height * esc;
          p.drawImage(img, { x: x + (CELDA_W - w) / 2, y: yCelda + (CELDA_H - h) / 2, width: w, height: h });

          p.drawRectangle({ x, y: yCelda, width: CELDA_W, height: CELDA_H, borderColor: LINEA, borderWidth: 0.75 });
          p.drawText(`${i + 1}.${f + c + 1}`, { x, y: yCelda - 9, size: 7.5, font: normal, color: GRIS });
        }
        cursor -= FILA_H + 6;
      }

      if (i < observaciones.length - 1) {
        cursor -= 10;
        if (cursor > 76) {
          p.drawLine({ start: { x: MARGEN, y: cursor }, end: { x: HOJA.ancho - MARGEN, y: cursor }, thickness: 0.75, color: LINEA });
          cursor -= 24;
        }
      }
    }
  }

  // --------------------------------------------------------- pie de página
  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  paginas.forEach((p, i) => {
    const izq = limpiar(`${empresa}  ·  Generado el ${generado}`);
    const der = `${i + 1} / ${paginas.length}`;
    p.drawLine({ start: { x: MARGEN, y: 50 }, end: { x: HOJA.ancho - MARGEN, y: 50 }, thickness: 0.5, color: LINEA });
    p.drawText(izq, { x: MARGEN, y: 37, size: 7.5, font: normal, color: GRIS });
    p.drawText(der, {
      x: HOJA.ancho - MARGEN - normal.widthOfTextAtSize(der, 7.5),
      y: 37, size: 7.5, font: normal, color: GRIS
    });
  });

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

// Nombre en ACC: <Proyecto como aparece en ACC>_<AAAA-MM-DD>_<HH-MM>.pdf,
// con la fecha y hora de publicación (hora local, formato 24 h).
// Ej.: AIV2210_Providencia_2026-10-28_14-35.pdf
// La hora va con guion porque los dos puntos no se permiten en nombres de
// archivo de ACC ni de Windows. Como cada publicación lleva su hora, cada vez
// que se publica queda un archivo nuevo, no una versión del anterior.
export function nombreArchivo(informe, cuando = new Date()) {
  const proyecto = String(informe.proyecto?.proyectoNombre || 'Proyecto')
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '') || 'Proyecto';
  const dos = n => String(n).padStart(2, '0');
  const dia = `${cuando.getFullYear()}-${dos(cuando.getMonth() + 1)}-${dos(cuando.getDate())}`;
  const hora = `${dos(cuando.getHours())}-${dos(cuando.getMinutes())}`;
  return `${proyecto}_${dia}_${hora}.pdf`;
}
