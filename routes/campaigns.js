// Rutas de campañas
const express = require('express');
const router = express.Router();
const campaignsController = require('../controllers/campaignsController');

// Campañas
router.get('/', campaignsController.getAllCampaigns);
router.get('/:id', campaignsController.getCampaign);
router.post('/', campaignsController.createCampaign);
router.delete('/:id', campaignsController.deleteCampaign);

module.exports = router;
