// Controlador de configuración
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

module.exports = {
    getSettings: (req, res) => {
        try {
            if (!fs.existsSync(SETTINGS_FILE)) {
                const defaultSettings = {
                    welcomeMessage: "¡Hola! Bienvenido a nuestro servicio de WhatsApp.",
                    autoReply: false,
                    workingHours: { start: '08:00', end: '18:00' },
                    autoReplyMessage: "Gracias por tu mensaje. Te responderemos a la brevedad.",
                    keywords: {},
                    timezone: 'America/Bogota',
                    messageDelay: 2000,
                    batchSize: 50
                };
                return res.json(defaultSettings);
            }
            const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            res.json(settings);
        } catch (error) {
            res.status(500).json({ success: false, error: 'Error al leer la configuración' });
        }
    },

    updateSettings: (req, res) => {
        try {
            const settings = req.body;
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
            res.json({ success: true, settings });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Error al guardar la configuración' });
        }
    }
};
