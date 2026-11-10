const API_ORIGIN="https://api.shopmonkey.cloud";
const RESPONSE_MAX_BYTES=2_000_000;
const REQUEST_TIMEOUT_MS=20_000;

export class ShopmonkeyWriteError extends Error{
  status:number;
  retryAfterSeconds:number|null;
  constructor(status:number,message="Shopmonkey request failed.",retryAfterSeconds:number|null=null){
    super(message);
    this.name="ShopmonkeyWriteError";
    this.status=status;
    this.retryAfterSeconds=retryAfterSeconds;
  }
}

const remoteId=(value:unknown,label:string)=>{
  const text=String(value??"").trim();
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(text))throw new Error("Invalid "+label+".");
  return encodeURIComponent(text);
};

async function responseJson(response:Response){
  const declared=response.headers.get("content-length");
  if(declared){
    const n=Number(declared);
    if(Number.isFinite(n)&&n>RESPONSE_MAX_BYTES)throw new Error("Shopmonkey response exceeded the safe boundary.");
  }
  const reader=response.body?.getReader();
  if(!reader){
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>RESPONSE_MAX_BYTES)throw new Error("Shopmonkey response exceeded the safe boundary.");
    return JSON.parse(raw);
  }
  const decoder=new TextDecoder();
  let total=0,raw="";
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>RESPONSE_MAX_BYTES){await reader.cancel();throw new Error("Shopmonkey response exceeded the safe boundary.");}
      raw+=decoder.decode(value,{stream:true});
    }
    raw+=decoder.decode();
  }finally{reader.releaseLock();}
  return JSON.parse(raw);
}

export function createShopmonkeyWriteClient(token:string,fetchImpl:typeof fetch=fetch){
  if(!token||typeof token!=="string")throw new Error("Shopmonkey server API credential is not configured.");
  async function request(method:"GET"|"POST",path:string,body?:unknown){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      const response=await fetchImpl(API_ORIGIN+path,{
        method,
        headers:{
          Authorization:"Bearer "+token,
          Accept:"application/json",
          ...(body===undefined?{}:{"Content-Type":"application/json"}),
        },
        body:body===undefined?undefined:JSON.stringify(body),
        signal:controller.signal,
        redirect:"error",
      });
      if(!response.ok){
        const raw=Number(response.headers.get("Retry-After"));
        const retry=response.status===429&&Number.isFinite(raw)&&raw>0?Math.min(raw,3600):null;
        throw new ShopmonkeyWriteError(response.status,"Shopmonkey request failed.",retry);
      }
      const payload=await responseJson(response);
      if(!payload||typeof payload!=="object"||payload.success!==true)throw new Error("Shopmonkey returned an invalid success response.");
      return payload as Record<string,unknown>;
    }finally{clearTimeout(timeout);}
  }

  return Object.freeze({
    async order(orderId:string){
      const payload=await request("GET","/v3/order/"+remoteId(orderId,"Shopmonkey order ID"));
      const data=(payload.data&&typeof payload.data==="object"?payload.data:null) as Record<string,unknown>|null;
      if(!data||!data.id)throw new Error("Shopmonkey order response is missing its ID.");
      return data;
    },
    async services(orderId:string){
      const payload=await request("GET","/v3/order/"+remoteId(orderId,"Shopmonkey order ID")+"/service");
      const data=Array.isArray(payload.data)?payload.data:[];
      return data.filter((row):row is Record<string,unknown>=>Boolean(row&&typeof row==="object"));
    },
    async addService(orderId:string,args:{name:string;note?:string}){
      const name=args.name.trim();
      if(name.length<2||name.length>300)throw new Error("Shopmonkey service name is invalid.");
      const payload=await request("POST","/v3/order/"+remoteId(orderId,"Shopmonkey order ID")+"/service",[
        {name,note:(args.note??"").trim().slice(0,2000),pricing:"LineItem"},
      ]);
      const root=(payload.data&&typeof payload.data==="object"?payload.data:null) as Record<string,unknown>|null;
      const services=Array.isArray(root?.services)?root!.services.filter((row):row is Record<string,unknown>=>Boolean(row&&typeof row==="object")):[];
      const candidates=services.filter(row=>String(row.name??"").trim()===name&&typeof row.id==="string");
      if(candidates.length===1)return candidates[0];
      if(services.length===1&&typeof services[0].id==="string")return services[0];
      throw new Error("Shopmonkey service creation returned an ambiguous result. Review the order before retrying.");
    },
    async addLabor(orderId:string,serviceId:string,args:{hours:number;name:string;note?:string;rateCents:number}){
      const hours=Number(args.hours),rateCents=Number(args.rateCents),name=args.name.trim();
      if(!Number.isFinite(hours)||hours<=0||hours>24)throw new Error("Shopmonkey labor hours are invalid.");
      if(!Number.isInteger(rateCents)||rateCents<0||rateCents>1_000_000)throw new Error("Shopmonkey labor rate is invalid.");
      if(name.length<2||name.length>300)throw new Error("Shopmonkey labor name is invalid.");
      const payload=await request(
        "POST",
        "/v3/order/"+remoteId(orderId,"Shopmonkey order ID")+"/service/"+remoteId(serviceId,"Shopmonkey service ID")+"/labor",
        {hours:Math.round(hours*100)/100,name,note:(args.note??"").trim().slice(0,2000),rateCents,showHours:true,showNote:true,completed:true},
      );
      const root=(payload.data&&typeof payload.data==="object"?payload.data:null) as Record<string,unknown>|null;
      const labor=(root?.labor&&typeof root.labor==="object"?root.labor:null) as Record<string,unknown>|null;
      if(!labor||typeof labor.id!=="string"||!labor.id)throw new Error("Shopmonkey labor creation did not return a labor ID.");
      if(String(labor.orderId??"")!==decodeURIComponent(remoteId(orderId,"Shopmonkey order ID")))throw new Error("Shopmonkey labor response order ID does not match the requested order.");
      if(String(labor.serviceId??"")!==decodeURIComponent(remoteId(serviceId,"Shopmonkey service ID")))throw new Error("Shopmonkey labor response service ID does not match the requested service.");
      return labor;
    },
  });
}
