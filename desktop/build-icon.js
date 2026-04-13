/**
 * Convert app icon to ICO for Windows builds.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputFile = path.join(__dirname, 'renderer', 'icon.png');
const outputIco = path.join(__dirname, 'build', 'icon.ico');
const outputPng256 = path.join(__dirname, 'build', 'icon.png');

async function main() {
    // Convert to proper 256x256 PNG
    const pngBuf = await sharp(inputFile)
        .resize(256, 256)
        .png()
        .toBuffer();
    fs.writeFileSync(outputPng256, pngBuf);
    console.log('✓ icon.png (256x256 PNG) created in build/');

    // Create ICO using png-to-ico with proper PNG data
    const { default: pngToIco } = require('png-to-ico');
    const icoBuf = await pngToIco(outputPng256);
    fs.writeFileSync(outputIco, icoBuf);
    console.log('✓ icon.ico created in build/');
}

main().catch(err => {
    console.error('✗ Error:', err.message);
    process.exit(1);
});
