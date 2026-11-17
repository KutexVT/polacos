# Polacos
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
Delegada explícitamente por el usuario. React y Vite con Express y PostgreSQL. Una aplicación y una base de datos propias en Railway.
## Usuarios y propósito
Administrador de plataforma, dueños de grupos y trabajadores que venden a crédito y cobran en Costa Rica. Los clientes son registros sin cuenta. El administrador atiende soporte y supervisa grupos, usuarios y actividad con notas privadas. Su cuenta no crea compras ni registra nuevos cobros. Para dueños y polacos el flujo principal es cliente → compra → calendario → cobro confirmado.
## Restricciones
El alcance acordado completo está en docs/REQUISITOS.md. Dinero exacto en CRC. Zona America/Costa_Rica. Aislamiento de grupos y permisos en servidor. Sin intereses ni pasarela. Datos de demostración únicamente en el grupo de pruebas autorizado por el usuario.
## Accesibilidad
Uso prioritario desde celular. Texto legible al aire libre, controles amplios, etiquetas y estados textuales.
## Principios
La confirmación del servidor precede al éxito visual. Historia de pagos corregible y trazable. Las reservas bloquean stock hasta decisión final. Datos purgados no sostienen estadísticas ocultas.
