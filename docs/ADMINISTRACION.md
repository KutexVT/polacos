# Administración de plataforma

La navegación del administrador contiene **Estadísticas** y **Grupos**. Las preferencias de color, modo, perfil y salida siguen disponibles desde el avatar. No tiene soporte, chats, notas privadas, notificaciones, fichas comerciales, reportes de cobro ni cierres de caja.

## Estadísticas

Vista global o filtrada por grupo con períodos de 7, 30 y 90 días. Muestra personas registradas, dueños, polacos, grupos, personas con actividad en los últimos 15 minutos y personas distintas activas en el período. También muestra cantidades de clientes, productos, compras, pagos vigentes, cierres guardados y mensajes internos del equipo. No abre esos registros ni muestra saldos o importes cobrados.

El gráfico y su tabla muestran personas distintas por día y operaciones registradas en la auditoría. La tabla de grupos resume personas, actividad y operaciones e incluye el acceso a su administración.

La actividad de uso empieza con la migración `005_platform_usage.sql`. Los días anteriores se muestran **Sin datos de uso**. No se infiere tráfico histórico a partir de sesiones antiguas. Las cuentas de administrador no cuentan como uso de clientes. Una persona cuenta una sola vez por día aunque haga muchas solicitudes autenticadas. La fecha usa America/Costa_Rica y la última actividad se actualiza como máximo una vez por minuto. El navegador abierto actualiza datos periódicamente y puede mantener actividad reciente aunque la persona no esté haciendo clic.

Los datos de uso contienen únicamente usuario, grupo, día y última actividad. No se guardan IP, dispositivos ni contenido de navegación. Se eliminan por cascada al purgar la persona o el grupo. Las cuentas retiradas dejan de sumar personas activas.

## Grupos y cuentas

El administrador crea grupos con su dueño, establece el nombre interno y modifica los cupos. En cada grupo tiene dos secciones: **Estadísticas** y **Usuarios**. Puede crear, editar y retirar polacos o corregir datos de acceso de una cuenta. Se mantienen los límites de cupos y la auditoría con su identidad real.

Los nombres de grupo continúan siendo etiquetas exclusivas del administrador. Dueños y polacos no tienen nombre ni foto de grupo en el menú o en Configuración.

## Retiro del soporte

No existe opción de iniciar o responder soporte para ningún rol. El servidor rechaza crear conversaciones de tipo soporte y rechaza consultar o responder sus historiales. Las conversaciones antiguas con una cuenta de administrador tampoco se listan ni permiten mensajes. Sus adjuntos y notificaciones quedan inaccesibles desde la aplicación. Los chats entre participantes del equipo y sus archivos siguen funcionando.

Los datos históricos retirados se conservan en la base; esta modificación no purga mensajes ni archivos. Las notas administrativas anteriores también dejan de tener interfaz y API. Las rutas antiguas muestran las estadísticas o la pantalla operativa del rol. La API limita al administrador a estadísticas, grupos, usuarios y configuración de su propia cuenta.
