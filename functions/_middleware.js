// Cloudflare Pages Functions middleware protects the raw Pages origin.
// Staff must use inspection.socalautowork.com (protected by Cloudflare Access).
// Preserve previously shared customer report links and only the static assets
// strictly necessary to render those customer reports.
const deny=()=>new Response('Use the private SoCal Inspection address.',{
  status:403,headers:{'content-type':'text/plain; charset=utf-8',
    'cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive',
    'x-content-type-options':'nosniff'}
});
const PUBLIC_ASSETS=new Set([
  '/image.png','/icon.svg','/manifest.json','/favicon.ico','/apple-touch-icon.png',
  '/k5-premium-cutaway.webp','/mustang-premium-cutaway.webp'
]);
const reportPath=/^\/report\/[a-zA-Z0-9_-]{8,512}\/?$/;
const appAssetPath=/^\/assets\/[a-zA-Z0-9._/-]+\.(?:js|css|svg|png|webp|gif|woff2?|ttf|ico)$/;
export async function onRequest(context){
  const url=new URL(context.request.url);
  const host=url.hostname.toLowerCase();
  if(host==='inspection.socalautowork.com')return context.next();
  if(host==='socal-inspection.pages.dev'){
    if(reportPath.test(url.pathname)||appAssetPath.test(url.pathname)||PUBLIC_ASSETS.has(url.pathname))
      return context.next();
    return deny();
  }
  // Preview and unexpected hostnames must use explicitly authorized entrypoints.
  return deny();
}
