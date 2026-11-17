# Verificación de entrega

Fecha: **16 de noviembre de 2026**. URL: https://polacos-production.up.railway.app

## Resultado

- `npm test`: **19/19** pruebas correctas con PostgreSQL real local
- Integración contra Railway: **19/19**, cero fallos, ejecución final de 80,88 segundos
- `npm run build`: correcto; frontend JS 319,25 kB / 94,41 kB gzip y CSS 31,80 kB / 7,29 kB gzip
- `npm audit --omit=dev`: **0 vulnerabilidades reportadas** en esa consulta
- `git diff --cached --check` y `git diff --check`: correctos; comprobación adicional sin credenciales locales ni de producción en archivos preparados
- Navegador Chromium: flujo completo correcto en la URL pública, cero errores JavaScript capturados
- Revisión visual de capturas con datos cargados a **1440×1000**, **820×1180** y **390×844**, sin desbordamiento horizontal de la página
- Servicio web final `99918fb0-4943-438b-b0bd-eae021db03f5`: **SUCCESS**
- Redespliegue de persistencia `01ba1969-d2b1-4ae0-b698-5673b0489e1f`: **SUCCESS**, conservó sesión, texto y hashes SHA-256 de imagen, audio y archivo
- `/api/health`: HTTP 200 y conexión a PostgreSQL
- Los assets JavaScript y CSS descargados desde la URL pública coinciden byte a byte con el build local final
- Petición privada sin sesión: 401. Cookie de sesión: HttpOnly, Secure y SameSite Strict. Mutación con origen externo: 403
- Proxy TCP temporal de PostgreSQL eliminado; Railway confirmó `committed: true` y lista de proxies vacía
- Conexión TCP externa rechazada tras el cierre; salud pública siguió respondiendo 200 usando la conexión privada

La comprobación de persistencia se ejecutó sobre la versión previa al ajuste final de filtros de notificaciones y texto del reporte. La versión final volvió a pasar toda la integración pública y el recorrido de navegador; no cambió el almacenamiento de mensajes/adjuntos.

## Cobertura de los 19 casos solicitados

| Caso de requisitos | Evidencia |
| --- | --- |
| 1. Dos cupos y tercer perfil bloqueado | API 01: tres altas concurrentes, dos aceptadas y una 409 |
| 2. Retirada y restauración con cupo ocupado | API 11: liberar cupo, crear sustituto y competir por restaurar sin superar límite |
| 3. Aislamiento de grupos | API 01/08/09: clientes, modificaciones, chat, archivos y SSE; destinatario recibe evento y otro grupo no |
| 4. Dueño administra sin suplantación | API 06 y navegador: clientes propios y cobro del cliente del trabajador con identidad del dueño |
| 5. Última unidad concurrente | API 04: solo una asignación aceptada |
| 6. Reserva, rechazo, reenvío y cancelación | API 02: bloqueo de cobros y liberación única |
| 7. Aprobación y precio original | API 03: reserva convertida sin doble descuento |
| 8. Catálogo no reescribe la compra | API 03: precio pactado conservado |
| 9. Varias unidades | API 04: cantidad, total y calendario consistentes |
| 10. Capital 20.000 sobre 100.000 | Unidad y API 05: saldo 80.000, próximas cuotas 10.000 y dos cuotas finales eliminadas |
| 11. Parcial, adelanto, corrección y liquidación | API 05: reintentos concurrentes, sobrepago rechazado, auditoría y reapertura tras anulación |
| 12. Frecuencias y fechas | 6 pruebas unitarias: fin de mes, trimestre, cada 15 días, días fijos, personalizadas y fecha Costa Rica |
| 13. Accesos limitados | API 06: lectura sin edición, compra concreta, caducidad y revocación en servidor |
| 14. Recordatorios al responsable | API 07: destinatario y deduplicación; dueño recibe precio; filtros de leídas/no leídas antes de paginar |
| 15. Chat y adjuntos persistentes | Navegador: texto, PNG, audio grabado y TXT; recarga; redespliegue; comparación exacta de bytes |
| 16. Soporte | API 08 y navegador: trabajador inicia, admin responde, grupo de origen visible y contacto espontáneo a polaco rechazado |
| 17. Transferencia y papelera | API 10–12: pagos/stock conservados, foto transferida protegida, purga a 31 días con reloj controlado y repetición sin dobles efectos |
| 18. Logo y paleta | API 09 y navegador: preferencias independientes, acceso autorizado al logo y paleta persistente al recargar |
| 19. Flujos públicos Railway | Suite API completa y navegador contra HTTPS publicado |

Se añadió API 13 para comprobar que un cobro por su propia fecha sigue incluido aunque la compra sea anterior al período o esté cancelada. Anular el pago lo descuenta del reporte.

## Recorrido de navegador

Administrador crea grupo y dueño; dueño crea trabajador, producto y cliente; trabajador propone precio; dueño aprueba, cobra capital y cobra una cuota parcial desde vista móvil. Después crea conversación y envía texto, archivo, audio e imagen. Cambia paleta, recarga, inicia Soporte como trabajador y responde como administrador. Comprobación de errores JavaScript y ancho de página incluida.

La grabación usa MediaRecorder con el dispositivo de audio simulado de Chromium. Se verifican creación, envío, persistencia y presencia del reproductor. **No se verificó el micrófono físico del usuario ni Safari/iOS o dispositivos móviles físicos.**

## Producción al concluir las pruebas

Conteo verificado directamente en PostgreSQL: **1 usuario administrador**. Cero grupos, productos, clientes, compras, pagos, conversaciones, mensajes, notificaciones, adjuntos y registros de auditoría. No quedan ventas ni mensajes de demostración.

Las pruebas dejan sus capturas y logs locales en `.local/`, fuera de Git y del despliegue:

- `public-tests-final.log`
- `public-browser-final.log`
- `browser-result.json`
- `browser-redeploy-result.json`
- `production-final-counts.json`
- `dependency-audit.json`
- `screenshots/desktop.png`, `tablet.png`, `mobile.png`, `mobile-cobros.png` y `mobile-compra.png`

## Límites de la comprobación

No se hizo una prueba de carga masiva ni una restauración destructiva del volumen. Las pruebas de concurrencia cubren carreras reales de stock, cupos, mensajes y cobros. Las tareas se probaron con reloj controlado sobre grupos aislados; no se esperaron 30 días naturales.

**Copias de seguridad:** Railway rechazó activar el calendario diario porque esta función exige Pro. La lista de programaciones sigue vacía. No se modificó el plan ni se afirma disponer de una copia de recuperación. Retención y procedimiento condicional documentados en `OPERACION.md`.

## Rediseño de administración

Suite local ampliada a 20 pruebas. El escenario API 09b verifica autorización exclusiva de administrador, notas privadas entre dos administradores, vinculación y rechazo de grupos incompatibles, edición/completado/borrado de notas, estados de soporte, reapertura por nuevo mensaje y respuesta desde otro administrador. También verifica revisión de grupo, auditoría del administrador asociada al grupo correcto y rechazo de compras/cobros nuevos con ese rol.

El recorrido de navegador incorpora actualización de estado, notas vinculadas persistentes al recargar, búsqueda global de usuarios, revisión de clientes sin botón de alta y ausencia de Cobros en el menú administrativo. Guarda capturas de la nueva portada a 1440, 820 y 390 píxeles y comprueba desbordes. Conserva el recorrido comercial de dueño y trabajador.

Publicación del panel administrativo: Railway `ca72222e-63a4-4ace-b69e-5d85635b500a` terminó en `SUCCESS`. La URL pública confirmó salud PostgreSQL, assets actuales, resumen sin saldos comerciales, búsqueda de usuarios, actividad y revisión del grupo de pruebas. Se creó, completó, fijó y eliminó una nota temporal para comprobar persistencia real. La API pública rechazó compras y cobros nuevos del administrador con 403. La nota temporal se eliminó al terminar.

La comparación de la base antes y después mantuvo exactamente: 1 grupo, 4 cuentas (incluido el administrador), 64 productos, 100 clientes, 186 compras, 227 pagos, 20 conversaciones y 202 mensajes. Los contadores de la revisión excluyen la papelera: 3 usuarios del grupo, 91 clientes y 61 productos activos. Comprobación visual pública con la cuenta Kutex en escritorio y celular. Evidencia privada local: `.local/admin-production-result.json` y `.local/admin-public-desktop.png`.

## Cuadrículas y adaptación al teléfono

Clientes y productos pasan a tarjetas con imágenes o iniciales, nombre, datos de contacto/precio y estado. Se conservan búsqueda, paginación y acciones. Compras compartidas e historial, solicitudes, notificaciones y pagos usan cuadrículas. Grupos, usuarios, cobros, comparaciones, cuotas, papelera y actividad conservan las relaciones de encabezados y celdas de tabla para accesibilidad y se muestran como fichas etiquetadas. El menú del teléfono y las secciones de revisión del grupo se distribuyen en dos columnas sin barras horizontales. Los controles táctiles principales tienen una altura mínima de 44 px y los campos móviles usan 16 px.

El navegador añade registros temporales con nombres y descripciones largos dentro de su grupo QA. La matriz revisa clientes, productos, usuarios, grupos, actividad, solicitudes y cuotas en 320, 390, 600, 820 y 1440 px. También recorre cobros, reportes y compras del cliente como dueño en 320, 390 y 1440 px. Comprueba ancho del documento y contenedores que podrían requerir desplazamiento horizontal. Verifica dos columnas en los listados compactos cuando hay espacio, el menú móvil y que el formulario de edición de producto siga abriendo con los datos correctos. Las capturas y el detalle de cada tamaño quedan en `.local/screenshots/grid-*` y `.local/grid-layout-result.json`.

La evidencia corresponde a Chromium de escritorio con tamaños de pantalla simulados. No se realizó prueba en un teléfono físico ni con Safari/iOS.

Publicación de las cuadrículas: Railway `8d33572a-313c-4afe-90c1-1b19b3d94ad3` terminó en `SUCCESS`. La salud de PostgreSQL y los assets públicos coinciden con la compilación local. La matriz final pasó 44 comprobaciones sin contenedores que requieran desplazamiento lateral. En la URL pública se revisaron los 20 productos y los 20 clientes de la primera página del grupo de pruebas: ambos mostraron dos columnas a 390 px, documento de 382 px de ancho y ningún contenedor horizontal en productos. Se verificó también la cuadrícula de clientes a 1440 px. Evidencia privada: `.local/grid-production-result.json`, `.local/grid-public-products-mobile.png` y `.local/grid-public-clients-desktop.png`.
