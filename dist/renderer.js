import {UNITS, MERCENARIES, HEROES, WAVES} from './data.js';
import {MAP,laneToWorld,worldToLane,routePoints,kingWorld} from './layout.js';
const definitions=Object.fromEntries([...UNITS,...MERCENARIES,...HEROES].map(u=>[u.id,u]));
export const isEntityVisible=e=>!!e&&e.hp>0&&!e.status?.yseraHidden&&!e.status?.yseraRemoved;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const tone=(hex,n)=>{let c=hex?.replace('#','')||'9aad83';if(c.length!==6)c='9aad83';return '#'+[0,2,4].map(i=>clamp(parseInt(c.slice(i,i+2),16)+n,0,255).toString(16).padStart(2,'0')).join('');};
const hash=(x,y)=>{const z=Math.sin(x*127.1+y*311.7)*43758.5453;return z-Math.floor(z);};
export function unitIcon(u,size=40){
  if(!u)return '';
  const c=u.color||'#acc29e',d=tone(c,-45),l=tone(c,35),role=u.role||'frontline';
  let body='';
  if(u.race==='龙族'||/龙|凤凰|狮鹫|雷鸟|飞蛇/.test(u.name))body=`<path d="M20 17 5 8l4 17 10 4 11-2 5-18-15 8Z" fill="${d}"/><path d="m17 9 6-4 5 10-4 9 3 10-10-1-3-11Z" fill="${c}"/><path d="m8 12 10 11M32 12 23 23" stroke="${l}"/>`;
  else if(role==='tank'||u.shape==='square')body=`<path d="m9 15 7-4h10l7 6-3 17H11Z" fill="${d}"/><path d="m11 15 9-4 10 5-4 14H15Z" fill="${c}"/><path d="m14 10 2-5h9l3 7-6 5-8-2Z" fill="${l}"/><path d="M7 18v14l6-3V17Z" fill="${c}"/><path d="M31 16h5v17h-5Z" fill="${d}"/>`;
  else if(['caster','support','control'].includes(role))body=`<path d="m17 11 7-2 9 25H8Z" fill="${d}"/><path d="m17 16 6-3 3 20H14Z" fill="${c}"/><path d="m15 9 6-7 7 10-7 4Z" fill="${l}"/><path d="M32 9v25" stroke="${l}" stroke-width="2"/><path d="m32 3 4 5-4 5-4-5Z" fill="${l}"/>`;
  else if(role==='ranged')body=`<path d="m14 15 11-3 4 19H12Z" fill="${c}"/><path d="m16 11-1-6 10-2 3 9-6 5Z" fill="${l}"/><path d="M30 7q13 12-1 27M30 7v27" stroke="${l}"/><path d="m10 34 5-10m9 0 4 10" stroke="${d}" stroke-width="4"/>`;
  else body=`<path d="m13 14 13-2 6 17-9 4-14-5Z" fill="${c}"/><path d="m15 11 1-7h10l2 9-6 4Z" fill="${l}"/><path d="m12 26-3 9m17-9 5 8" stroke="${d}" stroke-width="4"/><path d="m30 10 3 20" stroke="${l}" stroke-width="3"/>`;
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" style="color:${c}"><ellipse cx="21" cy="35" rx="15" ry="3" fill="#0a1511" opacity=".6"/>${body}</svg>`;
}

export function drawPortrait(canvas,u){
  const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);
  if(!u)u={name:'先知',color:'#b0c3a2',role:'caster',race:'人类'};
  c.save();c.translate(canvas.width/2,canvas.height*.67);drawSprite(c,u,Math.min(canvas.width/2.8,canvas.height/2.2),0,0,true);c.restore();
}
function ellipse(c,x,y,rx,ry,fill){c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function poly(c,points,fill,stroke){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.7;c.stroke();}}
function drawSprite(c,u,r,t,attack=0,portrait=false){
  const color=u.color||'#a0b383',dark=tone(color,-47),light=tone(color,30),role=u.role||'frontline';
  const monster=!!u.isMonster, boss=!!(u.isBoss||u.boss);
  const bob=Math.sin(t*3.1+(u.animationId||0))*(portrait?1:r*.07);
  c.save();c.translate(0,bob);c.lineJoin='round';
  ellipse(c,0,1,r*.9,r*.34,'#091a12aa');
  if(u.isKing){
    c.fillStyle='#353b2b';c.fillRect(-r*1.1,-r*.6,r*2.2,r*.7);
    poly(c,[[-r,-r*.6],[0,-r*1.15],[r,-r*.6],[0,0]],'#777457');
    poly(c,[[-r*.7,-r*1.2],[0,-r*1.6],[r*.7,-r*1.2],[r*.5,-r*.3],[-r*.5,-r*.3]],'#576968','#a7a578');
    poly(c,[[-r*.4,-r*1.8],[r*.4,-r*1.8],[r*.28,-r*1.2],[-r*.28,-r*1.2]],'#c6b88c');
    poly(c,[[-r*.45,-r*2.3],[-r*.24,-r*2],[0,-r*2.6],[r*.24,-r*2],[r*.45,-r*2.3],[r*.32,-r*1.9],[-r*.32,-r*1.9]],'#dfc37a');
    c.strokeStyle='#c8c6ab';c.lineWidth=r*.16;c.beginPath();c.moveTo(r*.9,-r*1.9);c.lineTo(r*.8,-r*.2);c.stroke();
  }else if(/坦克|机枪|机甲|弩车/.test(u.name)){
    poly(c,[[-r,-r*.1],[-r,-r*.65],[r*.6,-r],[r*1.1,-r*.45],[r*.8,0]],dark,'#17261a');
    poly(c,[[-r*.8,-r*.6],[r*.25,-r*1.2],[r,-r*.7],[r*.2,-r*.1]],color);
    c.strokeStyle=light;c.lineWidth=r*.25;c.beginPath();c.moveTo(0,-r*.7);c.lineTo(r*.5+attack*r*.1,-r*1.8);c.stroke();
    for(let i=-1;i<=1;i++)ellipse(c,i*r*.48,-r*.04,r*.22,r*.18,'#1f3025');
  }else if(/龙|凤凰|狮鹫|雷鸟|飞蛇/.test(u.name)){
    const flap=Math.sin(t*5)*r*.2;
    poly(c,[[-r*.2,-r*.7],[-r*1.8,-r*1.5+flap],[-r*1.25,-r*.15],[-r*.2,-r*.1]],dark,'#233425');
    poly(c,[[r*.15,-r*.7],[r*1.7,-r*1.4-flap],[r*1.1,-r*.1],[r*.2,-r*.1]],dark,'#233425');
    poly(c,[[-r*.4,-r*.2],[-r*.35,-r*1.15],[r*.1,-r*1.6],[r*.55,-r*1.1],[r*.35,-r*.2],[r*.9,r*.3]],color);
    poly(c,[[r*.1,-r*1.65],[r*.48,-r*1.9],[r*.78,-r*1.5],[r*.4,-r*1.25]],light);
    c.fillStyle='#ecdc8b';c.fillRect(r*.4,-r*1.6,r*.12,r*.1);
  }else if(monster&&!boss&&u.shape==='circle'){
    for(let i=-1;i<=1;i+=2){c.strokeStyle=dark;c.lineWidth=r*.18;for(let j=0;j<3;j++){c.beginPath();c.moveTo(i*r*.4,-r*.3);c.lineTo(i*r*(.8+j*.12),-r*(.15+j*.18));c.lineTo(i*r*(1+j*.1),r*.07);c.stroke();}}
    ellipse(c,0,-r*.45,r*.68,r*.52,color);ellipse(c,r*.2,-r*.7,r*.28,r*.2,light);
    c.fillStyle='#f3dc86';c.fillRect(-r*.15,-r*.82,r*.11,r*.11);c.fillRect(r*.23,-r*.83,r*.11,r*.11);
  }else{
    const tank=role==='tank'||u.shape==='hex'||boss;
    const width=tank?.65:.43;
    c.strokeStyle=dark;c.lineWidth=r*.27;c.beginPath();c.moveTo(-r*.2,-r*.3);c.lineTo(-r*.35,r*.14);c.moveTo(r*.23,-r*.3);c.lineTo(r*.4,r*.1);c.stroke();
    if(role==='caster'||role==='support'||role==='control'){
      poly(c,[[-r*.26,-r*1.3],[r*.3,-r*1.3],[r*.7,0],[-r*.7,0]],dark,'#14261a');
      poly(c,[[-r*.15,-r*1.25],[r*.2,-r*1.25],[r*.3,-r*.1],[-r*.2,-r*.1]],color);
      c.strokeStyle=light;c.lineWidth=r*.09;c.beginPath();c.moveTo(r*.7,0);c.lineTo(r*.66,-r*1.7);c.stroke();
      ellipse(c,r*.66,-r*1.75,r*.16,r*.2,light);
      if(u.tier>=5||u.shape==='star'){c.strokeStyle=color+'55';c.lineWidth=.7;ellipse(c,0,-r*.5,r*.95,r*.4,color+'13');}
    }else{
      poly(c,[[-r*width,-r*1.12],[0,-r*1.45],[r*width,-r*1.05],[r*.44,-r*.2],[-r*.4,-r*.2]],color,'#18291b');
      poly(c,[[-r*width,-r*1.12],[0,-r*1.25],[-r*.08,-r*.27],[-r*.4,-r*.2]],dark);
      if(role==='ranged'){
        c.strokeStyle=light;c.lineWidth=r*.09;c.beginPath();c.moveTo(r*.75,-r*1.5);c.quadraticCurveTo(r*1.35,-r*.9,r*.75,-r*.2);c.moveTo(r*.75,-r*1.5);c.lineTo(r*.75,-r*.2);c.stroke();
      }else{
        poly(c,[[-r*.72,-r*1.05],[-r*.95,-r*.75],[-r*.7,-r*.23],[-r*.45,-r*.5]],dark,light);
        c.strokeStyle='#cad0b2';c.lineWidth=r*.11;c.beginPath();c.moveTo(r*.55,-r*.45);c.lineTo(r*(.65+attack*.45),-r*(1.6-attack*.5));c.stroke();
      }
    }
    const headY=-r*1.55;
    ellipse(c,0,headY,r*.3,r*.33,light);
    if(tank)poly(c,[[-r*.35,headY],[-r*.3,headY-r*.35],[r*.23,headY-r*.4],[r*.36,headY],[0,headY+r*.15]],dark);
    else if(role==='caster')poly(c,[[-r*.4,headY-r*.1],[r*.03,headY-r*.72],[r*.42,headY-r*.07]],color);
    c.fillStyle=monster?'#dd9d6b':'#182a20';c.fillRect(r*.04,headY-r*.02,r*.12,r*.07);
    if(boss||u.shape==='star'){poly(c,[[-r*.4,headY-r*.27],[-r*.22,headY-r*.6],[0,headY-r*.35],[r*.28,headY-r*.65],[r*.42,headY-r*.26]],'#e1c588');}
  }
  c.restore();
}

export class Battlefield{
  constructor(canvas,onClick){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.camera={x:8,y:10,scale:36};this.width=0;this.height=0;this.state=null;this.hover=null;this.selected=null;this.buildUnit=null;this.spellTarget=null;this.focusLane=0;this.showRoutes=false;this.onClick=onClick;this.pan=null;this.dragged=false;this.pointers=new Map();this.pinch=null;
    new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.pan={x:e.clientX,y:e.clientY,cx:this.camera.x,cy:this.camera.y};this.dragged=false;if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],r=canvas.getBoundingClientRect(),x=(a.x+b.x)/2-r.left,y=(a.y+b.y)/2-r.top;this.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:this.camera.scale,anchor:this.unproject(x,y)};this.pan=null;this.dragged=true;}});
    canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();this.pointerPoint={x:e.clientX-r.left,y:e.clientY-r.top};if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(this.pinch&&this.pointers.size===2){const [a,b]=[...this.pointers.values()],x=(a.x+b.x)/2-r.left,y=(a.y+b.y)/2-r.top;this.camera.scale=clamp(this.pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,this.pinch.distance),3.5,55);const after=this.unproject(x,y);this.camera.x+=this.pinch.anchor.x-after.x;this.camera.y+=this.pinch.anchor.y-after.y;this.hover=null;return;}this.hover=this.hit(e.clientX-r.left,e.clientY-r.top);if(this.pan){const dx=e.clientX-this.pan.x,dy=e.clientY-this.pan.y;if(Math.hypot(dx,dy)>5)this.dragged=true;if(this.dragged){const s=this.camera.scale;this.camera.x=this.pan.cx-dx/s;this.camera.y=this.pan.cy-dy/(s*.78);canvas.classList.add('dragging');}}});
    canvas.addEventListener('pointerup',e=>{if(!this.dragged&&!this.pinch){const r=canvas.getBoundingClientRect();onClick(this.hit(e.clientX-r.left,e.clientY-r.top),e);}this.pointers.delete(e.pointerId);if(!this.pointers.size)this.pinch=null;this.pan=null;canvas.classList.remove('dragging');});
    canvas.addEventListener('pointercancel',e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size)this.pinch=null;this.pan=null;canvas.classList.remove('dragging');});
    canvas.addEventListener('pointerleave',()=>{this.hover=null;this.pointerPoint=null;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,before=this.unproject(px,py);this.camera.scale=clamp(this.camera.scale*Math.exp(-e.deltaY*.001),3.5,55);const after=this.unproject(px,py);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;},{passive:false});
    canvas.addEventListener('keydown',e=>{const k=e.key.toLowerCase(),step=1.8;if(['arrowleft','a'].includes(k))this.camera.x-=step;if(['arrowright','d'].includes(k))this.camera.x+=step;if(['arrowup','w'].includes(k))this.camera.y-=step;if(['arrowdown','s'].includes(k))this.camera.y+=step;});
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;const d=Math.min(window.devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*d);this.canvas.height=Math.round(r.height*d);this.ctx.setTransform(d,0,0,d,0,0);}
  project(x,y){const s=this.camera.scale;return{x:this.width*.5+(x-this.camera.x)*s,y:this.height*.48+(y-this.camera.y)*s*.78};}
  unproject(x,y){const s=this.camera.scale;return{x:this.camera.x+(x-this.width*.5)/s,y:this.camera.y+(y-this.height*.48)/(s*.78)};}
  world(laneId,x,y){if(laneId<8)return laneToWorld(laneId,x,y);const k=kingWorld(laneId-8);return{x:k.x+x-3,y:k.y+y-11.5};}
  entityWorld(e){return Number.isFinite(e.worldX)&&Number.isFinite(e.worldY)?{x:e.worldX,y:e.worldY}:this.world(e.laneId,e.x,e.y);}
  focus(laneId=0){this.focusLane=laneId;if(laneId==='all'){const scale=Math.min((this.width-(this.width>960?280:30))/64,(this.height-85)/(.78*42));this.camera={x:30+(this.width>960?5:0),y:20.5,scale:Math.max(3.5,scale)};return;}if(laneId>=8){const source=this.state?.kings?.[laneId-8],k=Number.isFinite(source?.worldX)?{x:source.worldX,y:source.worldY}:kingWorld(laneId-8);this.camera={x:k.x,y:27,scale:Math.min(34,this.width/23,(this.height-70)/18)};return;}const p=this.world(laneId,3,7.5);this.camera={x:p.x+(this.width>960?4:0),y:p.y,scale:Math.min(43,(this.width-20)/12,(this.height-100)/10)};}
  hit(px,py){const w=this.unproject(px,py);let best=null,bd=21;
    const s=this.state;if(s){if(s.phase==='build')for(const p of s.players){for(const b of p.buildings){const pos=this.world(p.id,b.col+.5,b.row+4.5),screen=this.project(pos.x,pos.y);const d=Math.hypot(screen.x-px,screen.y-py-8);if(d<bd){best={type:'building',buildingId:b.id,playerId:p.id,laneId:p.id,col:b.col,row:b.row};bd=d;}}}if(s.phase!=='build')for(const e of s.entities){if(!isEntityVisible(e))continue;const pos=this.entityWorld(e),screen=this.project(pos.x,pos.y);const d=Math.hypot(screen.x-px,screen.y-py-5);if(d<bd){best={type:'entity',entityId:e.id,laneId:e.laneId};bd=d;}}}
    if(best&&!this.buildUnit)return best;
    if(s&&s.phase!=='build')return best||{type:'terrain',x:w.x,y:w.y};
    const local=worldToLane(w.x,w.y);if(local){const col=Math.floor(local.x),row=Math.floor(local.y-4);if(col>=0&&col<6&&row>=0&&row<8)return{type:'cell',laneId:local.laneId,playerId:local.laneId,col,row};}
    return best||{type:'terrain',x:w.x,y:w.y};
  }
  tile(x,y,color,stroke){const a=this.project(x,y),b=this.project(x+1,y),d=this.project(x,y+1),e=this.project(x+1,y+1);poly(this.ctx,[[a.x,a.y],[b.x,b.y],[e.x,e.y],[d.x,d.y]],color,stroke);}
  region(points,color,stroke){poly(this.ctx,points.map(p=>{const v=this.project(...p);return[v.x,v.y];}),color,stroke);}
  tree(x,y,h=1){const c=this.ctx,p=this.project(x,y),s=this.camera.scale*h;if(p.x<-60||p.x>this.width+60||p.y<-70||p.y>this.height+60)return;ellipse(c,p.x,p.y,s*.7,s*.25,'#0c211488');c.fillStyle='#514d30';c.fillRect(p.x-s*.08,p.y-s*.8,s*.16,s*.8);for(let i=0;i<3;i++){const z=i*.35;poly(c,[[p.x,p.y-s*(2-z)],[p.x-s*(.7-z*.25),p.y-s*(.55-z)],[p.x+s*(.68-z*.2),p.y-s*(.6-z)]],i%2?'#345239':'#29472f','#203f2b');}}
  hedge(x,y){const c=this.ctx,p=this.project(x,y),s=this.camera.scale;if(p.x<-s||p.x>this.width+s||p.y<-s||p.y>this.height+s)return;c.fillStyle='#737963';c.fillRect(p.x-s*.35,p.y-s*.28,s*.7,s*.5);ellipse(c,p.x,p.y-s*.3,s*.46,s*.35,'#1b3923');ellipse(c,p.x-s*.07,p.y-s*.42,s*.37,s*.25,'#31542b');ellipse(c,p.x+s*.15,p.y-s*.43,s*.22,s*.2,'#44613a');}
  flag(lane){const c=this.ctx,w=this.world(lane,.05,10),p=this.project(w.x,w.y),s=this.camera.scale;const color=lane<4?'#7faabb':'#b47862';c.strokeStyle='#adab78';c.lineWidth=1.4;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x,p.y-s*2.7);c.stroke();poly(c,[[p.x,p.y-s*2.7],[p.x+s*.8,p.y-s*2.4],[p.x+s*.65,p.y-s*1.8],[p.x,p.y-s*2]],color);}
  draw(state,now){this.state=state;const c=this.ctx,w=this.width,h=this.height,s=this.camera.scale;c.fillStyle='#233a29';c.fillRect(0,0,w,h);
    // A continuous, lightly textured forest floor anchors every battlefield.
    const ext=Math.ceil((w+h)/Math.max(s,1)),fromX=Math.floor(this.camera.x-ext*.5),toX=Math.ceil(this.camera.x+ext*.5),fromY=Math.floor(this.camera.y-ext*.5),toY=Math.ceil(this.camera.y+ext*.5);
    for(let y=fromY;y<=toY;y+=2)for(let x=fromX;x<=toX;x+=2){const p=this.project(x,y);if(p.x<-s*3||p.x>w+s*3||p.y<-s*3||p.y>h+s*3)continue;const v=hash(x,y);c.fillStyle=v>.5?'#2c4430':'#203925';c.globalAlpha=.24;c.beginPath();c.ellipse(p.x,p.y,s*(.6+v),s*.3,0,0,6.28);c.fill();c.globalAlpha=1;}
    this.region([[-3,31],[64,31],[64,46],[-3,46]],'#263d4b','#455a5d');
    for(let team=0;team<2;team++){const ox=team*34;this.region([[ox,0],[ox+26,0],[ox+26,32],[ox,32]],'#4c5548','#7c7e68');for(let y=0;y<32;y+=2)for(let x=0;x<26;x+=2){const p=this.project(ox+x,y);if(p.x<-s*2||p.x>w||p.y<-s*2||p.y>h)continue;this.tile(ox+x,y,'#5b625324','#8a8c6b16');}}
    // The same traversable rectangles drive the simulation and the terrain.
    for(const r of MAP.regions){if(Number.isInteger(r.laneId))continue;this.region([[r.minX,r.minY],[r.maxX,r.minY],[r.maxX,r.maxY],[r.minX,r.maxY]],'#777969','#a09e80');for(let y=Math.ceil(r.minY);y<r.maxY;y+=2)for(let x=Math.ceil(r.minX);x<r.maxX;x+=2){const p=this.project(x,y);if(p.x<-s*2||p.x>w||p.y<-s*2||p.y>h)continue;this.tile(x,y,'#ffffff05','#a7aa7b22');}}
    for(let lane=0;lane<8;lane++){
      const isOwn=lane===0,sel=this.focusLane===lane;
      for(let y=0;y<12;y++)for(let x=0;x<6;x++){
        const a=this.world(lane,x,y),b=this.world(lane,x+1,y+1),pos={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y)};const v=hash(x+lane*31,y);
        const col=y<3?(v>.5?'#506f3c':'#486737'):(v>.55?'#345b30':'#30572b');
        this.tile(pos.x,pos.y,col,y>=4?(isOwn?'#71835a24':'#64745515'):null);
      }
      const corners=[this.world(lane,0,4),this.world(lane,6,4),this.world(lane,6,12),this.world(lane,0,12)];
      this.region(corners.map(p=>[p.x,p.y]),'#ffffff00',isOwn?'#c3b27399':sel?'#81987988':'#57684d66');
      const a=this.world(lane,3,2),b=this.project(a.x,a.y);c.textAlign='center';c.font=`${clamp(s*.4,8,13)}px system-ui`;c.fillStyle=lane<4?'#b7cdad':'#d4b295';if(s>10)c.fillText(`${lane%4+1} 路${lane===0?' · 你':''} ${lane%2===0?'↓':'↑'}`,b.x,b.y-s*.4);
      this.flag(lane);
      const gate=this.world(lane,3,-.5),gp=this.project(gate.x,gate.y);ellipse(c,gp.x,gp.y,s*1.4,s*.75,'#222e25');ellipse(c,gp.x,gp.y,s*1.13,s*.58,'#101d17');
      c.strokeStyle='#b1a37a77';c.lineWidth=2;c.beginPath();c.ellipse(gp.x,gp.y,s*1.33,s*.7,0,0,Math.PI*2);c.stroke();
      for(let n=0;n<12;n++){for(const side of[-.5,6.5]){const t=this.world(lane,side,n+.5);this.hedge(t.x,t.y);}}
      if(s>20){const exit=this.world(lane,3,11.2),p=this.project(exit.x,exit.y);c.fillStyle='#e0d4a577';c.font='9px system-ui';c.fillText('汇流通道',p.x,p.y);}
    }
    for(let team=0;team<2;team++){
      const king=state.kings[team],pos=Number.isFinite(king.worldX)?{x:king.worldX,y:king.worldY}:kingWorld(team),pt=this.project(pos.x,pos.y);
      const sh=s*.7; c.save();c.translate(pt.x,pt.y);drawSprite(c,{isKing:true},sh,now,0);c.restore();
      if(s>8){this.bar(pt.x,pt.y-sh*2.8,Math.max(30,s*2.2),king.hp/king.maxHp,team===0?'#82b6b4':'#ca8f73');c.fillStyle='#ddd4a5';c.font='10px system-ui';c.textAlign='center';c.fillText(team===0?'联盟国王':'部落国王',pt.x,pt.y+13);}
    }
    if(this.showRoutes){for(let lane=0;lane<8;lane++){const nodes=[this.world(lane,3,.5),this.world(lane,3,11.8),...routePoints(lane)],color=lane<4?'#a4d3c8':'#e2ad91';c.strokeStyle=color+'bb';c.lineWidth=1.4;c.setLineDash([5,5]);c.beginPath();nodes.forEach((v,i)=>{const p=this.project(v.x,v.y);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.stroke();c.setLineDash([]);for(let i=1;i<nodes.length;i++){const a=this.project(nodes[i-1].x,nodes[i-1].y),b=this.project(nodes[i].x,nodes[i].y),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<4)continue;const px=(a.x+b.x)/2,py=(a.y+b.y)/2,ux=dx/d,uy=dy/d;poly(c,[[px+ux*4,py+uy*4],[px-ux*4-uy*3,py-uy*4+ux*3],[px-ux*4+uy*3,py-uy*4-ux*3]],color);}}}
    if(state.phase==='build'){
      const sprites=[];for(const p of state.players)for(const b of p.buildings){const pos=this.world(p.id,b.col+.5,b.row+4.5);sprites.push({...pos,u:definitions[b.unitId],b,p});}sprites.sort((a,b)=>a.x+a.y-b.x-b.y);
      for(const item of sprites){const pt=this.project(item.x,item.y);if(pt.x<-40||pt.x>w+40||pt.y<-70||pt.y>h+30)continue;const selected=this.selected?.buildingId===item.b.id;if(selected)ellipse(c,pt.x,pt.y,s*.5,s*.24,'#e3cf7e55');c.save();c.translate(pt.x,pt.y);if(item.b.construction)c.globalAlpha=.45;drawSprite(c,item.u,s*.36,now+hash(item.b.col,item.b.row)*4,0);c.restore();if(item.b.construction){const task=item.b.construction,remaining=Math.max(0,task.finishAt-state.time);this.bar(pt.x,pt.y-s*.9,Math.max(12,s*.75),1-remaining/task.duration,'#d9bc78');if(s>22){c.fillStyle='#e5d4a2';c.font='9px system-ui';c.textAlign='center';c.fillText(`${Math.ceil(remaining)}s`,pt.x,pt.y-s*1.1);}}}
      for(const p of state.players)if(p.heroId){const pos=this.world(p.id,3.5,9.5),pt=this.project(pos.x,pos.y);c.save();c.translate(pt.x,pt.y);drawSprite(c,definitions[p.heroId],s*.44,now);c.restore();}
    }else{
      for(const job of state.sourceSkillJobs??[]){
        if(job.done||!['vashj_flight','vashj_lightning','vashj_spore','lich_king_dragon','dark_arthas_dragon','dark_arthas_coil','dark_arthas_wind'].includes(job.type))continue;
        const spot=job.type==='dark_arthas_wind'?(job.lastImpact??job):job,p=this.project(spot.x,spot.y),scale=(job.source.distanceScale??1/3)/100;
        c.save();
        if(job.type==='lich_king_dragon'||job.type==='dark_arthas_dragon'){c.translate(p.x,p.y);drawSprite(c,{name:'辛达苟萨',color:'#a9d8ef',role:'ranged'},s*.6,now);}
        else if(job.type==='dark_arthas_coil'){c.fillStyle='#8ee6a8';c.beginPath();c.arc(p.x,p.y,Math.max(3,s*.1),0,Math.PI*2);c.fill();}
        else if(job.type==='vashj_flight'){c.strokeStyle='#a8e8ff';c.lineWidth=2;c.beginPath();c.moveTo(p.x-Math.cos(job.angle)*s*.3,p.y-Math.sin(job.angle)*s*.3*.78);c.lineTo(p.x,p.y);c.stroke();}
        else {const radius=(job.type==='vashj_spore'?200:300)*scale*s;c.fillStyle=job.type==='vashj_spore'?'#b1cd5630':'#86d8f52b';c.strokeStyle=job.type==='vashj_spore'?'#c8da7899':'#9de6ff99';c.lineWidth=1;c.beginPath();c.ellipse(p.x,p.y,radius,radius*.78,0,0,Math.PI*2);c.fill();c.stroke();}
        c.restore();
      }
      const entities=state.entities.filter(isEntityVisible).map(e=>({...e,world:this.entityWorld(e)})).sort((a,b)=>a.world.y-b.world.y);
      for(const e of entities){const p=this.project(e.world.x,e.world.y);if(p.x<-40||p.x>w+40||p.y<-70||p.y>h+30)continue;const def=definitions[e.unitId]||{...WAVES[Math.min(state.wave-1,WAVES.length-1)],name:e.name};const size=s*(e.isBoss?.62:e.isHero?.44:e.side==='defender'?.36:.24);const selected=this.selected?.entityId===e.id;if(selected||e.side==='defender'&&e.ownerId===0){c.strokeStyle=selected?'#e8d78b':'#82b8bf77';c.lineWidth=selected?1.4:.7;c.beginPath();c.ellipse(p.x,p.y,size*1.2,size*.4,0,0,6.28);c.stroke();}c.save();c.translate(p.x,p.y);c.globalAlpha=e.status?.sourceOpacity??1;drawSprite(c,{...def,...e,isMonster:e.side==='monster',animationId:parseInt(e.id?.replace(/\D/g,''),10)||0},size,now,e.pendingAttack?clamp((state.time-e.pendingAttack.startedAt)/Math.max(.001,e.pendingAttack.finishAt-e.pendingAttack.startedAt),0,1)*.8:e.attackCd>e.attackInterval-.22?.8:0);c.restore();if(e.hp<e.maxHp*.98||selected||e.isBoss)this.bar(p.x,p.y-size*2,Math.max(7,size*1.8),e.hp/e.maxHp,e.side==='defender'?(e.team===0?'#98be8c':'#d69e85'):'#c5b478');if(selected&&e.maxMana>0)this.bar(p.x,p.y-size*2+5,Math.max(7,size*1.8),e.mana/e.maxMana,'#6dadd1');if(e.pendingAttack&&s>12)this.bar(p.x,p.y+4,Math.max(10,size*2.1),clamp((state.time-e.pendingAttack.startedAt)/Math.max(.001,e.pendingAttack.finishAt-e.pendingAttack.startedAt),0,1),'#edb66c');}
    }
    if(this.hover?.type==='cell'&&state.phase==='build'){
      const {laneId,col,row}=this.hover;const a=this.world(laneId,col,row+4),b=this.world(laneId,col+1,row+5),pos={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y)};const occupied=state.players[laneId]?.buildings.some(b=>b.col===col&&b.row===row);const valid=laneId===0&&!occupied;this.tile(pos.x,pos.y,valid?'#d3d99835':'#d48f7b44',valid?'#d9d69a':'#b57e62');
      if(this.buildUnit&&laneId===0){const b=this.world(laneId,col+.5,row+4.5),pt=this.project(b.x,b.y);c.globalAlpha=.6;c.save();c.translate(pt.x,pt.y);drawSprite(c,definitions[this.buildUnit],s*.36,now);c.restore();c.globalAlpha=1;}
    }
    let labels=0;
    for(const ev of state.events||[]){const age=state.time-ev.time;if(ev.laneId<0||age<0||age>1.2)continue;const pos=this.entityWorld(ev),p=this.project(pos.x,pos.y);if(p.x<-50||p.x>w+50||p.y<-50||p.y>h+50)continue;c.globalAlpha=Math.max(0,1-age/1.2);
      if(['projectile','chain','kingAttack'].includes(ev.type)&&age<.28&&s>12){const from=Number.isFinite(ev.fromWorldX)?{x:ev.fromWorldX,y:ev.fromWorldY}:this.world(ev.laneId,ev.fromX,ev.fromY),a=this.project(from.x,from.y),f=Math.min(1,age/.18);c.strokeStyle=ev.type==='chain'?'#badde3':ev.color||'#d4d69b';c.lineWidth=ev.type==='kingAttack'?2:1.1;c.beginPath();c.moveTo(a.x+(p.x-a.x)*Math.max(0,f-.35),a.y+(p.y-a.y)*Math.max(0,f-.35)-s*.35);c.lineTo(a.x+(p.x-a.x)*f,a.y+(p.y-a.y)*f-s*.35);c.stroke();}
      if(ev.type==='hit'&&age<.18&&s>17){c.strokeStyle='#e3d5a5';c.lineWidth=1;c.beginPath();c.moveTo(p.x-3,p.y-s*.35-3);c.lineTo(p.x+3,p.y-s*.35+3);c.stroke();}
      if(['interfere','stomp','splash','heal','king','leak'].includes(ev.type)){c.strokeStyle=ev.type==='heal'?'#a9dba7':ev.type==='leak'?'#bc875f88':'#e3c983';c.lineWidth=ev.type==='leak'?.6:1.4;c.beginPath();c.ellipse(p.x,p.y,s*(.25+age*(ev.type==='leak'?.3:1.5)),s*(.12+age*.7),0,0,6.28);c.stroke();}
      if(ev.type==='warp'){c.strokeStyle='#b9c9ed';c.lineWidth=1.5;for(let ring=0;ring<2;ring++){c.beginPath();c.ellipse(p.x,p.y-age*s*.9-ring*s*.25,s*(.6+age*.3),s*.22,0,0,Math.PI*2);c.stroke();}const glow=c.createLinearGradient(p.x,p.y-s*2,p.x,p.y);glow.addColorStop(0,'#a5bdef00');glow.addColorStop(1,'#a5bdef55');c.fillStyle=glow;c.fillRect(p.x-s*.4,p.y-s*2,s*.8,s*2);}
      if(ev.text&&['build','upgrade','support','interfere','revive','king'].includes(ev.type)&&s>17&&labels++<6){c.font='10px system-ui';c.textAlign='center';c.fillStyle='#e1d5a8';c.fillText(ev.text,p.x,p.y-s*.7-age*17);}c.globalAlpha=1;
    }
    if(this.spellTarget){const caster=state.entities.find(e=>e.id===this.spellTarget.entityId&&isEntityVisible(e));if(caster){const origin=this.entityWorld(caster),center=this.project(origin.x,origin.y);c.save();c.strokeStyle='#9ed7e0aa';c.lineWidth=1;c.setLineDash([5,4]);if(this.spellTarget.range>0){c.beginPath();c.ellipse(center.x,center.y,this.spellTarget.range*s,this.spellTarget.range*s*.78,0,0,Math.PI*2);c.stroke();}if(this.pointerPoint){const p=this.pointerPoint,world=this.unproject(p.x,p.y),valid=!(this.spellTarget.range>0)||Math.hypot(world.x-origin.x,world.y-origin.y)<=this.spellTarget.range;c.strokeStyle=valid?'#a9e2e9':'#e4a18c';c.fillStyle=valid?'#9ed7e022':'#e4a18c22';if(this.spellTarget.radius>0){c.beginPath();c.ellipse(p.x,p.y,this.spellTarget.radius*s,this.spellTarget.radius*s*.78,0,0,Math.PI*2);c.fill();c.stroke();}c.setLineDash([]);c.beginPath();c.moveTo(p.x-6,p.y);c.lineTo(p.x+6,p.y);c.moveTo(p.x,p.y-6);c.lineTo(p.x,p.y+6);c.stroke();}c.restore();}}
    if(this.targetRadius&&this.pointerPoint){const p=this.pointerPoint;c.save();c.fillStyle='#e3c98322';c.strokeStyle='#f4d785';c.lineWidth=1.6;c.setLineDash([4,3]);c.beginPath();c.ellipse(p.x,p.y,this.targetRadius*s,this.targetRadius*s*.78,0,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);c.beginPath();c.moveTo(p.x-5,p.y);c.lineTo(p.x+5,p.y);c.moveTo(p.x,p.y-5);c.lineTo(p.x,p.y+5);c.stroke();c.restore();}
    // Hand-cut compass and a subdued vignette keep the play field readable.
    c.fillStyle='#a7b592';c.font='8px Georgia';c.textAlign='right';c.fillText('N',w-19,87);c.strokeStyle='#a6b28c77';c.beginPath();c.moveTo(w-21,95);c.lineTo(w-21,116);c.moveTo(w-25,101);c.lineTo(w-21,95);c.lineTo(w-17,101);c.stroke();
    if(state.paused&&state.phase!=='ended'){c.fillStyle='#0b190e66';c.fillRect(0,0,w,h);c.font='500 27px "Songti SC",serif';c.fillStyle='#e6d5a4';c.textAlign='center';c.fillText('已 暂 停',w/2,h/2);}
  }
  bar(x,y,width,fraction,color){const c=this.ctx;c.fillStyle='#0b1b13';c.fillRect(x-width/2-1,y-1,width+2,4);c.fillStyle=color;c.fillRect(x-width/2,y,Math.max(0,width*clamp(fraction,0,1)),2);}
  minimapHit(nx,ny){const b=MAP.bounds,world={x:b.minX+(nx-.035)/.93*(b.maxX-b.minX),y:b.minY+(ny-.035)/.93*(b.maxY-b.minY)},lane=worldToLane(world.x,world.y),gate=MAP.regions.find(r=>Number.isInteger(r.laneId)&&world.x>=r.minX&&world.x<=r.maxX&&world.y>=r.minY&&world.y<=r.maxY);return lane?lane.laneId:gate?gate.laneId:world.x<30?8:9;}
  minimap(canvas,state){const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,b=MAP.bounds,sx=w*.93/(b.maxX-b.minX),sy=h*.93/(b.maxY-b.minY),p=(x,y)=>({x:w*.035+(x-b.minX)*sx,y:h*.035+(y-b.minY)*sy});c.fillStyle='#192c20';c.fillRect(0,0,w,h);const water=p(0,31);c.fillStyle='#263b5e';c.fillRect(0,water.y,w,h-water.y);
    for(const r of MAP.regions){const a=p(r.minX,r.minY);c.fillStyle=Number.isInteger(r.laneId)?'#355b34':r.type==='spawn'?'#15231b':'#8b8c72';c.fillRect(a.x,a.y,(r.maxX-r.minX)*sx,(r.maxY-r.minY)*sy);}
    for(let lane=0;lane<8;lane++){const a=this.world(lane,0,4),z=this.world(lane,6,12),q=p(Math.min(a.x,z.x),Math.min(a.y,z.y));if(lane===0||lane===this.focusLane){c.strokeStyle=lane===0?'#d2cc8c':'#b0c29b';c.lineWidth=.8;c.strokeRect(q.x,q.y,Math.abs(a.x-z.x)*sx,Math.abs(a.y-z.y)*sy);}const spawn=this.world(lane,3,0),v=p(spawn.x,spawn.y);c.fillStyle=lane<4?'#8bb8b4':'#d89d78';c.fillRect(v.x-1,v.y-1,2,2);}
    if(state.phase==='build')for(const pl of state.players)for(const unit of pl.buildings){const world=this.world(pl.id,unit.col+.5,unit.row+4.5),v=p(world.x,world.y);c.fillStyle=pl.team===0?'#9ccfc2':'#d6a081';c.fillRect(v.x-.7,v.y-.7,1.4,1.4);}
    for(const e of state.entities){if(!isEntityVisible(e))continue;const world=this.entityWorld(e),v=p(world.x,world.y);c.fillStyle=e.side==='monster'?'#d9c66c':e.team===0?'#92d5ce':'#e09b82';c.fillRect(v.x-.7,v.y-.7,1.4,1.4);}
    for(let team=0;team<2;team++){const king=state.kings[team],k=Number.isFinite(king.worldX)?{x:king.worldX,y:king.worldY}:kingWorld(team),v=p(k.x,k.y);c.fillStyle=team===0?'#9dc9c0':'#d9977b';c.fillRect(v.x-2,v.y-2,4,4);}
    const a=this.unproject(0,0),z=this.unproject(this.width,this.height),q=p(a.x,a.y);c.strokeStyle='#eff1c9bb';c.lineWidth=.9;c.strokeRect(q.x,q.y,(z.x-a.x)*sx,(z.y-a.y)*sy);
  }
}
