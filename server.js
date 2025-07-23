// server.js - WhatsApp API Backend con gestión de campañas
const express = require('express');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('🚀 Iniciando WhatsApp Campaign Manager...');

// Crear directorios necesarios
const requiredDirs = ['./data', './uploads/excel', './uploads/media', './session'];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configuración de rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: { success: false, error: 'Demasiadas peticiones, intente más tarde' }
});

// Configuración de CORS
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuración de multer para diferentes tipos de archivos
const createMulterConfig = (destination, allowedTypes) => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = destination;
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

    return multer({
        storage: storage,
        limits: { fileSize: 16 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
            const mimetype = (
                file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                file.mimetype === 'application/vnd.ms-excel' ||
                file.mimetype === 'text/csv'
            );
            if (extname || mimetype) {
                return cb(null, true);
            } else {
                cb(new Error(`Tipo de archivo no permitido: ${file.originalname} (${file.mimetype})`));
            }
        }
    });
};

// Configuraciones de multer específicas
const uploadExcel = createMulterConfig('./uploads/excel/', /\.(xlsx|xls|csv)$/i);
const uploadMedia = createMulterConfig('./uploads/media/', /\.(jpe?g|png|gif|pdf|docx?|txt|mp[34]|wav|ogg|web[pm]|mov|avi|mkv)$/i);

// Servir archivos estáticos
app.use('/uploads', express.static('uploads'));

// Variables globales para WhatsApp
let client = null;
let isClientReady = false;
let qrCodeData = null;
let clientInfo = null;
let campaigns = [];
let contacts = [];
let messages = [];
let flows = [];

// Configuraciones por defecto
let settings = {
    welcomeMessage: "¡Hola! Bienvenido a nuestro servicio de WhatsApp.",
    autoReply: false,
    workingHours: { start: '08:00', end: '18:00' },
    autoReplyMessage: "Gracias por tu mensaje. Te responderemos a la brevedad.",
    keywords: {},
    timezone: 'America/Bogota',
    messageDelay: 2000,
    batchSize: 50
};

// Archivos de persistencia
const SETTINGS_FILE = './data/settings.json';
const CAMPAIGNS_FILE = './data/campaigns.json';
const CONTACTS_FILE = './data/contacts.json';
const MESSAGES_FILE = './data/messages.json';
const FLOWS_FILE = './data/flows.json';

// Funciones de persistencia
function saveMessages() {
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Error al guardar mensajes:', error);
    }
}

function saveData() {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
        saveMessages();
    } catch (error) {
        console.error('Error al guardar datos:', error);
    }
}

function loadData() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const savedSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            settings = { ...settings, ...savedSettings };
        }

        if (fs.existsSync(CAMPAIGNS_FILE)) {
            campaigns = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
        }

        if (fs.existsSync(CONTACTS_FILE)) {
            contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
        }

        if (fs.existsSync(MESSAGES_FILE)) {
            messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
        }

        if (fs.existsSync(FLOWS_FILE)) {
            flows = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error al cargar datos:', error);
    }
}

// Funciones utilitarias
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/[^\d]/g, '');
    if (cleaned.length === 10 && !cleaned.startsWith('57')) {
        cleaned = '57' + cleaned;
    }
    return cleaned.endsWith('@c.us') ? cleaned : `${cleaned}@c.us`;
}

// Cargar datos al iniciar
loadData();

// Inicializar cliente WhatsApp
function initializeWhatsAppClient() {
    console.log('🔄 Inicializando cliente WhatsApp...');

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: "whatsapp-campaign-manager",
            dataPath: "./session"
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        console.log('📱 Código QR generado');
        qrCodeData = await QRCode.toDataURL(qr);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('✅ Cliente WhatsApp listo');
        isClientReady = true;
        clientInfo = client.info;
        qrCodeData = null;
    });

    client.on('authenticated', () => {
        console.log('🔐 Cliente autenticado');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Fallo de autenticación:', msg);
        isClientReady = false;
        qrCodeData = null;
    });

    client.on('disconnected', (reason) => {
        console.log('📱 Cliente desconectado:', reason);
        isClientReady = false;
        clientInfo = null;
        qrCodeData = null;
    });

    client.on('message', async (message) => {
        console.log('📨 Mensaje recibido:', message.from, message.body);

        // Guardar mensaje recibido
        const newMessage = {
            id: uuidv4(),
            from: message.from,
            to: message.to || 'me',
            message: message.body,
            type: 'received',
            status: 'received',
            timestamp: new Date().toISOString(),
            messageId: message.id._serialized
        };

        messages.push(newMessage);
        saveMessages();
    });

    client.initialize();
}

// Inicializar cliente
initializeWhatsAppClient();

// Manejo de cierre limpio
process.on('SIGINT', async () => {
    console.log('\n🔄 Cerrando servidor...');

    // Pausar campañas activas
    campaigns.forEach(campaign => {
        if (campaign.status === 'running') {
            campaign.status = 'paused';
        }
    });
    saveData();

    server.close(() => {
        console.log('🌐 Servidor HTTP cerrado');
    });

    if (isClientReady && client) {
        try {
            await client.destroy();
            console.log('📱 Cliente WhatsApp cerrado');
        } catch (error) {
            console.error('Error al cerrar cliente:', error);
        }
    }

    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🔄 Cerrando servidor...');

    // Pausar campañas activas
    campaigns.forEach(campaign => {
        if (campaign.status === 'running') {
            campaign.status = 'paused';
        }
    });
    saveData();

    server.close(() => {
        console.log('🌐 Servidor HTTP cerrado');
    });

    if (isClientReady && client) {
        try {
            await client.destroy();
            console.log('📱 Cliente WhatsApp cerrado');
        } catch (error) {
            console.error('Error al cerrar cliente:', error);
        }
    }

    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada:', reason);
    process.exit(1);
});
// =

// Endpoint de salud
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Backend funcionando correctamente' });
});

// Endpoint para verificar estado de conexión
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        connected: isClientReady,
        status: isClientReady ? 'connected' : 'disconnected',
        clientInfo: clientInfo,
        needsQR: !isClientReady && !qrCodeData
    });
});

// Endpoint para obtener estado del QR
app.get('/api/qr-status', (req, res) => {
    res.json({
        success: true,
        data: {
            qrCode: qrCodeData,
            isClientReady: isClientReady,
            clientInfo: clientInfo,
            needsQR: !isClientReady && !qrCodeData
        }
    });
});

// Endpoint para conectar WhatsApp
app.post('/api/connect', (req, res) => {
    if (isClientReady) {
        return res.json({
            success: true,
            status: 'connected',
            message: 'WhatsApp ya está conectado'
        });
    }

    if (!client) {
        initializeWhatsAppClient();
    }

    res.json({
        success: true,
        status: 'connecting',
        message: 'Iniciando conexión a WhatsApp...'
    });
});

// Endpoint para desconectar WhatsApp
app.post('/api/disconnect', async (req, res) => {
    try {
        if (client && isClientReady) {
            await client.destroy();
            console.log('🔌 Cliente WhatsApp desconectado');
        }

        isClientReady = false;
        clientInfo = null;
        qrCodeData = null;
        client = null;

        res.json({
            success: true,
            message: 'WhatsApp desconectado correctamente'
        });
    } catch (error) {
        console.error('Error al desconectar:', error);
        res.status(500).json({
            success: false,
            message: 'Error al desconectar WhatsApp'
        });
    }
});

// Endpoint para generar nuevo QR
app.post('/api/generate-qr', (req, res) => {
    try {
        if (isClientReady) {
            return res.json({
                success: false,
                message: 'WhatsApp ya está conectado'
            });
        }

        // Reinicializar cliente para generar nuevo QR
        if (client) {
            client.destroy().catch(console.error);
        }

        qrCodeData = null;
        initializeWhatsAppClient();

        res.json({
            success: true,
            message: 'Generando nuevo código QR...'
        });
    } catch (error) {
        console.error('Error al generar QR:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar código QR'
        });
    }
});

// Endpoint para estadísticas del dashboard
app.get('/api/dashboard/stats', (req, res) => {
    try {
        const totalMessages = messages.length;
        const sentMessages = messages.filter(m => m.status === 'sent').length;
        const deliveredMessages = messages.filter(m => m.status === 'delivered').length;
        const readMessages = messages.filter(m => m.status === 'read').length;
        const failedMessages = messages.filter(m => m.status === 'failed').length;

        const successfulMessages = totalMessages - failedMessages;
        const deliveryRate = totalMessages > 0 ? (successfulMessages / totalMessages) * 100 : 0;

        const activeCampaigns = campaigns.filter(campaign =>
            campaign.status === 'running' || campaign.status === 'created'
        ).length;

        res.json({
            success: true,
            data: {
                totalContacts: contacts.length,
                totalMessages: totalMessages,
                campaigns: {
                    total: campaigns.length,
                    completed: campaigns.filter(c => c.status === 'completed').length,
                    inProgress: activeCampaigns
                },
                unreadMessages: 0, // Implementar lógica de mensajes no leídos
                deliveryRate: Math.round(deliveryRate * 100) / 100,
                sentMessages,
                deliveredMessages,
                readMessages,
                failedMessages
            }
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener estadísticas del dashboard'
        });
    }
});

// Endpoint para obtener contactos
app.get('/api/contacts', (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';

        let filteredContacts = contacts;

        if (search) {
            filteredContacts = contacts.filter(contact =>
                contact.name.toLowerCase().includes(search.toLowerCase()) ||
                contact.phone.includes(search)
            );
        }

        const total = filteredContacts.length;
        const pages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedContacts = filteredContacts.slice(startIndex, endIndex);

        res.json({
            success: true,
            data: paginatedContacts,
            pagination: {
                total,
                page,
                limit,
                pages
            }
        });
    } catch (error) {
        console.error('Error al obtener contactos:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener contactos'
        });
    }
});

// Endpoint para importar contactos desde Excel
app.post('/api/contacts/import', uploadExcel.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se proporcionó archivo'
            });
        }

        const result = processExcelFile(req.file.path);

        // Agregar contactos únicos
        const existingPhones = new Set(contacts.map(c => c.phone));
        const newContacts = result.contacts.filter(c => !existingPhones.has(c.phone));

        contacts.push(...newContacts);
        saveData();

        // Limpiar archivo temporal
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: `Se importaron ${newContacts.length} contactos nuevos`,
            data: {
                imported: newContacts.length,
                duplicates: result.contacts.length - newContacts.length,
                errors: result.errors,
                total: result.contacts.length
            }
        });

    } catch (error) {
        console.error('Error importando contactos:', error);
        res.status(500).json({
            success: false,
            error: 'Error al importar contactos: ' + error.message
        });
    }
});

// Endpoint para enviar mensaje individual
app.post('/api/messages', async (req, res) => {
    try {
        const { phone, message, mediaUrl } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Teléfono y mensaje son requeridos'
            });
        }

        if (!isClientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp no está conectado'
            });
        }

        const cleanedPhone = cleanPhoneNumber(phone);
        if (!cleanedPhone) {
            return res.status(400).json({
                success: false,
                error: 'Número de teléfono inválido'
            });
        }

        let sentMessage;
        if (mediaUrl) {
            const media = MessageMedia.fromFilePath(mediaUrl);
            sentMessage = await client.sendMessage(cleanedPhone, media, { caption: message });
        } else {
            sentMessage = await client.sendMessage(cleanedPhone, message);
        }

        const newMessage = {
            id: uuidv4(),
            to: cleanedPhone,
            from: 'me',
            message: message,
            mediaUrl: mediaUrl,
            status: 'sent',
            sentAt: new Date().toISOString(),
            messageId: sentMessage.id._serialized
        };

        messages.push(newMessage);
        saveMessages();

        res.json({
            success: true,
            data: newMessage
        });

    } catch (error) {
        console.error('Error enviando mensaje:', error);
        res.status(500).json({
            success: false,
            error: 'Error al enviar mensaje: ' + error.message
        });
    }
});

// Endpoint para obtener mensajes
app.get('/api/messages', (req, res) => {
    try {
        const contactId = req.query.contactId;
        let filteredMessages = messages;

        if (contactId) {
            filteredMessages = messages.filter(m =>
                m.to === contactId || m.from === contactId
            );
        }

        res.json({
            success: true,
            data: filteredMessages.sort((a, b) =>
                new Date(b.sentAt || b.timestamp) - new Date(a.sentAt || a.timestamp)
            )
        });
    } catch (error) {
        console.error('Error al obtener mensajes:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener mensajes'
        });
    }
});

// Función para procesar archivos Excel
function processExcelFile(filePath) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        const processedContacts = [];
        const errors = [];

        data.forEach((row, index) => {
            try {
                const nameFields = ['nombre', 'name', 'cliente', 'contact', 'contacto', 'full name', 'nombre completo'];
                const phoneFields = ['telefono', 'teléfono', 'phone', 'celular', 'movil', 'móvil', 'whatsapp', 'número', 'numero', 'number'];

                let name = null;
                let phone = null;

                for (const field of nameFields) {
                    const key = Object.keys(row).find(k =>
                        k.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '')
                            .includes(field.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ''))
                    );
                    if (key && row[key]) {
                        name = row[key].toString().trim();
                        break;
                    }
                }

                for (const field of phoneFields) {
                    const key = Object.keys(row).find(k =>
                        k.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '')
                            .includes(field.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ''))
                    );
                    if (key && row[key]) {
                        phone = row[key].toString().trim();
                        break;
                    }
                }

                if (!name && phone) {
                    name = phone;
                }

                if (!phone) {
                    errors.push(`Fila ${index + 2}: Teléfono faltante`);
                    return;
                }

                const cleanedPhone = cleanPhoneNumber(phone);
                if (!cleanedPhone) {
                    errors.push(`Fila ${index + 2}: Teléfono inválido (${phone})`);
                    return;
                }

                processedContacts.push({
                    id: uuidv4(),
                    name: name,
                    phone: cleanedPhone,
                    rawPhone: phone,
                    source: 'excel_import',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });

            } catch (error) {
                errors.push(`Fila ${index + 2}: Error al procesar - ${error.message}`);
            }
        });

        return { contacts: processedContacts, errors };

    } catch (error) {
        throw new Error(`Error al procesar Excel: ${error.message}`);
    }
}

// Servir archivos estáticos del frontend en producción
const isElectron = process.env.ELECTRON_ENV === 'true';
const frontendPath = isElectron
    ? path.join(__dirname, '..', 'whatsapp-campaign-desktop', 'dist-frontend')
    : path.join(__dirname, '..', 'whatsapp-admin', 'dist', 'whatsapp-admin');

console.log('Ruta de frontend estático:', frontendPath);

// Servir archivos estáticos del frontend
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));

    // Manejar rutas del SPA (Single Page Application)
    app.get('*', (req, res) => {
        // Solo servir index.html para rutas que no son de API
        if (!req.path.startsWith('/api/')) {
            const indexPath = path.join(frontendPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).json({ error: 'Frontend no encontrado' });
            }
        } else {
            res.status(404).json({ error: 'Ruta de API no encontrada' });
        }
    });
}

// Manejo de errores global
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

// Iniciar servidor
const server = app.listen(PORT, HOST, () => {
    console.log(`🌐 Servidor ejecutándose en http://${HOST}:${PORT}`);
    console.log(`📊 Dashboard disponible en http://${HOST}:${PORT}`);
    console.log(`🔗 API disponible en http://${HOST}:${PORT}/api`);
    console.log(`📱 Estado WhatsApp: ${isClientReady ? 'Conectado' : 'Desconectado'}`);
});