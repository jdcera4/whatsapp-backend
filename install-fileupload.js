// Este archivo es temporal para instalar express-fileupload
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Instalando express-fileupload...');

try {
    // Intentar instalar express-fileupload
    execSync('npm install express-fileupload --save', { stdio: 'inherit' });
    console.log('✅ express-fileupload instalado correctamente');
    
    // Verificar si el package.json se actualizó
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    console.log('Dependencias actualizadas:', packageJson.dependencies);
    
    // Eliminar este archivo después de la instalación
    fs.unlinkSync(__filename);
    console.log('✅ Archivo temporal eliminado');
    
    console.log('✅ Todo listo para reiniciar el servidor');
} catch (error) {
    console.error('❌ Error al instalar express-fileupload:', error);
    console.log('Por favor, instala manualmente con: npm install express-fileupload --save');
}