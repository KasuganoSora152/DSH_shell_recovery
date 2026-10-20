// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 KasuganoSora152
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, originalHash, patchedHash } from './transform.mjs';

export const name='dsh-local-shell-fix';
export const inject=['sandbox'];
const statusFile=new URL('./status.json',import.meta.url);
const preload=new URL('./preload.mjs',import.meta.url).href;
function report(status,detail={}) {
 try {writeFileSync(statusFile,JSON.stringify({plugin:name,version:1,status,time:new Date().toISOString(),pid:process.pid,...detail},null,2));} catch {}
}
export function apply(ctx) {
 const provider=ctx.sandbox;
 if(process.platform!=='win32'||!process.versions.electron) {report('inactive-non-desktop');return;}
 try {
  if(!provider?.internals||typeof provider.windowsAclRunnerInvocation!=='function') throw Error('Sandbox provider interface changed');
  if(provider.internals.windowsAclRunnerArgs!==undefined) throw Error('A different runner override is already configured');
  const original=provider.windowsAclRunnerInvocation();
  if(original.length!==2||resolve(original[0]).toLowerCase()!==resolve(process.execPath).toLowerCase()) throw Error('Unexpected official runner invocation');
  const runner=original[1];
  const expected=join(dirname(process.execPath),'resources','app.asar','dsh','node_modules','@deepseek-ai','dsh-sandbox-windows-acl','lib','runner.js');
  if(resolve(runner).toLowerCase()!==resolve(expected).toLowerCase()) throw Error('Runner is outside this desktop installation');
  const runnerSource=readFileSync(runner,'utf8');
  const imports=[...runnerSource.matchAll(/from\s+["'](\.\/types-[^/\\"']+\.js)["']/g)];
  if(imports.length!==1) throw Error('Runner source module interface changed');
  const sourcePath=join(dirname(runner),imports[0][1]);
  const digest=hash(readFileSync(sourcePath));
  if(digest!==originalHash&&digest!==patchedHash) throw Error('Official sandbox source changed; no patch applied');
  if(!existsSync(fileURLToPath(preload))) throw Error('Preload is missing');
  const override=[original[0],'--import',preload,runner];
  ctx.effect(()=>{
   provider.internals.windowsAclRunnerArgs=override;
   report('active',{source: digest===originalHash?'official-original':'already-patched',sourceSha256:digest,runner,invocation:override});
   return ()=>{
    if(provider.internals.windowsAclRunnerArgs===override) delete provider.internals.windowsAclRunnerArgs;
    report('disposed');
   };
  });
 } catch(error) {
  report('inactive-needs-review',{reason:error.message});
  console.warn(`[${name}] ${error.message}. Official sandbox remains unchanged.`);
 }
}
