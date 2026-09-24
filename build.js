const fs = require('fs');
const path = require('path');

const env = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
  VITE_SUPABASE_BUCKET_RECEIPTS:
    process.env.VITE_SUPABASE_BUCKET_RECEIPTS || 'receipts',
  VITE_LOCAL_ONLY: process.env.VITE_LOCAL_ONLY || 'false'
};

const content = `window.__APP_ENV__ = ${JSON.stringify(env)};\n`;

// Garante pasta assets/js existe antes de escrever
const assetsDir = path.join(__dirname, 'assets', 'js');
try { fs.mkdirSync(assetsDir, { recursive: true }); } catch (_) {}

const output = path.join(assetsDir, 'env.js');
fs.writeFileSync(output, content, 'utf8');

// Remove arquivo antigo env.js solto na raiz (evita duplicata inconsistente)
const oldRoot = path.join(__dirname, 'env.js');
try { if (fs.existsSync(oldRoot)) fs.unlinkSync(oldRoot); } catch (_) {}

console.log('env.js gerado com sucesso em:', path.relative(process.cwd(), output));
