import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyShopmonkeyWebhook as verify} from '../integrations/shopmonkey/webhook-verify.mjs';
const body=Buffer.from('{"apiVersion":"3","operation":"UPDATE","table":"order","data":{"id":"order-123"}}');
const key='testing-secret-1234567890';
const now=1793577600;
const id='delivery-id-123';
const sign=(raw=body,k=key)=>'v1,'+createHmac('sha256',k).update(Buffer.concat([Buffer.from(`${id}.${now}.`),raw])).digest('base64');
const headers=(sig=sign(),stamp=now)=>new Headers({'webhook-id':id,'webhook-timestamp':String(stamp),'webhook-signature':sig});
test('Accepts authentic raw signed body',()=>{
 assert.deepEqual(verify({headers:headers(),rawBody:body,secrets:[key],nowSeconds:now}),{deliveryId:id,sentAt:now,verified:true});
});
test('Rejects tampered body and malformed header',()=>{
 assert.throws(()=>verify({headers:headers(),rawBody:Buffer.from('{}'),secrets:[key],nowSeconds:now}),/signature invalid/);
 assert.throws(()=>verify({headers:headers('v1,garbage'),rawBody:body,secrets:[key],nowSeconds:now}),/signature invalid/);
});
test('Rejects stale webhook',()=>{
 assert.throws(()=>verify({headers:headers(),rawBody:body,secrets:[key],nowSeconds:now+301}),/outside accepted window/);
});
test('Allows multiple signatures during secret rotation',()=>{
 const sig='v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= '+sign();
 assert.equal(verify({headers:headers(sig),rawBody:body,secrets:['old-secret-1234567890',key],nowSeconds:now}).verified,true);
});
test('Requires raw bytes and refuses unsafe config',()=>{
 assert.throws(()=>verify({headers:headers(),rawBody:'{}',secrets:[key],nowSeconds:now}),/raw request body/);
 assert.throws(()=>verify({headers:headers(),rawBody:body,secrets:['x'],nowSeconds:now}),/secret required/);
});
