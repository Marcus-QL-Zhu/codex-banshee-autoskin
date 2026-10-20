/* Cached Banshee light renderer. Installed only by the verified main renderer.
 * 24fps active pass, bounded software frame cache, no per-frame SVG filters.
 */
(async function installBansheeLights() {
  'use strict';
  window.__CODEX_BANSHEE_LIGHTS__?.cleanup();
  const root=document.documentElement, skin=window.__CODEX_DREAM_SKIN_STATE__;
  let chrome=document.getElementById('codex-dream-skin-chrome');
  let svg=chrome?.querySelector('.dream-banshee-armor-svg');
  if(!svg || !skin || !root.matches('.dream-pack-banshee[data-dream-pack-ready="banshee-v1"]'))return {installed:false};
  if(typeof OffscreenCanvas!=='function'||typeof Path2D!=='function'||typeof ResizeObserver!=='function')return {installed:false};
  const FPS=24, ACTIVE=.16, MAX_BYTES=64*1024*1024;
  const scope='html.codex-dream-skin.dream-pack-banshee[data-dream-pack-ready="banshee-v1"]';
  const style=document.createElement('style');style.id='codex-banshee-lights-style';
  style.textContent=`${scope} #codex-dream-skin-chrome .dream-banshee-cavity-pulse-band,${scope} #codex-dream-skin-chrome .dream-banshee-center-cavity-pulse-field,${scope} #codex-dream-skin-chrome .dream-banshee-conduit-static>path,${scope} [data-dream-surface="composer"]::after{animation:none!important;filter:none!important;opacity:0!important;will-change:auto!important} ${scope} #codex-dream-skin-chrome .dream-banshee-armor-svg{transform:translateZ(0);will-change:transform} #codex-dream-skin-chrome .banshee-raster-light{position:absolute;pointer-events:none;contain:strict;transform:translateZ(0);will-change:transform;} @media(prefers-reduced-motion:reduce),(forced-colors:active){#codex-dream-skin-chrome .banshee-raster-light{display:none!important}}`;
  const host=document.createElement('div');host.className='banshee-raster-host';host.setAttribute('aria-hidden','true');host.setAttribute('inert','');host.style.cssText='position:absolute;inset:0;pointer-events:none';
  let disposed=false,generation=0, timer=0, rebuildTimer=0, cycle=20000, cache=[],last=-2,key='',observedComposer=null,ready=false;
  const stats={fps:FPS,buildMs:0,cacheBytes:0,frames:0,presentations:0,builds:0,rasterScale:0};
  const reduced=matchMedia('(prefers-reduced-motion:reduce)'),forced=matchMedia('(forced-colors:active)');
  const lerp=(table,t)=>{for(let i=1;i<table.length;i++)if(t<=table[i][0]){const a=table[i-1],b=table[i],k=(t-a[0])/(b[0]-a[0]);return a.slice(1).map((v,j)=>v+(b[j+1]-v)*k);}return table.at(-1).slice(1);};
  const centerTable=[[0,0,.68,0],[.01325,.06,.76,0],[.0353,.26,.96,0],[.0662,.72,1.2,4],[.0794,.78,1.22,5],[.12355,.42,1.04,4],[.15,0,.78,0],[1,0,.78,0]];
  const conduitTable=[[0,.26,.7,2],[.0576,.46,.96,4],[.0864,.86,1.36,8],[.1296,.34,.84,3],[.15,.26,.7,2],[1,.26,.7,2]];
  const composerTable=[[0,.08,.72,.02,.5],[.024,.3,.96,.16,.5],[.0576,.78,1.28,.33,.5],[.072,.82,1.3,.24,.34],[.12,.62,1.08,.24,.04],[.1488,0,.82,.24,0],[.15,0,.72,.02,.5],[1,0,.72,.02,.5]];
  function present(){clearTimeout(timer);timer=0;if(disposed||!cache.length||document.visibilityState!=='visible'||reduced.matches||forced.matches)return;const phase=((document.timeline.currentTime-skin.waveEpoch)%cycle+cycle)%cycle;const index=phase<ACTIVE*cycle?Math.min(stats.frames-1,Math.floor(phase*FPS/1000)):-1;if(index!==last){for(const layer of cache)layer.ctx.putImageData(index<0?layer.idle:layer.frames[index],0,0);last=index;stats.presentations++;}timer=setTimeout(present,index<0?cycle-phase+2:Math.max(4,1000/FPS-phase%(1000/FPS)+1));}
  function rgba(rgb,a=1,brightness=1){const nums=rgb.match(/[\d.]+/g).slice(0,3).map(Number);return `rgba(${nums.map(v=>Math.min(255,v*brightness)).join(',')},${a})`;}
  function gradient(ctx,stops,y0,y1,brightness=1,opacity=1,horizontal=false){const g=horizontal?ctx.createLinearGradient(y0,0,y1,0):ctx.createLinearGradient(0,y0,0,y1);for(const s of stops)g.addColorStop(s.offset,rgba(s.color,s.alpha*opacity,brightness));return g;}
  async function rebuild(){
    if(disposed)return;const thisGen=++generation;clearTimeout(timer);
    if(!root.matches('.dream-pack-banshee[data-dream-pack-ready="banshee-v1"]')){host.style.visibility='hidden';return;}
    host.style.visibility='';
    const currentChrome=document.getElementById('codex-dream-skin-chrome');
    const currentSvg=currentChrome?.querySelector('.dream-banshee-armor-svg');
    if(!currentSvg){host.style.visibility='hidden';return;}
    if(currentSvg!==svg){ro.unobserve(chrome);chrome=currentChrome;svg=currentSvg;ro.observe(chrome);mo.observe(svg,{attributes:true,attributeFilter:['viewBox','data-dream-compact-frame']});mo.observe(chrome,{attributes:true,attributeFilter:['style']});key='';}
    const started=performance.now(), box=chrome.getBoundingClientRect(),cs=getComputedStyle(svg);
    const pulse=svg.querySelector('.dream-banshee-cavity-pulse-band'),path=svg.querySelector('#dream-banshee-cavity-pulse-clip>path');
    const composer=document.querySelector('[data-dream-surface="composer"]'),cb=composer?.getBoundingClientRect();
    if(composer!==observedComposer){if(observedComposer)ro.unobserve(observedComposer);if(composer)ro.observe(composer);observedComposer=composer;}
    if(!pulse||!path||box.width<1||box.height<1){host.style.visibility='hidden';return;}
    const stops=[...svg.querySelectorAll('#dream-banshee-cavity-pulse-fill>stop')].map(n=>({offset:Number(n.getAttribute('offset')),color:getComputedStyle(n).stopColor,alpha:Number(getComputedStyle(n).stopOpacity)}));
    const core=getComputedStyle(svg.querySelector('.dream-banshee-conduit-static>path')).stroke,bloom=cs.getPropertyValue('--dream-banshee-emission-bloom-rgb'),bandBloom=cs.getPropertyValue('--dream-banshee-emission-band-bloom-rgb');
    const signature=JSON.stringify([box.width,box.height,devicePixelRatio,path.getAttribute('d'),stops,core,bloom,bandBloom,cb&&[cb.x,cb.y,cb.width,cb.height]]);
    if(signature===key){present();return;}key=signature;
    const cycleText=cs.getPropertyValue('--dream-banshee-wave-cycle').trim();cycle=parseFloat(cycleText)*(cycleText.endsWith('ms')?1:1000)||20000;
    const count=Math.ceil(cycle*ACTIVE/1000*FPS),railWidth=Math.ceil(path.getBBox().x+path.getBBox().width)+1,pulseHeight=Number(pulse.getAttribute('height'));
    const shapes=[];
    for(const right of [false,true])shapes.push({kind:'rail',x:right?box.width-railWidth:0,y:0,w:railWidth,h:box.height,right});
    for(const p of svg.querySelectorAll('.dream-banshee-conduit-static>path')){const b=p.getBBox();shapes.push({kind:'conduit',x:b.x-12,y:b.y-12,w:b.width+24,h:24});}
    if(cb?.width>20)shapes.push({kind:'composer',x:cb.left-box.left+4,y:cb.top-box.top-6,w:cb.width-8,h:14});
    if(svg.getAttribute('data-dream-compact-frame')!=='true'){const p=svg.querySelector('#dream-banshee-center-cavity-clip>path');if(p){const b=p.getBBox();shapes.push({kind:'center',x:b.x,y:b.y,w:b.width,h:b.height,path:p.getAttribute('d')});}}
    const uniqueArea=shapes.filter(s=>!s.right).reduce((v,s)=>v+s.w*s.h,0);
    const scale=Math.min(devicePixelRatio,1.5,Math.sqrt(MAX_BYTES/(4*(count+1)*uniqueArea)));
    if(scale<.5){cleanup();throw new Error('Light cache would exceed budget');}
    const built=[];
    for(const shape of shapes){
      const canvas=document.createElement('canvas');canvas.className='banshee-raster-light';canvas.width=Math.ceil(shape.w*scale);canvas.height=Math.ceil(shape.h*scale);canvas.style.cssText=`left:${shape.x}px;top:${shape.y}px;width:${shape.w}px;height:${shape.h}px;${shape.right?'transform:scaleX(-1)':''}`;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(shape.right){built.push({canvas,ctx,frames:built[0].frames,idle:built[0].idle});continue;}
      const off=new OffscreenCanvas(canvas.width,canvas.height),oc=off.getContext('2d',{willReadFrequently:true});
      function draw(t){oc.resetTransform();oc.clearRect(0,0,off.width,off.height);oc.save();oc.scale(scale,scale);
        if(shape.kind==='rail'){
          oc.clip(new Path2D(path.getAttribute('d')));
          if(t<ACTIVE){const y=(-2.56876+(3.50165*t/.15995))*box.height;
            const glowStops=stops.map(s=>({...s,color:`rgb(${bandBloom})`,alpha:s.alpha*.34}));
            oc.fillStyle=gradient(oc,glowStops,y,y+pulseHeight);oc.fillRect(0,0,shape.w,shape.h);
            oc.fillStyle=gradient(oc,stops,y,y+pulseHeight);oc.fillRect(0,0,shape.w,shape.h);
          }
          const occ=svg.querySelector('.dream-banshee-composer-occluder');if(occ){const ox=Number(occ.getAttribute('x')),oy=Number(occ.getAttribute('y')),ow=Number(occ.getAttribute('width')),oh=Number(occ.getAttribute('height'));oc.clearRect(ox,oy,ow,oh);}
        }else if(shape.kind==='conduit'){
          const [a,b,blur]=lerp(conduitTable,t);oc.globalAlpha=a;oc.strokeStyle=rgba(core,1,b);oc.lineWidth=1.2;oc.shadowColor=rgba(bloom,.45);oc.shadowBlur=blur*scale;oc.beginPath();oc.moveTo(12,12);oc.lineTo(shape.w-12,12);oc.stroke();
        }else if(shape.kind==='composer'){
          const [a,b,size,pos]=lerp(composerTable,t);oc.globalAlpha=a;oc.shadowColor=rgba(bloom,.3);oc.shadowBlur=4*scale;
          for(const p of [pos,1-pos]){const w=(shape.w-12)*size,x=6+(shape.w-12-w)*p;const g=oc.createLinearGradient(x,0,x+w,0);for(const [o,alpha] of [[0,0],[.18,.22],[.5,.76],[.82,.22],[1,0]])g.addColorStop(o,rgba(bloom,alpha,b));oc.fillStyle=g;oc.fillRect(x,6,w,2);}
        }else{
          const [a,b]=lerp(centerTable,t);oc.globalAlpha=a;oc.translate(-shape.x,-shape.y);oc.clip(new Path2D(shape.path));oc.translate(shape.x,shape.y);oc.fillStyle=gradient(oc,stops,-shape.w,2*shape.w,b,1,true);oc.fillRect(0,0,shape.w,shape.h);
        }
        oc.restore();return oc.getImageData(0,0,off.width,off.height);
      }
      const frames=[];for(let i=0;i<count;i++){frames.push(draw(i/FPS/(cycle/1000)));if(i%12===11){await new Promise(r=>setTimeout(r,0));if(disposed||generation!==thisGen)return;}}
      built.push({canvas,ctx,frames,idle:draw(.16)});
    }
    if(disposed||generation!==thisGen)return;
    host.replaceChildren(...built.map(l=>l.canvas));cache=built;chrome.append(host);document.head.append(style);
    stats.frames=count;stats.cacheBytes=built.filter((_,i)=>i!==1).reduce((n,l)=>n+l.idle.data.byteLength*(count+1),0);stats.rasterScale=scale;stats.buildMs=performance.now()-started;stats.builds++;last=-2;present();
  }
  function schedule(){if(disposed||!ready)return;clearTimeout(rebuildTimer);rebuildTimer=setTimeout(()=>rebuild().catch(error=>{console.error('Banshee cached lights',error);cleanup();}),120);}
  const ro=new ResizeObserver(schedule);ro.observe(chrome);
  const mo=new MutationObserver(schedule);mo.observe(svg,{attributes:true,attributeFilter:['viewBox','data-dream-compact-frame']});mo.observe(root,{attributes:true,attributeFilter:['class','data-dream-fast','data-dream-pack-ready']});mo.observe(chrome,{attributes:true,attributeFilter:['style']});
  const resume=()=>{last=-2;present();};document.addEventListener('visibilitychange',resume);reduced.addEventListener('change',resume);forced.addEventListener('change',resume);
  function cleanup(){if(disposed)return;disposed=true;generation++;clearTimeout(timer);clearTimeout(rebuildTimer);ro.disconnect();mo.disconnect();document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);forced.removeEventListener('change',resume);cache=[];host.remove();style.remove();if(window.__CODEX_BANSHEE_LIGHTS__?.cleanup===cleanup)delete window.__CODEX_BANSHEE_LIGHTS__;}
  window.__CODEX_BANSHEE_LIGHTS__={cleanup,rebuild:schedule,stats,version:1};
  try{await rebuild();ready=true;schedule();}catch(error){cleanup();throw error;}
  return {installed:!disposed,...stats};
})
