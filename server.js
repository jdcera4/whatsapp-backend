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

// Intentar cargar express-fileupload
let fileUpload;
try {
    fileUpload = require('express-fileupload');
    console.log('✅ express-fileupload cargado correctamente');
} catch (error) {
    console.error('❌ Error al cargar express-fileupload:', error.message);
    console.log('⚠️ Instalando express-fileupload automáticamente...');
    
    try {
        // Intentar instalar express-fileupload usando child_process
        const { execSync } = require('child_process');
        execSync('npm install express-fileupload --save', { stdio: 'inherit' });
        console.log('✅ express-fileupload instalado correctamente');
        fileUpload = require('express-fileupload');
    } catch (installError) {
        console.error('❌ Error al instalar express-fileupload:', installError.message);
        console.log('⚠️ Por favor, instala manualmente con: npm install express-fileupload --save');
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('🚀 Iniciando WhatsApp Campaign Manager...');

// Crear directorios necesarios
const requiredDirs = [
    './data', 
    './uploads/excel', 
    './uploads/media', 
    './uploads/temp',
    './session'
];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Directorio creado: ${dir}`);
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

// Configurar express-fileupload
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    useTempFiles: true,
    tempFileDir: './uploads/temp/',
    debug: true,
    createParentPath: true
}));

// Middleware para depurar solicitudes
app.use((req, res, next) => {
    console.log(`📝 ${req.method} ${req.path}`);
    if (req.files) {
        console.log('📁 Archivos recibidos:', Object.keys(req.files));
    }
    next();
});

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

// Endpoint para enviar mensajes masivos desde Excel
app.post('/api/send-excel-broadcast', async (req, res) => {
    try {
        console.log('Recibida solicitud de broadcast Excel');
        
        // Verificar si WhatsApp está conectado
        if (!isClientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp no está conectado'
            });
        }

        // Verificar si se recibió un archivo y un mensaje
        console.log('Archivos recibidos:', req.files);
        console.log('Cuerpo de la solicitud:', req.body);
        
        if (!req.files || !req.body.message) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un archivo Excel y un mensaje'
            });
        }
        
        // El archivo puede venir con cualquier nombre de campo
        let excelFile = null;
        for (const fieldName in req.files) {
            const file = req.files[fieldName];
            if (file.mimetype.includes('excel') || 
                file.mimetype.includes('spreadsheet') || 
                file.name.endsWith('.xlsx') || 
                file.name.endsWith('.xls') || 
                file.name.endsWith('.csv')) {
                excelFile = file;
                break;
            }
        }
        
        if (!excelFile) {
            return res.status(400).json({
                success: false,
                error: 'No se encontró un archivo Excel válido'
            });
        }
        const messageTemplate = req.body.message;
        const mediaFile = req.files.media;

        console.log('Archivo Excel recibido:', excelFile.name);
        console.log('Mensaje recibido:', messageTemplate);
        if (mediaFile) {
            console.log('Archivo media recibido:', mediaFile.name);
        }

        // Guardar el archivo Excel temporalmente
        const excelPath = path.join(__dirname, 'uploads', 'excel', `${Date.now()}-${excelFile.name}`);
        await excelFile.mv(excelPath);
        console.log('Archivo Excel guardado en:', excelPath);

        // Guardar el archivo de media si existe
        let mediaPath = null;
        if (mediaFile) {
            mediaPath = path.join(__dirname, 'uploads', 'media', `${Date.now()}-${mediaFile.name}`);
            await mediaFile.mv(mediaPath);
            console.log('Archivo media guardado en:', mediaPath);
        }

        // Procesar el archivo Excel
        const { contacts, errors } = processExcelBroadcast(excelPath, messageTemplate);
        console.log(`Procesados ${contacts.length} contactos, con ${errors.length} errores`);

        // Preparar resultados
        const results = [];
        let sent = 0;
        let failed = 0;

        // Enviar mensajes
        for (const contact of contacts) {
            try {
                let sentMessage;
                
                if (mediaPath) {
                    const media = MessageMedia.fromFilePath(mediaPath);
                    sentMessage = await client.sendMessage(contact.phone, media, { caption: contact.message });
                } else {
                    sentMessage = await client.sendMessage(contact.phone, contact.message);
                }

                // Registrar mensaje enviado
                const newMessage = {
                    id: uuidv4(),
                    to: contact.phone,
                    from: 'me',
                    message: contact.message,
                    mediaUrl: mediaPath,
                    status: 'sent',
                    sentAt: new Date().toISOString(),
                    messageId: sentMessage.id._serialized,
                    contactName: contact.name || ''
                };

                messages.push(newMessage);

                results.push({
                    phone: contact.rawPhone,
                    name: contact.name || '',
                    status: 'sent',
                    messageId: sentMessage.id._serialized
                });

                sent++;

                // Esperar un poco entre mensajes para evitar bloqueos
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (error) {
                console.error(`Error enviando mensaje a ${contact.phone}:`, error);
                
                results.push({
                    phone: contact.rawPhone,
                    status: 'failed',
                    error: error.message
                });

                failed++;
            }
        }

        // Guardar mensajes
        saveMessages();

        // Limpiar archivos temporales
        try {
            fs.unlinkSync(excelPath);
            if (mediaPath) fs.unlinkSync(mediaPath);
        } catch (error) {
            console.error('Error al eliminar archivos temporales:', error);
        }

        // Enviar respuesta
        res.json({
            success: true,
            message: `Se enviaron ${sent} mensajes, fallaron ${failed}`,
            data: {
                total: contacts.length,
                sent,
                failed,
                errors,
                results
            }
        });

    } catch (error) {
        console.error('Error en broadcast:', error);
        res.status(500).json({
            success: false,
            error: 'Error al enviar mensajes masivos: ' + error.message
        });
    }
});

// Función para procesar archivos Excel para broadcast
function processExcelBroadcast(filePath, messageTemplate) {
    try {
        console.log('Procesando archivo Excel:', filePath);
        console.log('Plantilla de mensaje:', messageTemplate);
        
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        console.log('Datos del Excel:', data);

        const contacts = [];
        const errors = [];

        data.forEach((row, index) => {
            try {
                console.log(`Procesando fila ${index + 2}:`, row);
                
                // Buscar el campo de nombre (name o nombre)
                let name = null;
                if (row.name) {
                    name = row.name.toString().trim();
                } else if (row.nombre) {
                    name = row.nombre.toString().trim();
                } else if (row.Name) {
                    name = row.Name.toString().trim();
                } else if (row.Nombre) {
                    name = row.Nombre.toString().trim();
                }
                
                // Buscar el campo de teléfono (number o número)
                let phone = null;
                if (row.number) {
                    phone = row.number.toString().trim();
                } else if (row.numero) {
                    phone = row.numero.toString().trim();
                } else if (row.número) {
                    phone = row.número.toString().trim();
                } else if (row.Number) {
                    phone = row.Number.toString().trim();
                } else if (row.Numero) {
                    phone = row.Numero.toString().trim();
                } else if (row.Número) {
                    phone = row.Número.toString().trim();
                } else if (row.phone) {
                    phone = row.phone.toString().trim();
                } else if (row.Phone) {
                    phone = row.Phone.toString().trim();
                } else if (row.telefono) {
                    phone = row.telefono.toString().trim();
                } else if (row.Telefono) {
                    phone = row.Telefono.toString().trim();
                } else if (row.teléfono) {
                    phone = row.teléfono.toString().trim();
                } else if (row.Teléfono) {
                    phone = row.Teléfono.toString().trim();
                }
                
                console.log(`Nombre encontrado: "${name}", Teléfono encontrado: "${phone}"`);

                if (!phone) {
                    errors.push(`Fila ${index + 2}: Teléfono faltante`);
                    return;
                }

                const cleanedPhone = cleanPhoneNumber(phone);
                if (!cleanedPhone) {
                    errors.push(`Fila ${index + 2}: Teléfono inválido (${phone})`);
                    return;
                }

                // Preparar mensaje personalizado reemplazando variables
                let personalizedMessage = messageTemplate;
                
                // Reemplazar {nombre} con el nombre del contacto
                if (name) {
                    personalizedMessage = personalizedMessage.replace(/{nombre}/g, name);
                }
                
                // También reemplazar {name} por si acaso
                if (name) {
                    personalizedMessage = personalizedMessage.replace(/{name}/g, name);
                }
                
                // Reemplazar otras variables del formato {{variable}}
                Object.keys(row).forEach(key => {
                    const placeholder = `{{${key}}}`;
                    if (personalizedMessage.includes(placeholder)) {
                        personalizedMessage = personalizedMessage.replace(
                            new RegExp(placeholder, 'g'),
                            row[key] || ''
                        );
                    }
                });
                
                console.log(`Mensaje personalizado: "${personalizedMessage}"`);

                contacts.push({
                    phone: cleanedPhone,
                    rawPhone: phone,
                    name: name || '',
                    message: personalizedMessage,
                    data: row
                });

            } catch (error) {
                console.error(`Error al procesar fila ${index + 2}:`, error);
                errors.push(`Fila ${index + 2}: Error al procesar - ${error.message}`);
            }
        });
        
        console.log(`Procesamiento completado: ${contacts.length} contactos válidos, ${errors.length} errores`);

        return { contacts, errors };

    } catch (error) {
        console.error('Error al procesar Excel:', error);
        throw new Error(`Error al procesar Excel: ${error.message}`);
    }
}

// Endpoint para campañas
app.post('/api/campaigns', async (req, res) => {
    try {
        // Verificar si WhatsApp está conectado
        if (!isClientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp no está conectado'
            });
        }

        // Verificar si se recibieron los datos necesarios
        if (!req.body.phones || !req.body.message) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren teléfonos y mensaje'
            });
        }

        let phones;
        try {
            phones = JSON.parse(req.body.phones);
            if (!Array.isArray(phones)) {
                phones = [phones];
            }
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Formato de teléfonos inválido'
            });
        }

        const message = req.body.message;
        let mediaFile = null;

        // Verificar si hay un archivo adjunto
        if (req.files && req.files.media) {
            mediaFile = req.files.media;
            
            // Guardar el archivo temporalmente
            const mediaPath = path.join(__dirname, 'uploads', 'media', `${Date.now()}-${mediaFile.name}`);
            await mediaFile.mv(mediaPath);
            mediaFile.path = mediaPath;
        }

        // Crear una nueva campaña
        const campaignId = uuidv4();
        const campaign = {
            id: campaignId,
            name: `Campaña ${new Date().toLocaleDateString()}`,
            message: message,
            status: 'sending',
            contacts: phones.map(p => typeof p === 'string' ? p : p.toString()),
            sent: 0,
            failed: 0,
            total: phones.length,
            startedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Agregar la campaña a la lista
        campaigns.push(campaign);
        saveData();

        // Enviar mensajes en segundo plano
        (async () => {
            for (const phone of phones) {
                try {
                    const cleanedPhone = cleanPhoneNumber(phone);
                    if (!cleanedPhone) {
                        campaign.failed++;
                        continue;
                    }

                    let sentMessage;
                    if (mediaFile) {
                        const media = MessageMedia.fromFilePath(mediaFile.path);
                        sentMessage = await client.sendMessage(cleanedPhone, media, { caption: message });
                    } else {
                        sentMessage = await client.sendMessage(cleanedPhone, message);
                    }

                    // Registrar mensaje enviado
                    const newMessage = {
                        id: uuidv4(),
                        to: cleanedPhone,
                        from: 'me',
                        message: message,
                        mediaUrl: mediaFile ? mediaFile.path : undefined,
                        status: 'sent',
                        sentAt: new Date().toISOString(),
                        messageId: sentMessage.id._serialized,
                        campaignId: campaignId
                    };

                    messages.push(newMessage);
                    campaign.sent++;

                    // Esperar un poco entre mensajes para evitar bloqueos
                    await new Promise(resolve => setTimeout(resolve, settings.messageDelay || 1000));
                } catch (error) {
                    console.error(`Error enviando mensaje a ${phone}:`, error);
                    campaign.failed++;
                }
            }

            // Actualizar estado de la campaña
            campaign.status = 'completed';
            campaign.completedAt = new Date().toISOString();
            campaign.updatedAt = new Date().toISOString();
            saveData();
            saveMessages();

            // Limpiar archivo temporal si existe
            if (mediaFile && mediaFile.path) {
                try {
                    fs.unlinkSync(mediaFile.path);
                } catch (error) {
                    console.error('Error al eliminar archivo temporal:', error);
                }
            }
        })();

        // Responder inmediatamente
        res.json({
            success: true,
            data: {
                success: true,
                message: `Campaña iniciada con ${phones.length} contactos`,
                campaignId: campaignId
            }
        });
    } catch (error) {
        console.error('Error al crear campaña:', error);
        res.status(500).json({
            success: false,
            error: 'Error al crear campaña: ' + error.message
        });
    }
});

// Variables globales para WhatsApp
let client = null;
let isClientReady = false;
let qrCodeData = null;
let clientInfo = null;
let campaigns = [];
let qrGenerated = false; // Flag to track if QR has been generated
let qrGenerationTime = null; // Track when QR was generated
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
        if (!qrGenerated) {
            console.log('📱 Código QR generado');
            console.log('🔍 Escanea este código QR con tu teléfono para iniciar sesión en WhatsApp');
            
            // Mostrar el QR en la consola
            qrcode.generate(qr, { small: false });
            
            // También guardar el QR como URL de datos
            qrCodeData = await QRCode.toDataURL(qr);
            
            // Mostrar la URL del código QR en la consola
            console.log('\n🌐 O abre este enlace en tu navegador para ver el código QR:');
            console.log(`http://localhost:3000/api/qr`);
            
            qrGenerated = true;
            qrGenerationTime = new Date();
        }
    });

    client.on('ready', () => {
        console.log('✅ Cliente WhatsApp listo');
        isClientReady = true;
        clientInfo = client.info;
        qrCodeData = null;
        qrGenerated = false; // Reset QR flag when ready
    });

    client.on('authenticated', () => {
        console.log('🔐 Cliente autenticado');
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Fallo de autenticación:', msg);
        isClientReady = false;
        qrCodeData = null;
        qrGenerated = false; // Reset QR flag on auth failure
        qrGenerationTime = null;
    });

    client.on('disconnected', (reason) => {
        console.log('📱 Cliente desconectado:', reason);
        isClientReady = false;
        clientInfo = null;
        qrCodeData = null;
        qrGenerated = false; // Reset QR flag on disconnection
        qrGenerationTime = null;
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

// Función para cerrar sesión
function logoutWhatsApp() {
    return new Promise((resolve, reject) => {
        if (!client) {
            return resolve({ success: true, message: 'No active session' });
        }

        console.log('🔒 Cerrando sesión de WhatsApp...');
        
        // Guardar el estado actual
        const wasReady = isClientReady;
        
        // Resetear el estado
        isClientReady = false;
        clientInfo = null;
        qrCodeData = null;
        qrGenerated = false;
        qrGenerationTime = null;

        // Cerrar el cliente
        client.destroy().then(() => {
            console.log('✅ Sesión de WhatsApp cerrada correctamente');
            client = null;
            
            // Esperar un momento para que se liberen los recursos
            setTimeout(() => {
                // Limpiar la sesión manualmente
                const sessionPath = path.join(__dirname, 'session', 'session-whatsapp-campaign-manager');
                if (fs.existsSync(sessionPath)) {
                    try {
                        // Renombrar la carpeta de sesión en lugar de eliminarla
                        const timestamp = new Date().getTime();
                        const newPath = `${sessionPath}-old-${timestamp}`;
                        fs.renameSync(sessionPath, newPath);
                        console.log(`✅ Carpeta de sesión renombrada a: ${path.basename(newPath)}`);
                    } catch (error) {
                        console.warn('⚠️ No se pudo renombrar la carpeta de sesión:', error.message);
                    }
                }
                
                // Volver a inicializar el cliente
                initializeWhatsAppClient();
                resolve({ success: true, message: 'Sesión cerrada correctamente' });
            }, 2000); // Esperar 2 segundos antes de reiniciar
            
        }).catch(error => {
            console.error('❌ Error al cerrar sesión:', error);
            // Forzar la limpieza del cliente aunque falle el cierre
            client = null;
            initializeWhatsAppClient();
            reject({ success: false, error: 'Error al cerrar sesión: ' + error.message });
        });
    });
}

// Inicializar cliente
initializeWhatsAppClient();

// Endpoint para obtener el código QR actual
app.get('/api/qr', (req, res) => {
    if (!qrCodeData) {
        return res.status(404).json({
            success: false,
            message: 'No hay un código QR disponible actualmente. Por favor, espera a que se genere uno nuevo.'
        });
    }

    // Enviar el QR como imagen
    const img = Buffer.from(qrCodeData.split(',')[1], 'base64');
    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': img.length
    });
    res.end(img);
});

// Endpoint para cerrar sesión
app.post('/api/logout', async (req, res) => {
    try {
        const result = await logoutWhatsApp();
        res.json(result);
    } catch (error) {
        console.error('Error en /api/logout:', error);
        res.status(500).json({
            success: false,
            error: 'Error al cerrar sesión: ' + error.message
        });
    }
});

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

        // Reset all QR related flags and data
        qrCodeData = null;
        qrGenerated = false;
        qrGenerationTime = null;
        
        // Initialize new client
        initializeWhatsAppClient();

        res.json({
            success: true,
            message: 'Generando nuevo código QR...'
        });
    } catch (error) {
        console.error('Error al generar QR:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar código QR',
            error: error.message
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