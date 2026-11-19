import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
const path=new URL('../.dev.vars',import.meta.url);
let contents='';try{contents=await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const match=contents.match(/^LEADERSHIP_TOKEN\s*=\s*["']?([a-zA-Z0-9_-]{32,})["']?\s*$/m);
const placeholder=/^LEADERSHIP_TOKEN[ \t]*=[ \t]*(?:""|'')?[ \t]*$/m;
if(!match && !placeholder.test(contents) && /^LEADERSHIP_TOKEN\s*=/m.test(contents))throw new Error('Revise a chave LEADERSHIP_TOKEN existente em .dev.vars.');
const token=match?.[1] || randomBytes(32).toString('hex');
if(!match){const entry='LEADERSHIP_TOKEN='+token;await writeFile(path,placeholder.test(contents)?contents.replace(placeholder,entry):contents+(contents.endsWith('\n')?'':'\n')+entry+'\n',{mode:0o600});}
await chmod(path,0o600);
const child=spawn('npx',['wrangler','secret','bulk'],{cwd:new URL('..',import.meta.url),stdio:['pipe','inherit','inherit']});
child.stdin.end(JSON.stringify({LEADERSHIP_TOKEN:token}));
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
if(code!==0)process.exit(code || 1);
console.log('Chave de liderança configurada. Consulte LEADERSHIP_TOKEN no arquivo privado .dev.vars; o valor não foi exibido.');
