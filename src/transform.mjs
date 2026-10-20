import { createHash } from 'node:crypto';
export const originalHash = '0bb3a34508785bdc34626542f9358d398fd9f60fdaf4b48201dfdff2122f25fc';
export const patchedHash = '93541b5477d1e8a83fe91d6de0c258a92d48498a2e0adc356d07a48bacbfa57b';
export const hash = source => createHash('sha256').update(source).digest('hex');
export function transform(source) {
 const bytes = typeof source === 'string' ? Buffer.from(source) : Buffer.from(source);
 const digest = hash(bytes);
 if(digest === patchedHash) return {status:'already-patched',source:bytes};
 if(digest !== originalHash) return {status:'unknown-source',source:bytes};
 const anchor='const result = api.setEntriesInAclW(1, buildExplicitAccess(sidPtr, 1, FILE_ALL_ACCESS), currentDacl, newDaclSlot);';
 const replacement=`const userSize = allocUint32();
 api.getTokenInformation(token, 1, null, 0, userSize);
 const userBytes = Buffer.alloc(decodeUint32(userSize));
 if (!userBytes.length || api.getTokenInformation(token, 1, userBytes, userBytes.length, userSize) === 0) throwLastError$1(api, "GetTokenInformation", "TokenUser default DACL grant");
 const userSid = decodePtrAt(userBytes, 0);
 if (userSid === null) throw new Error("TokenUser returned null SID");
 const entries = Buffer.concat([buildExplicitAccess(sidPtr, 1, FILE_ALL_ACCESS), buildExplicitAccess(userSid, 1, 0x10000000)]);
 const result = api.setEntriesInAclW(2, entries, currentDacl, newDaclSlot);`;
 let code=bytes.toString('utf8');
 if(code.split(anchor).length !== 2) throw Error('Verified patch anchor missing');
 code=code.replace(anchor,replacement).replace(/\/\*\*\r?\n\* Merge one full-access[\s\S]*?\*\//,'/* DSH local repair: preserve the normal-user write pass in new-object default DACLs. */');
 code+=' '.repeat(bytes.length-Buffer.byteLength(code));
 if(hash(code)!==patchedHash) throw Error('Transformed source verification failed');
 return {status:'patched-in-memory',source:code};
}
