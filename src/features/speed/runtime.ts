import type { ResolvedSpeed } from './types'

export type RuntimeConfig = {
  lazyImages: boolean
  lazyIframes: boolean
  dimensions: boolean
  /** 0 = off, 1 = release third-party scripts on window load, 2 = release on first interaction. */
  scriptHold: 0 | 1 | 2
}

export const runtimeConfigFor = (speed: ResolvedSpeed): RuntimeConfig | null => {
  if (!speed.enabled) return null
  const config: RuntimeConfig = {
    lazyImages: speed.media.lazyLoadImages,
    lazyIframes: speed.media.lazyLoadIframes,
    dimensions: speed.media.addImageDimensions,
    // Delay wins over defer: it is the stronger version of the same mechanism.
    scriptHold: speed.advanced.delayJsExecution ? 2 : speed.assets.deferThirdPartyJs ? 1 : 0,
  }
  if (!config.lazyImages && !config.lazyIframes && !config.dimensions && config.scriptHold === 0) return null
  return config
}

/**
 * The one inline script this feature adds to the page.
 *
 * It runs in <head>, before the body streams in, because everything it does is
 * only useful if it happens before the browser starts fetching the thing it is
 * trying to influence.
 *
 * WHAT IT ACTUALLY ACHIEVES, HONESTLY:
 *
 * - Lazy loading works by patching elements as the parser inserts them, via a
 *   MutationObserver. The browser's preload scanner can still have started a
 *   fetch for an image before the observer fires, so the very first images in
 *   the markup may load eagerly regardless. Everything further down the page -
 *   which is where the bytes actually are - is caught. The complete fix is
 *   `loading="lazy"` written by the components that emit the <img>; this is the
 *   site-wide safety net for markup we do not control (rich text, embeds).
 *
 * - Dimensions cannot be invented. Nothing on the client knows an image's size
 *   before it has loaded, so this cannot prevent the layout shift on a first
 *   view. What it does is stamp width/height and an aspect-ratio onto each
 *   image once its intrinsic size is known, which holds the space through
 *   re-renders, client-side navigation and back/forward restores. Preventing
 *   the first-paint shift requires the dimensions server-side, at render time.
 *
 * - Script holding applies only to scripts inserted into the DOM by other
 *   scripts - analytics tags, chat widgets, embedded players - and to elements
 *   explicitly marked `type="text/speed-delay"`. That is deliberate. A script
 *   the parser found in the original HTML cannot be stopped from here, and the
 *   engine's own hydration scripts are same-origin and never touched: holding
 *   those back would leave a dead page, not a fast one.
 */
export const buildRuntimeScript = (config: RuntimeConfig): string => {
  const json = JSON.stringify(config)
  return `(function(){
var C=${json},D=document;
function ready(fn){if(D.readyState!=='loading'){fn()}else{D.addEventListener('DOMContentLoaded',fn)}}
function sizeImage(i){
  if(i.getAttribute('width')&&i.getAttribute('height'))return;
  var w=i.naturalWidth,h=i.naturalHeight;
  if(!w||!h)return;
  i.setAttribute('width',String(w));i.setAttribute('height',String(h));
  if(!i.style.aspectRatio)i.style.aspectRatio=w+' / '+h;
}
function patch(el){
  var t=el.tagName;
  if(t==='IMG'){
    if(C.lazyImages&&!el.hasAttribute('loading')&&!el.hasAttribute('data-speed-eager')){el.setAttribute('loading','lazy');el.setAttribute('decoding','async')}
    if(C.dimensions){if(el.complete){sizeImage(el)}else{el.addEventListener('load',function(){sizeImage(el)},{once:true})}}
  }else if(t==='IFRAME'){
    if(C.lazyIframes&&!el.hasAttribute('loading'))el.setAttribute('loading','lazy')
  }
}
function sweep(root){
  if(root.nodeType!==1)return;
  patch(root);
  var found=root.querySelectorAll?root.querySelectorAll('img,iframe'):[];
  for(var i=0;i<found.length;i++)patch(found[i])
}
if(C.lazyImages||C.lazyIframes||C.dimensions){
  new MutationObserver(function(records){
    for(var r=0;r<records.length;r++){
      var added=records[r].addedNodes;
      for(var n=0;n<added.length;n++)sweep(added[n])
    }
  }).observe(D.documentElement,{childList:true,subtree:true});
  ready(function(){sweep(D.body||D.documentElement)})
}
if(C.scriptHold){
  var held=[],released=false,origin=location.origin;
  function isThird(node){
    if(node.tagName!=='SCRIPT')return false;
    if(node.type==='text/speed-delay')return true;
    if(node.hasAttribute&&node.hasAttribute('data-speed-keep'))return false;
    var src=node.src||node.getAttribute&&node.getAttribute('src');
    if(!src)return false;
    try{return new URL(src,location.href).origin!==origin}catch(e){return false}
  }
  function revive(node){
    var s=D.createElement('script');
    for(var a=0;a<node.attributes.length;a++){
      var at=node.attributes[a];
      if(at.name==='type'&&at.value==='text/speed-delay')continue;
      s.setAttribute(at.name,at.value)
    }
    if(!node.src)s.text=node.text||'';
    return s
  }
  function release(){
    if(released)return;released=true;
    for(var i=0;i<held.length;i++){
      var item=held[i];
      try{item.parent.insertBefore(revive(item.node),item.before||null)}catch(e){}
    }
    held=[]
  }
  var patchInsert=function(name){
    var original=Node.prototype[name];
    Node.prototype[name]=function(node,before){
      if(!released&&node&&node.nodeType===1&&isThird(node)){
        held.push({parent:this,node:node,before:before});
        return node
      }
      return original.apply(this,arguments)
    }
  };
  patchInsert('appendChild');patchInsert('insertBefore');
  var events=C.scriptHold===2?['pointerdown','touchstart','keydown','wheel','scroll','mousemove']:[];
  function fire(){for(var i=0;i<events.length;i++)removeEventListener(events[i],fire);release()}
  for(var e=0;e<events.length;e++)addEventListener(events[e],fire,{once:true,passive:true});
  // Safety net: a visitor who reads without interacting still gets a working
  // page. Without this, a delayed chat widget or player never appears at all.
  if(C.scriptHold===2){setTimeout(release,10000)}else{addEventListener('load',function(){setTimeout(release,0)})}
  ready(function(){
    var marked=D.querySelectorAll('script[type="text/speed-delay"]');
    for(var i=0;i<marked.length;i++)held.push({parent:marked[i].parentNode,node:marked[i],before:marked[i].nextSibling})
  })
}
})();`
}
