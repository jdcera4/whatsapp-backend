// fix-puppeteer-windows.js - Script para solucionar problemas de Puppeteer en Windows
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Iniciando diagnóstico y reparación de Puppeteer para Windows...\n');

// 1. Verificar la instalación de Chrome
function checkChromeInstallation() {
    console.log('1. 🔍 Verificando instalación de Chrome...');
    
    const possibleChromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.CHROME_BIN,
        process.env.GOOGLE_CHROME_BIN
    ].filter(Boolean);

    let chromeFound = false;
    let chromePath = null;

    for (const testPath of possibleChromePaths) {
        if (fs.existsSync(testPath)) {
            console.log(`   ✅ Chrome encontrado en: ${testPath}`);
            chromeFound = true;
            chromePath = testPath;
            break;
        }
    }

    if (!chromeFound) {
        console.log('   ❌ Chrome no encontrado en las ubicaciones comunes');
        console.log('   💡 Instala Google Chrome desde: https://www.google.com/chrome/');
        return null;
    }

    return chromePath;
}

// 2. Verificar dependencias de Node.js
function checkNodeDependencies() {
    console.log('\n2. 📦 Verificando dependencias de Node.js...');
    
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        console.log('   ❌ package.json no encontrado');
        return false;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    const requiredDeps = [
        'whatsapp-web.js',
        'puppeteer',
        'puppeteer-core'
    ];

    let allDepsOk = true;
    for (const dep of requiredDeps) {
        if (dependencies[dep]) {
            console.log(`   ✅ ${dep}: ${dependencies[dep]}`);
        } else {
            console.log(`   ❌ ${dep}: No instalado`);
            allDepsOk = false;
        }
    }

    return allDepsOk;
}

// 3. Limpiar caché y reinstalar dependencias
function cleanAndReinstall() {
    console.log('\n3. 🧹 Limpiando caché y reinstalando dependencias...');
    
    try {
        // Limpiar caché de npm
        console.log('   🧹 Limpiando caché de npm...');
        execSync('npm cache clean --force', { stdio: 'inherit' });
        
        // Eliminar node_modules si existe
        const nodeModulesPath = path.join(__dirname, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            console.log('   🗑️ Eliminando node_modules...');
            fs.rmSync(nodeModulesPath, { recursive: true, force: true });
        }
        
        // Reinstalar dependencias
        console.log('   📦 Reinstalando dependencias...');
        execSync('npm install', { stdio: 'inherit' });
        
        console.log('   ✅ Dependencias reinstaladas correctamente');
        return true;
    } catch (error) {
        console.log(`   ❌ Error al reinstalar dependencias: ${error.message}`);
        return false;
    }
}

// 4. Configurar variables de entorno
function setupEnvironmentVariables(chromePath) {
    console.log('\n4. 🌍 Configurando variables de entorno...');
    
    if (chromePath) {
        process.env.PUPPETEER_EXECUTABLE_PATH = chromePath;
        process.env.CHROME_BIN = chromePath;
        console.log(`   ✅ PUPPETEER_EXECUTABLE_PATH configurado: ${chromePath}`);
        console.log(`   ✅ CHROME_BIN configurado: ${chromePath}`);
    }
    
    // Configurar otras variables útiles
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
    console.log('   ✅ PUPPETEER_SKIP_CHROMIUM_DOWNLOAD configurado');
}

// 5. Crear archivo de configuración de Puppeteer
function createPuppeteerConfig(chromePath) {
    console.log('\n5. ⚙️ Creando configuración optimizada de Puppeteer...');
    
    const configContent = `// puppeteer-config.js - Configuración optimizada para Windows
module.exports = {
    headless: true,
    ${chromePath ? `executablePath: '${chromePath.replace(/\\/g, '\\\\')}',` : ''}
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-default-apps',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
        '--disable-ipc-flooding-protection',
        '--single-process'
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    defaultViewport: null,
    timeout: 30000
};`;

    const configPath = path.join(__dirname, 'puppeteer-config.js');
    fs.writeFileSync(configPath, configContent);
    console.log(`   ✅ Configuración guardada en: ${configPath}`);
}

// 6. Probar Puppeteer
async function testPuppeteer() {
    console.log('\n6. 🧪 Probando Puppeteer...');
    
    try {
        const puppeteer = require('puppeteer');
        const config = require('./puppeteer-config.js');
        
        console.log('   🚀 Lanzando navegador...');
        const browser = await puppeteer.launch(config);
        
        console.log('   📄 Creando página...');
        const page = await browser.newPage();
        
        console.log('   🌐 Navegando a página de prueba...');
        await page.goto('data:text/html,<h1>Puppeteer Test</h1>');
        
        console.log('   📸 Tomando captura de pantalla...');
        await page.screenshot({ path: 'puppeteer-test.png' });
        
        console.log('   🔒 Cerrando navegador...');
        await browser.close();
        
        console.log('   ✅ Puppeteer funciona correctamente');
        
        // Limpiar archivo de prueba
        if (fs.existsSync('puppeteer-test.png')) {
            fs.unlinkSync('puppeteer-test.png');
        }
        
        return true;
    } catch (error) {
        console.log(`   ❌ Error al probar Puppeteer: ${error.message}`);
        return false;
    }
}

// 7. Crear script de inicio mejorado
function createImprovedStartScript() {
    console.log('\n7. 📝 Creando script de inicio mejorado...');
    
    const startScriptContent = `// start-whatsapp.js - Script de inicio mejorado
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando WhatsApp Backend con configuración optimizada...');

// Configurar variables de entorno
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';

// Configurar argumentos de Node.js para mejor rendimiento
const nodeArgs = [
    '--max-old-space-size=4096',
    '--no-warnings',
    path.join(__dirname, 'server.js')
];

// Iniciar el servidor
const server = spawn('node', nodeArgs, {
    stdio: 'inherit',
    env: process.env
});

server.on('close', (code) => {
    console.log(\`Servidor terminado con código: \${code}\`);
    if (code !== 0) {
        console.log('⚠️ El servidor se cerró inesperadamente');
    }
});

server.on('error', (error) => {
    console.error('❌ Error al iniciar el servidor:', error);
});

// Manejar señales de terminación
process.on('SIGINT', () => {
    console.log('\\n🛑 Cerrando servidor...');
    server.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\\n🛑 Cerrando servidor...');
    server.kill('SIGTERM');
});`;

    const startScriptPath = path.join(__dirname, 'start-whatsapp.js');
    fs.writeFileSync(startScriptPath, startScriptContent);
    console.log(`   ✅ Script de inicio creado: ${startScriptPath}`);
}

// Función principal
async function main() {
    try {
        // Verificar Chrome
        const chromePath = checkChromeInstallation();
        
        // Verificar dependencias
        const depsOk = checkNodeDependencies();
        
        // Si las dependencias no están bien, reinstalar
        if (!depsOk) {
            const reinstallOk = cleanAndReinstall();
            if (!reinstallOk) {
                console.log('\n❌ No se pudieron reinstalar las dependencias');
                return;
            }
        }
        
        // Configurar variables de entorno
        setupEnvironmentVariables(chromePath);
        
        // Crear configuración de Puppeteer
        createPuppeteerConfig(chromePath);
        
        // Probar Puppeteer
        const puppeteerOk = await testPuppeteer();
        
        // Crear script de inicio mejorado
        createImprovedStartScript();
        
        console.log('\n🎉 Diagnóstico y reparación completados!');
        console.log('\n📋 Resumen:');
        console.log(`   Chrome: ${chromePath ? '✅ Encontrado' : '❌ No encontrado'}`);
        console.log(`   Dependencias: ${depsOk ? '✅ OK' : '⚠️ Reinstaladas'}`);
        console.log(`   Puppeteer: ${puppeteerOk ? '✅ Funcionando' : '❌ Con problemas'}`);
        
        if (puppeteerOk) {
            console.log('\n🚀 Puedes iniciar el servidor con:');
            console.log('   node start-whatsapp.js');
            console.log('   o');
            console.log('   node server.js');
        } else {
            console.log('\n⚠️ Puppeteer aún tiene problemas. Considera:');
            console.log('   1. Instalar Google Chrome');
            console.log('   2. Ejecutar como administrador');
            console.log('   3. Verificar antivirus/firewall');
        }
        
    } catch (error) {
        console.error('\n❌ Error durante el diagnóstico:', error);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { main };