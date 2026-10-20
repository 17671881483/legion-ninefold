import {Game} from './engine.js';
import {UNITS,MERCENARIES,HEROES,WAVES,RULES,BUILDERS} from './data.js';
import {describeSkills} from './skills.js';
import {openCatalog} from './catalog-ui.js';
import {Battlefield,unitIcon,drawPortrait} from './renderer.js';
import {isAppearanceVariant,appearanceBaseLabel,splitUnitCategories} from './unit-categories.js';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defs=Object.fromEntries([...UNITS,...MERCENARIES,...HEROES].map(u=>[u.id,u]));
const typeNames={hero:'英雄',normal:'普通',pierce:'穿刺',magic:'魔法',chaos:'混乱',siege:'攻城',spells:'法术'},armorNames={hero:'英雄甲',light:'轻甲',medium:'中甲',heavy:'重甲',fortified:'城甲',unarmored:'无甲',divine:'神圣甲'},roleNames={tank:'前排',frontline:'近战',ranged:'远程',support:'辅助',caster:'法师',control:'控制'};
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const num=n=>Math.floor(Number(n)||0).toLocaleString('zh-CN');
const time=n=>`${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,n)%60).toString().padStart(2,'0')}`;
const STORE='legion-v14-1a5-x9-match-v1';
let saved=null;try{saved=JSON.parse(localStorage.getItem(STORE)||'null');}catch{}
let game=new Game({seed:42,difficulty:'normal'}),started=false,tab='build',difficulty='normal',builderId=RULES.defaultBuilderId,selected=null,buildUnit=null,panelKey='',selectionKey='',uiTimer=0,saveTimer=0,lastFrame=0,endShown=false,soundOn=false,audio=null,lastWave=1,lastPhase='build';
let autoFollowWave=0,autoFollowing=false,kingMoveMode=false,tMonsterMode=false;
let economyDisplayGame=null,economyDisplayWorkers=0,economyDisplayLevel=0;
const battlefield=new Battlefield($('battlefield'),handleBattlefieldClick);
const initialState=game.state;
if(saved?.state?.phase!=='ended'&&saved)$('continue-game').hidden=false;

function toast(message,error=false){const t=document.createElement('div');t.className=`toast${error?' error':''}`;t.textContent=message;$('toast-container').append(t);setTimeout(()=>t.remove(),2700);}
function sound(kind='click'){
  if(!soundOn)return;
  try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const at=audio.currentTime;const notes=kind==='wave'?[196,246.94,293.66]:kind==='win'?[261.63,329.63,392,523.25]:kind==='error'?[110]:kind==='build'?[293.66,392]:[220];notes.forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(0,at+i*.07);g.gain.linearRampToValueAtTime(.035,at+i*.07+.015);g.gain.exponentialRampToValueAtTime(.001,at+i*.07+.18);o.connect(g);g.connect(audio.destination);o.start(at+i*.07);o.stop(at+i*.07+.2);});}catch{}
}
function command(type,payload={}){
  const res=game.command(type,payload);if(res?.message)toast(res.message,!res.ok);if(res?.ok)sound(type==='build'||type==='upgrade'?'build':type==='ready'?'wave':'click');else sound('error');
  if(res?.ok&&['race','builder','reroll'].includes(type)){buildUnit=null;battlefield.buildUnit=null;selected=null;battlefield.selected=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;}if(type!=='merc')panelKey='';selectionKey='';updateUI();if(res?.ok)save();return res;
}
function save(){if(!started)return;try{localStorage.setItem(STORE,JSON.stringify(game.snapshot()));$('save-label').textContent='进度已保存';}catch{$('save-label').textContent='此浏览器暂不能存档';}}
function startMatch(resume=false){
  if(resume&&saved){try{if(saved.state?.dataRevision!==RULES.dataRevision&&!localStorage.getItem(STORE+'-before-document'))localStorage.setItem(STORE+'-before-document',JSON.stringify(saved));game=Game.fromSnapshot(saved);}catch{game=new Game({seed:42,difficulty,builderId});}}
  else game=new Game({seed:Math.floor(Date.now()%2147483647),difficulty,builderId});
  game.state.paused=false;started=true;lastWave=game.state.wave;lastPhase=game.state.phase;selected=null;buildUnit=null;endShown=false;panelKey='';selectionKey='';$('welcome').hidden=true;
  autoFollowWave=0;autoFollowing=false;kingMoveMode=false;tMonsterMode=false;battlefield.targetRadius=null;$('battlefield').classList.remove('targeting');battlefield.selected=null;battlefield.buildUnit=null;focus(0);updateUI();save();sound('wave');
  toast('先选择兵种，再点击自己的建造格。前排与远程搭配更稳。');
}
function handleBattlefieldClick(hit,e){
  if(!started)return;
  if(tMonsterMode){const r=$('battlefield').getBoundingClientRect(),point=battlefield.unproject(e.clientX-r.left,e.clientY-r.top),res=command('interfere',{worldX:point.x,worldY:point.y});if(res.ok){cancelBuild();}return;}
  if(!hit)return;
  if(kingMoveMode){const r=$('battlefield').getBoundingClientRect(),point=battlefield.unproject(e.clientX-r.left,e.clientY-r.top),res=command('kingMove',{worldX:point.x,worldY:point.y});if(res.ok){kingMoveMode=false;$('build-hint').hidden=true;}return;}
  if(hit.type==='cell'){
    const existing=game.state.players[hit.playerId]?.buildings.find(b=>b.col===hit.col&&b.row===hit.row);
    if(existing){select({type:'building',buildingId:existing.id,playerId:hit.playerId});return;}
    if(buildUnit){if(hit.playerId!==0){toast('请在自己的 1 路防线建造',true);return;}const r=command('build',{unitId:buildUnit,col:hit.col,row:hit.row});if(r.ok){const b=game.state.players[0].buildings.at(-1);selected={type:'building',buildingId:b.id,playerId:0};battlefield.selected=selected;selectionKey='';updateSelection();}return;}
    select(null);
  }else if(hit.type==='building'){select({...hit});}
  else if(hit.type==='entity'){select({...hit});}
  else if(!e.shiftKey){cancelBuild();}
}
function select(value){selected=value;battlefield.selected=value;selectionKey='';updateSelection();}
function cancelBuild(){kingMoveMode=false;tMonsterMode=false;battlefield.targetRadius=null;$('battlefield').classList.remove('targeting');buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;selected=null;battlefield.selected=null;panelKey='';selectionKey='';updateUI();}
function population(p){return p.workers+(p.economyTasks?.workerQueue?.length??0)*RULES.workerPopulation+p.buildings.reduce((sum,b)=>sum+(defs[b.unitId]?.population||1),0)+(p.heroId?(defs[p.heroId]?.population||3):0);}
function power(p){return p.buildings.reduce((sum,b)=>sum+(b.construction?0:(defs[b.unitId]?.sourcePoints??b.spent??b.totalSpent??defs[b.unitId]?.cost??0)),0)+(p.heroId?(defs[p.heroId]?.cost||280):0);}
const activeUnits=UNITS.filter(u=>!u.legacy);
const waveCount=w=>w.count??(w.boss?w.bossCount:w.baseCount*RULES.monsterMultiplier);
const kingCap=stat=>game.kingUpgradeCap?.(stat)??RULES.kingUpgradeCaps?.[stat]??RULES.kingUpgradeMax;
const healAmount=()=>RULES.kingHealFraction?Math.floor(game.state.kings[0].maxHp*RULES.kingHealFraction):RULES.kingHealAmount;
function waveInfo(){return WAVES[Math.min(game.state.wave-1,WAVES.length-1)];}

function renderPanel(){
  const s=game.state,p=s.players[0],key=[tab,p.roster.join(','),p.builderId,p.heroId,s.phase,s.wave,p.populationCap,p.rerolls,p.raceChanges,p.builderChoices?.join(','),buildUnit].join('|');
  if(key===panelKey){if(tab==='king')updateKingPanel();if(tab==='attack')updateMercPanel();return;}panelKey=key;
  let html='';
  if(tab==='build'){
    const builder=BUILDERS.find(b=>b.id===p.builderId),entries=builder?.heroEntryIds||[];
    html=`${p.builderChoices?.length?`<div class="builder-offer"><small>选择新的建造者</small>${p.builderChoices.map(id=>{const b=BUILDERS.find(b=>b.id===id);return `<button data-builder="${id}">${esc(b?.name||id)}</button>`;}).join('')}</div>`:''}<div class="panel-intro"><span>${esc(builder?.name||'旧局')}军团</span><b>${builder?.mode==='prophet'?'六阶随机 · 每阶一种':builder?.mode==='morph'?'六阶代理 · 随机变形':'种族专属 · 基础与升级'}</b></div><div class="roster-grid">`+p.roster.map(id=>{const u=defs[id];if(!u)return '';return `<button class="unit-card${buildUnit===id?' selected':''}" data-unit="${id}" title="${esc(u.name)} · ${u.cost}金币${u.woodCost?` ${u.woodCost}木`:''}\n${esc(u.description)}"><span class="tier">T${u.tier||'—'}</span>${unitIcon(u)}<span><b>${esc(u.name)}</b><small>${u.cost} 金${u.woodCost?` ${u.woodCost}木`:''}</small></span><span class="card-role">${u.morphProxy?'随机变形':roleNames[u.role]||'军团'}</span></button>`;}).join('')+`</div><div class="roster-toolbar">${builder?.mode==='prophet'?`<button class="reroll-button" data-action="reroll">${icon('refresh')}重选兵种 <span>${RULES.rerollCosts?.[p.rerolls]??RULES.rerollCost} 木 · ${p.rerolls}/${RULES.rerollCount}</span></button>`:''}<button class="reroll-button" data-action="farm" title="${RULES.farmCost}金币、${RULES.farmWoodCost||0}木，${RULES.farmTrainingSeconds}秒后增加${RULES.farmPopulation}人口">建造农场</button><button class="reroll-button" data-action="race" title="换族${p.raceChanges||0}/${RULES.rerollCount}次，下一次${RULES.builderChangeGoldCosts?.[p.raceChanges||0]??0}金＋${RULES.builderChangeWoodCosts?.[p.raceChanges||0]??0}木；抽两个建造者供选择">更换种族</button><button class="reroll-button" data-action="catalog">兵种图鉴</button></div>${entries.length?`<div class="hero-section"><div class="section-heading"><span>英雄祭坛</span><small>通过原图升级链成长</small></div><div class="document-heroes">${entries.map(id=>{const u=defs[id];return u?`<button data-unit="${id}" title="${esc(u.name)} · ${u.cost}金币">${unitIcon(u)}<span>${esc(u.name)}<small>${u.cost}金${u.woodCost?` ${u.woodCost}木`:''}</small></span></button>`:'';}).join('')}</div></div>`:''}`;

  }else if(tab==='attack'){
    html=`<div class="panel-intro"><span>开战时分配敌军四路</span><b>独立库存 · 逐只补充</b></div><div class="merc-list">`+MERCENARIES.filter(m=>!m.shopPreview).map(m=>`<button class="merc-button" data-merc="${m.id}" title="${esc(m.description)}"><span class="merc-body">${unitIcon(m)}<span class="merc-info"><b>${esc(m.name)}<span class="queue-count" data-merc-queue hidden></span></b><small>${esc(m.ability?.name||'进攻佣兵')}</small></span><span class="merc-price">${m.wood} 木<small data-merc-income>收入 +${m.income}</small></span></span><span class="merc-stock-meta"><b data-merc-stock>库存 ${m.stockMax}/${m.stockMax}</b><span data-merc-timer>库存已满</span></span><span class="merc-cooldown" role="progressbar" aria-label="${esc(m.name)}库存补充" aria-valuemin="0" aria-valuemax="100"><i></i></span></button>`).join('')+`</div><p class="hero-copy">发兵对象按v14脚本阶段解锁及切换；库存独立恢复。第11波起木怪收入按点数整数减半；国王强化单独计收入。开战轮询分配敌军四路，战斗中购买参与下一波。</p>`;
  }else{
    const k=s.kings[0];html=`<div class="king-panel"><svg class="king-large"><use href="#i-crown"/></svg><h3>联盟国王</h3><p>四路共同的最后防线<br>花费木材强化国王，同时获得回合收入</p><div class="king-health"><i id="king-panel-bar"></i></div><div id="king-panel-hp" class="king-hp-label"></div>`+[['hp','heart','生命上限',`下级 +${RULES.kingHpUpgradeIncrements?.[k.hpLevel]??RULES.kingHpPerUpgrade} 生命（静态映射）`,k.hpLevel],['attack','swords','攻击力',`每级 +${RULES.kingDamagePerUpgrade} 攻击`,k.attackLevel],['regen','spark','生命恢复',`每级 +${RULES.kingRegenPerUpgrade} 回复/秒`,k.regenLevel]].map(([stat,ico,label,desc,lv])=>`<button class="king-upgrade" data-king="${stat}" title="${RULES.kingUpgradeCost}木材，收入增加${RULES.kingIncome}">${icon(ico)}<span><b>${label} <small style="display:inline">Lv.${lv}/${kingCap(stat)}</small></b><small>${desc}</small></span><em>${RULES.kingUpgradeCost} 木</em></button>`).join('')+`<div class="team-heals">`+[0,1,2,3].map(i=>`<svg class="heal-charge ${i>=k.healCharges?'empty':''}"><use href="#i-heart"/></svg>`).join('')+`</div><p class="hero-copy">国王治疗每名玩家一口，全队共 4 次，每次回复 ${num(healAmount())} 生命（最大生命${Math.round((RULES.kingHealFraction??.5)*100)}%）。<br>团队治疗间隔 ${RULES.kingHealLockSeconds} 秒。</p><button class="king-move" data-action="kingmove" ${s.wave<31||s.phase==='ended'?'disabled':''}>移动国王<small>${s.wave<31?'第31波起开放':'选择后点击路面'}</small></button></div>`;
  }
  $('panel-content').innerHTML=html;if(tab==='king')updateKingPanel();if(tab==='attack')updateMercPanel();
}
function updateMercPanel(){
  const s=game.state,p=s.players[0];
  document.querySelectorAll('[data-merc]').forEach(button=>{
    const m=defs[button.dataset.merc],status=game.mercenaryStatus(m.id),queue=s.pendingSends.filter(v=>v.senderId===0&&v.mercId===m.id).length;
    const timer=status.locked?(status.reason??`第 ${m.unlock} 波${m.unlockPhase?'开战':''}解锁`):status.stock===status.maxStock?'库存已满':`补充 ${status.remaining.toFixed(1)}s${s.paused?' · 暂停':''}`;
    button.disabled=status.locked||status.stock===0||p.wood<m.wood||s.phase==='ended';
    button.classList.toggle('locked',status.locked);button.classList.toggle('empty',!status.locked&&status.stock===0);button.classList.toggle('unaffordable',!status.locked&&p.wood<m.wood);button.classList.toggle('recharging',!status.locked&&status.stock<status.maxStock);
    button.querySelector('[data-merc-income]').textContent=`收入 +${status.income??(s.wave>=11?(m.incomeLate??Math.floor(m.income/2)):m.income)}`;
    button.querySelector('[data-merc-stock]').textContent=`库存 ${status.stock}/${status.maxStock}`;
    button.querySelector('[data-merc-timer]').textContent=timer;
    const badge=button.querySelector('[data-merc-queue]');badge.hidden=queue===0;badge.textContent=`已派 ${queue}`;
    const bar=button.querySelector('.merc-cooldown'),percent=Math.max(0,Math.min(100,status.locked?0:status.progress*100));
    bar.firstElementChild.style.width=`${percent}%`;bar.setAttribute('aria-valuenow',String(Math.round(percent)));bar.setAttribute('aria-valuetext',timer);
    const reason=status.locked?timer:s.phase==='ended'?'对局已结束':status.stock===0?'等待库存补充':p.wood<m.wood?'木材不足':'点击派出一只';
    button.setAttribute('aria-label',`${m.name}，库存 ${status.stock}/${status.maxStock}，${m.wood} 木材，${timer}，${reason}`);
    button.title=`${m.description}\n${reason}；${timer}。每次派出消耗 1 库存。`;
  });
}
function updateKingPanel(){
  const s=game.state,p=s.players[0],k=s.kings[0];
  if($('king-panel-bar'))$('king-panel-bar').style.width=`${Math.max(0,k.hp/k.maxHp)*100}%`;
  if($('king-panel-hp'))$('king-panel-hp').textContent=`${num(k.hp)} / ${num(k.maxHp)} · 攻击 ${num(k.attack)} · 护甲 ${num(k.armor??RULES.kingArmor)} · 回复 ${k.regen}/秒`;
  document.querySelectorAll('[data-king]').forEach(button=>{
    const stat=button.dataset.king,level=k[`${stat}Level`];button.disabled=s.phase==='ended'||p.wood<RULES.kingUpgradeCost||level>=kingCap(stat);
    button.querySelector('b small').textContent=`Lv.${level}/${kingCap(stat)}`;
  });
  document.querySelectorAll('.team-heals .heal-charge').forEach((e,i)=>e.classList.toggle('empty',i>=k.healCharges));
}
function updateEconomyPanel(){
  const s=game.state,status=game.economyStatus(),w=status.worker,l=status.lumber,ended=s.phase==='ended';
  const price=cost=>`${cost?.gold??0}金${cost?.wood?` ${cost.wood}木`:''}`;
  const workerTask=w.tasks[0]??null,lumberTask=l.task;
  const workerGate=!workerTask&&!w.canStart&&w.reason?.includes('军力')?w.reason.match(/\d+/)?.[0]:null,lumberGate=!lumberTask&&!l.canStart&&l.reason?.includes('军力')?l.reason.match(/\d+/)?.[0]:null;
  $('worker-label').textContent=workerGate?`精灵 · ${workerGate}军力`:`精灵 ${w.current}${w.queued?`+${w.queued}`:''}/${w.max}`;
  $('lumber-label').textContent=lumberGate?`科技 · ${lumberGate}军力`:lumberTask?`伐木 ${l.current}→${lumberTask.targetLevel}`:`伐木 ${l.current}/${l.max}`;
  $('worker-price').textContent=ended?'对局结束':workerTask?`${price(w.cost)} · ${Math.ceil(workerTask.remaining)}s`:w.current>=w.max?'已满员':`${price(w.cost)} · ${w.duration}s`;
  $('lumber-price').textContent=ended?'对局结束':lumberTask?`${price(lumberTask.cost)} · ${Math.ceil(lumberTask.remaining)}s`:l.current>=l.max?'已满级':`${price(l.cost)} · ${l.duration}s`;
  $('worker').disabled=!w.canStart;$('lumber').disabled=!l.canStart;
  const workerHint=`已完成 ${w.current}/${w.max}，训练队列 ${w.queued}/${w.queueLimit}`;
  $('worker').title=`招募小精灵：${price(w.cost)}，${w.duration}秒。${workerHint}。${workerTask?`当前剩余${workerTask.remaining.toFixed(1)}秒，`:'备战与战斗期间均可招募，'}${s.paused?'已暂停，':''}${w.canStart?'点击排入训练队列':w.reason}`;
  $('lumber').title=`伐木科技：${l.current}/${l.max}。${price(lumberTask?.cost??l.cost)}，${lumberTask?.duration??l.duration}秒。${lumberTask?`正在研究${lumberTask.targetLevel}级，剩余${lumberTask.remaining.toFixed(1)}秒，`:''}${s.paused?'已暂停，':''}${l.canStart?'点击开始研究':l.reason}`;
  $('worker').setAttribute('aria-label',$('worker').title);$('lumber').setAttribute('aria-label',$('lumber').title);
  for(const [id,task]of[['worker',workerTask],['lumber',lumberTask]]){
    const button=$(id),bar=button.querySelector('.economy-progress'),pct=task?Math.max(0,Math.min(100,task.progress*100)):0;
    button.classList.toggle('economy-busy',!!task);button.classList.toggle('economy-paused',!!task&&s.paused);button.setAttribute('aria-busy',String(!!task));bar.hidden=!task;
    bar.firstElementChild.style.width=`${pct}%`;bar.setAttribute('aria-valuenow',String(Math.round(pct)));bar.setAttribute('aria-valuetext',task?`剩余${task.remaining.toFixed(1)}秒${s.paused?'，已暂停':''}`:'空闲');
  }
  $('wood-rate').textContent=`+${status.woodPerSecond.toFixed(1)} 木/秒`;
  if(economyDisplayGame===game&&started&&$('welcome').hidden){
    if(w.current>economyDisplayWorkers){toast(`${w.current-economyDisplayWorkers} 个小精灵训练完成 · ${w.current}/${w.max}`);sound('build');}
    if(l.current>economyDisplayLevel){toast(`伐木科技 Lv.${l.current} 研究完成`);sound('build');}
  }
  economyDisplayGame=game;economyDisplayWorkers=w.current;economyDisplayLevel=l.current;
}
function updateSelection(){
  const s=game.state;let u=null,b=null,p=null,e=null;
  if(selected?.type==='building'){for(const player of s.players){const found=player.buildings.find(v=>v.id===selected.buildingId);if(found){b=found;p=player;u=defs[b.unitId];break;}}if(!b)selected=null;}
  else if(selected?.type==='unit')u=defs[selected.unitId];
  else if(selected?.type==='entity'){e=s.entities.find(v=>v.id===selected.entityId&&v.hp>0);if(e){u={...(defs[e.unitId]||waveInfo()),...e};p=s.players[e.ownerId];}else{selected=null;}}
  const key=[selected?.type,selected?.buildingId,selected?.entityId,u?.id,u?.unitId,s.phase,b?.unitId,b?.construction?Math.ceil(b.construction.finishAt-s.time):'',p?.gold?Math.floor(p.gold):0,e?Math.ceil(e.hp):'',e?Math.floor(e.mana??0):'',e?Math.floor(s.time*4):'',e?.routeMode,buildUnit].join('|');if(key===selectionKey)return;selectionKey=key;
  if(!u){$('selection').innerHTML=`<div class="selection-portrait"><canvas id="unit-portrait" width="100" height="100"></canvas></div><div class="selection-copy"><small>${esc(BUILDERS.find(b=>b.id===game.state.players[0].builderId)?.name||'军团')} · 建造者</small><h2>部署你的军团</h2><p>选择兵种后点击自己的格子布阵。<br>前排承伤，远程输出；多余金币发展经济。</p></div>`;drawPortrait($('unit-portrait'),null);$('selection-actions').innerHTML='';return;}
  const hp=e?`${num(e.hp)} / ${num(e.maxHp)}`:num(u.hp),damage=e?num(e.damage):num(u.damage),range=e?(e.range*100).toFixed(0):u.range;
  $('selection').innerHTML=`<div class="selection-portrait"><canvas id="unit-portrait" width="100" height="100"></canvas></div><div class="selection-copy"><small>${p?esc(p.name)+' · ':''}${u.race||'怪物'} · ${isAppearanceVariant(u)?`外观款（本体：${esc(appearanceBaseLabel(u,activeUnits))}）`:roleNames[u.role]||'系统怪'} · ${typeNames[u.attackType]||'普通'} / ${armorNames[u.armorType]||'中甲'}</small><h2>${esc(u.name)}</h2><div class="stat-chips"><span>生命<b>${hp}</b></span><span>攻击<b>${damage}</b></span><span>护甲<b>${u.armor??0}</b></span><span>射程<b>${range}</b></span></div><p>${esc(describeSkills(u).map(a=>a.name).join(' · ')||u.description||'自动作战的军团单位。')}</p></div>`;
  drawPortrait($('unit-portrait'),u);
  if(e?.skillSpecs){const casts=e.skillSpecs.filter(a=>a.status==='implemented'&&a.cooldown>0).sort((a,b)=>(e.skillStates?.[b.id]?.readyAt??0)-(e.skillStates?.[a.id]?.readyAt??0)).slice(0,3);if(casts.length){const node=document.createElement('div');node.className='live-skill-cds';node.innerHTML=casts.map(a=>{const left=Math.max(0,(e.skillStates?.[a.id]?.readyAt??0)-s.time),pct=100*(1-Math.min(1,left/a.cooldown));return `<span title="${esc(a.name)}：${left>0?`冷却剩余${left.toFixed(1)}秒`:'已就绪'}"><small>${esc(a.name)} ${left>0?`${left.toFixed(1)}s`:'就绪'}</small><i><em style="width:${pct}%"></em></i></span>`;}).join('');$('selection').querySelector('.selection-copy').append(node);}}
  if(b?.construction){const p=document.createElement('p');p.className='unit-order';p.textContent=`${b.construction.targetId&&b.construction.targetId!==b.unitId?'升级':'建造'}中 · 剩余 ${Math.max(0,b.construction.finishAt-s.time).toFixed(1)}秒，完成后生效`;$('selection').querySelector('.selection-copy').append(p);}
  if(e?.side==='defender'&&e.routeMode){const label={guard:'防区交战',return:'返回出生口',warp_wait:'等待协防传送',support:'王前协防'}[e.routeMode];if(label){const order=document.createElement('p');order.className='unit-order';order.textContent=`当前行动：${label}`;$('selection').querySelector('.selection-copy').append(order);}}
  if(b&&p.id===0){
    const groups=splitUnitCategories((u.upgrades||[]).map(id=>defs[id]).filter(Boolean));
    const renderGroup=(targets,label,appearance)=>targets.length?`<span class="unit-order" style="width:100%;flex:none;margin:0">${label}</span>`+targets.map(v=>`<button data-upgrade="${esc(v.id)}" data-unit-category="${appearance?'appearance':'upgrade'}" title="${appearance?`外观款 · 对应本体：${esc(appearanceBaseLabel(v,activeUnits))}；`:''}${v.cost}金${v.woodCost?`＋${v.woodCost}木`:''}，需满足原有资格与条件" ${s.phase!=='build'||b.construction?'disabled':''}>${appearance?'外观款':'升级'} ${esc(v.name)}<small>${v.cost} 金${v.woodCost?`＋${v.woodCost}木`:''}</small></button>`).join(''):'';
    $('selection-actions').innerHTML=renderGroup(groups.upgrades,'兵种升级',false)+renderGroup(groups.appearances,'外观选项',true)+`<button class="sell" data-sell="${b.id}" ${s.phase!=='build'?'disabled':''}>出售<small>按当前阶段结算</small></button>`;
  }
  else if(selected?.type==='unit')$('selection-actions').innerHTML=`<button data-cancel="true">取消部署<small>Esc</small></button>`;
  else $('selection-actions').innerHTML='';
  if(b&&!u.legacy&&u.buildingAbilityIds&&!u.buildingAbilityIds.includes('A008'))$('selection-actions').querySelector('[data-sell]')?.remove();
  if(b&&p?.id===0&&['h062','h05Q'].includes(u.sourceRawcode))$('selection-actions').innerHTML+=`<button data-form="${b.id}" ${s.phase!=='build'||b.construction?'disabled':''}>切换形态<small>免费 · 1秒</small></button>`;
  if(b&&p?.id===0&&u.sourceRawcode==='h06I')$('selection-actions').innerHTML+=`<button data-stim="${b.id}" ${s.phase!=='build'||b.construction||p.gold<75?'disabled':''}>兴奋剂<small>75金 · 本波有效</small></button>`;
  if(u&&(e?.unitId||u.id))$('selection-actions').innerHTML+=`<button data-inspect="${esc(e?.unitId||u.id)}">完整技能<small>${e?`魔法 ${num(e.mana)} / ${num(e.maxMana)}`:'属性与升级链'}</small></button>`;
}

function updateUI(){
  const s=game.state,p=s.players[0],wave=waveInfo();
  $('gold').textContent=num(p.gold);$('wood').textContent=num(p.wood);$('income').textContent=`+${num(p.income)}`;$('tech').textContent=`${p.workers} / ${p.lumberLevel}`;
  $('phase-label').textContent=s.phase==='build'?(s.roundMode==='arena-prep'?'竞技准备':s.roundMode==='arena-transition'?'竞技结束过渡':'布阵准备'):s.phase==='combat'?(s.roundMode==='arena'?'军团竞技':s.wave>=31?'最终攻防':'怪物来袭'):'对局结束';$('phase-label').style.color=s.phase==='combat'?'#d5aa7b':'#83ad80';$('wave-label').textContent=`第 ${String(s.wave).padStart(2,'0')} 波`;$('wave-time').textContent=time(s.roundMode==='arena'?s.arenaRemaining:s.wave>=31&&s.continuousRemaining!=null?s.continuousRemaining:s.timer);
  for(const [id,k]of[['ally',s.kings[0]],['enemy',s.kings[1]]]){$(`${id}-hp`).style.width=`${Math.max(0,k.hp/k.maxHp)*100}%`;$(`${id}-hp-text`).textContent=`${Math.ceil(k.hp/k.maxHp*100)}%`;}
  $('team-list').innerHTML=s.players.map(pl=>{const alive=s.entities.filter(e=>e.ownerId===pl.id&&e.side==='defender'&&e.hp>0).length,max=pl.buildings.length+(pl.heroId?1:0);return `<button class="team-row${pl.id===0?' me':''}${pl.team===1?' enemy':''}" data-focus="${pl.id}" title="查看${esc(pl.name)}的战区"><span class="player-number">${pl.id%4+1}</span><span class="player-info"><b>${esc(pl.name)}</b><small>${pl.workers}-${pl.lumberLevel} 科技 <em>${s.phase==='combat'?`存活 ${alive}`:'布阵中'}</em></small></span><span class="player-value">${num(power(pl))}</span><span class="row-health"><i style="width:${s.phase==='combat'&&max?Math.min(100,alive/max*100):100}%"></i></span></button>`;}).join('');
  $('wave-name').textContent=wave.name;$('wave-kind').textContent=`${typeNames[wave.attackType]}攻击 · ${wave.armorDisplayName??armorNames[wave.armorType]}`;$('wave-count').textContent=`${waveCount(wave)} ${wave.boss?'首领':'只'}`;$('wave-bounty').textContent=`${wave.bounty} 金`;
  $('ribbon-wave-name').textContent=s.roundMode==='arena'?'军团竞技 · 120秒上限':`${wave.name} · ${waveCount(wave)+(wave.boss?'首领':'只')}`;$('ribbon-wave-name').title=`${typeNames[wave.attackType]}攻击 / ${wave.armorDisplayName??armorNames[wave.armorType]} · 点击图鉴`;
  $('wave-advice').textContent=wave.boss?'首领数量少但实力强，注意前排与单体输出。':wave.range>100?'远程怪物波。保护脆弱后排，避免近战脱节。':'密集怪潮，范围输出与前排协同更有效。';
  if($('wave-portrait').dataset.wave!==String(s.wave)){drawPortrait($('wave-portrait'),{...wave,isMonster:true});$('wave-portrait').dataset.wave=String(s.wave);}
  $('entity-count').textContent=s.roundMode==='arena'?'双方军团竞技':s.phase==='combat'?`${s.entities.filter(e=>e.side==='monster'&&e.hp>0).length} 只怪物在场`:'6 × 8 建造区';
  updateEconomyPanel();
  $('ready').disabled=s.phase!=='build'||s.roundMode==='arena-transition';$('ready').innerHTML=`${icon('swords')}<b>${s.phase==='build'?(s.roundMode==='arena-prep'?'开始军团竞技':s.roundMode==='arena-transition'?'竞技结束过渡':`开始第 ${s.wave} 波`):s.phase==='combat'?(s.roundMode==='arena'?'竞技交战中':'军团交战中'):'对局已结束'}</b><kbd>空格</kbd>`;$('ready-subtext').textContent=s.phase==='build'?`${p.buildings.length} 个兵种已部署 · ${Math.ceil(s.timer)} 秒后自动开战`:`守住自己的防线，支援队友与国王`;
  $('pause').disabled=s.phase==='ended';$('pause').textContent=s.paused?'▶':'Ⅱ';$('pause').title=s.paused?'继续':'暂停';$('pause').setAttribute('aria-label',s.paused?'继续':'暂停');document.querySelectorAll('[data-speed]').forEach(b=>{b.disabled=s.phase==='ended';b.classList.toggle('active',Number(b.dataset.speed)===s.speed);});
  $('heal-count').textContent=`${s.kings[0].healCharges}/4`;const healWait=Math.max(0,(s.kings[0].healBlockedUntil??0)-s.time);$('heal').disabled=s.phase==='ended'||p.healUsed||s.kings[0].healCharges<=0||s.kings[0].hp>=s.kings[0].maxHp||healWait>0;$('heal').title=healWait>0?`团队治疗间隔 ${healWait.toFixed(1)}秒`:`国王回复 ${num(healAmount())} 生命，每人一次`;const tWait=Math.max(0,(p.interfereUntil??0)-s.time),tReady=RULES.interfereEnabled&&s.phase==='combat'&&s.roundMode!=='arena'&&!s.paused&&tWait<=0;
  $('interfere').disabled=!tReady;$('interfere').querySelector('span').textContent=tMonsterMode?'选择位置':'T 怪';
  $('interfere-status').textContent=tWait>0?`${tWait.toFixed(1)}s`:s.paused?'已暂停':s.phase!=='combat'||s.roundMode==='arena'?'待开战':'选点';
  $('interfere').setAttribute('aria-pressed',String(tMonsterMode));$('interfere').title='T怪／防卡兵：点击或按T后选择位置，打断圆内双方怪物尚未出手的普通攻击，重发进攻指令。冷却5秒；Esc取消。';
  const tProgress=Math.max(0,Math.min(100,(1-tWait/RULES.interfereCooldown)*100));$('interfere-progress').firstElementChild.style.width=`${tProgress}%`;$('interfere-progress').setAttribute('aria-valuenow',String(Math.round(tProgress)));$('interfere-progress').setAttribute('aria-valuetext',tWait>0?`剩余${tWait.toFixed(1)}秒`:'冷却完成');
  if(tMonsterMode&&!tReady){tMonsterMode=false;battlefield.targetRadius=null;$('battlefield').classList.remove('targeting');$('build-hint').hidden=true;}

  $('army-power').textContent=num(power(p));$('army-pop').textContent=`${population(p)} / ${p.populationCap||RULES.initialPopulation}`;$('kill-count').textContent=num(p.stats.kills);
  $('logs').innerHTML=s.logs.slice(-5).reverse().map(l=>`<div><span>${time(l.time)}</span>${esc(l.text)}</div>`).join('');
  renderPanel();updateSelection();
  const raceButton=document.querySelector('[data-action="race"]'),rerollButton=document.querySelector('[data-action="reroll"]');if(raceButton)raceButton.disabled=s.phase!=='build'||!!p.builderChoices?.length||(p.raceChanges||0)>=RULES.rerollCount||p.buildings.some(b=>defs[b.unitId]?.hero);if(rerollButton)rerollButton.disabled=s.phase!=='build'||p.rerolls>=RULES.rerollCount;
  const farmButton=document.querySelector('[data-action="farm"]'),farm=p.economyTasks?.farmTask;if(farmButton){farmButton.textContent=farm?`农场 ${Math.max(0,farm.finishAt-s.time).toFixed(1)}s`:'建造农场';farmButton.disabled=!!farm||s.phase==='ended'||p.gold<RULES.farmCost||p.wood<RULES.farmWoodCost||p.populationCap>=RULES.maxPopulation;}
  document.querySelectorAll('[data-unit]').forEach(b=>{const u=defs[b.dataset.unit],gate=game.requirementStatus?.(u.id);b.classList.toggle('unaffordable',p.gold<u.cost);b.disabled=s.phase!=='build'||gate?.canStart===false;if(gate?.reason)b.title=`${u.name} · ${gate.reason}`;});
  document.querySelectorAll('[data-upgrade]').forEach(button=>{const u=defs[button.dataset.upgrade],gate=game.requirementStatus?.(u.id),b=game.state.players[0].buildings.find(v=>v.id===selected?.buildingId);button.disabled=s.phase!=='build'||!!b?.construction||gate?.canStart===false||p.gold<u.cost||p.wood<(u.woodCost||0);if(gate?.reason)button.title=(isAppearanceVariant(u)?`外观款 · 对应本体：${appearanceBaseLabel(u,activeUnits)}。`:'')+gate.reason;});
  if(s.wave!==lastWave){lastWave=s.wave;panelKey='';sound('wave');toast(`第 ${s.wave} 波${s.wave>=31?'追加':'准备'}：${wave.name}`);save();}
  if(s.phase!==lastPhase){if(s.phase==='combat'||s.phase==='arena'){if(s.roundMode==='arena'){focus('all');toast('军团竞技开始 · 最长120秒');}buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;if(selected?.type==='building'){const unit=s.entities.find(e=>e.buildingId===selected.buildingId&&e.hp>0);selected=unit?{type:'entity',entityId:unit.id,laneId:unit.laneId}:null;battlefield.selected=selected;selectionKey='';updateSelection();}sound('wave');}else if(s.phase==='build')save();lastPhase=s.phase;panelKey='';}
  if(s.legacyMatch&&!$('save-label').dataset.legacy){$('save-label').dataset.legacy='true';toast('当前存档包含历史单位；v14.1A5请使用新开局。');}
  if(s.phase==='ended'&&!endShown){endShown=true;showEnd();save();}
  if(!tMonsterMode&&!kingMoveMode&&s.phase==='combat'&&s.timer>5&&battlefield.focusLane===0&&autoFollowWave!==s.wave&&!s.entities.some(e=>e.hp>0&&e.laneId===0)&&s.entities.some(e=>e.hp>0&&e.side==='monster'&&e.laneId===8)){autoFollowWave=s.wave;focus(8);autoFollowing=true;toast('战斗转入国王防线，镜头已跟随。');}
  if(s.phase==='build'&&autoFollowing){focus(0);autoFollowing=false;}
}
function showEnd(){const s=game.state,p=s.players[0],win=s.winner===0,draw=s.winner===-1||s.winner===null||s.winner==='draw';$('end-title').textContent=draw?'战局平分秋色':win?'联盟军团获胜':'部落军团获胜';$('end-eyebrow').textContent=draw?'势均力敌':win?'VICTORY':'DEFEAT';$('end-description').textContent=draw?'双方军团战至最后，国王生命与兵力未能分出胜负。':win?'你的军团守住了国王。攻守与经济，共同决定这一局的胜负。':'国王的防线已经失守。尝试调整造位、升级前排，并及时强化国王。';$('end-stats').innerHTML=`<span><b>${s.wave}</b>抵达波次</span><span><b>${num(p.stats.kills)}</b>击杀</span><span><b>${num(p.stats.sent)}</b>派出木怪</span>`;$('end-dialog').showModal();sound(win?'win':'error');}

function help(which='play'){
  document.querySelectorAll('[data-help]').forEach(b=>b.classList.toggle('active',b.dataset.help===which));
  if(which==='play')$('help-content').innerHTML=`<div class="help-stats"><div><small>阵营对抗</small><b>4 vs 4</b></div><div><small>首波每路</small><b>${waveCount(WAVES[0])}</b></div><div><small>模式</small><b>v14.1A5 · 9×</b></div></div><h3>建造军团</h3><ol><li>选择${BUILDERS.length}种建造者之一。种族使用自己的基础兵；先知从六阶候选池各抽一种。点击兵种再点自己格子建造，升级费用、兵力与战斗属性分别读取v14来源。</li><li>手动或自动开波时，尚未完成的军团新建、升级、形态转换立即完成并参与当波。小精灵、科技、农场继续按各自计时完成。</li><li>开局${RULES.initialGold}金、${RULES.initialWood}木。小精灵上限${RULES.maxWorkers}，每名${RULES.workerCostBase}金、${RULES.workerTrainingSeconds}秒；科技共${RULES.maxLumberLevel}级，按逐级金木、时长与兵力门槛研究。</li><li>采木采用实际脚本的连续平均映射：每工人每10秒 2＋基础科技等级＋2.5×高级科技等级。高级物编每级+2与脚本+2.5分开保留。</li><li>“进攻”页按来源阶段切换发兵对象，各自库存独立恢复。第11波起木怪收入按点数整数除2；国王强化独立增加${RULES.kingIncome}收入。发兵在开波分配敌军四路。</li><li>国王强化早期上限20/30/20；攻击和恢复第16波、生命第17波放开至60/80/60。治疗每人一次，按国王最大生命的${Math.round((RULES.kingHealFraction??.5)*100)}%回复。第31波后持续推进至最终攻防。</li></ol><h3>T怪／防卡兵</h3><p>战斗中按T或点击“T怪”，再点地图。圆内双方系统怪和已出场木怪取消未出手的普通攻击并重新向各自王区进攻。橙色短条显示抬手，冷却${RULES.interfereCooldown}秒；空点也耗冷却。Esc取消，暂停和竞技时不可用。</p><h3>位置与协防</h3><p>双方各四路按2×2排列，北路向南、南路向北，再经横廊进入王道。清线与走位决定协防时机。拖动、WASD/方向键平移，滚轮或双指缩放；小地图和玩家列表可定位。空格开波/暂停，H治疗国王，31波起可选“移动国王”。</p>`;
  else if(which==='waves')$('help-content').innerHTML=`<p>数量与生命已包含九倍脚本倍率，不再重复乘倍数。第20波每路10只、第30波6只；6—28波除10/20外有10%下一波替换。按原始计时器实现，同一批出怪各路共享替换结果。</p><table class="wave-table"><thead><tr><th>波</th><th>怪物</th><th>每路</th><th>实际攻击 / 护甲</th><th>有效生命</th></tr></thead><tbody>${WAVES.map(w=>`<tr class="${w.boss?'boss-row':''} ${w.id===game.state.wave?'current-wave':''}"><td>${w.id}</td><td>${esc(w.name)}</td><td>${waveCount(w)}</td><td>${typeNames[w.attackType]} / ${w.armorDisplayName??armorNames[w.armorType]}</td><td>${num(w.hp)}</td></tr>`).join('')}</tbody></table>`;
  else $('help-content').innerHTML=`<h3>v14.1A5 九倍模式</h3><p>数据依据本地“军团战争v14.1A5_九倍怪物模式_解析数据包”，平台地图ID 20197574。内部“8.2b”是遗留标题；当前使用${BUILDERS.length}建造者、v14兵种/技能与35波实际对象数据，不将5.0dJF数值混入新局。</p><h3>获取条件</h3><p>兵种图鉴可查完整登记对象、升级分支、实际条件与原始代码。外观选项单列对应本体和资格，皮肤不作为合成材料；原有费用与条件仍适用。菜单/预览对象不等于可建单位；外部账号资格、未确认的英雄入口等不按旧版数据开放。图鉴逐项区分参与模拟、状态标记和待核定技能。</p><h3>脚本优先</h3><p>九倍有阶段生命倍率、下一波随机替换、第11波收入变化及首次漏怪全队扣木。实际脚本与说明有冲突时使用可定位的执行逻辑；例如20/30波数量、实际无甲类型、全队奖励检查标志和采木系数，不照抄旧提示。</p><h3>存档与模拟边界</h3><p>本版使用独立v14存档，旧5.0dJF存档保留在浏览器，不自动混合迁移。暂停、倍速与刷新保留经济任务、攻击抬手和技能进度。</p><p>浏览器采用Canvas/SVG表现，未包含魔兽模型、贴图或音频。原生对象参数、已核定JASS机制与未核定项分别展示；当前是本地4v4 AI模拟，不含平台联网或付费资格验证。</p>`;
  $('help-dialog').showModal();
}

$('panel-content').addEventListener('click',e=>{const target=e.target.closest('button');if(!target)return;if(target.dataset.unit){cancelBuild();buildUnit=target.dataset.unit;battlefield.buildUnit=buildUnit;selected={type:'unit',unitId:buildUnit};battlefield.selected=null;$('battlefield').classList.add('building');$('build-hint').textContent=`部署 ${defs[buildUnit].name} · ${defs[buildUnit].cost} 金 · 点击自己的空格`; $('build-hint').hidden=false;panelKey='';selectionKey='';renderPanel();updateSelection();sound();}if(target.dataset.builder)command('builder',{builderId:target.dataset.builder});if(target.dataset.merc)command('merc',{mercId:target.dataset.merc});if(target.dataset.hero)command('hero',{heroId:target.dataset.hero});if(target.dataset.king)command('king',{stat:target.dataset.king});if(target.dataset.action==='heroes'){$('panel-content').scrollTop=$('panel-content').querySelector('.hero-section').offsetTop-$('panel-content').offsetTop;}else if(target.dataset.action==='kingmove'){cancelBuild();kingMoveMode=true;buildUnit=null;battlefield.buildUnit=null;focus(8);$('build-hint').hidden=false;$('build-hint').textContent='点击可行走地面，移动联盟国王 · Esc取消';}else if(target.dataset.action==='catalog')openCatalog();else if(target.dataset.action)command(target.dataset.action);});
$('selection-actions').addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.dataset.upgrade)command('upgrade',{buildingId:selected?.buildingId,unitId:t.dataset.upgrade});if(t.dataset.sell){command('sell',{buildingId:t.dataset.sell});select(null);}if(t.dataset.cancel)cancelBuild();if(t.dataset.inspect)openCatalog(t.dataset.inspect);if(t.dataset.form)command('form',{buildingId:t.dataset.form});if(t.dataset.stim)command('stim',{buildingId:t.dataset.stim});});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active));});panelKey='';renderPanel();}));
$('worker').onclick=()=>command('worker');$('lumber').onclick=()=>command('lumber');$('ready').onclick=()=>command('ready');$('pause').onclick=()=>command('pause');$('interfere').onclick=()=>{if(tMonsterMode){cancelBuild();return;}cancelBuild();tMonsterMode=true;battlefield.targetRadius=RULES.interfereRadius;const r=$('battlefield').getBoundingClientRect();battlefield.pointerPoint={x:r.width/2,y:r.height*.48};$('battlefield').classList.add('targeting');$('build-hint').hidden=false;$('build-hint').textContent='T怪：点击圆内怪物位置 · 双方怪物均可 · Esc取消';updateUI();};$('heal').onclick=()=>{const r=command('heal');if(r.ok)focus(8);};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>command('speed',{value:Number(b.dataset.speed)}));
function focus(lane){autoFollowing=false;battlefield.focus(lane);$('arena-location').textContent=lane==='all'?'八路战场全景':lane===8?'联盟国王防线':lane===9?'部落国王防线':lane===0?'我的战区':`${lane<4?'联盟':'部落'} ${lane%4+1} 路`;document.querySelectorAll('.view-buttons button:not(#view-routes)').forEach(b=>b.classList.remove('active'));$(lane==='all'?'view-all':lane>=8?'view-king':'view-home').classList.add('active');}
$('view-home').onclick=()=>focus(0);$('view-all').onclick=()=>focus('all');$('view-king').onclick=()=>focus(8);
$('team-list').onclick=e=>{const b=e.target.closest('[data-focus]');if(b)focus(Number(b.dataset.focus));};
$('minimap').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();focus(battlefield.minimapHit((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height));};
$('view-routes').onclick=()=>{battlefield.showRoutes=!battlefield.showRoutes;$('view-routes').classList.toggle('active',battlefield.showRoutes);$('view-routes').setAttribute('aria-pressed',String(battlefield.showRoutes));};
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{difficulty=b.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('active',x===b));});
$('start-game').onclick=()=>startMatch(false);$('continue-game').onclick=()=>startMatch(true);$('restart-game').onclick=()=>{$('end-dialog').close();startMatch(false);};$('new-game').onclick=()=>{if(started)command('pause',{value:true});$('welcome').hidden=false;try{saved=game.snapshot();$('continue-game').hidden=false;}catch{}};
$('catalog').onclick=()=>openCatalog();$('help').onclick=()=>help();$('wavebook').onclick=()=>help('waves');$('welcome-about').onclick=()=>help('about');document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>help(b.dataset.help));
$('ribbon-wave-name').onclick=()=>help('waves');
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').classList.toggle('on',soundOn);$('sound').title=soundOn?'关闭音效':'开启音效';$('sound').setAttribute('aria-label',$('sound').title);sound();};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>toast('当前浏览器暂不支持全屏'));};
document.addEventListener('keydown',e=>{if(!started||$('help-dialog').open||$('catalog-dialog')?.open||$('end-dialog').open||!$('welcome').hidden||e.repeat)return;if(e.key==='Escape')cancelBuild();if(e.code==='Space'){e.preventDefault();command(game.state.phase==='build'?'ready':'pause');}if(RULES.interfereEnabled&&e.key.toLowerCase()==='t')$('interfere').click();if(e.key.toLowerCase()==='h')$('heal').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started){save();game.state.paused=true;}});window.addEventListener('beforeunload',save);
function frame(now){const dt=Math.min((now-(lastFrame||now))/1000,.15);lastFrame=now;if(started&&$('welcome').hidden&&!$('help-dialog').open&&!$('catalog-dialog')?.open)game.tick(dt);updateEconomyPanel();if(tab==='attack')updateMercPanel();battlefield.draw(game.state,now/1000);battlefield.minimap($('minimap'),game.state);uiTimer+=dt;saveTimer+=dt;if(uiTimer>.18){uiTimer=0;updateUI();}if(saveTimer>8){saveTimer=0;save();}requestAnimationFrame(frame);}
$('builder-select').innerHTML=BUILDERS.map(b=>`<option value="${esc(b.id)}" ${b.id===builderId?'selected':''}>${esc(b.name)}${b.mode==='prophet'?' · 六阶随机':b.mode==='morph'?' · 随机变形':''}</option>`).join('');
function updateBuilderChoice(){builderId=$('builder-select').value;$('builder-description').textContent=BUILDERS.find(b=>b.id===builderId)?.mode==='prophet'?'从六阶107个候选中各抽一种（18/18/18/18/18/17），按来源分支升级。':BUILDERS.find(b=>b.id===builderId)?.mode==='morph'?'建造六阶变形体，完成后从对应候选池随机变形。':`使用本种族${BUILDERS.find(b=>b.id===builderId)?.rosterIds.length??0}种基础兵种，按v14来源分支与条件升级。`;}
$('builder-select').onchange=updateBuilderChoice;updateBuilderChoice();
updateUI();setTimeout(()=>battlefield.focus(0),50);requestAnimationFrame(frame);
// Deterministic read-only state is available to local QA and replay inspection.
window.legion={get game(){return game;},get renderer(){return battlefield;},get started(){return started;},get config(){return RULES;}};
