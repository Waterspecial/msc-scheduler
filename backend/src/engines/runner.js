const { spawn } = require('child_process');
const path      = require('path');

function run(algorithm, payload) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, `${algorithm}.py`);
    const proc = spawn('python3', [scriptPath]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Engine exited with code ${code}: ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Engine returned invalid JSON: ${stdout}`));
      }
    });

    proc.on('error', (err) => reject(err));

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

module.exports = { run };
