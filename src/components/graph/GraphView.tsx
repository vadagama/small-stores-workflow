import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { offsetToDate } from '../../utils/dateUtils';

// ── Internal types ────────────────────────────────────────────────────────────

interface GNode {
  id: string; name: string; stageId: string; stageColor: string; stageLabel: string;
  dept: string; startDate: string; endDate: string; durationDays: number;
  stepsCount: number; inputs: string[]; outputs: string[]; x: number; y: number;
}
interface GEdge { id: string; from: string; to: string; artifact: string; }
interface GStage { id: string; label: string; color: string; }
interface Port { name: string; isExt: boolean; side: 'in'|'out'; ly: number; x: number; y: number; color: string; }

// ── Pure helpers ──────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return forms[2];
  if (m10 === 1) return forms[0];
  if (m10 >= 2 && m10 <= 4) return forms[1];
  return forms[2];
}

const _clr = new Map<string,string>();
function colorForArtifact(name: string): string {
  const key = norm(name);
  if (_clr.has(key)) return _clr.get(key)!;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  const c = 'oklch(72% 0.17 ' + hue + ')';
  _clr.set(key, c); return c;
}

const NODE_W = 280; const NODE_H_BASE = 168;
const PORT_SPACING = 22; const PORT_PAD = 10;

function nodeHeight(n: GNode) {
  return Math.max(NODE_H_BASE, Math.max(n.inputs.length, n.outputs.length, 1) * PORT_SPACING + 2 * PORT_PAD);
}

function computePorts(n: GNode, allOut: Set<string>): { portsIn: Port[]; portsOut: Port[] } {
  const h = nodeHeight(n);
  const innerH = h - 2 * PORT_PAD;
  const portsIn: Port[] = n.inputs.map((name, i, arr) => {
    const t = (i + 1) / (arr.length + 1);
    const ly = PORT_PAD + t * innerH;
    return { name, isExt: !allOut.has(norm(name)), side: 'in', ly, x: n.x, y: n.y + ly, color: colorForArtifact(name) };
  });
  const portsOut: Port[] = n.outputs.map((name, i, arr) => {
    const t = (i + 1) / (arr.length + 1);
    const ly = PORT_PAD + t * innerH;
    return { name, isExt: false, side: 'out', ly, x: n.x + NODE_W, y: n.y + ly, color: colorForArtifact(name) };
  });
  return { portsIn, portsOut };
}

function median(arr: number[]) {
  const s = [...arr].sort((a,b)=>a-b); const m = Math.floor(s.length/2);
  return s.length % 2 ? s[m] : (s[m-1]+s[m])/2;
}

function getNeighbors(id: string, depth: number, edges: GEdge[]): Map<string,number> {
  const vis = new Map<string,number>(); vis.set(id,0);
  const q: {id:string;d:number}[] = [{id,d:0}];
  while (q.length) {
    const {id:cur,d} = q.shift()!; if (d>=depth) continue;
    edges.forEach(e=>{
      const next = e.from===cur ? e.to : e.to===cur ? e.from : null;
      if (next && !vis.has(next)) { vis.set(next,d+1); q.push({id:next,d:d+1}); }
    });
  }
  return vis;
}

function autoLayout(nodes: GNode[], edges: GEdge[]) {
  const layerOf = new Map<string,number>();
  function layer(id: string, stk = new Set<string>()): number {
    if (layerOf.has(id)) return layerOf.get(id)!;
    if (stk.has(id)) return 0; stk.add(id);
    const up = edges.filter(e=>e.to===id).map(e=>e.from);
    const l = up.length ? 1+Math.max(...up.map(u=>layer(u,new Set(stk)))) : 0;
    stk.delete(id); layerOf.set(id,l); return l;
  }
  nodes.forEach(n=>layer(n.id));
  const layers: GNode[][] = [];
  nodes.forEach(n=>{ const l=layerOf.get(n.id)!; if(!layers[l]) layers[l]=[]; layers[l].push(n); });
  const CS=620, RS=400, X0=60, Y0=60;
  layers.forEach((lay,li)=>lay.forEach((n,i)=>{ n.x=X0+li*CS; n.y=Y0+i*RS; }));
  const byId = (id:string)=>nodes.find(n=>n.id===id);
  for (let it=0;it<8;it++) {
    for (let l=1;l<layers.length;l++) {
      layers[l].forEach(n=>{ const ups=edges.filter(e=>e.to===n.id).map(e=>byId(e.from)).filter(x=>x&&layerOf.get(x.id)===l-1).map(x=>x!.y); (n as any)._sk=ups.length?median(ups):n.y; });
      layers[l].sort((a,b)=>(a as any)._sk-(b as any)._sk); layers[l].forEach((n,i)=>{n.y=Y0+i*RS;});
    }
    for (let l=layers.length-2;l>=0;l--) {
      layers[l].forEach(n=>{ const dns=edges.filter(e=>e.from===n.id).map(e=>byId(e.to)).filter(x=>x&&layerOf.get(x.id)===l+1).map(x=>x!.y); (n as any)._sk=dns.length?median(dns):n.y; });
      layers[l].sort((a,b)=>(a as any)._sk-(b as any)._sk); layers[l].forEach((n,i)=>{n.y=Y0+i*RS;});
    }
  }
  const maxR = Math.max(...layers.map(l=>l.length));
  layers.forEach(lay=>{ const off=(maxR-lay.length)*RS/2; lay.forEach((n,i)=>{n.y=Y0+off+i*RS;}); });
  nodes.forEach(n=>delete (n as any)._sk);
}

// ── DOM helpers (no innerHTML) ────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = text;
  return e;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function setAttrs(el: Element, attrs: Record<string, string>) {
  Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
}

function icon(path: string): SVGSVGElement {
  const svg = svgEl('svg'); setAttrs(svg, { width:'12', height:'12', viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'2' });
  const p = svgEl('path'); p.setAttribute('d', path); svg.appendChild(p); return svg;
}

// ── GraphView ─────────────────────────────────────────────────────────────────

export function GraphView({ activeStageIds }: { activeStageIds: Set<string> }) {
  const { state: appState } = useApp();

  const { baseNodes, edges, stages, allOutputNorms, projStart, projEnd } = useMemo(() => {
    const projectStart = appState.projectStart;
    const minOffset = appState.minOffset;
    const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' });
    const stages: GStage[] = appState.stages.map(st => ({ id: st.id, label: st.title, color: st.color }));
    const baseNodes: GNode[] = [];
    appState.stages.forEach(stage => {
      stage.subprocesses.forEach(sub => {
        const startD = offsetToDate(sub.startOffset, projectStart, minOffset);
        const endD   = offsetToDate(sub.endOffset,   projectStart, minOffset);
        baseNodes.push({
          id: sub.id, name: sub.title, stageId: stage.id, stageColor: stage.color, stageLabel: stage.title,
          dept: sub.responsible, startDate: fmt(startD), endDate: fmt(endD),
          durationDays: Math.max(0, sub.endOffset - sub.startOffset),
          stepsCount: sub.operations.length, inputs: [...sub.ioIn], outputs: [...sub.ioOut], x: 60, y: 60,
        });
      });
    });
    const allOutputNorms = new Set<string>();
    baseNodes.forEach(n => n.outputs.forEach(o => allOutputNorms.add(norm(o))));
    const edges: GEdge[] = [];
    baseNodes.forEach(a => {
      a.outputs.forEach(out => {
        baseNodes.forEach(b => {
          if (a.id === b.id) return;
          if (b.inputs.some(inp => norm(inp) === norm(out)))
            edges.push({ id: `${a.id}-${b.id}-${edges.length}`, from: a.id, to: b.id, artifact: out });
        });
      });
    });
    const allOff = appState.stages.flatMap(st => st.subprocesses.flatMap(s => [s.startOffset, s.endOffset]));
    return { baseNodes, edges, stages, allOutputNorms,
      projStart: allOff.length ? Math.min(...allOff) : minOffset,
      projEnd:   allOff.length ? Math.max(...allOff) : minOffset };
  }, [appState.stages, appState.projectStart, appState.minOffset]);

  const nodesRef   = useRef<GNode[]>([]);
  const edgesRef   = useRef<GEdge[]>([]);
  const gs = useRef({ focusId: null as string|null, selectedArtifact: null as string|null, depth: 1, filterMode: 'hide' as 'dim'|'hide', zoom: 0.6, panX: 60, panY: 30, activeStages: new Set<string>(), canvasW: 6000, canvasH: 3000 });
  const [, setRev] = useState(0);
  const invalidate = useCallback(() => setRev(r=>r+1), []);

  const [depth, setDepth]           = useState(1);
  const [filterMode, setFilterMode] = useState<'dim'|'hide'>('hide');
  const [search, setSearch]         = useState('');

  const canvasWrapRef       = useRef<HTMLDivElement>(null);
  const canvasRef           = useRef<HTMLDivElement>(null);
  const edgesSvgRef         = useRef<SVGSVGElement|null>(null);
  const minimapSvgRef       = useRef<SVGSVGElement|null>(null);
  const tooltipRef          = useRef<HTMLDivElement>(null);
  const savedPositionsRef   = useRef<Map<string,{x:number;y:number}>|null>(null);

  const byId = useCallback((id: string) => nodesRef.current.find(n=>n.id===id), []);

  const applyTransform = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    c.style.transform = `translate(${gs.current.panX}px,${gs.current.panY}px) scale(${gs.current.zoom})`;
  }, []);

  const ensureCanvasBounds = useCallback(() => {
    const PAD = 600; let w = 6000, h = 3000;
    nodesRef.current.forEach(n => { w = Math.max(w, n.x+NODE_W+PAD); h = Math.max(h, n.y+nodeHeight(n)+PAD); });
    if (w===gs.current.canvasW && h===gs.current.canvasH) return;
    gs.current.canvasW = w; gs.current.canvasH = h;
    if (canvasRef.current) { canvasRef.current.style.width=w+'px'; canvasRef.current.style.height=h+'px'; }
    if (edgesSvgRef.current) { edgesSvgRef.current.setAttribute('width',String(w)); edgesSvgRef.current.setAttribute('height',String(h)); }
    if (minimapSvgRef.current) minimapSvgRef.current.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }, []);

  const renderMiniMap = useCallback(() => {
    const svg = minimapSvgRef.current; if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const focus = gs.current.focusId;
    const nbrs = focus ? getNeighbors(focus, gs.current.depth, edgesRef.current) : new Map();
    nodesRef.current.forEach(n => {
      const isFocus = focus===n.id; const isN = nbrs.has(n.id)&&!isFocus;
      const r = svgEl('rect');
      setAttrs(r, { x:String(n.x), y:String(n.y), width:String(NODE_W), height:String(nodeHeight(n)), fill:n.stageColor, opacity:focus?(isFocus||isN?'1':'0.25'):'1', rx:'14' });
      svg.appendChild(r);
    });
    const wrap = canvasWrapRef.current?.getBoundingClientRect();
    if (wrap) {
      const vr = svgEl('rect');
      setAttrs(vr, { x:String(-gs.current.panX/gs.current.zoom), y:String(-gs.current.panY/gs.current.zoom), width:String(wrap.width/gs.current.zoom), height:String(wrap.height/gs.current.zoom), fill:'rgba(241,196,15,0.1)', stroke:'#f1c40f', 'stroke-width':'8' });
      svg.appendChild(vr);
    }
  }, []);

  const renderEdges = useCallback(() => {
    const svg = edgesSvgRef.current; if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const defs = svgEl('defs');
    const marker = svgEl('marker');
    setAttrs(marker, { id:'arr', viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'6', markerHeight:'6', orient:'auto-start-reverse' });
    const markerPath = svgEl('path'); markerPath.setAttribute('d','M0 0 L10 5 L0 10 z'); markerPath.setAttribute('fill','context-stroke');
    marker.appendChild(markerPath); defs.appendChild(marker); svg.appendChild(defs);

    const focus = gs.current.focusId;
    const nbrs  = focus ? getNeighbors(focus, gs.current.depth, edgesRef.current) : new Map();
    const selKey = gs.current.selectedArtifact ? norm(gs.current.selectedArtifact) : null;
    const portsByNode = new Map<string,{portsIn:Port[];portsOut:Port[]}>();
    nodesRef.current.forEach(n => portsByNode.set(n.id, computePorts(n, allOutputNorms)));

    const hideMode = gs.current.filterMode === 'hide';
    edgesRef.current.forEach(e => {
      const a=byId(e.from), b=byId(e.to); if (!a||!b) return;
      if (hideMode && (!gs.current.activeStages.has(a.stageId) || !gs.current.activeStages.has(b.stageId))) return;
      const ap=portsByNode.get(a.id), bp=portsByNode.get(b.id);
      const src=ap?.portsOut.find(p=>norm(p.name)===norm(e.artifact));
      const dst=bp?.portsIn.find(p=>norm(p.name)===norm(e.artifact));
      if (!src||!dst) return;
      const color = colorForArtifact(e.artifact);
      const isFocusEdge = focus ? (e.from===focus||e.to===focus) : false;
      const isInNbr     = focus ? (nbrs.has(a.id)&&nbrs.has(b.id)) : true;
      const isSel       = selKey ? norm(e.artifact)===selKey : false;
      let opacity=1, sw=1.7;
      if (selKey) { if(isSel){opacity=1;sw=2.6;} else {opacity=0.18;sw=1.3;} }
      else if (focus) { if(isFocusEdge){opacity=1;sw=2.2;} else if(isInNbr){opacity=0.7;sw=1.7;} else {opacity=0.22;sw=1.3;} }

      const x1=src.x, y1=src.y, x2=dst.x, y2=dst.y;
      const dx=Math.max(60,(x2-x1)*0.5);
      const d=`M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`;
      const g=svgEl('g'); g.setAttribute('style','cursor:pointer');

      const hit=svgEl('path'); setAttrs(hit,{d,stroke:'transparent','stroke-width':'10',fill:'none','pointer-events':'all'}); g.appendChild(hit);
      const path=svgEl('path'); setAttrs(path,{d,stroke:color,'stroke-width':String(sw),opacity:String(opacity),fill:'none','marker-end':'url(#arr)','stroke-linecap':'round'}); g.appendChild(path);

      const midX=(x1+x2)/2, midY=(y1+y2)/2;
      g.addEventListener('mouseenter',()=>{
        path.setAttribute('stroke-width',String(Math.max(sw*1.7,3))); path.setAttribute('opacity','1');
        const tt=tooltipRef.current;
        if (tt) { tt.textContent=e.artifact; tt.style.left=(gs.current.panX+midX*gs.current.zoom)+'px'; tt.style.top=(gs.current.panY+midY*gs.current.zoom)+'px'; tt.style.opacity='1'; }
      });
      g.addEventListener('mouseleave',()=>{
        path.setAttribute('stroke-width',String(sw)); path.setAttribute('opacity',String(opacity));
        if (tooltipRef.current) tooltipRef.current.style.opacity='0';
      });
      g.addEventListener('click',(ev)=>{
        ev.stopPropagation();
        gs.current.selectedArtifact=e.artifact; gs.current.focusId=null;
        renderAll(); invalidate();
      });
      svg.appendChild(g);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOutputNorms, byId, invalidate]);

  // Build node card DOM without innerHTML
  const buildNodeEl = useCallback((n: GNode, focus: string|null, nbrs: Map<string,number>, maxDur: number): HTMLDivElement => {
    const isFocus = focus===n.id;
    const isNbr   = nbrs.has(n.id) && !isFocus;
    const isActive = gs.current.activeStages.has(n.stageId);

    // Compute opacity / visibility
    const hideMode = gs.current.filterMode === 'hide';
    let opacity = 1;
    let hidden = false;
    if (!isActive) {
      if (hideMode) { hidden = true; }
      else { opacity = 0.12; }
    } else if (focus && !isFocus && !isNbr) {
      opacity = 0.18;
    }
    if (search) {
      const q = norm(search);
      const match = norm(n.name).includes(q)||n.inputs.some(i=>norm(i).includes(q))||n.outputs.some(o=>norm(o).includes(q));
      if (!match) { if (hideMode) hidden = true; else opacity = 0.12; }
    }

    let border = 'rgba(230,236,242,.12)', shadow = '0 1px 0 rgba(255,255,255,0.03),0 4px 12px rgba(0,0,0,0.25)';
    if (isFocus)    { border='#f1c40f'; shadow='0 0 0 2px #f1c40f,0 0 30px rgba(241,196,15,0.25),0 8px 24px rgba(0,0,0,0.4)'; }
    else if (isNbr) { border='#f1c40f'; shadow='0 0 0 1px rgba(241,196,15,0.25),0 6px 18px rgba(0,0,0,0.35)'; }

    const wrap = el('div', `position:absolute;left:${n.x}px;top:${n.y}px;width:${NODE_W}px;height:${nodeHeight(n)}px;background:#20262f;border:1px solid ${border};border-radius:12px;cursor:grab;box-shadow:${shadow};opacity:${opacity};transition:opacity .18s,box-shadow .18s,border-color .18s;overflow:visible;${hidden?'display:none;':''}`);
    wrap.className = 'g-node';
    wrap.dataset.id = n.id;

    // ── head
    const head = el('div', `padding:10px 12px;background:${n.stageColor};border-radius:11px 11px 0 0;`);
    const namEl = el('div', 'font-size:13.5px;font-weight:600;line-height:1.25;letter-spacing:-0.005em;color:#fff;');
    namEl.textContent = n.name;
    head.appendChild(namEl);
    wrap.appendChild(head);

    // ── body
    const body = el('div', 'padding:10px 12px 12px;');
    const dept = el('div', 'font-size:12px;color:#7a8fa8;margin-top:2px;');
    dept.textContent = n.dept || '—';
    body.appendChild(dept);

    const dates = el('div', 'font-family:ui-monospace,monospace;font-size:11.5px;color:#e0e6ef;margin-top:6px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;');
    const dateSpan = el('span');
    dateSpan.textContent = n.startDate + ' → ' + n.endDate;
    const durSpan = el('span', 'color:#7a8fa8;font-size:11px;');
    durSpan.textContent = '· ' + n.durationDays + ' ' + plural(n.durationDays, ['день','дня','дней']);
    dates.appendChild(dateSpan); dates.appendChild(durSpan);
    body.appendChild(dates);

    // Duration bar
    const barW = Math.max(2, maxDur > 0 ? (n.durationDays/maxDur)*100 : 2);
    const barColor = (isFocus||isNbr) ? '#f1c40f' : 'rgba(255,255,255,0.55)';
    const barTrack = el('div', 'position:relative;margin-top:8px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;border:1px solid rgba(255,255,255,0.04);');
    const barFill  = el('div', `position:absolute;top:0;bottom:0;left:0;width:${barW}%;background:${barColor};border-radius:2px;`);
    barTrack.appendChild(barFill); body.appendChild(barTrack);

    // Counters
    const counters = el('div', 'display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;');
    const cDefs: [string, number, [string,string,string]][] = [
      ['M5 12h14M5 12l5-5M5 12l5 5', n.inputs.length,  ['вход','входа','входов']],
      ['M5 12h14M19 12l-5-5M19 12l-5 5', n.outputs.length, ['выход','выхода','выходов']],
      ['M3 6h18M3 12h18M3 18h18', n.stepsCount, ['шаг','шага','шагов']],
    ];
    cDefs.forEach(([path, count, forms]) => {
      const c = el('span','display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#7a8fa8;');
      c.appendChild(icon(path));
      const num = el('b','color:#e0e6ef;'); num.textContent = String(count);
      c.appendChild(num);
      const lbl = document.createTextNode(' ' + plural(count, forms));
      c.appendChild(lbl);
      counters.appendChild(c);
    });
    body.appendChild(counters);
    wrap.appendChild(body);

    // ── Ports
    const { portsIn, portsOut } = computePorts(n, allOutputNorms);
    const selKey = gs.current.selectedArtifact ? norm(gs.current.selectedArtifact) : null;
    [...portsIn, ...portsOut].forEach(p => {
      const isSel = selKey && norm(p.name)===selKey;
      const dot = el('div', `position:absolute;width:14px;height:14px;border-radius:50%;background:${p.color};border:2.5px solid #20262f;cursor:pointer;z-index:25;top:${p.ly-7}px;${p.side==='in'?'left:-10px;':'right:-10px;'}transition:transform .12s,box-shadow .12s;${isSel?'transform:scale(1.55);box-shadow:0 0 0 3px rgba(255,255,255,0.18);':''}`);
      dot.title = p.name + (p.isExt ? ' · внешний' : '');
      if (p.isExt) dot.style.background = `repeating-linear-gradient(45deg,${p.color},${p.color} 1.5px,rgba(0,0,0,0.45) 1.5px,rgba(0,0,0,0.45) 3px)`;
      dot.addEventListener('mousedown', ev => ev.stopPropagation());
      dot.addEventListener('click', ev => {
        ev.stopPropagation();
        gs.current.selectedArtifact = p.name; gs.current.focusId = null;
        renderAll(); invalidate();
      });
      wrap.appendChild(dot);
    });

    return wrap;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOutputNorms, invalidate, search]);

  const renderAll = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.querySelectorAll('.g-node').forEach(e=>e.remove());
    const focus = gs.current.focusId;
    const nbrs  = focus ? getNeighbors(focus, gs.current.depth, edgesRef.current) : new Map();
    const maxDur = Math.max(1, ...nodesRef.current.map(n=>n.durationDays));
    nodesRef.current.forEach(n => {
      const nodeEl = buildNodeEl(n, focus, nbrs, maxDur);
      nodeEl.addEventListener('mousedown', (ev) => {
        if (ev.button!==0) return; ev.stopPropagation();
        const sx=ev.clientX, sy=ev.clientY, snx=n.x, sny=n.y; let dragging=false;
        const onMove=(mv: MouseEvent)=>{
          const dx=mv.clientX-sx, dy=mv.clientY-sy;
          if (!dragging && Math.hypot(dx,dy)>4) { dragging=true; nodeEl.style.cursor='grabbing'; nodeEl.style.borderColor='#f1c40f'; nodeEl.style.zIndex='20'; document.body.style.userSelect='none'; }
          if (dragging) { n.x=snx+dx/gs.current.zoom; n.y=sny+dy/gs.current.zoom; nodeEl.style.left=n.x+'px'; nodeEl.style.top=n.y+'px'; ensureCanvasBounds(); renderEdges(); renderMiniMap(); }
        };
        const onUp=()=>{
          window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp);
          document.body.style.userSelect=''; nodeEl.style.cursor='grab'; nodeEl.style.zIndex='';
          if (dragging) { persistPositions(); }
          else { gs.current.focusId=n.id; gs.current.selectedArtifact=null; renderAll(); invalidate(); centerOn(n.id); }
        };
        window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
      });
      canvas.appendChild(nodeEl);
    });
    renderEdges(); renderMiniMap(); ensureCanvasBounds(); applyTransform();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildNodeEl, renderEdges, renderMiniMap, ensureCanvasBounds, applyTransform, invalidate]);

  const centerOn = useCallback((id: string) => {
    const n=byId(id); if (!n||!canvasWrapRef.current) return;
    const wrap=canvasWrapRef.current.getBoundingClientRect();
    const cx=n.x+NODE_W/2, cy=n.y+nodeHeight(n)/2;
    const tx=wrap.width/2-cx*gs.current.zoom, ty=wrap.height/2-cy*gs.current.zoom;
    const sx=gs.current.panX, sy=gs.current.panY, t0=performance.now(), dur=280;
    const step=(t:number)=>{ const p=Math.min(1,(t-t0)/dur); const e=1-Math.pow(1-p,3); gs.current.panX=sx+(tx-sx)*e; gs.current.panY=sy+(ty-sy)*e; applyTransform(); renderMiniMap(); if(p<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [byId, applyTransform, renderMiniMap]);

  const fitToScreen = useCallback(() => {
    const wrap=canvasWrapRef.current?.getBoundingClientRect(); if(!wrap||!nodesRef.current.length) return;
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    nodesRef.current.forEach(n=>{ mnX=Math.min(mnX,n.x); mnY=Math.min(mnY,n.y); mxX=Math.max(mxX,n.x+NODE_W); mxY=Math.max(mxY,n.y+nodeHeight(n)); });
    const pad=60, W=(mxX-mnX)+40, H=(mxY-mnY)+40;
    gs.current.zoom=Math.min((wrap.width-pad*2)/W,(wrap.height-pad*2)/H,1);
    gs.current.panX=(wrap.width-W*gs.current.zoom)/2-(mnX-20)*gs.current.zoom;
    gs.current.panY=(wrap.height-H*gs.current.zoom)/2-(mnY-20)*gs.current.zoom;
    applyTransform(); renderMiniMap();
  }, [applyTransform, renderMiniMap]);

  const fitVisible = useCallback(() => {
    const wrap = canvasWrapRef.current?.getBoundingClientRect();
    const visible = nodesRef.current.filter(n => gs.current.activeStages.has(n.stageId));
    if (!wrap || !visible.length) return;
    let mnX=Infinity, mnY=Infinity, mxX=-Infinity, mxY=-Infinity;
    visible.forEach(n => { mnX=Math.min(mnX,n.x); mnY=Math.min(mnY,n.y); mxX=Math.max(mxX,n.x+NODE_W); mxY=Math.max(mxY,n.y+nodeHeight(n)); });
    const pad=60, W=(mxX-mnX)+40, H=(mxY-mnY)+40;
    gs.current.zoom = Math.min((wrap.width-pad*2)/W, (wrap.height-pad*2)/H, 1);
    gs.current.panX = (wrap.width-W*gs.current.zoom)/2-(mnX-20)*gs.current.zoom;
    gs.current.panY = (wrap.height-H*gs.current.zoom)/2-(mnY-20)*gs.current.zoom;
    applyTransform(); renderMiniMap();
  }, [applyTransform, renderMiniMap]);

  const persistPositions = useCallback(() => {
    try { const pos: Record<string,{x:number;y:number}> = {}; nodesRef.current.forEach(n=>{pos[n.id]={x:n.x,y:n.y};}); localStorage.setItem('graph-view-node-positions',JSON.stringify(pos)); } catch {}
  }, []);

  const doAutoLayout = useCallback(() => {
    autoLayout(nodesRef.current, edgesRef.current);
    persistPositions(); ensureCanvasBounds(); renderAll();
    setTimeout(()=>{ if(gs.current.focusId) centerOn(gs.current.focusId); }, 30);
  }, [persistPositions, ensureCanvasBounds, renderAll, centerOn]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    nodesRef.current = baseNodes.map(n=>({...n}));
    edgesRef.current = edges;
    gs.current.activeStages = new Set(stages.map(s=>s.id));
    try {
      const saved = JSON.parse(localStorage.getItem('graph-view-node-positions')||'{}');
      let any = false;
      nodesRef.current.forEach(n=>{ if(saved[n.id]){n.x=saved[n.id].x;n.y=saved[n.id].y;any=true;} });
      if (!any) autoLayout(nodesRef.current, edgesRef.current);
    } catch { autoLayout(nodesRef.current, edgesRef.current); }
    ensureCanvasBounds(); renderAll(); setTimeout(()=>fitToScreen(), 80);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseNodes, edges, stages]);

  useEffect(() => { gs.current.depth=depth; renderAll(); }, [depth, renderAll]);
  useEffect(() => {
    gs.current.filterMode = filterMode;
    if (filterMode !== 'hide' && savedPositionsRef.current) {
      nodesRef.current.forEach(n => { const s=savedPositionsRef.current!.get(n.id); if(s){n.x=s.x;n.y=s.y;} });
      savedPositionsRef.current = null;
      ensureCanvasBounds();
      setTimeout(() => fitToScreen(), 80);
    }
    renderAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, renderAll]);
  useEffect(() => { renderAll(); }, [search, renderAll]);
  useEffect(() => {
    gs.current.activeStages = activeStageIds;
    if (gs.current.filterMode === 'hide') {
      const visNodes = nodesRef.current.filter(n => activeStageIds.has(n.stageId));
      if (visNodes.length > 0) {
        if (!savedPositionsRef.current) {
          savedPositionsRef.current = new Map(nodesRef.current.map(n => [n.id, {x:n.x, y:n.y}]));
        }
        const visIds = new Set(visNodes.map(n => n.id));
        autoLayout(visNodes, edgesRef.current.filter(e => visIds.has(e.from) && visIds.has(e.to)));
        ensureCanvasBounds();
        setTimeout(() => fitVisible(), 80);
      }
    }
    renderAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStageIds, stages, renderAll]);


  // ── Pan / zoom ────────────────────────────────────────────────────────────

  useEffect(() => {
    const wrap=canvasWrapRef.current; if(!wrap) return;
    let panning=false,sx=0,sy=0,opx=0,opy=0;
    const onDown=(e:MouseEvent)=>{ const t=e.target as HTMLElement; if(t.closest('.g-node')||t.closest('.g-minimap')||t.closest('.g-ctrls')) return; panning=true; sx=e.clientX;sy=e.clientY;opx=gs.current.panX;opy=gs.current.panY; wrap.style.cursor='grabbing'; };
    const onMove=(e:MouseEvent)=>{ if(!panning) return; gs.current.panX=opx+(e.clientX-sx); gs.current.panY=opy+(e.clientY-sy); applyTransform(); };
    const onUp=(e:MouseEvent)=>{
      if(panning && Math.hypot(e.clientX-sx,e.clientY-sy)<4){
        if(gs.current.selectedArtifact){gs.current.selectedArtifact=null;renderAll();invalidate();}
        else if(gs.current.focusId){gs.current.focusId=null;renderAll();invalidate();}
      }
      panning=false; wrap.style.cursor='';
    };
    const onWheel=(e:WheelEvent)=>{ e.preventDefault(); const nz=Math.min(2,Math.max(0.25,gs.current.zoom*(1+(-e.deltaY*0.0012)))); const r=wrap.getBoundingClientRect(); const mx=e.clientX-r.left,my=e.clientY-r.top; const cx=(mx-gs.current.panX)/gs.current.zoom,cy=(my-gs.current.panY)/gs.current.zoom; gs.current.zoom=nz; gs.current.panX=mx-cx*nz; gs.current.panY=my-cy*nz; applyTransform(); renderMiniMap(); };
    wrap.addEventListener('mousedown',onDown); window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp); wrap.addEventListener('wheel',onWheel,{passive:false});
    return ()=>{ wrap.removeEventListener('mousedown',onDown); window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); wrap.removeEventListener('wheel',onWheel); };
  }, [applyTransform, renderMiniMap]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey=(e:KeyboardEvent)=>{
      if (e.key==='Escape') {
        if(gs.current.selectedArtifact){gs.current.selectedArtifact=null;renderAll();invalidate();}
        else if(gs.current.focusId){gs.current.focusId=null;renderAll();invalidate();}
      }
    };
    window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey);
  }, [renderAll, invalidate]);

  // ── Side panel ────────────────────────────────────────────────────────────

  const sidePanelContent = (() => {
    const { focusId, selectedArtifact } = gs.current;
    const spRow = (k: string, v: string) => (
      <><div style={{color:'#7a8fa8',textTransform:'uppercase',fontSize:10.5,letterSpacing:'0.06em'}}>{k}</div><div>{v}</div></>
    );
    const pill = (count: number) => <span style={{background:'rgba(230,236,242,.08)',color:'#7a8fa8',padding:'1px 7px',borderRadius:999,fontSize:10,marginLeft:6}}>{count}</span>;
    const navBtn = (node: GNode|null, dir: string) => (
      <button disabled={!node} onClick={()=>{if(node){gs.current.focusId=node.id;gs.current.selectedArtifact=null;renderAll();invalidate();centerOn(node.id);}}}
        style={{flex:1,padding:'8px 10px',background:'#1a1f2a',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,color:'#e0e6ef',cursor:node?'pointer':'not-allowed',fontSize:12,textAlign:'left',fontFamily:'inherit',opacity:node?1:0.4}}>
        <span style={{color:'#7a8fa8',fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:2}}>{dir}</span>
        {node ? node.name : 'нет'}
      </button>
    );
    const chipBtn = (node: GNode) => (
      <button key={node.id} onClick={()=>{gs.current.focusId=node.id;gs.current.selectedArtifact=null;renderAll();invalidate();centerOn(node.id);}}
        style={{background:'#262d38',border:'1px solid rgba(230,236,242,.10)',borderRadius:6,padding:'2px 8px',cursor:'pointer',fontSize:11.5,fontFamily:'inherit',color:'#e0e6ef'}}>{node.name}</button>
    );
    const linkBtn = (node: GNode) => (
      <button key={node.id} onClick={()=>{gs.current.focusId=node.id;gs.current.selectedArtifact=null;renderAll();invalidate();centerOn(node.id);}}
        style={{background:'transparent',border:0,padding:0,cursor:'pointer',fontFamily:'inherit',color:'#5b9cf6',fontSize:'inherit',textDecoration:'underline',textAlign:'left',lineHeight:'inherit'}}>{node.name}</button>
    );
    const artRow = (name: string, idx: number, below: React.ReactNode) => (
      <div key={idx} style={{padding:'8px 10px',background:'#1a1f2a',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,marginBottom:6}}>
        <div style={{fontSize:12.5,color:'#e0e6ef'}}>{name}</div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4,fontSize:11.5,color:'#7a8fa8',flexWrap:'wrap'}}>{below}</div>
      </div>
    );
    const secHead = (label: string, count: number) => (
      <div style={{fontSize:11,fontWeight:600,color:'#7a8fa8',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>{label}{pill(count)}</div>
    );
    const closeBtn = (onClick: ()=>void) => (
      <button onClick={onClick} style={{position:'absolute',top:14,right:14,background:'transparent',border:0,color:'#7a8fa8',cursor:'pointer',padding:4,borderRadius:6,fontSize:16}}>✕</button>
    );

    if (selectedArtifact) {
      const color = colorForArtifact(selectedArtifact);
      const sources = nodesRef.current.filter(n=>n.outputs.some(o=>norm(o)===norm(selectedArtifact)));
      const targets = nodesRef.current.filter(n=>n.inputs.some(i=>norm(i)===norm(selectedArtifact)));
      return (
        <div>
          <div style={{padding:'18px 20px 14px',borderBottom:'1px solid rgba(230,236,242,.10)',position:'relative'}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:999,fontSize:11,fontWeight:600,background:color+'25',color}}><span style={{width:9,height:9,borderRadius:'50%',background:color,display:'inline-block'}}/> Артефакт</div>
            <div style={{fontSize:18,fontWeight:600,margin:'8px 0 2px',lineHeight:1.25}}>{selectedArtifact}</div>
            <div style={{color:'#7a8fa8',fontSize:13}}>Поток данных между подпроцессами</div>
            {closeBtn(()=>{gs.current.selectedArtifact=null;renderAll();invalidate();})}
          </div>
          <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(230,236,242,.10)'}}>
            {secHead('Источник',sources.length)}
            {sources.length===0 && <div style={{color:'#7a8fa8',fontSize:12,padding:'10px 0'}}>Внешний артефакт</div>}
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{sources.map(s=>chipBtn(s))}</div>
          </div>
          <div style={{padding:'14px 20px'}}>
            {secHead('Получатели',targets.length)}
            {targets.length===0 && <div style={{color:'#7a8fa8',fontSize:12,padding:'10px 0'}}>Нет потребителей</div>}
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{targets.map(t=>chipBtn(t))}</div>
          </div>
        </div>
      );
    }

    if (!focusId) {
      return (
        <div style={{padding:'40px 24px',textAlign:'center',color:'#7a8fa8'}}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
          <div style={{color:'#7a8fa8',fontSize:14,fontWeight:500,margin:'12px 0 4px'}}>Выберите подпроцесс или связь</div>
          <div style={{fontSize:12}}>Кликните на узел графа, чтобы увидеть его входы, выходы и соседей.</div>
        </div>
      );
    }

    const n = nodesRef.current.find(nn=>nn.id===focusId); if (!n) return null;
    const inputsW = n.inputs.map(inp => { const isExt=!allOutputNorms.has(norm(inp)); const srcs=isExt?[]:nodesRef.current.filter(o=>o.id!==n.id&&o.outputs.some(oo=>norm(oo)===norm(inp))); return {name:inp,isExt,srcs}; });
    const outputsW = n.outputs.map(out => { const tgts=nodesRef.current.filter(o=>o.id!==n.id&&o.inputs.some(i=>norm(i)===norm(out))); return {name:out,tgts}; });
    const upstream   = edgesRef.current.filter(e=>e.to===n.id).map(e=>nodesRef.current.find(nn=>nn.id===e.from)).filter(Boolean) as GNode[];
    const downstream = edgesRef.current.filter(e=>e.from===n.id).map(e=>nodesRef.current.find(nn=>nn.id===e.to)).filter(Boolean) as GNode[];

    return (
      <div>
        <div style={{padding:'18px 20px 14px',borderBottom:'1px solid rgba(230,236,242,.10)',position:'relative'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:999,fontSize:11,fontWeight:600,background:n.stageColor+'20',color:n.stageColor}}><span style={{width:8,height:8,borderRadius:'50%',background:n.stageColor,display:'inline-block'}}/>{n.stageLabel}</div>
          <div style={{fontSize:18,fontWeight:600,margin:'8px 0 2px',lineHeight:1.25}}>{n.name}</div>
          <div style={{color:'#7a8fa8',fontSize:13}}>{n.dept}</div>
          {closeBtn(()=>{gs.current.focusId=null;renderAll();invalidate();})}
        </div>
        <div style={{padding:'14px 20px',display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 16px',borderBottom:'1px solid rgba(230,236,242,.10)',fontSize:12.5}}>
          {spRow('Старт',n.startDate)}{spRow('Завершение',n.endDate)}{spRow('Длительность',n.durationDays+' '+plural(n.durationDays,['день','дня','дней']))}
        </div>
        <div style={{display:'flex',gap:8,padding:'12px 20px',borderBottom:'1px solid rgba(230,236,242,.10)'}}>
          {navBtn(upstream[0]??null,'← Предыдущий')}{navBtn(downstream[0]??null,'Следующий →')}
        </div>
        <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(230,236,242,.10)'}}>
          {secHead('Входы',n.inputs.length)}
          {inputsW.map((inp,i)=>(
            <div key={i} style={{display:'flex',gap:7,marginBottom:5,fontSize:12.5,lineHeight:1.6,color:'#e0e6ef'}}>
              <span style={{color:'#5b9cf6',flexShrink:0,marginTop:1}}>•</span>
              <span>
                {inp.name}
                {inp.isExt
                  ? <span style={{color:'#7a8fa8',fontStyle:'italic',fontSize:11.5}}> — внешний вход</span>
                  : <><span style={{color:'#7a8fa8',fontSize:11.5}}> ← </span>{inp.srcs.length===0?<span style={{color:'#7a8fa8',fontStyle:'italic'}}>источник не найден</span>:inp.srcs.map(s=>linkBtn(s))}</>
                }
              </span>
            </div>
          ))}
        </div>
        <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(230,236,242,.10)'}}>
          {secHead('Выходы',n.outputs.length)}
          {outputsW.map((out,i)=>(
            <div key={i} style={{display:'flex',gap:7,marginBottom:5,fontSize:12.5,lineHeight:1.6,color:'#e0e6ef'}}>
              <span style={{color:'#5b9cf6',flexShrink:0,marginTop:1}}>•</span>
              <span>
                {out.name}
                {out.tgts.length===0
                  ? <span style={{color:'#7a8fa8',fontStyle:'italic',fontSize:11.5}}> — нет потребителей</span>
                  : <><span style={{color:'#7a8fa8',fontSize:11.5}}> → </span>{out.tgts.map(t=>linkBtn(t))}</>
                }
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  })();

  // ── Count ─────────────────────────────────────────────────────────────────

  const visCount = nodesRef.current.filter(n=>{
    if (!gs.current.activeStages.has(n.stageId)) return false;
    if (search) { const q=norm(search); return norm(n.name).includes(q)||n.inputs.some(i=>norm(i).includes(q))||n.outputs.some(o=>norm(o).includes(q)); }
    return true;
  }).length;

  const cBtn: React.CSSProperties = { width:32,height:32,borderRadius:6,background:'transparent',border:0,color:'#7a8fa8',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#1a1f2a',color:'#e0e6ef',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif',fontSize:14}}>

      {/* Filter toolbar */}
      <div style={{borderBottom:'1px solid rgba(230,236,242,.10)',background:'rgba(13,17,23,.97)',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px 24px',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',background:'#121920',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,padding:'5px 10px',gap:6,minWidth:220}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7a8fa8" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск…" style={{background:'transparent',border:0,color:'#e0e6ef',outline:'none',fontSize:13,flex:1,fontFamily:'inherit'}}/>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,opacity:gs.current.focusId?1:0.4,transition:'opacity .18s'}}>
            <span style={{fontSize:11,color:'#7a8fa8',textTransform:'uppercase',letterSpacing:'0.06em'}}>Глубина</span>
            <div style={{display:'flex',background:'#0f1419',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,padding:2}}>
              {[1,2,3,4,5,99].map(d=>(
                <button key={d} onClick={()=>setDepth(d)} disabled={!gs.current.focusId} style={{padding:'4px 10px',fontSize:12,border:0,background:depth===d?'#26313b':'transparent',color:depth===d?'#e0e6ef':'#7a8fa8',borderRadius:6,cursor:gs.current.focusId?'pointer':'default',fontFamily:'inherit'}}>
                  {d===99?'Все':d}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:11,color:'#7a8fa8',textTransform:'uppercase',letterSpacing:'0.06em'}}>Режим</span>
            <div style={{display:'flex',background:'#0f1419',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,padding:2}}>
              {(['dim','hide'] as const).map(m=>(
                <button key={m} onClick={()=>setFilterMode(m)} style={{padding:'4px 10px',fontSize:12,border:0,background:filterMode===m?'#26313b':'transparent',color:filterMode===m?'#e0e6ef':'#7a8fa8',borderRadius:6,cursor:'pointer',fontFamily:'inherit'}}>
                  {m==='dim'?'Приглушать':'Скрывать'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={doAutoLayout} style={{padding:'4px 10px',borderRadius:999,fontSize:12,border:'1px solid rgba(230,236,242,.10)',color:'#7a8fa8',background:'transparent',cursor:'pointer',fontFamily:'inherit',display:'inline-flex',alignItems:'center',gap:6}}>⥂ Структурировать</button>
          <div style={{flex:1}}/>
          <div style={{fontSize:12,color:'#7a8fa8',background:'#121920',border:'1px solid rgba(230,236,242,.10)',borderRadius:999,padding:'4px 10px'}}>Показано {visCount} из {nodesRef.current.length}</div>
        </div>
      </div>

      {/* Workspace */}
      <div style={{flex:1,display:'flex',minHeight:0}}>
        <div ref={canvasWrapRef} style={{flex:1,position:'relative',overflow:'hidden',background:'#1a1f2a'}}>
          <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(230,236,242,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(230,236,242,0.04) 1px,transparent 1px)',backgroundSize:'40px 40px',pointerEvents:'none'}}/>
          <div className="g-ctrls" style={{position:'absolute',right:20,top:20,display:'flex',flexDirection:'column',gap:4,background:'rgba(13,17,23,.92)',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,padding:4,backdropFilter:'blur(6px)',zIndex:30}}>
            <button onClick={()=>{gs.current.zoom=Math.min(2,gs.current.zoom*1.15);applyTransform();}} style={cBtn}>+</button>
            <button onClick={()=>{gs.current.zoom=Math.max(0.25,gs.current.zoom/1.15);applyTransform();}} style={cBtn}>−</button>
            <button onClick={fitToScreen} title="Вписать в экран" style={cBtn}>⤢</button>
          </div>
          <div ref={canvasRef} style={{position:'absolute',top:0,left:0,transformOrigin:'0 0',width:6000,height:3000,overflow:'visible'}}>
            <svg ref={el=>{edgesSvgRef.current=el;}} style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'visible'}} width="6000" height="3000"/>
          </div>
          <div ref={tooltipRef} style={{position:'absolute',background:'#0d1117',border:'1px solid #f1c40f',color:'#e0e6ef',padding:'4px 8px',borderRadius:6,fontSize:11.5,pointerEvents:'none',transform:'translate(-50%,-100%)',marginTop:-6,whiteSpace:'nowrap',opacity:0,transition:'opacity .12s',zIndex:10,boxShadow:'0 4px 14px rgba(0,0,0,0.4)'}}/>
          <div className="g-minimap" style={{position:'absolute',right:20,bottom:20,width:220,height:130,background:'rgba(13,17,23,.92)',border:'1px solid rgba(230,236,242,.10)',borderRadius:8,overflow:'hidden',backdropFilter:'blur(6px)'}}>
            <svg ref={el=>{minimapSvgRef.current=el;}} style={{width:'100%',height:'100%'}} viewBox="0 0 6000 3000" preserveAspectRatio="xMidYMid meet"/>
          </div>
        </div>
        <aside style={{width:420,flexShrink:0,background:'#20262f',borderLeft:'1px solid rgba(230,236,242,.10)',overflowY:'auto'}}>
          {sidePanelContent}
        </aside>
      </div>
    </div>
  );
}
