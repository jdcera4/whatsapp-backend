// diagnose-broadcast.js - Herramienta de diagnóstico para problemas de broadcast
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    useTempFiles: true,
    tempFileDir: os.tmpdir()
}));

// Crear directorios necesarios
const requiredDirs = ['./logs', './uploads/excel', './uploads/media'];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Función para registrar logs
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
    
    console.log(logMessage.trim());
    
    fs.appendFileSync(
        path.join(__dirname, 'logs', 'diagnose.log'),
        logMessage
    );
}

// Endpoint de diagnóstico para broadcast
app.post('/api/diagnose-broadcast', async (req, res) => {
    try {
        log('Recibida solicitud de diagnóstico de broadcast');
        
        // Verificar si hay archivos
        if (!req.files || !req.files.file) {
            log('No se recibió ningún archivo', 'error');
            return res.status(400).json({
                success: false,
                error: 'Se requiere un archivo Excel'
            });
        }

        const excelFile = req.files.file;
        log(`Archivo recibido: ${excelFile.name} (${excelFile.size} bytes)`);
        
        // Verificar si hay mensaje
        if (!req.body.message) {
            log('No se recibió mensaje en el cuerpo de la solicitud', 'error');
            return res.status(400).json({
                success: false,
                error: 'Se requiere un mensaje'
            });
        }
        
        log(`Mensaje recibido: "${req.body.message.substring(0, 50)}..."`);
        
        // Guardar el archivo temporalmente para diagnóstico
        const excelPath = path.join(__dirname, 'uploads', 'excel', `diagnose-${Date.now()}-${excelFile.name}`);
        
        try {
            await excelFile.mv(excelPath);
            log(`Archivo guardado en: ${excelPath}`);
            
            // Verificar si el archivo existe y es accesible
            const stats = fs.statSync(excelPath);
            log(`Archivo guardado correctamente. Tamaño: ${stats.size} bytes`);
        } catch (error) {
            log(`Error al guardar el archivo: ${error.message}`, 'error');
            return res.status(500).json({
                success: false,
                error: `Error al guardar el archivo: ${error.message}`
            });
        }
        
        // Verificar información del sistema
        const systemInfo = {
            platform: os.platform(),
            release: os.release(),
            totalMem: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
            freeMem: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
            uptime: Math.round(os.uptime() / 60) + ' minutos',
            tempDir: os.tmpdir(),
            cwd: process.cwd()
        };
        
        log(`Información del sistema: ${JSON.stringify(systemInfo, null, 2)}`);
        
        // Simular procesamiento del archivo
        log('Simulando procesamiento del archivo...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Responder con éxito
        log('Diagnóstico completado con éxito');
        res.json({
            success: true,
            message: 'Diagnóstico completado con éxito',
            systemInfo,
            file: {
                name: excelFile.name,
                size: excelFile.size,
                path: excelPath,
                mimetype: excelFile.mimetype
            }
        });
        
    } catch (error) {
        log(`Error en diagnóstico: ${error.message}`, 'error');
        log(error.stack, 'error');
        
        res.status(500).json({
            success: false,
            error: `Error en diagnóstico: ${error.message}`
        });
    }
});

// Endpoint para verificar logs
app.get('/api/diagnose-logs', (req, res) => {
    try {
        const logPath = path.join(__dirname, 'logs', 'diagnose.log');
        
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({
                success: false,
                error: 'No hay logs disponibles'
            });
        }
        
        const logs = fs.readFileSync(logPath, 'utf8');
        res.json({
            success: true,
            logs: logs.split('\n').filter(Boolean)
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Error al leer logs: ${error.message}`
        });
    }
});

// Endpoint de estado
app.get('/api/diagnose-status', (req, res) => {
    res.json({
        success: true,
        status: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    log(`Servidor de diagnóstico iniciado en puerto ${PORT}`);
});