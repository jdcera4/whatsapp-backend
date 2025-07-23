// Rutas de contactos
const express = require('express');
const router = express.Router();
const contactsController = require('../controllers/contactsController');

// Contactos
router.get('/', contactsController.getAllContacts);
router.get('/paginated', contactsController.getPaginatedContacts);

module.exports = router;
