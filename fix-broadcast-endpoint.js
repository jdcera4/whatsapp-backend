// fix-broadcast-endpoint.js - Versión optimizada del endpoint de broadcast
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const os = require('os');

// Función para limpiar número de teléfono
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/[^\d]/g, '');
    if (cleaned.length === 10 && !cleaned.startsWith('57')) {
        cleaned = '57' + cleaned;
    }
    return cleaned.endsWith('@c.us') ? cleaned : `${cleaned}@c.us`;
}

// Función para registrar logs
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    try {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        fs.appendFileSync(
            path.join(logDir, 'broadcast.log'),
            logMessage
        );
    } catch (error) {
        console.error('Error al escribir log:', error);
    }
}

// Función para procesar archivos Excel para broadcast
function processExcelBroadcast(filePath, messageTemplate) {
    try {
        log(`Procesando archivo Excel: ${filePath}`);
        
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        log(`Datos extraídos: ${data.length} filas`);

        const contacts = [];
        const errors = [];

        data.forEach((row, index) => {
            try {
                const phoneFields = ['telefono', 'teléfono', 'phone', 'celular', 'movil', 'móvil', 'whatsapp', 'número', 'numero', 'number'];
                let phone = null;

                // Buscar el campo de teléfono
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
                Object.keys(row).forEach(key => {
                    const placeholder = `{{${key}}}`;
                    if (personalizedMessage.includes(placeholder)) {
                        personalizedMessage = personalizedMessage.replace(
                            new RegExp(placeholder, 'g'),
                            row[key] || ''
                        );
                    }
                });

                contacts.push({
                    phone: cleanedPhone,
                    rawPhone: phone,
                    message: personalizedMessage,
                    data: row
                });

            } catch (error) {
                log(`Error al procesar fila ${index + 2}: ${error.message}`, 'error');
                errors.push(`Fila ${index + 2}: Error al procesar - ${error.message}`);
            }
        });

        log(`Procesamiento completado: ${contacts.length} contactos válidos, ${errors.length} errores`);
        return { contacts, errors };

    } catch (error) {
        log(`Error al procesar Excel: ${error.message}`, 'error');
        throw new Error(`Error al procesar Excel: ${error.message}`);
    }
}

// Configurar los endpoints para el servidor Express
function setupOptimizedBroadcastEndpoints(app, client, messages, saveMessages) {
    // Asegurar que existan los directorios necesarios
    const requiredDirs = ['./uploads/excel', './uploads/media', './logs'];
    requiredDirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    // Endpoint para enviar mensajes masivos desde Excel
    app.post('/api/send-excel-broadcast', async (req, res) => {
        try {
            log('Recibida solicitud de broadcast desde Excel');
            
            // Verificar si WhatsApp está conectado
            if (!client || !client.info) {
                log('WhatsApp no está conectado', 'error');
                return res.status(503).json({
                    success: false,
                    error: 'WhatsApp no está conectado'
                });
            }

            // Verificar si se recibió un archivo y un mensaje
            if (!req.files || !req.files.file || !req.body.message) {
                log('Faltan archivos o mensaje en la solicitud', 'error');
                return res.status(400).json({
                    success: false,
                    error: 'Se requiere un archivo Excel y un mensaje'
                });
            }

            const excelFile = req.files.file;
            const messageTemplate = req.body.message;
            const mediaFile = req.files.media;
            
            log(`Archivo recibido: ${excelFile.name} (${excelFile.size} bytes)`);
            log(`Mensaje template: "${messageTemplate.substring(0, 50)}..."`);
            
            if (mediaFile) {
                log(`Archivo media recibido: ${mediaFile.name} (${mediaFile.size} bytes)`);
            }

            // Usar directorio temporal del sistema para mayor compatibilidad
            const tempDir = os.tmpdir();
            log(`Usando directorio temporal: ${tempDir}`);
            
            // Guardar el archivo Excel temporalmente
            const excelFileName = `excel-${Date.now()}-${excelFile.name}`;
            const excelPath = path.join(tempDir, excelFileName);
            
            try {
                await excelFile.mv(excelPath);
                log(`Archivo Excel guardado en: ${excelPath}`);
            } catch (error) {
                log(`Error al guardar archivo Excel: ${error.message}`, 'error');
                return res.status(500).json({
                    success: false,
                    error: `Error al guardar archivo Excel: ${error.message}`
                });
            }

            // Guardar el archivo de media si existe
            let mediaPath = null;
            if (mediaFile) {
                const mediaFileName = `media-${Date.now()}-${mediaFile.name}`;
                mediaPath = path.join(tempDir, mediaFileName);
                
                try {
                    await mediaFile.mv(mediaPath);
                    log(`Archivo media guardado en: ${mediaPath}`);
                } catch (error) {
                    log(`Error al guardar archivo media: ${error.message}`, 'error');
                    // Continuar sin el archivo media
                }
            }

            // Procesar el archivo Excel
            let contacts, errors;
            try {
                const result = processExcelBroadcast(excelPath, messageTemplate);
                contacts = result.contacts;
                errors = result.errors;
            } catch (error) {
                log(`Error al procesar Excel: ${error.message}`, 'error');
                return res.status(500).json({
                    success: false,
                    error: `Error al procesar Excel: ${error.message}`
                });
            }

            // Preparar resultados
            const results = [];
            let sent = 0;
            let failed = 0;
            
            log(`Iniciando envío de mensajes a ${contacts.length} contactos`);

            // Enviar mensajes en lotes para evitar sobrecarga
            const BATCH_SIZE = 5; // Procesar 5 mensajes a la vez
            const DELAY_BETWEEN_MESSAGES = 1000; // 1 segundo entre mensajes
            const DELAY_BETWEEN_BATCHES = 3000; // 3 segundos entre lotes
            
            // Función para enviar un lote de mensajes
            async function sendBatch(batch) {
                for (const contact of batch) {
                    try {
                        log(`Enviando mensaje a ${contact.rawPhone}`);
                        let sentMessage;
                        
                        if (mediaPath) {
                            try {
                                const media = MessageMedia.fromFilePath(mediaPath);
                                sentMessage = await client.sendMessage(contact.phone, media, { caption: contact.message });
                            } catch (mediaError) {
                                log(`Error con archivo media: ${mediaError.message}`, 'error');
                                // Intentar enviar sin media
                                sentMessage = await client.sendMessage(contact.phone, contact.message);
                            }
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
                            messageId: sentMessage.id._serialized
                        };

                        messages.push(newMessage);

                        results.push({
                            phone: contact.rawPhone,
                            status: 'sent',
                            messageId: sentMessage.id._serialized
                        });

                        sent++;
                        log(`Mensaje enviado correctamente a ${contact.rawPhone}`);

                        // Esperar un poco entre mensajes para evitar bloqueos
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));

                    } catch (error) {
                        log(`Error enviando mensaje a ${contact.rawPhone}: ${error.message}`, 'error');
                        
                        results.push({
                            phone: contact.rawPhone,
                            status: 'failed',
                            error: error.message
                        });

                        failed++;
                    }
                }
            }
            
            // Procesar contactos en lotes
            for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
                const batch = contacts.slice(i, i + BATCH_SIZE);
                await sendBatch(batch);
                
                // Si no es el último lote, esperar entre lotes
                if (i + BATCH_SIZE < contacts.length) {
                    log(`Esperando ${DELAY_BETWEEN_BATCHES/1000} segundos antes del siguiente lote...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            }

            // Guardar mensajes
            try {
                saveMessages();
                log('Mensajes guardados correctamente');
            } catch (error) {
                log(`Error al guardar mensajes: ${error.message}`, 'error');
            }

            // Limpiar archivos temporales
            try {
                fs.unlinkSync(excelPath);
                log(`Archivo Excel temporal eliminado: ${excelPath}`);
                
                if (mediaPath) {
                    fs.unlinkSync(mediaPath);
                    log(`Archivo media temporal eliminado: ${mediaPath}`);
                }
            } catch (error) {
                log(`Error al eliminar archivos temporales: ${error.message}`, 'warning');
            }

            // Enviar respuesta
            log(`Broadcast completado: ${sent} enviados, ${failed} fallidos`);
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
            log(`Error general en broadcast: ${error.message}`, 'error');
            log(error.stack, 'error');
            
            res.status(500).json({
                success: false,
                error: 'Error al enviar mensajes masivos: ' + error.message
            });
        }
    });

    // Endpoint para verificar logs de broadcast
    app.get('/api/broadcast-logs', (req, res) => {
        try {
            const logPath = path.join(__dirname, 'logs', 'broadcast.log');
            
            if (!fs.existsSync(logPath)) {
                return res.json({
                    success: true,
                    logs: []
                });
            }
            
            const logs = fs.readFileSync(logPath, 'utf8');
            res.json({
                success: true,
                logs: logs.split('\n').filter(Boolean).slice(-100) // Últimas 100 líneas
            });
            
        } catch (error) {
            res.status(500).json({
                success: false,
                error: `Error al leer logs: ${error.message}`
            });
        }
    });
}

module.exports = setupOptimizedBroadcastEndpoints;