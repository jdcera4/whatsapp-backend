// Controlador de contactos
const fs = require('fs');
const path = require('path');

const CONTACTS_FILE = path.join(__dirname, '../data/contacts.json');

let contacts = [];

function loadContacts() {
    if (fs.existsSync(CONTACTS_FILE)) {
        try {
            contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
        } catch (e) {
            contacts = [];
        }
    } else {
        contacts = [];
    }
}

function saveContacts() {
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2), 'utf8');
}

// Inicializar
loadContacts();

module.exports = {
    getAllContacts: (req, res) => {
        res.json(contacts);
    },
    getPaginatedContacts: (req, res) => {
        const { page = 1, limit = 50, search = '' } = req.query;
        let filteredContacts = contacts;
        if (search) {
            filteredContacts = contacts.filter(c => (c.name && c.name.toLowerCase().includes(search.toLowerCase())) || (c.phone && c.phone.includes(search)));
        }
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const start = (pageNum - 1) * limitNum;
        const end = start + limitNum;
        const paginated = filteredContacts.slice(start, end);
        res.json({
            contacts: paginated,
            total: filteredContacts.length,
            page: pageNum,
            limit: limitNum
        });
    },
    // Aquí agregar handlers adicionales: importar contactos, etc.
};
