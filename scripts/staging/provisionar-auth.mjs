import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { provisionSql } from './identidades-sinteticas.mjs';
const root=process.env.ERP_STAGING_PRIVATE_DIR;
if(!root)throw Error('Defina ERP_STAGING_PRIVATE_DIR em diretorio privado fora do checkout.');
const repository=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const relative=path.relative(repository,fs.realpathSync(root));
if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw Error('Diretorio privado deve ficar fora do checkout');
const statePath=path.join(root,'identidades.json');
if(fs.existsSync(statePath))throw Error('State already exists; inspect before reprovisioning');
const keyBytes=fs.readFileSync(path.join(root,'keys-private.json'));
const keyData=JSON.parse(keyBytes.toString(keyBytes[0]===255&&keyBytes[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,''));
if(keyData.target?.project_ref!=='vpowsedoajpdbeckimuv')throw Error('Projeto das chaves inesperado');
const keys=keyData.keys;
const publishable=keys.find(key=>key.type==='publishable'&&key.api_key.startsWith('sb_publishable_'))?.api_key;
const secret=keys.find(key=>key.type==='secret'&&key.api_key.startsWith('sb_secret_'))?.api_key;
if(!publishable||!secret)throw Error('Required key types unavailable');
const url='https://vpowsedoajpdbeckimuv.supabase.co';
const options=label=>({auth:{persistSession:false,autoRefreshToken:false,storageKey:'int003-'+label},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
const admin=createClient(url,secret,options('admin'));
const state={projectRef:'vpowsedoajpdbeckimuv',url,publishableKey:publishable,createdAt:new Date().toISOString(),stage:'auth-provisioning',users:[]};
const save=()=>fs.writeFileSync(statePath,JSON.stringify(state,null,2));
save();
const run=randomUUID().slice(0,8);
try {
 for(const label of ['editorA','readerA','editorB']) {
  const account={label,email:`int003-${label.toLowerCase()}-${run}@example.invalid`,password:randomBytes(36).toString('base64url')+'aA1!'};
  state.users.push(account);save();
  const created=await admin.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,app_metadata:{purpose:'ERP_INT003_SYNTHETIC'}});
  if(created.error||!created.data.user)throw Error('AUTH_ADMIN_CREATE_FAILED');
  account.id=created.data.user.id;save();
  const auth=createClient(url,publishable,options(label));
  const login=await auth.auth.signInWithPassword({email:account.email,password:account.password});
  if(login.error||!login.data.session)throw Error('AUTH_PASSWORD_LOGIN_FAILED');
  const checked=await auth.auth.getUser(login.data.session.access_token);
  if(checked.error||checked.data.user?.id!==account.id||checked.data.user.is_anonymous)throw Error('AUTH_IDENTITY_CHECK_FAILED');
  await auth.auth.signOut();
 }
 state.stage='auth-created-and-verified';save();
 const ids=Object.fromEntries(state.users.map(user=>[user.label,user.id]));
 fs.writeFileSync(path.join(root,'provision-domain.sql'),provisionSql(ids));
 console.log('PASS: three synthetic Auth identities created, confirmed and authenticated; private state saved. No emails requested.');
} catch(error) {state.stage='auth-provisioning-failed';save();console.log('Bootstrap stopped; private state retained. Code:',error instanceof Error&&/^AUTH_[A-Z_]+$/.test(error.message)?error.message:'UNEXPECTED');process.exitCode=1;}
