# Administración de la plataforma

El administrador gestiona la plataforma para los grupos. No es un vendedor y no tiene cartera propia.

- **Resumen:** casos que esperan respuesta, casos abiertos, grupos y usuarios activos. La cola prioriza los casos cuyo último mensaje es de un usuario. Dentro de cada prioridad muestra los más antiguos primero. Incluye notas pendientes y actividad reciente.
- **Soporte:** conversaciones iniciadas por dueños o polacos. Búsqueda por persona o grupo y filtros Pendiente, En revisión y Resuelto. Un mensaje nuevo del usuario reabre un caso resuelto. Responder no resuelve automáticamente el caso. La supervisión de conversaciones privadas sigue siendo de lectura; cualquier administrador puede responder un caso de soporte con su propia identidad.
- **Grupos:** altas con dueño, límites de cupos y acceso a la revisión de un grupo. La revisión reúne usuarios, clientes existentes, inventario, solicitudes, conversaciones, notas y papelera. No muestra indicadores de dinero en su resumen.
- **Usuarios:** búsqueda global por nombre, usuario o grupo. Permite revisar el grupo y corregir nombre, usuario y contraseña. Restablecer contraseña invalida las sesiones de esa persona. Las altas de polacos se realizan dentro de un grupo concreto.
- **Actividad:** acciones registradas con fecha, autor real y grupo. Búsqueda y filtros por grupo y fechas locales de Costa Rica. Ofrece acceso al registro o grupo afectado. No expone contraseñas ni el contenido de notas privadas. Los registros purgados pueden dejar de estar disponibles según la retención existente.
- **Mis notas:** títulos y texto privados para cada administrador. Se pueden vincular a un grupo o conversación, fijar, completar, reabrir, buscar, editar y eliminar con confirmación. Se guardan en PostgreSQL. Otro administrador no puede leerlas ni modificarlas. Al eliminar su administrador, grupo o conversación se eliminan las notas vinculadas por sus claves externas.
- **Notificaciones y Configuración:** continúan disponibles. Se conservan las cuatro paletas, modos claro y oscuro y preferencias independientes por usuario.

Las rutas comerciales generales del administrador llevan a Grupos. No tiene navegación de cobros, inventario personal, creación de compras ni reportes de ventas. La API rechaza crear compras o registrar nuevos pagos desde una cuenta administradora. Se conservan las correcciones de clientes, inventario, planes y pagos existentes para atender incidencias. Los cambios usan la identidad real del administrador y el grupo del registro afectado. No se inicia sesión como el usuario ayudado.

El historial cubre acciones de negocio y estados de soporte. No registra cada visita o lectura. No existe un sistema de vigilancia de navegación. Las notas privadas tampoco se copian al historial compartido de actividad.
