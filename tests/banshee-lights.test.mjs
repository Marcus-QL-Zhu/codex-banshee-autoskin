import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/banshee-lights.js',import.meta.url),'utf8');

test('light factory leaves unskinned and auxiliary renderers untouched',async()=>{
  let allocations=0;
  const context={window:{},document:{documentElement:{matches:()=>false},getElementById:()=>null,createElement:()=>{allocations++;throw new Error('Unexpected DOM allocation');}}};
  const install=vm.runInNewContext(source,context);
  assert.equal(typeof install,'function');
  assert.equal((await install()).installed,false);
  assert.equal(allocations,0);
  assert.equal(context.window.__CODEX_BANSHEE_LIGHTS__,undefined);
});

test('unsupported canvas runtimes retain the original light fallback',async()=>{
  let allocations=0;
  const context={window:{__CODEX_DREAM_SKIN_STATE__:{}},document:{documentElement:{matches:()=>true},getElementById:()=>({querySelector:()=>({})}),createElement:()=>{allocations++;throw new Error('Unexpected DOM allocation');}}};
  const install=vm.runInNewContext(source,context);
  assert.equal((await install()).installed,false);
  assert.equal(allocations,0);
});
