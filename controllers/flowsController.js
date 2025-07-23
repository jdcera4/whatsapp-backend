// Controlador de flujos conversacionales
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const FLOWS_FILE = path.join(__dirname, '../data/flows.json');

let flows = [];

function loadFlows() {
    if (fs.existsSync(FLOWS_FILE)) {
        try {
            flows = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8'));
        } catch (e) {
            flows = [];
        }
    } else {
        flows = [];
    }
}

function saveFlows() {
    fs.writeFileSync(FLOWS_FILE, JSON.stringify(flows, null, 2), 'utf8');
}

// Inicializar al cargar
loadFlows();

module.exports = {
    getAllFlows: (req, res) => {
        res.json(flows);
    },
    getFlow: (req, res) => {
        const flow = flows.find(f => f.id === req.params.id);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        res.json(flow);
    },
    createFlow: (req, res) => {
        const { name, description, isActive, steps = [] } = req.body;
        const newFlow = { id: uuidv4(), name, description, isActive: !!isActive, steps };
        flows.push(newFlow);
        saveFlows();
        res.status(201).json(newFlow);
    },
    updateFlow: (req, res) => {
        const flow = flows.find(f => f.id === req.params.id);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        flow.name = req.body.name || flow.name;
        flow.description = req.body.description || flow.description;
        flow.isActive = req.body.isActive !== undefined ? !!req.body.isActive : flow.isActive;
        saveFlows();
        res.json(flow);
    },
    deleteFlow: (req, res) => {
        const idx = flows.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Flujo no encontrado' });
        flows.splice(idx, 1);
        saveFlows();
        res.json({ success: true });
    },
    getFlowSteps: (req, res) => {
        const flow = flows.find(f => f.id === req.params.id);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        res.json(flow.steps || []);
    },
    addStepToFlow: (req, res) => {
        const flow = flows.find(f => f.id === req.params.id);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const { message, isFinal } = req.body;
        const newStep = { id: uuidv4(), message, isFinal: !!isFinal, options: [] };
        flow.steps.push(newStep);
        saveFlows();
        res.status(201).json(newStep);
    },
    updateStep: (req, res) => {
        const flow = flows.find(f => f.id === req.params.flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const step = flow.steps.find(s => s.id === req.params.stepId);
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        step.message = req.body.message || step.message;
        step.isFinal = req.body.isFinal !== undefined ? !!req.body.isFinal : step.isFinal;
        saveFlows();
        res.json(step);
    },
    deleteStep: (req, res) => {
        const flow = flows.find(f => f.id === req.params.flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const idx = flow.steps.findIndex(s => s.id === req.params.stepId);
        if (idx === -1) return res.status(404).json({ error: 'Paso no encontrado' });
        flow.steps.splice(idx, 1);
        saveFlows();
        res.json({ success: true });
    },
    getStepOptions: (req, res) => {
        const flow = flows.find(f => f.id === req.params.flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const step = flow.steps.find(s => s.id === req.params.stepId);
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        res.json(step.options || []);
    },
    addOptionToStep: (req, res) => {
        const flow = flows.find(f => f.id === req.params.flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const step = flow.steps.find(s => s.id === req.params.stepId);
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        const { label, nextStepId, responseMessage } = req.body;
        const newOption = { id: uuidv4(), label, nextStepId: nextStepId || null, responseMessage: responseMessage || '' };
        step.options.push(newOption);
        saveFlows();
        res.status(201).json(newOption);
    },
    updateOption: (req, res) => {
        const flow = flows.find(f => f.id === req.params.flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const step = flow.steps.find(s => s.id === req.params.stepId);
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        const option = step.options.find(o => o.id === req.params.optionId);
        if (!option) return res.status(404).json({ error: 'Opción no encontrada' });
        option.label = req.body.label || option.label;
        option.nextStepId = req.body.nextStepId !== undefined ? req.body.nextStepId : option.nextStepId;
        option.responseMessage = req.body.responseMessage !== undefined ? req.body.responseMessage : option.responseMessage;
        saveFlows();
        res.json(option);
    },
    deleteOption: (req, res) => {
        const flow = flows.find(f => f.id === req.params.flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const step = flow.steps.find(s => s.id === req.params.stepId);
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        const idx = step.options.findIndex(o => o.id === req.params.optionId);
        if (idx === -1) return res.status(404).json({ error: 'Opción no encontrada' });
        step.options.splice(idx, 1);
        saveFlows();
        res.json({ success: true });
    },
    conversationNext: (req, res) => {
        const { flowId, currentStepId, optionId } = req.body;
        const flow = flows.find(f => f.id === flowId);
        if (!flow) return res.status(404).json({ error: 'Flujo no encontrado' });
        const step = flow.steps.find(s => s.id === currentStepId);
        if (!step) return res.status(404).json({ error: 'Paso no encontrado' });
        const option = step.options.find(o => o.id === optionId);
        if (!option) return res.status(404).json({ error: 'Opción no encontrada' });
        let nextStep = null;
        if (option.nextStepId) {
            nextStep = flow.steps.find(s => s.id === option.nextStepId);
        }
        res.json({
            responseMessage: option.responseMessage || '',
            nextStep: nextStep ? {
                id: nextStep.id,
                message: nextStep.message,
                isFinal: nextStep.isFinal,
                options: nextStep.options
            } : null
        });
    }
};
