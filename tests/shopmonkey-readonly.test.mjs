import test from "node:test";
import assert from "node:assert/strict";
import {
  createShopmonkeyReadClient, ShopmonkeyReadError, orderLinkCandidates,
} from "../integrations/shopmonkey/readonly-client.mjs";

const response = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: {"content-type":"application/json", ...headers}
  });

test("Shopmonkey connector makes only an authenticated GET to approved v3 endpoint", async () => {
  const sent = [];
  const client = createShopmonkeyReadClient({
    token: "TEST_ONLY_NOT_REAL",
    fetchImpl: async (url, opts) => {
      sent.push({url: String(url), method: opts.method, auth: opts.headers.Authorization});
      return response({success: true, data: [{id:"ro-1",vehicleId:"vehicle-1"}]});
    },
  });
  const r = await client.orders({limit:10, skip:20});
  assert.equal(r.data.length,1);
  assert.deepEqual(sent, [{
    url:"https://api.shopmonkey.cloud/v3/order?limit=10&skip=20",
    method:"GET",auth:"Bearer TEST_ONLY_NOT_REAL"
  }]);
});

test("No credential means no requests", () => {
  assert.throws(() => createShopmonkeyReadClient({token:""}), /credential/);
});

test("Rejects path injection and unreasonable paging before making a request", async () => {
  let calls=0;
  const c=createShopmonkeyReadClient({token:"test-only",fetchImpl:async()=>{
    calls++;return response({success:true,data:[]});
  }});
  assert.throws(()=>c.order("../../payment"), /Shopmonkey ID/);
  assert.throws(()=>c.customer("bad?x=1"), /Shopmonkey ID/);
  assert.throws(()=>c.timesheets({skip:-1}), /Skip/);
  assert.throws(()=>c.orders({limit:1000}), /Limit/);
  assert.equal(calls,0);
});

test("429 response is safely surfaced without customer data or token", async () => {
  const c=createShopmonkeyReadClient({token:"highly-secret",fetchImpl:async() =>
    response({message:"Customer confidential data", code:"secret"},429,{"Retry-After":"13"})
  });
  await assert.rejects(c.orders(),error=>{
    assert.equal(error instanceof ShopmonkeyReadError,true);
    assert.equal(error.status,429);
    assert.equal(error.retryAfterSeconds,13);
    assert.doesNotMatch(error.message,/Customer|secret/);
    return true;
  });
});

test("Keeps external order IDs separate, flags incomplete identity for manager review", () => {
  const candidates=orderLinkCandidates({data:[
    {id:"ro-123",number:123,vehicleId:"vehicle-123",customerId:"cust-1",locationId:"loc-2"},
    {id:"ro-124",number:124,vehicleId:null}
  ]});
  assert.deepEqual(candidates[0], {
    source:"shopmonkey",orderId:"ro-123",orderNumber:"123",
    customerId:"cust-1",vehicleId:"vehicle-123",locationId:"loc-2",reviewRequired:false
  });
  assert.equal(candidates[1].reviewRequired,true);
});

test("Read client never exposes a mutation method",()=>{
  const c=createShopmonkeyReadClient({token:"test-only",fetchImpl:async()=>response({success:true})});
  for(const method of ["createOrder","updateOrder","deleteOrder","clockIn","clockOut","sendInvoice"])
    assert.equal(c[method],undefined);
});
