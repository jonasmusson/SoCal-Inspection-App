import test from 'node:test';import assert from 'node:assert/strict';
import {onRequest} from '../functions/_middleware.js';
const check=async(host,path)=>{
 let nextCalled=false;
 const res=await onRequest({request:new Request('https://'+host+path),
   next:async()=>{nextCalled=true;return new Response('original app',{status:200});}});
 return {status:res.status,nextCalled};
};
test('anonymous root Pages origin never serves staff login or internal inspection routes',async()=>{
 for(const p of ['/','/index.html','/login','/dashboard','/settings','/checkin',
  '/inspect/abc','/inspection/abc','/my-inspections','/templates','/sw.js']){
   const r=await check('socal-inspection.pages.dev',p);
   assert.equal(r.status,403,p);assert.equal(r.nextCalled,false,p);
 }
});
test('old public customer report token URLs and required assets still load',async()=>{
 for(const p of ['/report/1234567890abcdef','/report/12345678-1234-5678-1234-123456789abc',
   '/assets/index-Fg32s9.js','/assets/index.css','/image.png','/k5-premium-cutaway.webp']){
   const r=await check('socal-inspection.pages.dev',p);
   assert.equal(r.status,200,p);assert.equal(r.nextCalled,true,p);
 }
});
test('custom Access-protected domain remains unchanged and unknown hostnames denied',async()=>{
 assert.equal((await check('inspection.socalautowork.com','/')).status,200);
 for(const h of ['random.socal-inspection.pages.dev','socal-inspection.pages.dev.evil.com',
   'evil.example.com']){
   assert.equal((await check(h,'/report/1234567890abcdef')).status,403,h);
 }
 assert.equal((await check('socal-inspection.pages.dev','/report/a')).status,403);
});
