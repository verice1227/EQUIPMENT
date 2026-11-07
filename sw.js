const CACHE='equipment-map-search-v6';
const ASSETS=['./','./index.html','./styles.css','./app.js','./tiles.js','./floor-map.png','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('equipment-map-search-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||url.search)return;
  if(!ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===url.pathname))return;
  // Reviewed labels can be published by uploading only tiles.js. Fetch it fresh
  // when online, but keep the last copy available when the PWA is offline.
  if(url.pathname===new URL('./tiles.js',self.registration.scope).pathname){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      if(response.ok){const copy=response.clone();const cache=await caches.open(CACHE);await cache.put(event.request,copy);}
      return response;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
});
