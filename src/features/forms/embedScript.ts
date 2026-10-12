/**
 * The embed snippets and the loader script they use.
 *
 * Script snippet: one line the site owner pastes where the form should appear.
 * It loads /embed/forms.js from this site, which builds the iframe next to the
 * script tag and sizes it from the height the form reports with postMessage.
 *
 * Iframe snippet: the plain alternative, with a fixed height and no script on
 * the other site.
 */

const KEY = /^[A-Za-z0-9_-]{1,60}$/

export const embedUrl = (origin: string, key: string): string => `${origin.replace(/\/$/, '')}/embed/forms/${encodeURIComponent(key)}`

export function scriptSnippet(origin: string, key: string): string {
  const base = origin.replace(/\/$/, '')
  return `<script src="${base}/embed/forms.js" data-form="${key}" async></script>`
}

export function iframeSnippet(origin: string, key: string, height = 640): string {
  return `<iframe src="${embedUrl(origin, key)}" title="Form" width="100%" height="${height}" style="border:0;max-width:100%" loading="lazy"></iframe>`
}

/**
 * The loader, served as JavaScript. `origin` is baked in (this site's own origin, taken from the request that
 * fetched the script), so the iframe always points here and a message is trusted only from here.
 */
export function loaderScript(origin: string): string {
  const safeOrigin = JSON.stringify(origin.replace(/\/$/, ''))
  return `(function(){
var ORIGIN=${safeOrigin};
var KEY=/^[A-Za-z0-9_-]{1,60}$/;
var scripts=document.querySelectorAll('script[data-form]');
var frames={};
Array.prototype.forEach.call(scripts,function(script){
  if(script.getAttribute('data-eg-done'))return;
  var key=script.getAttribute('data-form')||'';
  if(!KEY.test(key))return;
  script.setAttribute('data-eg-done','1');
  var frame=document.createElement('iframe');
  var query=location.search?location.search.slice(1):'';
  frame.src=ORIGIN+'/embed/forms/'+encodeURIComponent(key)+(query?'?'+query:'');
  frame.title='Form';
  frame.setAttribute('loading','lazy');
  frame.style.cssText='border:0;width:100%;max-width:100%;display:block;height:'+(script.getAttribute('data-height')||'640')+'px';
  script.parentNode.insertBefore(frame,script);
  frames[key]=frame;
});
window.addEventListener('message',function(event){
  if(event.origin!==ORIGIN)return;
  var data=event.data;
  if(!data||data.type!=='eg-form-resize'||typeof data.height!=='number')return;
  var frame=frames[data.key];
  if(frame&&data.height>0&&data.height<20000)frame.style.height=Math.ceil(data.height)+'px';
});
})();
`
}

export const isValidEmbedKey = (key: string): boolean => KEY.test(key)
