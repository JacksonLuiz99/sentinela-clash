import { cp, mkdir, writeFile } from 'node:fs/promises';
const base = process.env.PUBLIC_API_BASE || '';
if (base && !/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(base)) {
  throw new Error('PUBLIC_API_BASE deve ser a origem HTTPS do Worker, sem barra final.');
}
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await writeFile('dist/config.js', `window.CLAN_CONFIG = ${JSON.stringify({ apiBase: base, clanTag: '#R0UPVVVY' })};\n`);
console.log('Painel compilado em dist/. ' + (base ? 'Worker configurado.' : 'Sem Worker: painel exibirá instruções de configuração.'));
