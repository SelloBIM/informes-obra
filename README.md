# Informes de obra → ACC

App web instalable para levantar informes de obra con fotos y comentarios y
publicarlos como PDF en la carpeta de un proyecto de Autodesk Construction Cloud.

No hay servidor, no hay base de datos, no hay licencia que pagar. Son archivos
estáticos: se dejan en cualquier hosting con HTTPS y listo. Las APIs de Autodesk
que usa (Autenticación y Data Management) son gratuitas.

---

## Puesta en marcha

Son cuatro pasos. La primera vez toma cerca de media hora; de ahí en adelante
agregar a alguien al equipo es mandarle un enlace.

### 1. Crear la aplicación en Autodesk

1. Entra a <https://aps.autodesk.com/myapps> con una cuenta de Autodesk y crea
   una aplicación nueva.
2. Elige el tipo de aplicación de **cliente público / Single Page App** (la que
   usa PKCE y **no** entrega un Client Secret). Si la consola te da un secret,
   escogiste el tipo equivocado: esta app no lo usa y no debe tenerlo.
3. En **Callback URL** pon la dirección exacta donde vas a publicar los
   archivos, terminada en barra. Por ejemplo:

   ```
   https://tuempresa.github.io/informes-obra-acc/
   ```

   Tiene que coincidir carácter por carácter con la dirección real. Si no
   coincide, Autodesk rechaza el ingreso con `invalid redirect_uri`.
4. Copia el **Client ID**. No es secreto: va dentro del código del navegador.

### 2. Publicar los archivos

Sube el contenido de esta carpeta tal cual a cualquier hosting estático con
HTTPS. HTTPS es obligatorio: sin él no hay cámara, ni instalación, ni OAuth.

Opciones gratuitas: GitHub Pages, Cloudflare Pages, Netlify. También sirve el
servidor web interno de la empresa.

Con GitHub Pages: crea un repositorio, sube estos archivos a la raíz y activa
Pages apuntando a la rama principal.

### 3. Configurar el Client ID

Abre `config.js` y reemplaza el valor de `CLIENT_ID` por el que copiaste.

Ahí mismo puedes ajustar el nombre de la empresa que sale en el PDF y la
compresión de las fotos.

**Probar en tu computador.** Doble clic en `iniciar-app.bat` levanta la app en
`http://localhost:8099/` usando PowerShell, que ya viene con Windows. Para que
el login funcione ahí, `http://localhost:8099/` tiene que estar agregada como
segunda Callback URL de la app en aps.autodesk.com. Usa una ventana InPrivate
para ver siempre la última versión de los archivos.

**Logo en el PDF.** Sube un `logo.png` a la raíz del repositorio (PNG con fondo
transparente, entre 400 y 800 px de ancho) y en `config.js` cambia `LOGO: null`
por `LOGO: "logo.png"`. Aparece en la portada y en el encabezado de cada
página. Mientras esté en `null`, el PDF usa el nombre de la empresa en texto y
no intenta descargar nada.

### 4. Aprobar la app en ACC

Este es el único permiso que hay que pedir, y es interno.

Un **administrador de la cuenta de ACC** debe entrar a
**Account Admin → Custom Integrations → Add custom integration**, pegar el
Client ID, ponerle un nombre ("Informes de obra") y guardar. Si la app la creó
otra persona, el administrador además tiene que **aprobarla** en esa misma
pantalla.

El Client ID no vuelve a mostrarse después de guardar, así que conviene dejarlo
anotado en el campo de descripción.

Sin este paso la app entra, pero la lista de cuentas sale vacía.

---

## Instalarla en el teléfono

**Android (Chrome):** abre el enlace, aparece el aviso de instalar. Si no sale,
menú de Chrome → *Instalar aplicación*. También está en el menú ⋯ de la app.

**iPhone:** tiene que ser desde **Safari** (Chrome en iOS no instala PWAs).
Botón de compartir → *Agregar a pantalla de inicio*.

Queda con icono propio y abre a pantalla completa, sin barra de navegador.

---

## Qué pasa con los datos

- Las fotos y los informes viven en el teléfono (IndexedDB) hasta que alguien
  pulsa **Publicar en ACC**. Nada se sube en segundo plano.
- El PDF se arma en el propio teléfono. Ninguna foto pasa por un servidor
  intermedio: va del teléfono directo al almacenamiento de Autodesk.
- Cada persona entra con **su** cuenta de Autodesk. La app hereda exactamente
  los permisos que esa persona ya tiene en ACC: no puede escribir en un proyecto
  donde no la hayan invitado.
- Permisos pedidos: `data:read`, `data:write`, `data:create`, `offline_access`,
  y `openid` con `user-profile:read` para leer el nombre y el correo de quien
  entra (con eso se llena solo "Elaborado por"). Ninguno de administración de
  cuenta.
- La cámara se abre con el selector de archivos del sistema operativo. La app
  nunca pide permiso permanente de cámara, ni ubicación, ni contactos.

Si prefieres que la sesión caduque cada hora y obligar a volver a entrar, quita
`offline_access` de `SCOPES` en `config.js`. A cambio, el residente tendrá que
autenticarse varias veces al día.

---

## Si algo falla

**"No apareció ninguna cuenta de ACC"**
El Client ID no está aprobado en Custom Integrations, o el usuario no está
invitado a ningún proyecto. Revisa el paso 4.

**Autodesk responde `invalid redirect_uri`**
La Callback URL registrada no coincide con la dirección real. Fíjate en la barra
final, en `www` y en mayúsculas. La app te muestra la dirección exacta que debe
registrarse cuando `config.js` no está configurado.

**Error 403 al publicar**
El usuario no tiene permiso de carga en esa carpeta de ACC. Es un permiso de
carpeta en ACC Docs, no de la app.

**Un error de CORS en la consola del navegador**
Suele significar que la petición salió sin sesión válida o hacia una URL mal
formada. Mira la pestaña Red: si la llamada a `developer.api.autodesk.com`
devuelve 401 o 403, el problema es de permisos, no de CORS.

**En iPhone, al volver del login se pierde la sesión**
Puede pasar si la app instalada abre el login en Safari y regresa en otra
ventana. Vuelve a abrir el icono de la app: la sesión suele quedar guardada. Si
se repite, usa la app desde Safari en vez de instalada.

**El PDF pesa demasiado**
Baja `FOTO_LADO_MAX` a 1200 y `FOTO_CALIDAD` a 0.65 en `config.js`.

**El logo no sale en el PDF**
Revisa que `logo.png` esté en la raíz del repositorio y que `config.js` tenga
`LOGO: "logo.png"` con comillas. Si acabas de subirlo, fuerza una recarga con
Ctrl+F5: la app guarda el logo para usarlo sin señal.

**Cambié algo y el teléfono sigue mostrando lo viejo**
Sube el número de `VERSION` en `sw.js`. Es lo que obliga a los teléfonos del
equipo a tomar la versión nueva.

---

## Publicar cambios

Cada teléfono guarda la app en caché. Cuando subas una versión nueva, cambia el
número de `VERSION` en `sw.js` (`v1` → `v2`). La próxima vez que alguien abra la
app se actualiza sola.

---

## Qué hace y qué no

Hace:

- Informe por proyecto, con frente, fecha de visita y quién lo elabora. Este
  último se llena solo con el nombre de la cuenta de Autodesk que inició sesión.
- **Observaciones**: cada hallazgo lleva título, actividad, condición actual,
  condición ideal, observaciones y las fotos que lo sustenten. Son obligatorios
  el frente o área del informe y el título de cada observación; lo demás,
  incluidas las fotos, es opcional. Se reordenan y se
  eliminan por separado.
- Buscador de proyectos al elegir dónde publicar (sin importar tildes ni
  mayúsculas).
- Fotos desde la cámara o la galería, comprimidas en el teléfono. Se numeran
  por observación (1.1, 1.2, 2.1) para poder citarlas en una reunión.
- Autoguardado permanente y funcionamiento sin señal.
- PDF con portada, logo opcional, observaciones numeradas y las fotos en
  cuadrícula de dos columnas.
- Publicación en la carpeta que elijas del proyecto en ACC, con el nombre
  `<Proyecto como aparece en ACC>_<AAAA-MM-DD>_<HH-MM>.pdf` (fecha y hora de
  publicación). Como cada publicación lleva su hora, cada vez queda un archivo
  nuevo.
- Ver o compartir el PDF antes de publicarlo.
- Los informes levantados con versiones anteriores se convierten solos al
  abrirlos: la descripción de cada observación pasa al campo "Observaciones".

No hace todavía:

- Crear Issues ni RFIs en ACC Build (eso es otra API).
- Firmas, marcas sobre la foto ni plantillas por tipo de informe.
- Prioridad o responsable por observación.
- Trabajo colaborativo: cada informe vive en el teléfono de quien lo levanta.

---

## Archivos

| Archivo | Qué contiene |
|---|---|
| `config.js` | Lo único que se edita para arrancar |
| `index.html` | Estructura de las pantallas |
| `styles.css` | Estilos |
| `app.js` | Navegación, fotos, autoguardado, publicación |
| `acc.js` | Login PKCE y Data Management API |
| `pdf.js` | Armado del PDF |
| `logo.png` | Opcional: logo de la portada |
| `db.js` | Almacenamiento local |
| `sw.js` | Funcionamiento sin señal |
| `fonts.css` | Barlow incrustada, para que no dependa de internet |
| `vendor/pdf-lib.min.js` | Librería de PDF (MIT), local |
