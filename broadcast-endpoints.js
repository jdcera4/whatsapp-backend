// broadcast-endpoints.js - Endpoints para envío masivo de mensajes
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

// Función para limpiar número de teléfono
function cleanPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/[^\d]/g, '');
    if (cleaned.length === 10 && !cleaned.startsWith('57')) {
        cleaned = '57' + cleaned;
    }
    return cleaned.endsWith('@c.us') ? cleaned : `${cleaned}@c.us`;
}

// Función para procesar archivos Excel para broadcast
function processExcelBroadcast(filePath, messageTemplate) {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

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
                errors.push(`Fila ${index + 2}: Error al procesar - ${error.message}`);
            }
        });

        return { contacts, errors };

    } catch (error) {
        throw new Error(`Error al procesar Excel: ${error.message}`);
    }
}

// Configurar los endpoints para el servidor Express
function setupBroadcastEndpoints(app, client, messages, saveMessages) {
    // Endpoint para enviar mensajes masivos desde Excel
    app.post('/api/send-excel-broadcast', async (req, res) => {
        try {
            // Verificar si WhatsApp está conectado
            if (!client || !client.info) {
                return res.status(503).json({
                    success: false,
                    error: 'WhatsApp no está conectado'
                });
            }

            // Verificar si se recibió un archivo y un mensaje
            if (!req.files || !req.files.file || !req.body.message) {
                return res.status(400).json({
                    success: false,
                    error: 'Se requiere un archivo Excel y un mensaje'
                });
            }

            const excelFile = req.files.file;
            const messageTemplate = req.body.message;
            const mediaFile = req.files.media;

            // Guardar el archivo Excel temporalmente
            const excelPath = path.join(__dirname, 'uploads', 'excel', `${Date.now()}-${excelFile.name}`);
            await excelFile.mv(excelPath);

            // Guardar el archivo de media si existe
            let mediaPath = null;
            if (mediaFile) {
                mediaPath = path.join(__dirname, 'uploads', 'media', `${Date.now()}-${mediaFile.name}`);
                await mediaFile.mv(mediaPath);
            }

            // Procesar el archivo Excel
            const { contacts, errors } = processExcelBroadcast(excelPath, messageTemplate);

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
                        messageId: sentMessage.id._serialized
                    };

                    messages.push(newMessage);

                    results.push({
                        phone: contact.rawPhone,
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

    // Endpoint para enviar mensajes a una lista de teléfonos
    app.post('/api/broadcast', async (req, res) => {
        try {
            // Verificar si WhatsApp está conectado
            if (!client || !client.info) {
                return res.status(503).json({
                    success: false,
                    error: 'WhatsApp no está conectado'
                });
            }

            // Verificar si se recibieron teléfonos y un mensaje
            if (!req.body.phones || !Array.isArray(req.body.phones) || !req.body.message) {
                return res.status(400).json({
                    success: false,
                    error: 'Se requiere una lista de teléfonos y un mensaje'
                });
            }

            const phones = req.body.phones;
            const messageText = req.body.message;
            const mediaFile = req.files?.media;

            // Guardar el archivo de media si existe
            let mediaPath = null;
            if (mediaFile) {
                mediaPath = path.join(__dirname, 'uploads', 'media', `${Date.now()}-${mediaFile.name}`);
                await mediaFile.mv(mediaPath);
            }

            // Preparar resultados
            const results = [];
            let sent = 0;
            let failed = 0;

            // Enviar mensajes
            for (const phone of phones) {
                try {
                    const cleanedPhone = cleanPhoneNumber(phone);
                    if (!cleanedPhone) {
                        results.push({
                            phone,
                            status: 'failed',
                            error: 'Número de teléfono inválido'
                        });
                        failed++;
                        continue;
                    }

                    let sentMessage;
                    
                    if (mediaPath) {
                        const media = MessageMedia.fromFilePath(mediaPath);
                        sentMessage = await client.sendMessage(cleanedPhone, media, { caption: messageText });
                    } else {
                        sentMessage = await client.sendMessage(cleanedPhone, messageText);
                    }

                    // Registrar mensaje enviado
                    const newMessage = {
                        id: uuidv4(),
                        to: cleanedPhone,
                        from: 'me',
                        message: messageText,
                        mediaUrl: mediaPath,
                        status: 'sent',
                        sentAt: new Date().toISOString(),
                        messageId: sentMessage.id._serialized
                    };

                    messages.push(newMessage);

                    results.push({
                        phone,
                        status: 'sent',
                        messageId: sentMessage.id._serialized
                    });

                    sent++;

                    // Esperar un poco entre mensajes para evitar bloqueos
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`Error enviando mensaje a ${phone}:`, error);
                    
                    results.push({
                        phone,
                        status: 'failed',
                        error: error.message
                    });

                    failed++;
                }
            }

            // Guardar mensajes
            saveMessages();

            // Limpiar archivo de media si existe
            if (mediaPath) {
                try {
                    fs.unlinkSync(mediaPath);
                } catch (error) {
                    console.error('Error al eliminar archivo de media:', error);
                }
            }

            // Enviar respuesta
            res.json({
                success: true,
                message: `Se enviaron ${sent} mensajes, fallaron ${failed}`,
                data: {
                    total: phones.length,
                    sent,
                    failed,
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
}

module.exports = setupBroadcastEndpoints;