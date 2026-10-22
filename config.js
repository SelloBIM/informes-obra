// ---------------------------------------------------------------------------
// Lo único que tienes que editar para poner la app en marcha.
// Lee el README.md para saber de dónde sale cada valor.
// ---------------------------------------------------------------------------

window.CONFIG = {

  // Client ID de la aplicación creada en https://aps.autodesk.com/myapps
  // (tipo de app: "Single Page App" / cliente público con PKCE).
  // Este valor NO es secreto: puede ir en el código del navegador.
  CLIENT_ID: "PEGA-AQUI-TU-CLIENT-ID",

  // Permisos que pide la app al entrar. No agregues más de los necesarios.
  //   data:read    ver proyectos y carpetas
  //   data:write   subir una versión nueva de un archivo existente
  //   data:create  crear el archivo en la carpeta
  //   offline_access  renovar la sesión sin volver a pedir la contraseña
  SCOPES: "data:read data:write data:create offline_access",

  // Nombre de la empresa como debe salir en el pie del PDF.
  EMPRESA: "Jaramillo Mora Constructora",

  // Logo para la portada y el encabezado del PDF.
  // Sube un logo.png al repositorio (fondo transparente, ancho 400-800 px)
  // y cambia este valor a "logo.png". Mientras sea null, el PDF usa el
  // nombre de la empresa en texto.
  LOGO: null,

  // Prefijo del nombre del archivo que se sube a ACC.
  // El nombre final queda: INFORME_<Proyecto>_<Frente>_<AAAA-MM-DD>.pdf
  PREFIJO_ARCHIVO: "INFORME",

  // Compresión de fotos antes de guardarlas. Bájalo si los PDF pesan mucho.
  FOTO_LADO_MAX: 1600,   // píxeles del lado más largo
  FOTO_CALIDAD: 0.72,    // 0 a 1

  // Fotos por página en el PDF: 1 o 2.
  FOTOS_POR_PAGINA: 2
};
