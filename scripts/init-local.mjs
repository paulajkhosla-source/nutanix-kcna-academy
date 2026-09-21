import fs from 'node:fs';
import crypto from 'node:crypto';
const target=new URL('../private/secret.json',import.meta.url);
if(!fs.existsSync(target)){
 if(!process.env.TEAM_PASSWORD)throw new Error('Set TEAM_PASSWORD before starting the app for the first time.');
 const salt=crypto.randomBytes(24).toString('hex');
 const settings={salt,hash:crypto.scryptSync(process.env.TEAM_PASSWORD,salt,64).toString('hex'),session:crypto.randomBytes(48).toString('hex')};
 fs.writeFileSync(target,JSON.stringify(settings),{mode:0o600,flag:'wx'});
 console.log('Local authentication initialized. Generated credentials are excluded from Git.');
}
