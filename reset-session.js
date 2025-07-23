// Script para limpiar la sesión de WhatsApp y forzar nuevo QR
const fs = require('fs');
const path = require('path');

function deleteDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file) => {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteDirectory(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}

console.log('🧹 Limpiando sesión de WhatsApp...');

// Eliminar directorio de sesión
const sessionDir = './session';
if (fs.existsSync(sessionDir)) {
    deleteDirectory(sessionDir);
    console.log('✅ Directorio de sesión eliminado');
}

// Eliminar caché de WhatsApp Web
const cacheDir = './.wwebjs_cache';
if (fs.existsSync(cacheDir)) {
    deleteDirectory(cacheDir);
    console.log('✅ Caché de WhatsApp Web eliminado');
}

console.log('🎉 Sesión limpiada. Ahora puedes reiniciar el servidor para obtener un nuevo QR.');