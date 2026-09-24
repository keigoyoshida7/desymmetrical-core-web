import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateStudy} from '../study-state.js';

test('saved harmonic and texture settings survive the chapter renumbering',()=>{
 const saved={chapterId:'texture',settings:{harmonic:{waveform:'sine',organization:'harmonic',frequencyMin:80,frequencyMax:640,harmonicFundamental:80},texture:{waveform:'triangle',frequencyMin:1200,frequencyMax:6000},pulse:{waveform:'square',organization:'pulse'}}};
 const migrated=migrateStudy(saved);
 assert.equal(migrated.chapterId,'texture');
 assert.equal(migrated.settings.harmonic.frequencyMin,80);
 assert.equal(migrated.settings.harmonic.harmonicFundamental,80);
 assert.equal(migrated.settings.texture.waveform,'triangle');
 assert.equal(migrated.settings.texture.frequencyMax,6000);
 assert.deepEqual(Object.keys(migrated.settings),['sustain','harmonic','texture','interference']);
 assert.equal(migrated.settings.interference.beatHz,1.5);
});
test('removed choices cannot return from saved settings',()=>{
 const restored=migrateStudy({chapterId:'pulse',settings:{sustain:{waveform:'sawtooth',organization:'pulse',pulseRate:3},harmonic:{waveform:'square',organization:'pulse'}}});
 assert.equal(restored.chapterId,'sustain');
 assert.equal(restored.settings.sustain.waveform,'sine');
 assert.equal(restored.settings.sustain.organization,'sustain');
 assert.equal(restored.settings.harmonic.waveform,'triangle');
 assert.equal(restored.settings.harmonic.organization,'harmonic');
 assert(!('pulseRate' in restored.settings.sustain));
 assert.equal(migrateStudy(null).chapterId,'sustain');
});
test('waveform menu exposes only the three requested choices in order; identity has no phi',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const waveform=html.match(/<select id="waveform">([\s\S]*?)<\/select>/)[1];
 assert.deepEqual([...waveform.matchAll(/value="([^"]+)"/g)].map(x=>x[1]),['sine','noise','triangle']);
 assert(!html.includes('φ'));
 assert(!html.includes('id="pulse-rate"'));
 assert(!html.includes('value="pulse"'));
});
