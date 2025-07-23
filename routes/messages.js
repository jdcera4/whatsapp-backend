// Rutas de mensajes
const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');

// Mensajes
router.get('/', messagesController.getAllMessages);
router.get('/paginated', messagesController.getPaginatedMessages);

module.exports = router;
