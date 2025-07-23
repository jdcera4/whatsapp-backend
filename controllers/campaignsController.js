// Controlador de campañas
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CAMPAIGNS_FILE = path.join(__dirname, '../data/campaigns.json');
const CONTACTS_FILE = path.join(__dirname, '../data/contacts.json');

let campaigns = [];
let contacts = [];

function loadCampaigns() {
    if (fs.existsSync(CAMPAIGNS_FILE)) {
        try {
            campaigns = JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, 'utf8'));
        } catch (e) {
            campaigns = [];
        }
    } else {
        campaigns = [];
    }
}

function saveCampaigns() {
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2), 'utf8');
}

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

// Inicializar
loadCampaigns();
loadContacts();

module.exports = {
    getAllCampaigns: (req, res) => {
        res.json(campaigns);
    },
    getCampaign: (req, res) => {
        const campaign = campaigns.find(c => c.id === req.params.id);
        if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
        res.json(campaign);
    },
    createCampaign: (req, res) => {
        const { name, message, mediaPath, mediaType, contacts: campaignContacts, scheduledFor } = req.body;
        const campaign = {
            id: Date.now().toString(),
            name,
            message,
            mediaPath: mediaPath || null,
            mediaType: mediaType || null,
            contacts: campaignContacts || [],
            status: 'created',
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            scheduledFor: scheduledFor || null,
            progress: {
                total: campaignContacts?.length || 0,
                sent: 0,
                failed: 0,
                pending: campaignContacts?.length || 0
            },
            results: []
        };
        campaigns.push(campaign);
        saveCampaigns();
        res.status(201).json(campaign);
    },
    deleteCampaign: (req, res) => {
        const idx = campaigns.findIndex(c => c.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Campaña no encontrada' });
        campaigns.splice(idx, 1);
        saveCampaigns();
        res.json({ success: true });
    },
    // Aquí agregar handlers adicionales: ejecutar campaña, reportes, etc.
};
