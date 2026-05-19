const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

// KaiOS standard icon sizes
const KAIOS_SIZES = [56, 112];

// SVG design matching the app's dark purple theme and Bible aesthetic
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8A2BE2; stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4B0082; stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="15" stdDeviation="15" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />

  <path d="M256 80 L256 220 M200 130 L312 130" 
        stroke="#FFFFFF" 
        stroke-width="24" 
        stroke-linecap="round" 
        opacity="0.9" />

  <g filter="url(#shadow)">
    <path d="M256 260 
             C180 260 120 220 90 170 
             L90 350 
             C120 400 180 430 256 430 Z" 
          fill="#FFFFFF" />
          
    <path d="M256 260 
             C332 260 392 220 422 170 
             L422 350 
             C392 400 332 430 256 430 Z" 
          fill="#F5F5F5" />
  </g>

  <path d="M256 260 L256 430" 
        stroke="#4B0082" 
        stroke-width="12" 
        stroke-linecap="round" />

  <path d="M130 330 C160 360 200 375 240 375" 
        stroke="#EAEAEA" 
        stroke-width="8" 
        fill="none" 
        stroke-linecap="round" />
        
  <path d="M382 330 C352 360 312 375 272 375" 
        stroke="#EAEAEA" 
        stroke-width="8" 
        fill="none" 
        stroke-linecap="round" />
</svg>
`;

async function generateIcons() {
    // Generate icons into 'public' so they are copied by Vite to dist
    const outputDir = path.join(__dirname, 'public');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
    }

    // Save the raw high-res SVG source
    const svgPath = path.join(outputDir, 'icon.svg');
    fs.writeFileSync(svgPath, svgIcon.trim());
    console.log('✅ Generated vector source: icon.svg');

    // Generate KaiOS specific PNG sizes
    const svgBuffer = Buffer.from(svgIcon.trim());

    for (const size of KAIOS_SIZES) {
        const fileName = `icon-${size}.png`;
        const outputPath = path.join(outputDir, fileName);

        try {
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outputPath);
            
            console.log(`✅ Generated KaiOS PNG: ${fileName}`);
        } catch (error) {
            console.error(`❌ Error generating ${fileName}:`, error.message);
        }
    }
}

generateIcons();
