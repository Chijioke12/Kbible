const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');
const sharp = require('sharp');

const KAIOS_SIZES = [56, 112];
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

async function main() {
    console.log('Starting KaiOS production build with Vite transpilation...');

    // 0. Generate Icons to public folder
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir);
    }
    const svgBuffer = Buffer.from(svgIcon.trim());
    for (const size of KAIOS_SIZES) {
        const fileName = `icon-${size}.png`;
        try {
            await sharp(svgBuffer).resize(size, size).png().toFile(path.join(publicDir, fileName));
            console.log(`✅ Generated KaiOS PNG: ${fileName}`);
        } catch (error) {
            console.error(`❌ Error generating ${fileName}:`, error.message);
        }
    }

    const outputDir = path.join(__dirname, 'dist');
    const outputFile = path.join(outputDir, 'index.html');

try {
    // 1. Run Vite build first to handle transpilation and legacy polyfills
    console.log('Running Vite build...');
    execSync('npx vite build', { stdio: 'inherit' });
} catch (error) {
    console.error('Vite build failed:', error);
    process.exit(1);
}

if (!fs.existsSync(outputFile)) {
    console.error('Error: dist/index.html not found after Vite build!');
    process.exit(1);
}

let html = fs.readFileSync(outputFile, 'utf-8');

console.log('Applying KaiOS production UI optimizations...');

// 2. Remove the outer device wrapper surgically
// We want to keep everything inside <div id="kaios-device" ...> ... </div>
// and remove the parent <div class="device-wrapper"> and siblings.

// Find the content of kaios-device
const deviceMatch = html.match(/<div id="kaios-device"[\s\S]*?<\/div>\s*?<\/div>\s*?<\/div>/);
if (deviceMatch) {
    // Actually, it's easier to just remove the specific parts we don't want.
    
    // Remove start of wrapper
    html = html.replace(/<div class="device-wrapper">/, '');
    
    // Remove keypad, instructions and the final closing div of the wrapper
    html = html.replace(/<!-- Virtual Hardware Controller -->[\s\S]*?<div class="instructions">[\s\S]*?<\/div>/, '');
    
    // Remove the extra closing </div> of device-wrapper
    html = html.replace(/<\/div>\s*?(?=<script)/, ''); 
}

// 3. Re-write the body CSS for native full screen
html = html.replace(/body\s*{[^}]*}/, `body {
        margin: 0;
        padding: 0;
        background-color: var(--kai-bg);
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        font-family: 'Open Sans', system-ui, sans-serif;
        user-select: none;
    }`);

// 4. Re-write the #kaios-device CSS
html = html.replace(/#kaios-device\s*{[^}]*}/, `#kaios-device {
        width: 100%;
        height: 100%;
        background-color: var(--kai-bg);
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: none;
        border-radius: 0;
        border: none;
    }`);

// 5. Ensure all script/link paths are relative
html = html.replace(/(src|href)="\/assets\//g, '$1="assets/');

// Write the compiled HTML back to the dist folder
fs.writeFileSync(outputFile, html);
console.log('Successfully optimized dist/index.html');

// 6. Auto-generate KaiOS manifest.webapp
const manifest = {
  name: "KaiBible",
  description: "A fast, offline-resilient Bible reader for KaiOS.",
  launch_path: "/index.html",
  icons: {
    "56": "/icon-56.png",
    "112": "/icon-112.png"
  },
  developer: {
    "name": "Chijioke Uwaefulem",
    "url": ""
  },
  type: "web",
  permissions: {
    "systemXHR": {
      "description": "Required for fetching Bible API data"
    }
  },
  default_locale: "en-US"
};

fs.writeFileSync(path.join(outputDir, 'manifest.webapp'), JSON.stringify(manifest, null, 2));



console.log('Successfully generated dist/manifest.webapp');

// 7. Generate OmniSD Package using adm-zip instead of shell zip commands
console.log('Generating OmniSD-compatible package...');
try {
    const omniDir = path.join(__dirname, 'omnisd_temp');
    if (fs.existsSync(omniDir)) fs.rmSync(omniDir, { recursive: true, force: true });
    fs.mkdirSync(omniDir);

    // Create application.zip from dist folder
    console.log('Creating application.zip...');
    const appZip = new AdmZip();
    appZip.addLocalFolder(outputDir);
    appZip.writeZip(path.join(omniDir, 'application.zip'));

    // Create metadata.json
    const metadata = {
        version: 1,
        manifestURL: "app://kaibible/manifest.webapp"
    };
    fs.writeFileSync(path.join(omniDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // Create empty update.webapp
    fs.writeFileSync(path.join(omniDir, 'update.webapp'), '');

    // Final ZIP
    console.log('Creating final OmniSD package (kaibible-omnisd.zip)...');
    const finalZip = new AdmZip();
    finalZip.addLocalFolder(omniDir);
    finalZip.writeZip(path.join(__dirname, 'kaibible-omnisd.zip'));

    // Cleanup
    fs.rmSync(omniDir, { recursive: true, force: true });
    console.log('Successfully generated kaibible-omnisd.zip');
} catch (error) {
    console.error('Failed to generate OmniSD package:', error);
}

}

main().catch(console.error);
