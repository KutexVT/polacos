# Decisiones de producto e implementación

La especificación completa está en `REQUISITOS.md`. Estas decisiones completan detalles no fijados en ella.

## Dinero y fechas

- Los importes se guardan en céntimos enteros. Las entradas aceptan hasta dos decimales; se rechazan decimales adicionales en vez de redondearlos silenciosamente. El descuento porcentual se convierte a céntimos redondeando al céntimo más cercano antes de enviar el precio propuesto. El total confirmado se vuelve a validar en servidor.
- No hay intereses, recargos, suscripciones, pagos bancarios ni estimaciones de ganancia. El límite técnico por importe/total es 1.000.000.000.000 céntimos y por calendario es 1.000 vencimientos.
- Las fechas comerciales son `date`, sin hora. La fecha actual y las presentaciones con hora usan Costa Rica. Los instantes de auditoría, sesiones y permisos se guardan como `timestamptz`.
- Mensual y trimestral respetan el día solicitado o el último día del mes. Si el día de ese período precede al inicio se usa el siguiente período. Quincenal permite cada 15 días o dos días fijos al mes. Si ambos días fijos coinciden en el último día de un mes corto se genera un solo vencimiento ese día.
- Los pagos se reproducen en orden de registro para que una corrección recalcule el mismo historial. `paid_on` es la fecha comercial y controla la evolución de cobros. No se permite que un pago o corrección exceda saldo/cuotas seleccionadas.
- Un abono al capital consume cuotas desde el final. La cuota actual permanece pendiente salvo que el abono liquide el saldo completo. Los adelantos de cuotas afectan solo a las cuotas seleccionadas.
- El calendario base siempre suma el total original pactado. Los abonos se aplican al calcular el saldo; no reescriben el calendario ni borran el historial. Al editar se conservan fechas e importes de cuotas pasadas o ya pagadas. Una modificación inconsistente con pagos posteriores se rechaza.

## Ventas e inventario

- Precio distinto solicitado por un polaco: reserva y no deuda cobrable. Un rechazo conserva la reserva. Reenvío incrementa la versión. Una decisión vieja no resuelve una versión posterior.
- Dueño y administrador fijan precio directamente. Una corrección posterior necesita motivo y calendario coherente con todos los pagos.
- Cancelar una compra confirmada detiene la cobranza pendiente y no devuelve unidades. Lo cobrado sigue contando hasta anular o corregir esos pagos explícitamente. No se inventa una devolución de dinero.
- Las estadísticas de ventas y saldo con rango de fechas corresponden a compras creadas en ese rango. Los cobros y su evolución siguen la fecha propia del pago, incluso si la venta se creó antes. El texto del reporte distingue los dos criterios.
- Un producto con reservas no se retira hasta resolverlas. Eliminar un producto no borra compras confirmadas. Purgar una compra elimina su asignación histórica del contador pero no repone unidades disponibles.

## Permisos y retirada

- El límite cuenta perfiles de polacos activos. Retirados no ocupan cupo; dueños y clientes tampoco. Se puede reducir el límite por debajo del uso actual: se impiden nuevas altas/restauraciones hasta estar por debajo del nuevo límite, sin borrar usuarios existentes.
- Las sesiones duran 7 días. Restablecer contraseña o retirar usuario invalida sesiones. Las preferencias son del usuario y el logo pertenece al grupo.
- Los permisos temporales pueden solicitarse por un máximo de 720 horas. El destinatario decide los registros y la caducidad. La caducidad se comprueba en la base en cada operación; un aviso en pantalla no constituye autorización.
- Transferir un cliente revoca conservadoramente todos los permisos pendientes/aprobados que concedió su responsable anterior. Tendrá que volver a compartir los otros clientes si lo necesita. No se mantiene acceso por haber subido una foto: manda el permiso sobre el registro actual.
- Al retirar con transferencia se conservan los clientes, compras, pagos, planes y fotos; las propuestas pendientes pasan al nuevo responsable. Si se envían los clientes a papelera se liberan sus reservas.
- Restaurar una compra confirmada no consume stock otra vez. Restaurar una compra que nunca se confirmó necesita reservar unidades de nuevo y queda pendiente de decisión. Restaurar un usuario no recupera clientes ya transferidos ni sesiones anteriores.
- Purgar un usuario elimina sus mensajes y archivos personales. Los archivos referenciados por clientes transferidos se conservan como archivos comerciales sin vinculación al usuario eliminado. No se eliminan mensajes de otros participantes ni los chats compartidos que aún contienen datos de otros.
- No existe una tabla oculta de ventas históricas. Los reportes se recalculan con datos vigentes. La retención de copias del proveedor se documenta por separado.

## Comunicación y operación

- Solo se generan avisos internos. Un recordatorio próximo cubre los tres días siguientes. El aviso de atraso aparece al pasar el vencimiento. Claves por compra, cuota, fecha, saldo y estado evitan repeticiones sin un cambio relevante.
- Los eventos SSE contienen únicamente una invalidación vacía dirigida al usuario destinatario. El cliente vuelve a consultar datos con su sesión. PostgreSQL LISTEN/NOTIFY permite varias instancias sin un bus externo. Tras una desconexión el navegador vuelve a consultar el estado persistente.
- Las conversaciones privadas son visibles para participantes y administrador. El administrador que supervisa no puede enviar mensajes si no participa. Soporte se crea con el primer mensaje del solicitante. No existe cifrado de extremo a extremo ni llamadas.
- Máximo 10 MiB por adjunto. Se admiten imágenes JPEG/PNG/WebP/GIF, audios comunes, PDF, ZIP, DOCX, XLSX y texto UTF-8. El tipo real se comprueba por contenido. Cada subida se vincula a una operación; reutilizar un adjunto privado para otro registro requiere subir un archivo nuevo.
- Interfaz móvil con navegación inferior, menú completo y tablas desplazables dentro de su contenedor. Listas principales con búsqueda y paginación de 20 elementos; máximo 100 por petición.
- Las consultas de reportes y varias listas calculan agregados en el servidor con los registros autorizados. Es adecuado para la primera instalación. Antes de un volumen masivo habría que paginar/agregar en SQL y medir el bloqueo global; no se afirma haber realizado una prueba de carga masiva.
- Sin datos de demostración permanentes en producción. Los grupos QA se crean solo durante verificación y se eliminan incluyendo avisos administrativos y adjuntos de prueba.
