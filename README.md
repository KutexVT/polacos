# Polacos

Aplicación para grupos de venta a crédito en Costa Rica. Inventario con reservas, clientes, compras, calendarios, pagos, acceso temporal, chat y soporte. Moneda CRC y fechas comerciales en `America/Costa_Rica`.

**Producción:** https://polacos-production.up.railway.app

Código: `/home/kutex/project/polacos`. Las credenciales iniciales de esta instalación están exclusivamente en `.local/ACCESO.md` con permisos `600`. Ese directorio está excluido de Git y del despliegue. No hay registro público ni contraseña predeterminada.

## Uso inicial

1. Entrar con el administrador y elegir una paleta. Desde **Grupos** crear el grupo, su dueño y los cupos autorizados.
2. El dueño crea sus polacos en **Usuarios** y productos en **Inventario**. Los nombres de los grupos son etiquetas internas del administrador. Dueños y polacos no ven esa identidad ni pueden configurarla.
3. Crear un cliente y su compra. Revisar el calendario antes de confirmar. Un precio propuesto por un polaco reserva unidades hasta que el dueño decida.
4. En **Cobros** abrir una compra y registrar pagos de cuota o abonos al capital. El historial conserva correcciones y anulaciones.
5. **Solicitudes** permite resolver precios y compartir registros con caducidad. **Conversaciones** incluye chat privado, grupos y Soporte.

El dueño opera sobre sus clientes y los de su equipo sin suplantar usuarios. El administrador selecciona grupo o consulta toda la plataforma. Los clientes comerciales no tienen cuenta.

En **Configuración → Colores de tu cuenta** se elige modo Claro u Oscuro y una de las cuatro paletas. Ambas preferencias se guardan por usuario y se recuperan en otros dispositivos; las cuentas sin una selección previa conservan el modo claro.

## Ejecutar localmente

Requisitos: Node.js 24, npm, PostgreSQL 16 o superior. El despliegue usa Node 24 y PostgreSQL 18. La base local de esta entrega está en el contenedor `polacos-db` y puerto `127.0.0.1:55439`.

Para la instalación existente:

```sh
cd /home/kutex/project/polacos
docker start polacos-db
npm ci
npm run build
npm run migrate
npm run dev
```

Abrir http://localhost:3210. `npm run dev` inicia Express con `.env`; sirve el frontend compilado. Después de editar el frontend ejecutar `npm run build`. Para reconstrucción continua puede ejecutarse `npm run build -- --watch` en otra terminal.

Para una instalación nueva copiar `.env.example` a `.env`, usar una base PostgreSQL propia y configurar una contraseña privada de al menos 12 caracteres para `ADMIN_PASSWORD`. No reutilizar credenciales de producción. `DATABASE_URL` debe corresponder a esa base. No subir `.env` al repositorio.

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Conexión privada a PostgreSQL; obligatoria |
| `ADMIN_USERNAME` | Usuario administrador inicial |
| `ADMIN_PASSWORD` | Contraseña inicial privada de 12 a 128 caracteres |
| `ADMIN_NAME` | Nombre visible del administrador inicial |
| `APP_ORIGIN` | Origen exacto de la web, sin `/` final |
| `PORT` | 3210 local; 3000 en Railway |
| `NODE_ENV` | `development` local; `production` para cookies seguras HTTPS |

El administrador se crea una sola vez cuando no existe otro. Cambiar las variables después no restablece su contraseña. La contraseña se cambia desde Configuración. Dueños y administrador pueden restablecer las cuentas que administran, nunca leer contraseñas guardadas.

## Arquitectura y almacenamiento

React + Vite para la interfaz; Express 5 para API, sesiones y tareas; PostgreSQL para todos los datos. Un solo servicio sirve la web y API del mismo origen. Las versiones instaladas están fijadas en `package-lock.json`.

- `server/money.js`: céntimos enteros, calendarios y aplicación de pagos
- `server/access.js`: límites de grupo y permisos de cada registro
- `server/routes.js`: cuentas, inventario, compras y pagos
- `server/collaboration.js`: accesos temporales, chat y archivos
- `server/lifecycle.js`: retirada, restauración, purga y recordatorios
- `server/reports.js`: estadísticas calculadas con los registros existentes
- `migrations/`: SQL versionado con registro de aplicación y bloqueo de concurrencia
- `src/`: interfaz adaptable y componentes de formularios

Las fotos, audios y adjuntos se guardan como `BYTEA` en PostgreSQL, hasta **10 MiB por archivo**. No dependen del disco efímero de Express. Los archivos se validan por contenido y se entregan tras comprobar autorización. No hay URL pública directa a un adjunto. Los archivos abandonados sin referencias se purgan después de un día.

Las contraseñas usan scrypt. Las sesiones aleatorias se almacenan con hash en la base; cookie HttpOnly, SameSite Strict y Secure en producción. Hay límites de intentos, validación de origen y tipo de petición, validación de entradas y consultas parametrizadas.

Los cambios de negocio usan transacciones y un bloqueo asesor PostgreSQL para impedir carreras de cupos, stock y pagos. Las claves de idempotencia evitan duplicaciones por reintento. Este bloqueo serializa las escrituras de toda la instalación: es una decisión de simplicidad documentada, no una afirmación de capacidad ilimitada.

## Migraciones y tareas

El servidor aplica migraciones pendientes al arrancar. `npm run migrate` permite aplicarlas por separado. Añadir nuevos archivos SQL ordenados; no editar una migración ya aplicada.

La purga y los recordatorios se ejecutan antes de aceptar tráfico y cada 60 segundos. El estado vive en PostgreSQL. No necesitan un navegador abierto. Las transacciones, el bloqueo y las claves únicas evitan efectos duplicados con varias instancias. Después de una caída el siguiente arranque procesa los vencimientos pendientes.

La papelera permite restaurar durante 30 días. Al vencer se eliminan datos y auditoría asociados, incluidas las imágenes y mensajes correspondientes. Los clientes transferidos y los mensajes de otras personas permanecen. Ver [decisiones](docs/DECISIONES.md) y [operación y copias](docs/OPERACION.md).

## Despliegue en Railway

Proyecto propio **Polacos** (`73a31525-8905-43da-b4c4-c7cb591bf0a4`), entorno `production`, servicios `polacos` y `Postgres`. La base usa volumen persistente. No utiliza recursos de otros proyectos.

El `Dockerfile` compila la interfaz y arranca como usuario sin privilegios. `DATABASE_URL` en el servicio web referencia `${{Postgres.DATABASE_URL}}`. `APP_ORIGIN` apunta a la URL pública. Comprobación de salud: `/api/health`, que consulta PostgreSQL.

```sh
railway whoami
railway status
railway config plan
railway up --service polacos --detach
railway deployment list --service polacos --json
curl --fail https://polacos-production.up.railway.app/api/health
```

La configuración parcial de `.railway/railway.ts` administra únicamente el servicio web y conserva las variables ya guardadas mediante `preserve()`. Si cambia esa configuración revisar el plan y aplicar con `railway config apply --yes`. El SDK `railway` es una dependencia de desarrollo para IaC. Subir código no equivale a un despliegue correcto: comprobar estado `SUCCESS`, salud, assets y los flujos públicos.

## Pruebas

```sh
npm test
npm run build
npm run test:e2e
git diff --check
```

La integración crea grupos con nombres y usuarios únicos y los elimina al terminar. El navegador usa Chromium en `/usr/bin/chromium`; puede indicarse otra ruta con `CHROMIUM_PATH`. Incluye vistas de 1440, 820 y 390 píxeles y grabación con micrófono simulado. Las capturas quedan en `.local/screenshots`.

Para verificar un entorno remoto se usan `TEST_BASE_URL`, las credenciales de su administrador y `DATABASE_URL` de **ese mismo entorno**. Las pruebas requieren conexión directa a PostgreSQL para limpiar sus grupos y controlar el reloj de purga. El archivo privado `.local/production.env` se preparó para la verificación de esta entrega. El acceso TCP temporal se cierra al concluir; recrearlo antes de volver a ejecutar esas pruebas.

```sh
node --env-file=.local/production.env --test --test-concurrency=1 tests/*.test.js
VERIFY_REDEPLOY=1 node --env-file=.local/production.env tests/browser.mjs
```

`VERIFY_REDEPLOY=1` **redespliega realmente el servicio `polacos` del proyecto enlazado** y comprueba que sesión, texto y bytes de imagen, audio y archivo permanezcan. Omitirlo en las pruebas normales. Ver resultados y límites comprobados en [VERIFICACION.md](docs/VERIFICACION.md).
