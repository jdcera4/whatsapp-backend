# WhatsApp Admin Backend

Backend para el panel de administración de WhatsApp, construido con Node.js, Express y whatsapp-web.js.

## Características

- Envío de mensajes individuales con soporte para archivos adjuntos
- Difusión masiva de mensajes con programación
- Gestión de contactos (CRUD, importación/exportación CSV)
- Configuración del bot (mensajes automáticos, horarios, etc.)
- Autenticación por código QR

## Requisitos

- Node.js 14.x o superior
- NPM o Yarn
- WhatsApp Business instalado en un teléfono móvil para escanear el código QR

## Instalación

1. Clonar el repositorio:
   ```bash
   git clone <repositorio>
   cd whatsapp-backend
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno (opcional):
   Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:
   ```
   PORT=3000
   SESSION_FILE_PATH=./session.json
   ```

## Uso

1. Iniciar el servidor:
   ```bash
   npm start
   ```

2. Escanear el código QR que aparece en la consola con tu teléfono móvil (usando la aplicación de WhatsApp)

3. El servidor estará disponible en `https://whatsapp-backend-stoe.onrender.com/api`

## API Endpoints

### Autenticación
- `GET /api/status` - Verificar estado de conexión
- `GET /api/qr` - Obtener código QR para autenticación

### Mensajes
- `POST /api/send-message` - Enviar mensaje individual
- `POST /api/broadcast` - Enviar mensaje de difusión

### Contactos
- `GET /api/contacts` - Obtener lista de contactos
- `POST /api/contacts` - Agregar nuevo contacto
- `POST /api/contacts/import` - Importar contactos desde CSV
- `GET /api/contacts/export` - Exportar contactos a CSV

### Configuración
- `GET /api/settings` - Obtener configuración actual
- `PUT /api/settings` - Actualizar configuración

## Estructura de Carpetas

- `/uploads` - Archivos subidos temporalmente
- `server.js` - Punto de entrada de la aplicación
- `package.json` - Dependencias y scripts

## Seguridad

- No expongas este servidor directamente a Internet sin autenticación adicional
- Los mensajes se envían a través de tu propia sesión de WhatsApp
- Se recomienda usar HTTPS en producción

## Licencia

MIT
