// server-stable.js - Versión estable sin WhatsApp Web para desarrollo
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('🚀 Iniciando WhatsApp Campaign Manager (Modo Desarrollo)...');

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

// Variables globales (simuladas para desarrollo)
let campaigns = [];
let contacts = [];
let messages = [];
let flows = [];
let isClientReady = false; // Simulado como false para desarrollo
let qrCodeData = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=WhatsApp-Development-Mode'; // QR simulado
let clientInfo = null;

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

// Middleware
const checkClientReady = (req, res, next) => {
    // En modo desarrollo, simular que no está conectado
    return res.status(503).json({
        success: false,
        error: 'WhatsApp no está conectado (Modo Desarrollo)',
        needsQR: true,
        qr: qrCodeData
    });
};

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Datos de entrada inválidos',
            details: errors.array()
        });
    }
    next();
};

// Cargar datos al iniciar
loadData();

// Importar y configurar controladores
const contactsController = require('./controllers/contactsController');
const messagesController = require('./controllers/messagesController');
const campaignsController = require('./controllers/campaignsController');
const settingsController = require('./controllers/settingsController');

// Configurar controladores con variables globales (simuladas)
contactsController.setWhatsAppGlobals({ contacts, client: null });
messagesController.setWhatsAppGlobals({ messages, client: null });
campaignsController.setWhatsAppGlobals({ campaigns, contacts, messages, client: null, settings });
settingsController.setWhatsAppGlobals({ settings });

// Rutas principales
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/flows', require('./routes/flows'));
app.use('/api/settings', require('./routes/settings'));

// Endpoint para obtener el QR (simulado)
app.get('/api/qr', (req, res) => {
    res.json({
        success: true,
        qr: qrCodeData,
        message: 'Modo desarrollo - WhatsApp no conectado. Para conectar WhatsApp real, use server.js'
    });
});

// Endpoint para verificar estado de conexión (simulado)
app.get('/api/status', (req, res) => {
    res.json({
        connected: false,
        status: 'development_mode',
        clientInfo: null,
        needsQR: true,
        message: 'Ejecutándose en modo desarrollo'
    });
});

// Endpoint para estadísticas del dashboard (simulado)
app.get('/api/dashboard/stats', (req, res) => {
    try {
        const totalMessages = messages.length;
        const sentMessages = messages.filter(m => m.status === 'sent').length;
        const deliveredMessages = messages.filter(m => m.status === 'delivered').length;
        const readMessages = messages.filter(m => m.status === 'read').length;
        const failedMessages = messages.filter(m => m.status === 'failed').length;
        
        const successfulMessages = totalMessages - failedMessages;
        const deliveryRate = totalMessages > 0 ? (successfulMessages / totalMessages) * 100 : 0;
        
        const messagesByDay = {};
        const now = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            messagesByDay[dateStr] = Math.floor(Math.random() * 10); // Datos simulados
        }
        
        const messagesTrend = Object.entries(messagesByDay).map(([date, count]) => ({
            date,
            count
        }));
        
        const activeCampaigns = campaigns.filter(campaign => 
            campaign.status === 'running' || campaign.status === 'created'
        ).length;
        
        res.json({
            success: true,
            connected: false,
            needsQR: true,
            qr: qrCodeData,
            clientInfo: null,
            developmentMode: true,
            stats: {
                totalMessages,
                sentMessages,
                deliveredMessages,
                readMessages,
                failedMessages,
                deliveryRate: Math.round(deliveryRate * 100) / 100,
                totalContacts: contacts.length,
                activeCampaigns,
                totalCampaigns: campaigns.length
            },
            messagesTrend
        });
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener estadísticas del dashboard'
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

// Manejo de errores global
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Ruta no encontrada'
    });
});

// Iniciar servidor
const server = app.listen(PORT, HOST, () => {
    console.log(`🌐 Servidor ejecutándose en http://${HOST}:${PORT}`);
    console.log(`📊 Dashboard disponible en http://${HOST}:${PORT}/api/dashboard/stats`);
    console.log(`⚠️  MODO DESARROLLO: WhatsApp Web no está conectado`);
    console.log(`📱 Para conectar WhatsApp real, use: npm run prod`);
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Cerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor cerrado correctamente');
        process.exit(0);
    });
});