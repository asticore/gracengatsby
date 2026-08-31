import React from 'react'

import { AB_TRACK_PATH } from '../slugs'
import type { AbContext } from '../types'

/**
 * The browser half of goal tracking.
 *
 * Three of the four goal types are scored on the server - a page visit from
 * the request, a form submission from the submit handler, an order from the
 * order itself. Only "element clicked" genuinely needs the browser, and this
 * is the smallest thing that can do it: one delegated listener, no bundle, no
 * framework, and nothing at all in the HTML when the visitor is in no test or
 * the feature is off.
 *
 * The script is told which selectors and paths matter but never which variant
 * the visitor is in. That is not an oversight - the assignment cookie is
 * HttpOnly precisely so a page script cannot report a conversion for an arm
 * the visitor was never shown.
 *
 * A page-visited goal is posted only when the current path is one the tests
 * actually care about, so an ordinary page view costs no request at all.
 */

type Bindings = { selectors: string[]; paths: string[]; forms: boolean }

const bindingsFor = (context: AbContext): Bindings => {
  const selectors = new Set<string>()
  const paths = new Set<string>()
  let forms = false

  for (const test of context.allTests) {
    if (!context.assignments[test.id]) continue
    for (const goal of test.goals) {
      if (goal.type === 'element-clicked' && goal.selector) selectors.add(goal.selector)
      if (goal.type === 'page-visited' && goal.path) paths.add(goal.path)
      if (goal.type === 'form-submitted') forms = true
    }
  }

  return { selectors: [...selectors], paths: [...paths], forms }
}

const script = (bindings: Bindings, endpoint: string): string => `
(function(){
  var b=${JSON.stringify(bindings)};
  function send(p){try{fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p),credentials:'same-origin',keepalive:true})}catch(e){}}
  function norm(v){v=String(v).split('?')[0].replace(/\\/+$/,'');return v===''?'/':v}
  var here=norm(location.pathname);
  for(var i=0;i<b.paths.length;i++){if(norm(b.paths[i])===here){send({kind:'page-visited',path:here});break}}
  if(b.selectors.length){document.addEventListener('click',function(e){
    for(var i=0;i<b.selectors.length;i++){
      try{if(e.target&&e.target.closest&&e.target.closest(b.selectors[i])){send({kind:'element-clicked',selector:b.selectors[i]})}}catch(err){}
    }
  },true)}
  if(b.forms){document.addEventListener('submit',function(e){
    var f=e.target;send({kind:'form-submitted',formId:(f&&f.getAttribute&&f.getAttribute('data-form-id'))||null})
  },true)}
})();`

export const ABTracker: React.FC<{ context: AbContext }> = ({ context }) => {
  if (!context.enabled) return null

  const bindings = bindingsFor(context)
  if (bindings.selectors.length === 0 && bindings.paths.length === 0 && !bindings.forms) return null

  return (
    <script
      // Server-generated from the site's own test definitions - there is no
      // visitor input anywhere in this string.
      dangerouslySetInnerHTML={{ __html: script(bindings, AB_TRACK_PATH) }}
    />
  )
}

export default ABTracker
