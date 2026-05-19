const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const outputDir = path.join(__dirname, 'dist');
const outputFile = path.join(outputDir, 'index.html');

console.log('Starting KaiOS production build with Vite transpilation...');

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
    "128": "/icon-128.png"
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

// Create a dummy icon since one is missing
fs.writeFileSync(path.join(outputDir, 'icon-128.png'), 'dummy'); 

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
