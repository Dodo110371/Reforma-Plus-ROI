const fs = require('fs');

const env = {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
  VITE_SUPABASE_BUCKET_RECEIPTS:
    process.env.VITE_SUPABASE_BUCKET_RECEIPTS || 'receipts',
  VITE_LOCAL_ONLY: process.env.VITE_LOCAL_ONLY || 'false'
};

const content = `window.__APP_ENV__ = ${JSON.stringify(env)};`;

fs.writeFileSync('env.js', content, 'utf8');

console.log('env.js gerado com sucesso.');
