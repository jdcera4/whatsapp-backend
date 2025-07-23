// Controlador de mensajes
const fs = require('fs');
const path = require('path');

const MESSAGES_FILE = path.join(__dirname, '../data/messages.json');

let messages = [];

function loadMessages() {
    if (fs.existsSync(MESSAGES_FILE)) {
        try {
            messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
        } catch (e) {
            messages = [];
        }
    } else {
        messages = [];
    }
}

function saveMessages() {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
}

// Inicializar
loadMessages();

module.exports = {
    getAllMessages: (req, res) => {
        res.json({ success: true, data: messages });
    },
    getPaginatedMessages: (req, res) => {
        const { page = 1, limit = 10, search = '' } = req.query;
        let filteredMessages = messages;
        if (search) {
            filteredMessages = messages.filter(m => (m.body && m.body.toLowerCase().includes(search.toLowerCase())));
        }
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const start = (pageNum - 1) * limitNum;
        const end = start + limitNum;
        const paginated = filteredMessages.slice(start, end);
        res.json({
            success: true,
            data: {
                messages: paginated,
                total: filteredMessages.length,
                page: pageNum,
                limit: limitNum
            }
        });
    },
    // Aquí agregar handlers adicionales: enviar mensaje, etc.
};
