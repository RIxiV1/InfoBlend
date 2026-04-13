const { spawn } = require('child_process');
const fs = require('fs');

let timer = null;

const push = () => {
    console.log('[AutoPush] Change detected. Pushing...');
    // We use powershell for the multi-command chain
    const cmd = spawn('powershell.exe', ['-Command', 'git add . ; git commit -m "auto-sync: partial update" ; git push origin main'], { stdio: 'inherit' });
    
    cmd.on('close', (code) => {
        console.log(`[AutoPush] Finished with code ${code}`);
    });
};

// Watch current directory recursively
fs.watch('.', { recursive: true }, (event, filename) => {
    // Ignore git internals and node_modules
    if (filename && (filename.startsWith('.git') || filename.includes('node_modules') || filename === 'autopush.js')) return;
    
    console.log(`[AutoPush] Change in: ${filename}`);
    clearTimeout(timer);
    timer = setTimeout(push, 3000); // 3-second debounce to avoid spamming commits
});

console.log('InfoBlend AutoPush Watcher Started (3s debounce)...');
