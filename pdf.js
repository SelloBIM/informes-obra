// Armado del PDF. Todo ocurre en el teléfono: ninguna foto sale del equipo
// hasta que la persona pulsa "Publicar en ACC".

const { PDFDocument, StandardFonts, rgb } = PDFLib;

const HOJA = { ancho: 612, alto: 792 };      // Carta vertical
const MARGEN = 42;
const ANCHO = HOJA.ancho - MARGEN * 2;

const ROJO = rgb(0.929, 0.110, 0.141);   // #ED1C24
const NEGRO = rgb(0.137, 0.122, 0.125);  // #231F20
const GRIS = rgb(0.541, 0.545, 0.553);   // #8A8B8D
const LINEA = rgb(0.851, 0.851, 0.855);  // #D9D9DA

// Helvetica usa codificación WinAnsi: las tildes y la ñ entran bien, pero
// un emoji o un guion largo raro rompen el documento. Se limpian antes.
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
      // Palabra sola más ancha que la caja (una URL, un código): se parte.
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

function fecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export async function generarPdf(informe, { empresa }) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fuerte = await doc.embedFont(StandardFonts.HelveticaBold);

  const fotos = informe.fotos || [];
  const porPagina = CONFIG.FOTOS_POR_PAGINA === 1 ? 1 : 2;
  const titulo = `${informe.proyecto?.proyectoNombre || 'Proyecto'}`;

  doc.setTitle(limpiar(`Informe de obra - ${titulo} - ${fecha(informe.cabecera?.fecha)}`));
  doc.setAuthor(limpiar(informe.cabecera?.responsable || empresa));
  doc.setProducer(limpiar(empresa));
  doc.setCreationDate(new Date());

  const paginas = [];

  function nuevaPagina() {
    const p = doc.addPage([HOJA.ancho, HOJA.alto]);
    paginas.push(p);
    // Franja superior
    p.drawRectangle({ x: 0, y: HOJA.alto - 6, width: HOJA.ancho, height: 6, color: ROJO });
    return p;
  }

  function encabezado(p, texto) {
    const y = HOJA.alto - 30;
    p.drawText(limpiar(empresa), { x: MARGEN, y, size: 9, font: fuerte, color: NEGRO });
    const der = limpiar(texto);
    p.drawText(der, {
      x: HOJA.ancho - MARGEN - normal.widthOfTextAtSize(der, 9),
      y, size: 9, font: normal, color: GRIS
    });
    p.drawLine({
      start: { x: MARGEN, y: y - 10 }, end: { x: HOJA.ancho - MARGEN, y: y - 10 },
      thickness: 0.75, color: LINEA
    });
    return y - 28;
  }

  // ------------------------------------------------------------- portada
  const pc = nuevaPagina();
  let y = encabezado(pc, 'Informe de obra');

  y -= 10;
  pc.drawText('Informe de obra', { x: MARGEN, y: y - 22, size: 30, font: fuerte, color: NEGRO });
  y -= 34;

  const sub = limpiar(titulo);
  for (const l of cortar(sub, normal, 15, ANCHO)) {
    y -= 20;
    pc.drawText(l, { x: MARGEN, y, size: 15, font: normal, color: ROJO });
  }

  y -= 26;
  pc.drawLine({ start: { x: MARGEN, y }, end: { x: HOJA.ancho - MARGEN, y }, thickness: 2, color: NEGRO });
  y -= 24;

  const datos = [
    ['Frente o área', informe.cabecera?.frente],
    ['Fecha de visita', fecha(informe.cabecera?.fecha)],
    ['Elaborado por', informe.cabecera?.responsable],
    ['Clima', informe.cabecera?.clima],
    ['Fotos', String(fotos.length)],
    ['Carpeta en ACC', informe.proyecto?.carpetaRuta]
  ].filter(([, v]) => v);

  for (const [etiqueta, valor] of datos) {
    pc.drawText(limpiar(etiqueta), { x: MARGEN, y, size: 9.5, font: normal, color: GRIS });
    const lineas = cortar(valor, fuerte, 11.5, ANCHO - 150);
    lineas.forEach((l, i) => {
      pc.drawText(l, { x: MARGEN + 150, y: y - i * 14, size: 11.5, font: fuerte, color: NEGRO });
    });
    y -= Math.max(22, lineas.length * 14 + 8);
  }

  if (informe.cabecera?.resumen) {
    y -= 8;
    pc.drawLine({ start: { x: MARGEN, y }, end: { x: HOJA.ancho - MARGEN, y }, thickness: 0.75, color: LINEA });
    y -= 22;
    pc.drawText('Observaciones generales', { x: MARGEN, y, size: 10, font: fuerte, color: NEGRO });
    y -= 18;
    for (const l of cortar(informe.cabecera.resumen, normal, 11, ANCHO)) {
      if (y < 70) { y = encabezado(nuevaPagina(), 'Informe de obra'); }
      const p = paginas[paginas.length - 1];
      p.drawText(l, { x: MARGEN, y, size: 11, font: normal, color: NEGRO });
      y -= 15;
    }
  }

  // --------------------------------------------------------------- fotos
  const altoCaja = porPagina === 1 ? 470 : 250;
  const bloque = porPagina === 1 ? 640 : 318;

  for (let i = 0; i < fotos.length; i++) {
    const enPagina = i % porPagina;
    let p, tope;
    if (enPagina === 0) {
      p = nuevaPagina();
      tope = encabezado(p, `${limpiar(titulo)} · ${fecha(informe.cabecera?.fecha)}`);
    } else {
      p = paginas[paginas.length - 1];
      tope = HOJA.alto - 58 - bloque * enPagina;
    }

    const foto = fotos[i];
    let cursor = tope;

    // Rótulo numerado: las fotos sí son una secuencia.
    p.drawText(`Foto ${i + 1}`, { x: MARGEN, y: cursor, size: 11, font: fuerte, color: ROJO });
    cursor -= 12;

    const bytes = new Uint8Array(await foto.blob.arrayBuffer());
    const img = await doc.embedJpg(bytes);
    const escala = Math.min(ANCHO / img.width, altoCaja / img.height, 1);
    const w = img.width * escala, h = img.height * escala;

    p.drawImage(img, { x: MARGEN + (ANCHO - w) / 2, y: cursor - h, width: w, height: h });
    p.drawRectangle({
      x: MARGEN + (ANCHO - w) / 2, y: cursor - h, width: w, height: h,
      borderColor: LINEA, borderWidth: 0.75
    });
    cursor -= h + 14;

    const comentario = foto.comentario || 'Sin comentario.';
    for (const l of cortar(comentario, normal, 10.5, ANCHO).slice(0, porPagina === 1 ? 8 : 4)) {
      p.drawText(l, { x: MARGEN, y: cursor, size: 10.5, font: normal, color: NEGRO });
      cursor -= 13.5;
    }
  }

  // --------------------------------------------------------- pie de página
  const generado = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  paginas.forEach((p, i) => {
    const izq = limpiar(`Generado el ${generado}`);
    const der = `${i + 1} / ${paginas.length}`;
    p.drawLine({ start: { x: MARGEN, y: 44 }, end: { x: HOJA.ancho - MARGEN, y: 44 }, thickness: 0.5, color: LINEA });
    p.drawText(izq, { x: MARGEN, y: 32, size: 8, font: normal, color: GRIS });
    p.drawText(der, {
      x: HOJA.ancho - MARGEN - normal.widthOfTextAtSize(der, 8),
      y: 32, size: 8, font: normal, color: GRIS
    });
  });

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export function nombreArchivo(informe) {
  const limpio = s => limpiar(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const partes = [
    CONFIG.PREFIJO_ARCHIVO,
    limpio(informe.proyecto?.proyectoNombre),
    limpio(informe.cabecera?.frente),
    informe.cabecera?.fecha || new Date().toISOString().slice(0, 10)
  ].filter(Boolean);
  return partes.join('_') + '.pdf';
}
