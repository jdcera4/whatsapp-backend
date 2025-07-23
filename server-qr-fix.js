// server-qr-fix.js - Versión optimizada para generar QR de WhatsApp
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('🚀 Iniciando WhatsApp Campaign Manager (Versión QR Optimizada)...');

// Crear directorios necesarios
const requiredDirs = ['./session', './data'];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Configuración básica
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());

// Variables globales
let isClientReady = false;
let qrCodeData = null;
let clientInfo = null;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// Configuración optimizada del cliente WhatsApp para generar QR
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-qr-manager",
        dataPath: './session'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ],
        timeout: 60000
    }
});

// Función para limpiar sesión anterior si hay problemas
function clearSession() {
    const sessionPath = './session';
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log('🧹 Sesión anterior eliminada');
        } catch (error) {
            console.error('Error eliminando sesión:', error);
        }
    }
}

// Función para inicializar WhatsApp con reintentos
async function initializeWhatsApp() {
    try {
        initializationAttempts++;
        console.log(`🔄 Intento de inicialización ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`);
        
        await client.initialize();
        
    } catch (error) {
        console.error(`❌ Error en intento ${initializationAttempts}:`, error.message);
        
        if (initializationAttempts < MAX_INIT_ATTEMPTS) {
            console.log('🔄 Limpiando sesión y reintentando...');
            clearSession();
            
            setTimeout(() => {
                initializeWhatsApp();
            }, 5000);
        } else {
            console.error('❌ Se agotaron los intentos de inicialización');
            console.log('💡 Sugerencias:');
            console.log('   1. Reinicia el servidor');
            console.log('   2. Verifica tu conexión a internet');
            console.log('   3. Cierra otras instancias de WhatsApp Web');
        }
    }
}

// Eventos de WhatsApp
client.on('qr', (qr) => {
    qrCodeData = qr;
    console.log('\n📱 ¡CÓDIGO QR GENERADO!');
    console.log('🔗 Escanea este código con tu WhatsApp:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Mostrar QR en la consola
    qrcode.generate(qr, { small: true });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 También disponible en: https://whatsapp-backend-stoe.onrender.com/api/api/qr');
    console.log('🌐 Frontend: http://localhost:4200');
    console.log('⏰ El QR expira en 20 segundos, se generará uno nuevo automáticamente');
});

client.on('authenticated', () => {
    console.log('✅ ¡WhatsApp autenticado correctamente!');
    qrCodeData = null;
});

client.on('ready', async () => {
    isClientReady = true;
    clientInfo = client.info;
    console.log('\n🎉 ¡WhatsApp conectado y listo!');
    console.log(`📞 Conectado como: ${clientInfo.pushname}`);
    console.log(`📱 Número: ${clientInfo.wid.user}`);
    console.log('✅ Ya puedes usar todas las funciones del sistema');
});

client.on('disconnected', (reason) => {
    console.log('\n🔌 WhatsApp desconectado:', reason);
    isClientReady = false;
    clientInfo = null;
    qrCodeData = null;
    
    // Reintentar conexión automáticamente
    console.log('🔄 Reintentando conexión en 5 segundos...');
    setTimeout(() => {
        initializeWhatsApp();
    }, 5000);
});

client.on('auth_failure', (msg) => {
    console.error('❌ Fallo de autenticación:', msg);
    qrCodeData = null;
    
    // Limpiar sesión y reintentar
    console.log('🧹 Limpiando sesión por fallo de autenticación...');
    clearSession();
    
    setTimeout(() => {
        initializeWhatsApp();
    }, 3000);
});

// Endpoints de API
app.get('/api/qr', (req, res) => {
    if (qrCodeData) {
        res.json({
            success: true,
            qr: qrCodeData,
            message: 'Escanea este código QR con tu WhatsApp',
            connected: false,
            needsQR: true
        });
    } else if (isClientReady) {
        res.json({
            success: true,
            qr: null,
            message: 'WhatsApp ya está conectado',
            connected: true,
            needsQR: false,
            clientInfo: {
                name: clientInfo?.pushname || 'Usuario',
                number: clientInfo?.wid?.user || 'No disponible'
            }
        });
    } else {
        res.json({
            success: false,
            qr: null,
            message: 'Generando código QR... Por favor espera',
            connected: false,
            needsQR: true
        });
    }
});

app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        connected: isClientReady,
        status: isClientReady ? 'connected' : 'connecting',
        clientInfo: clientInfo,
        needsQR: qrCodeData !== null,
        hasQR: qrCodeData !== null,
        initializationAttempts: initializationAttempts,
        maxAttempts: MAX_INIT_ATTEMPTS
    });
});

app.get('/api/dashboard/stats', (req, res) => {
    res.json({
        success: true,
        connected: isClientReady,
        needsQR: qrCodeData !== null,
        qr: qrCodeData,
        clientInfo: clientInfo,
        stats: {
            totalMessages: 0,
            sentMessages: 0,
            deliveredMessages: 0,
            readMessages: 0,
            failedMessages: 0,
            deliveryRate: 0,
            totalContacts: 0,
            activeCampaigns: 0,
            totalCampaigns: 0
        },
        messagesTrend: []
    });
});

// Endpoint para forzar regeneración de QR
app.post('/api/qr/regenerate', (req, res) => {
    console.log('🔄 Forzando regeneración de QR...');
    
    if (isClientReady) {
        return res.json({
            success: false,
            message: 'WhatsApp ya está conectado'
        });
    }
    
    // Reinicializar cliente
    client.destroy().then(() => {
        setTimeout(() => {
            initializeWhatsApp();
        }, 2000);
    }).catch(() => {
        setTimeout(() => {
            initializeWhatsApp();
        }, 2000);
    });
    
    res.json({
        success: true,
        message: 'Regenerando código QR...'
    });
});

// Endpoint para desconectar WhatsApp
app.post('/api/disconnect', (req, res) => {
    if (!isClientReady) {
        return res.json({
            success: false,
            message: 'WhatsApp no está conectado'
        });
    }
    
    console.log('🔌 Desconectando WhatsApp...');
    client.logout().then(() => {
        isClientReady = false;
        clientInfo = null;
        qrCodeData = null;
        
        res.json({
            success: true,
            message: 'WhatsApp desconectado correctamente'
        });
    }).catch((error) => {
        res.status(500).json({
            success: false,
            message: 'Error al desconectar: ' + error.message
        });
    });
});

// Página web simple para mostrar el QR
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; margin: 0; }
                .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .main-content { display: flex; gap: 30px; align-items: flex-start; flex-wrap: wrap; }
                .info-section { flex: 1; min-width: 300px; }
                .qr-section { flex: 0 0 320px; text-align: center; }
                .status { padding: 15px; border-radius: 8px; margin: 15px 0; font-weight: bold; }
                .connected { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .disconnected { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .loading { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                .button-group { margin: 20px 0; }
                button { background: #007bff; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; margin: 5px; font-size: 14px; transition: background 0.3s; }
                button:hover { background: #0056b3; }
                .qr-container { background: #f8f9fa; padding: 20px; border-radius: 8px; border: 2px dashed #dee2e6; }
                #qrcode canvas { max-width: 280px; height: auto; border-radius: 8px; }
                .links { background: #e9ecef; padding: 15px; border-radius: 8px; margin-top: 20px; }
                .links a { color: #007bff; text-decoration: none; font-weight: bold; }
                .links a:hover { text-decoration: underline; }
                h1 { color: #333; margin-bottom: 10px; text-align: center; }
                .subtitle { color: #666; text-align: center; margin-bottom: 30px; }
                .info-item { margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #eee; }
                .info-label { font-weight: bold; color: #555; }
                .qr-title { color: #333; margin-bottom: 15px; font-size: 18px; }
                .qr-instructions { color: #666; font-size: 14px; margin-top: 10px; line-height: 1.4; }
                @media (max-width: 768px) {
                    .main-content { flex-direction: column; }
                    .qr-section { flex: none; }
                    .container { padding: 20px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 WhatsApp Campaign Manager</h1>
                <p class="subtitle">Conecta tu WhatsApp para usar todas las funciones</p>
                
                <div class="main-content">
                    <div class="info-section">
                        <div id="status" class="status loading">Cargando estado...</div>
                        
                        <div class="info-item">
                            <span class="info-label">Estado:</span>
                            <span id="connection-status">Conectando...</span>
                        </div>
                        
                        <div class="info-item">
                            <span class="info-label">Usuario:</span>
                            <span id="user-info">No conectado</span>
                        </div>
                        
                        <div class="info-item">
                            <span class="info-label">Número:</span>
                            <span id="phone-info">No disponible</span>
                        </div>
                        
                        <div class="button-group">
                            <button onclick="checkStatus()">🔄 Actualizar</button>
                            <button onclick="regenerateQR()">📱 Nuevo QR</button>
                            <button onclick="disconnect()">🔌 Desconectar</button>
                        </div>
                        
                        <div class="links">
                            <div><strong>🌐 Frontend:</strong> <a href="http://localhost:4200" target="_blank">http://localhost:4200</a></div>
                            <div><strong>📊 API Status:</strong> <a href="/api/status" target="_blank">/api/status</a></div>
                            <div><strong>📱 API QR:</strong> <a href="/api/qr" target="_blank">/api/qr</a></div>
                        </div>
                    </div>
                    
                    <div class="qr-section">
                        <div class="qr-title">📱 Código QR</div>
                        <div class="qr-container">
                            <div id="qrcode">Generando código QR...</div>
                        </div>
                        <div id="message" class="qr-instructions"></div>
                    </div>
                </div>
            </div>
            
            <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
            <script>
                let statusInterval;
                
                function checkStatus() {
                    fetch('/api/qr')
                        .then(response => response.json())
                        .then(data => {
                            const statusDiv = document.getElementById('status');
                            const qrcodeDiv = document.getElementById('qrcode');
                            const messageDiv = document.getElementById('message');
                            const connectionStatus = document.getElementById('connection-status');
                            const userInfo = document.getElementById('user-info');
                            const phoneInfo = document.getElementById('phone-info');
                            
                            if (data.connected) {
                                // Estado principal
                                statusDiv.className = 'status connected';
                                statusDiv.innerHTML = '✅ WhatsApp Conectado y Listo';
                                
                                // QR section
                                qrcodeDiv.innerHTML = '<div style="padding: 40px; color: #28a745;"><h3>✅ ¡Conectado!</h3><p>WhatsApp está listo para usar</p></div>';
                                messageDiv.innerHTML = '<p style="color: #28a745;">✅ Conexión establecida correctamente</p>';
                                
                                // Info details
                                connectionStatus.innerHTML = '🟢 Conectado';
                                connectionStatus.style.color = '#28a745';
                                userInfo.innerHTML = data.clientInfo?.name || 'Usuario';
                                phoneInfo.innerHTML = data.clientInfo?.number || 'No disponible';
                                
                            } else if (data.qr) {
                                // Estado principal
                                statusDiv.className = 'status disconnected';
                                statusDiv.innerHTML = '📱 Escanea el código QR con WhatsApp';
                                
                                // Generate QR
                                qrcodeDiv.innerHTML = '<div style="padding: 20px;">Generando QR...</div>';
                                QRCode.toCanvas(document.createElement('canvas'), data.qr, function (error, canvas) {
                                    if (!error) {
                                        canvas.style.maxWidth = '280px';
                                        canvas.style.height = 'auto';
                                        canvas.style.borderRadius = '8px';
                                        qrcodeDiv.innerHTML = '';
                                        qrcodeDiv.appendChild(canvas);
                                    }
                                });
                                messageDiv.innerHTML = '<p>1. Abre WhatsApp en tu teléfono<br>2. Ve a Configuración > Dispositivos vinculados<br>3. Toca "Vincular un dispositivo"<br>4. Escanea este código QR<br><br>⏰ <strong>El código expira en 20 segundos</strong></p>';
                                
                                // Info details
                                connectionStatus.innerHTML = '🔴 Desconectado';
                                connectionStatus.style.color = '#dc3545';
                                userInfo.innerHTML = 'Esperando conexión...';
                                phoneInfo.innerHTML = 'No disponible';
                                
                            } else {
                                // Estado de carga
                                statusDiv.className = 'status loading';
                                statusDiv.innerHTML = '🔄 ' + data.message;
                                qrcodeDiv.innerHTML = '<div style="padding: 40px; color: #856404;"><div style="font-size: 24px;">⏳</div><p>Generando código QR...</p><p style="font-size: 12px;">Esto puede tomar unos segundos</p></div>';
                                messageDiv.innerHTML = '<p>Por favor espera mientras se genera el código QR</p>';
                                
                                // Info details
                                connectionStatus.innerHTML = '🟡 Conectando...';
                                connectionStatus.style.color = '#ffc107';
                                userInfo.innerHTML = 'Inicializando...';
                                phoneInfo.innerHTML = 'No disponible';
                            }
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            document.getElementById('status').innerHTML = '❌ Error de conexión con el servidor';
                            document.getElementById('connection-status').innerHTML = '🔴 Error';
                            document.getElementById('connection-status').style.color = '#dc3545';
                            document.getElementById('qrcode').innerHTML = '<div style="padding: 40px; color: #dc3545;"><div style="font-size: 24px;">❌</div><p>Error de conexión</p></div>';
                        });
                }
                
                function regenerateQR() {
                    fetch('/api/qr/regenerate', { method: 'POST' })
                        .then(response => response.json())
                        .then(data => {
                            alert(data.message);
                            setTimeout(checkStatus, 2000);
                        });
                }
                
                function disconnect() {
                    if (confirm('¿Estás seguro de que quieres desconectar WhatsApp?')) {
                        fetch('/api/disconnect', { method: 'POST' })
                            .then(response => response.json())
                            .then(data => {
                                alert(data.message);
                                checkStatus();
                            });
                    }
                }
                
                // Verificar estado cada 3 segundos
                checkStatus();
                statusInterval = setInterval(checkStatus, 3000);
            </script>
        </body>
        </html>
    `);
});

// Manejo de errores
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint no encontrado'
    });
});

// Iniciar servidor
const server = app.listen(PORT, HOST, () => {
    console.log(`\n🌐 Servidor ejecutándose en http://${HOST}:${PORT}`);
    console.log(`📱 Ver QR en: http://${HOST}:${PORT}`);
    console.log(`🔗 API QR: http://${HOST}:${PORT}/api/qr`);
    console.log(`📊 Estado: http://${HOST}:${PORT}/api/status`);
    console.log('\n🔄 Inicializando WhatsApp...\n');
});

// Inicializar WhatsApp
initializeWhatsApp();

// Manejo de cierre graceful
process.on('SIGINT', async () => {
    console.log('\n🛑 Cerrando servidor...');
    
    if (statusInterval) {
        clearInterval(statusInterval);
    }
    
    try {
        await client.destroy();
        console.log('✅ Cliente WhatsApp cerrado');
    } catch (error) {
        console.error('Error cerrando cliente:', error);
    }
    
    server.close(() => {
        console.log('✅ Servidor cerrado');
        process.exit(0);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada:', error);
});