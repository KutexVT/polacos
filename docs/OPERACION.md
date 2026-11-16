# Operación de Polacos

## Recursos de esta instalación

| Recurso | Identificador |
| --- | --- |
| Proyecto Railway | `73a31525-8905-43da-b4c4-c7cb591bf0a4` |
| Entorno production | `24af87f2-3871-4927-bf00-39350e7e6c10` |
| Web polacos | `5fecf51b-d008-4381-82eb-a55be3309b22` |
| Postgres | `5fd74620-a156-49ba-88c8-6188a90a3e15` |
| Volumen PostgreSQL | `07e3cbec-e0e0-4f44-bf87-2b052fd96de9` |
| Instancia de volumen | `03ebc456-e445-4d0c-9018-d6c5b939c899` |
| URL pública | https://polacos-production.up.railway.app |

El volumen tiene 5 GB. Los adjuntos también consumen ese espacio. Revisar uso del volumen, conexiones, latencia y errores desde Railway antes de ampliar grupos o permitir una carga importante de archivos. No hay cuotas de almacenamiento por grupo; el máximo de 10 MiB por archivo no sustituye la capacidad total.

## Copias y eliminación

La purga de la aplicación elimina filas y adjuntos de la base activa al cumplirse 30 días en papelera, en el siguiente ciclo de un minuto o al arrancar. No conserva un archivo histórico alternativo para estadísticas.

**Estado real al entregar, 16 de noviembre de 2026: no hay copias programadas.** Se intentó configurar una copia diaria y Railway rechazó la operación con `Manual backups and backup schedules are only available for Pro workspaces`. La consulta posterior devolvió una lista vacía. No se cambió el plan de la cuenta ni se contrató una ampliación.

Por tanto esta instalación tiene almacenamiento persistente pero **no una copia de recuperación verificada**. Si se habilita la función del proveedor, la política propuesta es diaria con retención de 6 días, que es el plazo publicado para las copias diarias en [Backups](https://docs.railway.com/volumes/backups). Esa retención no está activa actualmente. Una alternativa operativa es exportar PostgreSQL a un almacenamiento controlado por el propietario y definir explícitamente su caducidad; no se creó una exportación oculta durante esta entrega.

Eliminar un registro de la aplicación no elimina por sí mismo cualquier copia externa o interna del proveedor. No se conoce ni se garantiza la retención de copias internas que Railway no expone mediante esta función. No se promete borrado inmediato ni borrado físico de bloques, WAL o almacenamiento interno. Las copias manuales, exportaciones externas y volúmenes antiguos creados al restaurar requieren su propio control; esta aplicación no los borra automáticamente.

## Recuperación

Este procedimiento aplica cuando exista una copia disponible; hoy no hay una copia programada activa.

1. Revisar fecha y alcance del respaldo en el servicio Postgres de **Polacos**. Una restauración reemplaza el estado de la base: puede descartar cobros posteriores a la copia.
2. Detener tráfico de escritura durante la recuperación. Restaurar desde Railway y revisar los cambios pendientes antes de aplicarlos.
3. Iniciar el servicio web. Antes de escuchar ejecuta migraciones y purga vencida. Si esas tareas fallan, el arranque falla y no se publica una base con purgas pendientes.
4. Comprobar `/api/health`, acceso administrativo, saldo de compras conocidas y disponibilidad de adjuntos. La copia incluye tanto registros como bytes de los archivos.
5. Revisar el volumen previo que Railway conserva al restaurar. No afirmar que su contenido desapareció. Registrar cuándo se elimina según la política de retención elegida.

No se realizó una restauración destructiva del volumen de producción como parte de la entrega. Sí se comprobó persistencia después de un redespliegue del servicio web y purga con reloj controlado sobre grupos aislados.

## Mantenimiento y diagnóstico

```sh
cd /home/kutex/project/polacos
railway status
railway deployment list --service polacos --json
railway logs --service polacos --lines 100
curl --fail https://polacos-production.up.railway.app/api/health
```

Un healthcheck correcto verifica conexión PostgreSQL. No demuestra por sí solo que cada flujo funcione: usar las pruebas y la verificación en navegador después de cambios en negocio o permisos.

El proceso ejecuta las tareas cada minuto incluso sin sesiones abiertas. No activar suspensión por inactividad del servicio web. Con varias réplicas cada una puede intentar la tarea; el bloqueo de base y las claves únicas impiden efectos dobles. Si la base está caída se conserva el estado anterior y se reintenta en el siguiente ciclo.

Para desplegar cambios usar `railway up --service polacos --detach` desde este directorio y comprobar la identidad/proyecto primero. Para reiniciar la versión ya publicada usar `railway redeploy --service polacos --yes`. No utilizar credenciales de Polacos contra otro proyecto ni incluir secretos en argumentos, logs o documentación.

El proxy TCP de PostgreSQL usado durante pruebas es temporal. Se elimina al finalizar la entrega. La aplicación mantiene acceso por red privada; para repetir la integración remota crear temporalmente un proxy en este mismo servicio, actualizar la URL privada de pruebas y cerrarlo después. `.local/production.env` no sirve como conexión externa después de cerrarlo.
