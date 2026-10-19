import {Game} from './engine.js';
import {UNITS,MERCENARIES,HEROES,WAVES,RULES} from './data.js';
import {Battlefield,unitIcon,drawPortrait} from './renderer.js';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defs=Object.fromEntries([...UNITS,...MERCENARIES,...HEROES].map(u=>[u.id,u]));
const typeNames={normal:'普通',pierce:'穿刺',magic:'魔法',chaos:'混乱',siege:'攻城'},armorNames={light:'轻甲',medium:'中甲',heavy:'重甲',fortified:'城甲',unarmored:'无甲'},roleNames={tank:'前排',frontline:'近战',ranged:'远程',support:'辅助',caster:'法师',control:'控制'};
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const num=n=>Math.floor(Number(n)||0).toLocaleString('zh-CN');
const time=n=>`${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,n)%60).toString().padStart(2,'0')}`;
const STORE='legion-ninefold-match-v1';
let saved=null;try{saved=JSON.parse(localStorage.getItem(STORE)||'null');}catch{}
let game=new Game({seed:42,difficulty:'normal'}),started=false,tab='build',difficulty='normal',selected=null,buildUnit=null,panelKey='',selectionKey='',uiTimer=0,saveTimer=0,lastFrame=0,endShown=false,soundOn=false,audio=null,lastWave=1,lastPhase='build';
let autoFollowWave=0,autoFollowing=false;
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
  if(type!=='merc')panelKey='';selectionKey='';updateUI();if(res?.ok)save();return res;
}
function save(){if(!started)return;try{localStorage.setItem(STORE,JSON.stringify(game.snapshot()));$('save-label').textContent='进度已保存';}catch{$('save-label').textContent='此浏览器暂不能存档';}}
function startMatch(resume=false){
  if(resume&&saved){try{game=Game.fromSnapshot(saved);}catch{game=new Game({seed:42,difficulty});}}
  else game=new Game({seed:Math.floor(Date.now()%2147483647),difficulty});
  game.state.paused=false;started=true;lastWave=game.state.wave;lastPhase=game.state.phase;selected=null;buildUnit=null;endShown=false;panelKey='';selectionKey='';$('welcome').hidden=true;
  autoFollowWave=0;autoFollowing=false;battlefield.selected=null;battlefield.buildUnit=null;focus(0);updateUI();save();sound('wave');
  toast('先选择兵种，再点击自己的建造格。前排与远程搭配更稳。');
}
function handleBattlefieldClick(hit,e){
  if(!started||!hit)return;
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
function cancelBuild(){buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;selected=null;battlefield.selected=null;panelKey='';selectionKey='';updateUI();}
function population(p){return p.workers+p.buildings.reduce((sum,b)=>sum+(defs[b.unitId]?.population||1),0)+(p.heroId?(defs[p.heroId]?.population||3):0);}
function power(p){return p.buildings.reduce((sum,b)=>sum+(b.spent??b.totalSpent??defs[b.unitId]?.cost??0),0)+(p.heroId?(defs[p.heroId]?.cost||280):0);}
function waveInfo(){return WAVES[Math.min(game.state.wave-1,WAVES.length-1)];}

function renderPanel(){
  const s=game.state,p=s.players[0],key=[tab,p.roster.join(','),p.heroId,s.phase,s.wave,p.populationCap,buildUnit].join('|');
  if(key===panelKey){if(tab==='king')updateKingPanel();if(tab==='attack')updateMercPanel();return;}panelKey=key;
  let html='';
  if(tab==='build'){
    html=`<div class="panel-intro"><span>先知兵种池</span><b>六阶随机 · 合理搭配</b></div><div class="roster-grid">`+p.roster.map(id=>{const u=defs[id];return `<button class="unit-card${buildUnit===id?' selected':''}" data-unit="${id}" title="${esc(u.name)} · ${u.cost}金币\n${esc(u.description)}"><span class="tier">T${u.tier}</span>${unitIcon(u)}<span><b>${esc(u.name)}</b><small>${u.cost} 金</small></span><span class="card-role">${roleNames[u.role]||'军团'}</span></button>`;}).join('')+`</div><div class="roster-toolbar"><button class="reroll-button" data-action="reroll">${icon('refresh')}切换兵种 <span>25 木</span></button><button class="reroll-button" data-action="farm" title="增加20人口上限，75金币">扩建营地</button><button class="reroll-button" data-action="heroes">军团英雄</button></div><div class="hero-section"><div class="section-heading"><span>军团英雄</span><small>${p.heroId?'已招募':'每局一位 · 280 金'}</small></div><div class="hero-grid">`+HEROES.map(h=>`<button class="hero-button${p.heroId===h.id?' active':''}" data-hero="${h.id}" title="${esc(h.name)} · ${esc(h.description)}" ${p.heroId?'disabled':''}>${unitIcon(h)}<small>${h.name}</small></button>`).join('')+`</div><p class="hero-copy">${p.heroId?esc(defs[p.heroId].ability.description):'英雄光环增强周围军团，搭配你的主力兵种。'}</p></div>`;
  }else if(tab==='attack'){
    html=`<div class="panel-intro"><span>发往部落 1 路</span><b>每种库存 3 只 · 逐只补充</b></div><div class="merc-list">`+MERCENARIES.map(m=>`<button class="merc-button" data-merc="${m.id}" title="${esc(m.description)}"><span class="merc-body">${unitIcon(m)}<span class="merc-info"><b>${esc(m.name)}<span class="queue-count" data-merc-queue hidden></span></b><small>${esc(m.ability?.name||'进攻佣兵')}</small></span><span class="merc-price">${m.wood} 木<small>收入 +${m.income}</small></span></span><span class="merc-stock-meta"><b data-merc-stock>库存 3/3</b><span data-merc-timer>库存已满</span></span><span class="merc-cooldown" role="progressbar" aria-label="${esc(m.name)}库存补充" aria-valuemin="0" aria-valuemax="100"><i></i></span></button>`).join('')+`</div><p class="hero-copy">每种最多缓存 3 只，消耗后逐只恢复。备战时发木参与当前波，战斗中进入下一波；木怪不随系统怪倍增。</p>`;
  }else{
    const k=s.kings[0];html=`<div class="king-panel"><svg class="king-large"><use href="#i-crown"/></svg><h3>联盟国王</h3><p>四路共同的最后防线<br>花费木材强化国王，同时获得回合收入</p><div class="king-health"><i id="king-panel-bar"></i></div><div id="king-panel-hp" class="king-hp-label"></div>`+[['hp','heart','生命上限',`每级 +${RULES.kingHpPerUpgrade} 生命`,k.hpLevel],['attack','swords','攻击力',`每级 +${RULES.kingDamagePerUpgrade} 攻击`,k.attackLevel],['regen','spark','生命恢复',`每级 +${RULES.kingRegenPerUpgrade} 回复/秒`,k.regenLevel]].map(([stat,ico,label,desc,lv])=>`<button class="king-upgrade" data-king="${stat}" title="${RULES.kingUpgradeCost}木材，收入增加${RULES.kingIncome||3}">${icon(ico)}<span><b>${label} <small style="display:inline">Lv.${lv}</small></b><small>${desc}</small></span><em>${RULES.kingUpgradeCost} 木</em></button>`).join('')+`<div class="team-heals">`+[0,1,2,3].map(i=>`<svg class="heal-charge ${i>=k.healCharges?'empty':''}"><use href="#i-heart"/></svg>`).join('')+`</div><p class="hero-copy">国王治疗每名玩家一口，全队共 4 次。<br>国王满血时不会消耗治疗。</p></div>`;
  }
  $('panel-content').innerHTML=html;if(tab==='king')updateKingPanel();if(tab==='attack')updateMercPanel();
}
function updateMercPanel(){
  const s=game.state,p=s.players[0];
  document.querySelectorAll('[data-merc]').forEach(button=>{
    const m=defs[button.dataset.merc],status=game.mercenaryStatus(m.id),queue=s.pendingSends.filter(v=>v.senderId===0&&v.mercId===m.id).length;
    const timer=status.locked?`第 ${m.unlock} 波解锁`:status.stock===status.maxStock?'库存已满':`补充 ${status.remaining.toFixed(1)}s${s.paused?' · 暂停':''}`;
    button.disabled=status.locked||status.stock===0||p.wood<m.wood||s.phase==='ended';
    button.classList.toggle('locked',status.locked);button.classList.toggle('empty',!status.locked&&status.stock===0);button.classList.toggle('unaffordable',!status.locked&&p.wood<m.wood);button.classList.toggle('recharging',!status.locked&&status.stock<status.maxStock);
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
function updateKingPanel(){const k=game.state.kings[0];if($('king-panel-bar'))$('king-panel-bar').style.width=`${Math.max(0,k.hp/k.maxHp)*100}%`;if($('king-panel-hp'))$('king-panel-hp').textContent=`${num(k.hp)} / ${num(k.maxHp)}  ·  攻击 ${num(k.attack)}  ·  回复 ${k.regen}/秒`;}
function updateSelection(){
  const s=game.state;let u=null,b=null,p=null,e=null;
  if(selected?.type==='building'){for(const player of s.players){const found=player.buildings.find(v=>v.id===selected.buildingId);if(found){b=found;p=player;u=defs[b.unitId];break;}}if(!b)selected=null;}
  else if(selected?.type==='unit')u=defs[selected.unitId];
  else if(selected?.type==='entity'){e=s.entities.find(v=>v.id===selected.entityId&&v.hp>0);if(e){u={...(defs[e.unitId]||waveInfo()),...e};p=s.players[e.ownerId];}else{selected=null;}}
  const key=[selected?.type,selected?.buildingId,selected?.entityId,u?.id,u?.unitId,s.phase,b?.unitId,p?.gold?Math.floor(p.gold):0,e?Math.ceil(e.hp):'',e?.routeMode,buildUnit].join('|');if(key===selectionKey)return;selectionKey=key;
  if(!u){$('selection').innerHTML=`<div class="selection-portrait"><canvas id="unit-portrait" width="100" height="100"></canvas></div><div class="selection-copy"><small>先知 · 建造者</small><h2>部署你的军团</h2><p>选择兵种后点击自己的格子布阵。<br>前排承伤，远程输出；多余金币发展经济。</p></div>`;drawPortrait($('unit-portrait'),null);$('selection-actions').innerHTML='';return;}
  const hp=e?`${num(e.hp)} / ${num(e.maxHp)}`:num(u.hp),damage=e?num(e.damage):num(u.damage),range=e?(e.range*100).toFixed(0):u.range;
  $('selection').innerHTML=`<div class="selection-portrait"><canvas id="unit-portrait" width="100" height="100"></canvas></div><div class="selection-copy"><small>${p?esc(p.name)+' · ':''}${u.race||'怪物'} · ${roleNames[u.role]||'系统怪'} · ${typeNames[u.attackType]||'普通'} / ${armorNames[u.armorType]||'中甲'}</small><h2>${esc(u.name)}</h2><div class="stat-chips"><span>生命<b>${hp}</b></span><span>攻击<b>${damage}</b></span><span>护甲<b>${u.armor??0}</b></span><span>射程<b>${range}</b></span></div><p>${esc(u.ability?.name?`${u.ability.name}：${u.ability.description||''}`:u.description||'自动作战的军团单位。')}</p></div>`;
  drawPortrait($('unit-portrait'),u);
  if(e?.side==='defender'&&e.routeMode){const label={guard:'防区交战',return:'返回出生口',warp_wait:'等待协防传送',support:'王前协防'}[e.routeMode];if(label){const order=document.createElement('p');order.className='unit-order';order.textContent=`当前行动：${label}`;$('selection').querySelector('.selection-copy').append(order);}}
  if(b&&p.id===0){$('selection-actions').innerHTML=(u.upgrades||[]).map(id=>{const v=defs[id];return `<button data-upgrade="${id}" ${s.phase!=='build'?'disabled':''}>升级 ${v.name}<small>${v.cost} 金币</small></button>`;}).join('')+`<button class="sell" data-sell="${b.id}" ${s.phase!=='build'?'disabled':''}>出售<small>+${Math.floor((b.spent??b.totalSpent??u.cost)*RULES.sellRatio)} 金币</small></button>`;}
  else if(selected?.type==='unit')$('selection-actions').innerHTML=`<button data-cancel="true">取消部署<small>Esc</small></button>`;
  else $('selection-actions').innerHTML='';
}

function updateUI(){
  const s=game.state,p=s.players[0],wave=waveInfo();
  $('gold').textContent=num(p.gold);$('wood').textContent=num(p.wood);$('income').textContent=`+${num(p.income)}`;$('tech').textContent=`${p.workers} / ${p.lumberLevel}`;
  $('phase-label').textContent=s.phase==='build'?'布阵准备':s.phase==='combat'?'怪物来袭':'对局结束';$('phase-label').style.color=s.phase==='combat'?'#d5aa7b':'#83ad80';$('wave-label').textContent=`第 ${String(s.wave).padStart(2,'0')} 波`;$('wave-time').textContent=time(s.timer);
  for(const [id,k]of[['ally',s.kings[0]],['enemy',s.kings[1]]]){$(`${id}-hp`).style.width=`${Math.max(0,k.hp/k.maxHp)*100}%`;$(`${id}-hp-text`).textContent=`${Math.ceil(k.hp/k.maxHp*100)}%`;}
  $('team-list').innerHTML=s.players.map(pl=>{const alive=s.entities.filter(e=>e.ownerId===pl.id&&e.side==='defender'&&e.hp>0).length,max=pl.buildings.length+(pl.heroId?1:0);return `<button class="team-row${pl.id===0?' me':''}${pl.team===1?' enemy':''}" data-focus="${pl.id}" title="查看${esc(pl.name)}的战区"><span class="player-number">${pl.id%4+1}</span><span class="player-info"><b>${esc(pl.name)}</b><small>${pl.workers}-${pl.lumberLevel} 科技 <em>${s.phase==='combat'?`存活 ${alive}`:'布阵中'}</em></small></span><span class="player-value">${num(power(pl))}</span><span class="row-health"><i style="width:${s.phase==='combat'&&max?Math.min(100,alive/max*100):100}%"></i></span></button>`;}).join('');
  $('wave-name').textContent=wave.name;$('wave-kind').textContent=`${typeNames[wave.attackType]}攻击 · ${armorNames[wave.armorType]}`;$('wave-count').textContent=wave.boss?`${wave.bossCount} 首领`:`${wave.baseCount*RULES.monsterMultiplier} 只`;$('wave-bounty').textContent=`${wave.bounty} 金`;
  $('ribbon-wave-name').textContent=`${wave.name} · ${wave.boss?wave.bossCount+'首领':wave.baseCount*RULES.monsterMultiplier+'只'}`;$('ribbon-wave-name').title=`${typeNames[wave.attackType]}攻击 / ${armorNames[wave.armorType]} · 点击图鉴`;
  $('wave-advice').textContent=wave.boss?'首领数量少但实力强，注意前排与单体输出。':wave.range>100?'远程怪物波。保护脆弱后排，避免近战脱节。':'密集怪潮，范围输出与前排协同更有效。';
  if($('wave-portrait').dataset.wave!==String(s.wave)){drawPortrait($('wave-portrait'),{...wave,isMonster:true});$('wave-portrait').dataset.wave=String(s.wave);}
  $('entity-count').textContent=s.phase==='combat'?`${s.entities.filter(e=>e.side==='monster'&&e.hp>0).length} 只怪物在场`:'6 × 8 建造区';
  const workerPrice=RULES.workerCostBase+(p.workers-1)*RULES.workerCostStep,lumberPrice=RULES.lumberUpgradeCostBase+p.lumberLevel*RULES.lumberUpgradeCostStep;
  $('worker-price').textContent=p.workers>=RULES.maxWorkers?'已满员':`${workerPrice} 金币`;$('lumber-price').textContent=p.lumberLevel>=RULES.maxLumberLevel?'已满级':`${lumberPrice} 金币`;$('worker').disabled=s.phase==='ended'||p.workers>=RULES.maxWorkers||p.gold<workerPrice;$('lumber').disabled=s.phase==='ended'||p.lumberLevel>=RULES.maxLumberLevel||p.gold<lumberPrice;
  $('wood-rate').textContent=`+${(p.workers*RULES.workerBaseWoodPerSecond*(1+p.lumberLevel*RULES.lumberRateStep)).toFixed(1)} 木/秒`;
  $('ready').disabled=s.phase!=='build';$('ready').innerHTML=`${icon('swords')}<b>${s.phase==='build'?`开始第 ${s.wave} 波`:s.phase==='combat'?'军团交战中':'对局已结束'}</b><kbd>空格</kbd>`;$('ready-subtext').textContent=s.phase==='build'?`${p.buildings.length} 个兵种已部署 · ${Math.ceil(s.timer)} 秒后自动开战`:`守住自己的防线，支援队友与国王`;
  $('pause').disabled=s.phase==='ended';$('pause').textContent=s.paused?'▶':'Ⅱ';$('pause').title=s.paused?'继续':'暂停';$('pause').setAttribute('aria-label',s.paused?'继续':'暂停');document.querySelectorAll('[data-speed]').forEach(b=>{b.disabled=s.phase==='ended';b.classList.toggle('active',Number(b.dataset.speed)===s.speed);});
  $('heal-count').textContent=`${s.kings[0].healCharges}/4`;$('heal').disabled=p.healUsed||s.kings[0].healCharges<=0||s.kings[0].hp>=s.kings[0].maxHp;$('interfere').disabled=s.phase!=='combat'||p.interfereCooldown>0;$('interfere').querySelector('span').textContent=p.interfereCooldown>0?`干扰 ${Math.ceil(p.interfereCooldown)}s`:'干扰';
  $('army-power').textContent=num(power(p));$('army-pop').textContent=`${population(p)} / ${p.populationCap||RULES.initialPopulation}`;$('kill-count').textContent=num(p.stats.kills);
  $('logs').innerHTML=s.logs.slice(-5).reverse().map(l=>`<div><span>${time(l.time)}</span>${esc(l.text)}</div>`).join('');
  renderPanel();updateSelection();
  document.querySelectorAll('[data-unit]').forEach(b=>{const u=defs[b.dataset.unit];b.classList.toggle('unaffordable',p.gold<u.cost);});
  if(s.wave!==lastWave){lastWave=s.wave;panelKey='';sound('wave');toast(`第 ${s.wave} 波准备：${wave.name}`);save();}
  if(s.phase!==lastPhase){if(s.phase==='combat'){buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;if(selected?.type==='building'){const unit=s.entities.find(e=>e.buildingId===selected.buildingId&&e.hp>0);selected=unit?{type:'entity',entityId:unit.id,laneId:unit.laneId}:null;battlefield.selected=selected;selectionKey='';updateSelection();}sound('wave');}else if(s.phase==='build')save();lastPhase=s.phase;panelKey='';}
  if(s.phase==='ended'&&!endShown){endShown=true;showEnd();save();}
  if(s.phase==='combat'&&s.timer>5&&battlefield.focusLane===0&&autoFollowWave!==s.wave&&!s.entities.some(e=>e.hp>0&&e.laneId===0)&&s.entities.some(e=>e.hp>0&&e.side==='monster'&&e.laneId===8)){autoFollowWave=s.wave;focus(8);autoFollowing=true;toast('战斗转入国王防线，镜头已跟随。');}
  if(s.phase==='build'&&autoFollowing){focus(0);autoFollowing=false;}
}
function showEnd(){const s=game.state,p=s.players[0],win=s.winner===0,draw=s.winner===-1||s.winner===null||s.winner==='draw';$('end-title').textContent=draw?'战局平分秋色':win?'联盟军团获胜':'部落军团获胜';$('end-eyebrow').textContent=draw?'势均力敌':win?'VICTORY':'DEFEAT';$('end-description').textContent=draw?'双方军团战至最后，国王生命与兵力未能分出胜负。':win?'你的军团守住了国王。攻守与经济，共同决定这一局的胜负。':'国王的防线已经失守。尝试调整造位、升级前排，并及时强化国王。';$('end-stats').innerHTML=`<span><b>${s.wave}</b>抵达波次</span><span><b>${num(p.stats.kills)}</b>击杀</span><span><b>${num(p.stats.sent)}</b>派出木怪</span>`;$('end-dialog').showModal();sound(win?'win':'error');}

function help(which='play'){
  document.querySelectorAll('[data-help]').forEach(b=>b.classList.toggle('active',b.dataset.help===which));
  if(which==='play')$('help-content').innerHTML=`<div class="help-stats"><div><small>阵营对抗</small><b>4 vs 4</b></div><div><small>首波每路系统怪</small><b>${WAVES[0].baseCount*9}</b></div><div><small>普通波数量倍率</small><b>9×</b></div></div><h3>先知的第一场战斗</h3><ol><li>在右侧选择兵种，点击自己 1 路的格子建造。靠近出怪方向的格子放前排，远程和辅助放后方。</li><li>点击已建造单位，可在下方升级或出售。升级价格是额外费用，出售返还累计投入的 ${Math.round(RULES.sellRatio*100)}%。</li><li>有余钱时招募小精灵、升级伐木。木材持续产出；在“进攻”页派木怪到敌方 1 路，同时增加之后每轮的收入。每种木怪最多缓存 3 只，消耗后按冷却逐只恢复，卡片下方显示库存与补充进度。</li><li>开战后军团自动交战。自己守不住的怪会进入国王防线，队友的存活军团会支援。你可以使用干扰，或为受伤的国王治疗。</li><li>双方各自守住四路。先击败对方国王的一方获胜；完成第35波后依剩余国王生命比例、兵力比较战果。</li></ol><h3>地形与协防</h3><p>双方各有四个防区，按 2×2 排列。北排的怪向南推进，南排向北；漏怪穿过横向通道，在中轴汇合后沿长道走向国王。点击战场上方“路线”可显示方向。</p><p>守军在防区接敌，清路后返回出生侧区域，满足条件才传送到王前。后置、接敌距离和清线速度会改变协防到场时刻。通道长度、转弯与碰撞都计入模拟时间。</p><h3>操作与镜头</h3><p>点击格子：建造或选中。拖动：移动镜头。滚轮：缩放。点击战况中的玩家或小地图：查看对应防线。手机上可双指缩放。</p><p><kbd>Esc</kbd>取消部署 <kbd>空格</kbd>备战时开战／交战时暂停 <kbd>T</kbd>干扰当前己方战区 <kbd>H</kbd>治疗国王。方向键或 WASD 可移动镜头。</p><h3>别把全部金币都花在科技上</h3><p>兵力、伐木和发木需要相互配合。开局先安排前排和输出，再提高科技。远程波和首领波需要调整阵容，范围伤害对密集怪潮更有效。暂停时也可以慢慢布阵。</p>`;
  else if(which==='waves')$('help-content').innerHTML=`<p>普通怪物每路数量 = Web 基数 × 9，Boss 单独设置。波次名称参考历史军团资料；属性与数量为本网页版调校值。</p><table class="wave-table"><thead><tr><th>波</th><th>怪物</th><th>每路数量</th><th>攻击 / 护甲</th><th>生命</th></tr></thead><tbody>${WAVES.map(w=>`<tr class="${w.boss?'boss-row':''} ${w.id===game.state.wave?'current-wave':''}"><td>${w.id}</td><td>${w.name}</td><td>${w.boss?w.bossCount:w.baseCount*9}</td><td>${typeNames[w.attackType]} / ${armorNames[w.armorType]}</td><td>${num(w.hp*(w.boss?1:RULES.webMonsterHpScale??.25))}</td></tr>`).join('')}</tbody></table>`;
  else $('help-content').innerHTML=`<h3>军团战争 9倍怪物 · Web 复刻</h3><p>这是可以独立运行的浏览器版本，复刻布阵、自动战斗、伐木经济、发木进攻、协防吃漏与国王胜负的玩法关系。你与3名AI队友对抗4名AI对手，目前不包含玩家联网匹配。</p><h3>版本与数值</h3><p>目标线索为11平台、9倍怪物、可能的15A2版本。公开资料尚不足以核定该版本的全部数据。本版的价格、技能、升级链、兵力、波次强度和9倍基数采用独立调校，没有把它们标作15A2的原版数值。Boss独立计数，木怪不随系统怪倍增。</p><p>目前有 ${UNITS.length} 种基础与升级单位、${MERCENARIES.length} 种木怪、${HEROES.length} 位英雄、${WAVES.length} 波。波次名称参考历史军团资料，其中31至35波是Web延长关。地图拓扑、怪物路径与守军传送语义另参考了可静态读取的11平台历史5.0dJF地图；6×8格数、通道宽度、距离和探测范围仍是Web参数。主要数值集中在data.js，地图配置在layout.js，便于继续校准。战斗超过100秒时，本Web会为当时的战斗单位加入狂暴攻速加成，移动速度不变；这不是已核定的原图机制。</p><h3>参考资料</h3><ul><li><a href="https://wc3maps.com/map/175858" target="_blank" rel="noopener">历史5.0dJF地图存档</a>：描述注明11平台，已静态核对地图区域与移动脚本；不是15A2版本证明。</li><li><a href="https://www.5211game.com/News/000/081/735.shtml" target="_blank" rel="noopener">11平台 木材的运用</a>：历史发木与兵营资料。</li><li><a href="https://www.5211game.com/News/000/081/729.shtml" target="_blank" rel="noopener">11平台 防脱节攻略</a>：造位、寻敌与干扰线索。</li><li><a href="https://tieba.baidu.com/p/9978062000" target="_blank" rel="noopener">11军团战争吧 9倍有什么攻略</a>：9倍玩法讨论。</li><li><a href="https://tieba.baidu.com/p/10060226468" target="_blank" rel="noopener">11军团9倍出怪崩溃反馈</a>：稳定性与平台语境。</li><li><a href="https://legiontd.forumotion.com/t429-legion-td-mega-book-overall-strategical-guide-3-41" target="_blank" rel="noopener">Legion TD Mega 3.41 历史攻略</a>：历史波次名称参考。</li></ul><h3>本地存档</h3><p>对局保存在当前浏览器的本地存储中。保存包含随机状态和战场状态，刷新后可继续。清理浏览器数据会删除存档。</p>`;
  if(!$('help-dialog').open)$('help-dialog').showModal();
}

$('panel-content').addEventListener('click',e=>{const target=e.target.closest('button');if(!target)return;if(target.dataset.unit){buildUnit=target.dataset.unit;battlefield.buildUnit=buildUnit;selected={type:'unit',unitId:buildUnit};battlefield.selected=null;$('battlefield').classList.add('building');$('build-hint').textContent=`部署 ${defs[buildUnit].name} · ${defs[buildUnit].cost} 金 · 点击自己的空格`; $('build-hint').hidden=false;panelKey='';selectionKey='';renderPanel();updateSelection();sound();}if(target.dataset.merc)command('merc',{mercId:target.dataset.merc});if(target.dataset.hero)command('hero',{heroId:target.dataset.hero});if(target.dataset.king)command('king',{stat:target.dataset.king});if(target.dataset.action==='heroes'){$('panel-content').scrollTop=$('panel-content').querySelector('.hero-section').offsetTop-$('panel-content').offsetTop;}else if(target.dataset.action)command(target.dataset.action);});
$('selection-actions').addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.dataset.upgrade)command('upgrade',{buildingId:selected?.buildingId,unitId:t.dataset.upgrade});if(t.dataset.sell){command('sell',{buildingId:t.dataset.sell});select(null);}if(t.dataset.cancel)cancelBuild();});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active));});panelKey='';renderPanel();}));
$('worker').onclick=()=>command('worker');$('lumber').onclick=()=>command('lumber');$('ready').onclick=()=>command('ready');$('pause').onclick=()=>command('pause');$('interfere').onclick=()=>command('interfere',{laneId:typeof battlefield.focusLane==='number'&&[0,1,2,3,8].includes(battlefield.focusLane)?battlefield.focusLane:0});$('heal').onclick=()=>{const r=command('heal');if(r.ok)focus(8);};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>command('speed',{value:Number(b.dataset.speed)}));
function focus(lane){autoFollowing=false;battlefield.focus(lane);$('arena-location').textContent=lane==='all'?'八路战场全景':lane===8?'联盟国王防线':lane===9?'部落国王防线':lane===0?'我的战区':`${lane<4?'联盟':'部落'} ${lane%4+1} 路`;document.querySelectorAll('.view-buttons button:not(#view-routes)').forEach(b=>b.classList.remove('active'));$(lane==='all'?'view-all':lane>=8?'view-king':'view-home').classList.add('active');}
$('view-home').onclick=()=>focus(0);$('view-all').onclick=()=>focus('all');$('view-king').onclick=()=>focus(8);
$('team-list').onclick=e=>{const b=e.target.closest('[data-focus]');if(b)focus(Number(b.dataset.focus));};
$('minimap').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();focus(battlefield.minimapHit((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height));};
$('view-routes').onclick=()=>{battlefield.showRoutes=!battlefield.showRoutes;$('view-routes').classList.toggle('active',battlefield.showRoutes);$('view-routes').setAttribute('aria-pressed',String(battlefield.showRoutes));};
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{difficulty=b.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('active',x===b));});
$('start-game').onclick=()=>startMatch(false);$('continue-game').onclick=()=>startMatch(true);$('restart-game').onclick=()=>{$('end-dialog').close();startMatch(false);};$('new-game').onclick=()=>{if(started)command('pause',{value:true});$('welcome').hidden=false;try{saved=game.snapshot();$('continue-game').hidden=false;}catch{}};
$('help').onclick=()=>help();$('wavebook').onclick=()=>help('waves');$('welcome-about').onclick=()=>help('about');document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>help(b.dataset.help));
$('ribbon-wave-name').onclick=()=>help('waves');
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').classList.toggle('on',soundOn);$('sound').title=soundOn?'关闭音效':'开启音效';$('sound').setAttribute('aria-label',$('sound').title);sound();};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>toast('当前浏览器暂不支持全屏'));};
document.addEventListener('keydown',e=>{if(!started||$('help-dialog').open||$('end-dialog').open||!$('welcome').hidden||e.repeat)return;if(e.key==='Escape')cancelBuild();if(e.code==='Space'){e.preventDefault();command(game.state.phase==='build'?'ready':'pause');}if(e.key.toLowerCase()==='t')$('interfere').click();if(e.key.toLowerCase()==='h')$('heal').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started){save();game.state.paused=true;}});window.addEventListener('beforeunload',save);
function frame(now){const dt=Math.min((now-(lastFrame||now))/1000,.15);lastFrame=now;if(started&&$('welcome').hidden&&!$('help-dialog').open)game.tick(dt);if(tab==='attack')updateMercPanel();battlefield.draw(game.state,now/1000);battlefield.minimap($('minimap'),game.state);uiTimer+=dt;saveTimer+=dt;if(uiTimer>.18){uiTimer=0;updateUI();}if(saveTimer>8){saveTimer=0;save();}requestAnimationFrame(frame);}
updateUI();setTimeout(()=>battlefield.focus(0),50);requestAnimationFrame(frame);
// Deterministic read-only state is available to local QA and replay inspection.
window.legion={get game(){return game;},get renderer(){return battlefield;},get started(){return started;},get config(){return RULES;}};
