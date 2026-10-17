/** Navigator (page structure tree) styles. Injected next to VISUAL_EDITOR_CSS in VisualEditor.tsx. */
export const NAVIGATOR_CSS = `
.ve-nav{display:flex;flex-direction:column;gap:6px;font-size:13px;min-height:0}
.ve-nav__tools{display:flex;gap:6px;align-items:center;position:sticky;top:0;background:var(--ve-panel-bg,#fff);padding-bottom:4px;z-index:1}
.ve-nav__search{flex:1;min-width:0;padding:5px 8px;border:1px solid rgba(128,128,128,.4);border-radius:6px;font:inherit;background:transparent;color:inherit}
.ve-nav__btn{border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;border-radius:6px;padding:4px 8px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.ve-nav__btn:hover{background:rgba(128,128,128,.15)}
.ve-nav__tree,.ve-nav__tree ul{list-style:none;margin:0;padding:0}
.ve-nav__tree ul{margin-left:12px;border-left:1px solid rgba(128,128,128,.25)}
.ve-nav__row{display:flex;align-items:center;gap:4px;padding:3px 4px;border-radius:5px;cursor:pointer;min-height:26px}
.ve-nav__row:hover{background:rgba(128,128,128,.14)}
.ve-nav__row--selected{background:rgba(59,130,246,.22);outline:1px solid rgba(59,130,246,.6)}
.ve-nav__row:focus-visible{outline:2px solid #3b82f6}
.ve-nav__caret{width:18px;height:18px;flex:none;border:0;background:transparent;color:inherit;cursor:pointer;padding:0;font-size:10px}
.ve-nav__caret--empty{visibility:hidden}
.ve-nav__icon{flex:none;width:18px;text-align:center}
.ve-nav__label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ve-nav__type{opacity:.55;font-size:11px;flex:none}
.ve-nav__anchor{flex:none;font-size:11px;padding:0 6px;border-radius:9px;background:rgba(16,185,129,.2);color:inherit;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ve-nav__actions{display:none;gap:2px;flex:none}
.ve-nav__row:hover .ve-nav__actions,.ve-nav__row--selected .ve-nav__actions,.ve-nav__row:focus-within .ve-nav__actions{display:flex}
.ve-nav__icon-btn{border:0;background:transparent;color:inherit;cursor:pointer;padding:2px 4px;border-radius:4px;font-size:12px;opacity:.75}
.ve-nav__icon-btn:hover{opacity:1;background:rgba(128,128,128,.25)}
.ve-nav__input{flex:1;min-width:0;padding:2px 6px;border:1px solid #3b82f6;border-radius:4px;font:inherit;background:transparent;color:inherit}
.ve-nav__anchor-edit{display:flex;align-items:center;gap:4px;margin:2px 0 4px 40px;font-size:12px}
.ve-nav__hint{opacity:.6;font-size:11px;margin:0 0 4px 40px}
.ve-nav__empty{opacity:.65;padding:8px}
`
