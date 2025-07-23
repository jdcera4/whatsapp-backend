// Rutas de configuración
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

// Obtener configuración
router.get('/', settingsController.getSettings);

// Actualizar configuración
router.put('/', settingsController.updateSettings);

module.exports = router;
