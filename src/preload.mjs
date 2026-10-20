// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 KasuganoSora152
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { transform } from './transform.mjs';

// This preload belongs only to the Windows sandbox runner invocation. It is
// never installed as a global NODE_OPTIONS value or inherited shell setting.
const entry=process.argv[1];
const runnerDir=entry ? dirname(resolve(entry)) : '';
if(!/[/\\]@deepseek-ai[/\\]dsh-sandbox-windows-acl[/\\]lib[/\\]runner\.js$/i.test(entry||'')) throw Error('DSH local fix: unexpected runner entry');
registerHooks({
 load(url,context,nextLoad){
  const loaded=nextLoad(url,context);
  if(!url.startsWith('file:')) return loaded;
  const filename=fileURLToPath(url);
  if(dirname(filename).toLowerCase()!==runnerDir.toLowerCase()||!/^types-[^/\\]+\.js$/i.test(filename.split(/[/\\]/).at(-1))) return loaded;
  if(loaded.source==null) return loaded;
  const result=transform(loaded.source);
  if(result.status==='unknown-source') {
   process.stderr.write('[dsh-local-shell-fix] Official sandbox code changed; leaving it unchanged. Recheck only if shell fails.\n');
   return loaded;
  }
  return {...loaded,source:result.source};
 }
});
