import {readFile,writeFile,chmod} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const path=new URL('../.dev.vars',import.meta.url);let contents='';try{contents=await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const get=name=>contents.match(new RegExp('^'+name+'[ \\t]*=[ \\t]*[\"\']?([A-Za-z0-9_-]+)[\"\']?[ \\t]*$','m'))?.[1];
let publicKey=get('VAPID_PUBLIC_KEY'),privateKey=get('VAPID_PRIVATE_KEY');
for(const name of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY']){const present=contents.match(new RegExp('^'+name+'[ \\t]*=(.*)$','m'))?.[1]?.trim();if(present && present!=='\"\"' && present!=="''" && !get(name))throw new Error('Revise a chave '+name+' existente; ela não será substituída automaticamente.');}
if(Boolean(publicKey)!==Boolean(privateKey))throw new Error('As duas chaves VAPID devem ser preservadas juntas. Revise .dev.vars.');
if(!publicKey){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',keys.privateKey);
 const raw=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey));publicKey=Buffer.from(raw).toString('base64url');privateKey=jwk.d;
 for(const [name,value] of [['VAPID_PUBLIC_KEY',publicKey],['VAPID_PRIVATE_KEY',privateKey]]){const line=new RegExp('^'+name+'[ \\t]*=.*$','m');const entry=name+'='+value;contents=line.test(contents)?contents.replace(line,entry):contents+(contents.endsWith('\n')?'':'\n')+entry+'\n';}
 await writeFile(path,contents,{mode:0o600});
}
if(publicKey.length!==87||privateKey.length!==43)throw new Error('As chaves VAPID existentes não têm o formato esperado.');
await chmod(path,0o600);
const child=spawn('npx',['wrangler','secret','bulk'],{cwd:new URL('..',import.meta.url),stdio:['pipe','inherit','inherit']});child.stdin.end(JSON.stringify({VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:privateKey}));
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});if(code!==0)process.exit(code || 1);
console.log('Chaves Web Push configuradas; valores preservados somente no arquivo privado .dev.vars e no Cloudflare.');
