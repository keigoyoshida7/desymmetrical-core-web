import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
test('Core UI keeps original author attribution and links to the source',()=>{
 assert.match(main,/De-symmetrical Core/);
 assert.match(main,/GUILLAUME PICCARRETA/);
 assert.match(main,/href="https:\/\/github.com\/gllmp"/);
 assert.match(main,/https:\/\/github.com\/gllmp\/desymmetrical-adaptation/);
 assert.match(main,/id="info-modal"/);
 assert.doesNotMatch(main,/KNOWCASE 3D|F: entrance|12 SPEAKER FEEDS|Cotec proposal/);
});
test('Core recording export matches v2 importer and namespaced edition',()=>{
 assert.match(main,/desymmetrical-core-automation\.json/);
 assert.match(main,/version:2,edition:'core',frames:recorder.frames/);
});
test('public preview does not automatically connect to a local bridge',()=>{
 assert.doesNotMatch(main,/location\.protocol==='http:'&&\['localhost','127.0.0.1'\]/);
 assert.match(main,/if\(a==='connect'\)/);
 assert.match(main,/audio requires local Max \+ Spat/);
});
