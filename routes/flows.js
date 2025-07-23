// Rutas de flujos conversacionales
const express = require('express');
const router = express.Router();
const flowsController = require('../controllers/flowsController');

// Flujos
router.get('/', flowsController.getAllFlows);
router.get('/:id', flowsController.getFlow);
router.post('/', flowsController.createFlow);
router.put('/:id', flowsController.updateFlow);
router.delete('/:id', flowsController.deleteFlow);

// Steps
router.get('/:id/steps', flowsController.getFlowSteps);
router.post('/:id/steps', flowsController.addStepToFlow);
router.put('/:flowId/steps/:stepId', flowsController.updateStep);
router.delete('/:flowId/steps/:stepId', flowsController.deleteStep);

// Options
router.get('/:flowId/steps/:stepId/options', flowsController.getStepOptions);
router.post('/:flowId/steps/:stepId/options', flowsController.addOptionToStep);
router.put('/:flowId/steps/:stepId/options/:optionId', flowsController.updateOption);
router.delete('/:flowId/steps/:stepId/options/:optionId', flowsController.deleteOption);

// Conversational next
router.post('/conversation/next', flowsController.conversationNext);

module.exports = router;
