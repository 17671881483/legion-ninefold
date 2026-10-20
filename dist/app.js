import {Game} from './engine.js';
import {MATCH_STORAGE_KEYS,matchMode,readMatch,writeMatch} from './match-storage.js';
import {UNITS,MERCENARIES,HEROES,WAVES,RULES,BUILDERS} from './data.js';
import {describeSkills} from './skills.js';
import {openCatalog} from './catalog-ui.js';
import {Battlefield,unitIcon,drawPortrait,isEntityVisible} from './renderer.js';
import {isAppearanceVariant,appearanceBaseLabel,splitUnitCategories,unitBranchLabel,unitCategoryLabel,unitDisplayName,documentUnit} from './unit-categories.js';
import {SANDBOX_QUALIFICATIONS,SANDBOX_QUALIFICATION_KEYS} from './sandbox-qualifications.js';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defs=Object.fromEntries([...UNITS,...MERCENARIES,...HEROES].map(u=>[u.id,u]));
const typeNames={hero:'英雄',normal:'普通',pierce:'穿刺',magic:'魔法',chaos:'混乱',siege:'攻城',spells:'法术'},armorNames={hero:'英雄甲',light:'轻甲',medium:'中甲',heavy:'重甲',fortified:'城甲',unarmored:'无甲',divine:'神圣甲'},roleNames={tank:'前排',frontline:'近战',ranged:'远程',support:'辅助',caster:'法师',control:'控制'};
const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const num=n=>Math.floor(Number(n)||0).toLocaleString('zh-CN');
const time=n=>`${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,n)%60).toString().padStart(2,'0')}`;
let mode='normal',saved=null;
try{saved=readMatch(localStorage,mode);}catch{}
let game=new Game({seed:42,difficulty:'normal'}),started=false,tab='build',difficulty='normal',builderId=RULES.defaultBuilderId,selected=null,buildUnit=null,panelKey='',selectionKey='',uiTimer=0,saveTimer=0,lastFrame=0,endShown=false,soundOn=false,audio=null,lastWave=1,lastPhase='build';
let autoFollowWave=0,autoFollowing=false,kingMoveMode=false,tMonsterMode=false,spellTargetMode=null;
let economyDisplayGame=null,economyDisplayWorkers=0,economyDisplayLevel=0;
let boxGiftDisplayGame=null,boxGiftDisplayKey='',boxGiftSelections=Object.create(null);
const battlefield=new Battlefield($('battlefield'),handleBattlefieldClick);
const initialState=game.state;
updateModeChoice();

function toast(message,error=false){const t=document.createElement('div');t.className=`toast${error?' error':''}`;t.textContent=message;$('toast-container').append(t);setTimeout(()=>t.remove(),2700);}
function sound(kind='click'){
  if(!soundOn)return;
  try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const at=audio.currentTime;const notes=kind==='wave'?[196,246.94,293.66]:kind==='win'?[261.63,329.63,392,523.25]:kind==='error'?[110]:kind==='build'?[293.66,392]:[220];notes.forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(0,at+i*.07);g.gain.linearRampToValueAtTime(.035,at+i*.07+.015);g.gain.exponentialRampToValueAtTime(.001,at+i*.07+.18);o.connect(g);g.connect(audio.destination);o.start(at+i*.07);o.stop(at+i*.07+.2);});}catch{}
}
function command(type,payload={}){
  const res=game.command(type,payload);if(res?.message)toast(res.message,!res.ok);if(res?.ok)sound(type==='build'||type==='upgrade'?'build':type==='ready'?'wave':'click');else sound('error');
  if(res?.ok&&['race','builder','reroll','sandboxBuilder','sandboxWave','sandboxReset','sandboxClear'].includes(type)){buildUnit=null;battlefield.buildUnit=null;selected=null;battlefield.selected=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;}if(type!=='merc')panelKey='';selectionKey='';updateUI();if(res?.ok)save();return res;
}
function clearSpellTarget(){
  spellTargetMode=null;battlefield.spellTarget=null;selectionKey='';
  if(!tMonsterMode&&!kingMoveMode){$('battlefield').classList.remove('targeting');if(!buildUnit)$('build-hint').hidden=true;}
}
function currentSpellTarget(){
  if(!spellTargetMode)return null;
  const e=game.state.entities.find(e=>e.id===spellTargetMode.entityId&&isEntityVisible(e)&&e.ownerId===0),skill=e?game.unitSkillStatus?.(e.id,0).find(s=>s.id===spellTargetMode.skillId):null;
  return e&&skill?.canStart&&!game.state.paused&&game.state.phase===spellTargetMode.phase&&game.state.wave===spellTargetMode.wave?{entity:e,skill}:null;
}
function startSpellTarget(entityId,skill){
  kingMoveMode=false;tMonsterMode=false;buildUnit=null;battlefield.buildUnit=null;battlefield.targetRadius=null;
  $('battlefield').classList.remove('building');spellTargetMode={entityId,skillId:skill.id,targetKind:skill.targetKind,phase:game.state.phase,wave:game.state.wave};
  battlefield.spellTarget={entityId,targetKind:skill.targetKind,range:skill.range,radius:skill.radius};$('battlefield').classList.add('targeting');
  const r=$('battlefield').getBoundingClientRect();battlefield.pointerPoint??={x:r.width/2,y:r.height*.48};
  $('build-hint').textContent=`${skill.name}：点击${skill.targetKind==='enemy'?'敌方单位':skill.targetKind==='unit'?'单位目标':'地面位置'}施放 · Esc取消`;$('build-hint').hidden=false;selectionKey='';updateUI();
}
function save(){if(!started)return;try{const snapshot=game.snapshot();writeMatch(localStorage,snapshot);if(mode===matchMode(game.state))saved=snapshot;$('save-label').textContent=matchMode(game.state)==='sandbox'?'沙盒进度已保存':'进度已保存';}catch{$('save-label').textContent='此浏览器暂不能存档';}}
function updateModeChoice(){
  try{saved=readMatch(localStorage,mode);}catch{saved=null;}
  document.querySelectorAll('[name="match-mode"]').forEach(input=>input.checked=input.value===mode);
  const sandbox=mode==='sandbox';
  $('mode-description').textContent=sandbox?'10万金 · 10万木 · 300人口，自由切族、指定波次，独立存档。':'普通对局按原有资源与时间规则进行。';
  $('start-game').innerHTML=sandbox?'进入测试沙盒 <span>→</span>':'进入战场 <span>→</span>';
  $('continue-game').textContent=sandbox?'继续上次沙盒':'继续上次对局';
  $('welcome-foot').textContent=sandbox?'默认单路测试，可启用 AI 进行八路模拟 · 沙盒独立保存':'你与 3 名 AI 队友，对抗部落军团 · 对局自动保存在此浏览器';
  $('continue-game').hidden=!saved||(!sandbox&&saved.state.phase==='ended');
}

function updateSandbox(syncFields=false){
  const s=game.state,building=s.phase==='build';
  $('sandbox-status').textContent=`第 ${s.wave} 波 · ${s.phase==='combat'?'战斗中':building?'自由布阵':'测试结束'} · 军团 ${s.players[0].buildings.length} 个`;
  if(syncFields){$('sandbox-wave').value=String(s.wave);$('sandbox-builder').value=s.players[0].builderId;}
  $('sandbox-switch-builder').disabled=!building;
  $('sandbox-ai').disabled=!building;$('sandbox-ai').checked=!!s.sandbox?.aiEnabled;
  document.querySelectorAll('[data-build-only]').forEach(button=>button.disabled=!building);
  $('sandbox-switch-builder').title=building?'免费更换建造者，保留现有阵容':'请先返回布阵';
  const entitlements=s.players[0].entitlements??{},qualification=SANDBOX_QUALIFICATIONS.find(q=>q.key===$('sandbox-qualification').value),enabled=qualification?[qualification.key,...qualification.aliases].some(key=>!!entitlements[key]):false;
  $('sandbox-super-sponsor').checked=!!entitlements.h220;$('sandbox-super-sponsor').disabled=matchMode(s)!=='sandbox';
  $('sandbox-qualification-status').textContent=qualification?`${qualification.label}（${qualification.key}）：${enabled?'已开启':'未开启'} · 本地测试资格，随沙盒存档保存`:'请选择来源资格';
  $('sandbox-enable-qualification').disabled=!qualification||enabled;$('sandbox-disable-qualification').disabled=!qualification||!enabled;
}
function sandboxCommand(type,payload={}){
  const result=command(type,payload);
  $('sandbox-feedback').textContent=result.message;$('sandbox-feedback').classList.toggle('error',!result.ok);
  if(result.ok){
    if(['sandboxReset','sandboxWave','sandboxClear','sandboxBuilder'].includes(type))cancelBuild();
    if(['sandboxReset','sandboxWave'].includes(type)){$('end-dialog').close();endShown=false;autoFollowWave=0;focus(0);}
    updateSandbox(true);
  }
  return result;
}
function startMatch(resume=false){
  if(resume&&saved){try{const key=MATCH_STORAGE_KEYS[mode];if(saved.state?.dataRevision!==RULES.dataRevision&&!localStorage.getItem(key+'-before-document'))localStorage.setItem(key+'-before-document',JSON.stringify(saved));game=Game.fromSnapshot(saved);}catch{game=new Game({seed:42,difficulty,builderId,mode});toast('存档无法载入，已创建新的'+(mode==='sandbox'?'测试沙盒':'对局'),true);}}
  else game=new Game({seed:Math.floor(Date.now()%2147483647),difficulty,builderId,mode});
  game.state.paused=false;started=true;lastWave=game.state.wave;lastPhase=game.state.phase;selected=null;buildUnit=null;endShown=false;panelKey='';selectionKey='';$('welcome').hidden=true;
  autoFollowWave=0;autoFollowing=false;kingMoveMode=false;tMonsterMode=false;clearSpellTarget();battlefield.targetRadius=null;$('battlefield').classList.remove('targeting');battlefield.selected=null;battlefield.buildUnit=null;focus(0);updateUI();save();sound('wave');
  toast(mode==='sandbox'?'测试沙盒已就绪，点击右上角“测试沙盒”调整波次与资源。':'先选择兵种，再点击自己的建造格。前排与远程搭配更稳。');
}
function handleBattlefieldClick(hit,e){
  if(!started)return;
  if(spellTargetMode){
    const pending=spellTargetMode,current=currentSpellTarget();if(!current){clearSpellTarget();updateUI();toast('单位或技能状态已变化，请重新选择技能',true);return;}
    const payload={entityId:pending.entityId,skillId:pending.skillId,playerId:0};
    if(['enemy','unit'].includes(pending.targetKind)){const target=hit?.type==='entity'?game.state.entities.find(t=>t.id===hit.entityId&&isEntityVisible(t)):null;if(!target||pending.targetKind==='enemy'&&target.side===current.entity.side||target?.battleTeam!==current.entity.battleTeam){toast(pending.targetKind==='enemy'?'请选择敌方单位':'请选择有效单位',true);return;}payload.targetId=target.id;}
    else{const r=$('battlefield').getBoundingClientRect(),point=battlefield.unproject(e.clientX-r.left,e.clientY-r.top);payload.worldX=point.x;payload.worldY=point.y;}
    const result=command('cast',payload);if(result.ok){clearSpellTarget();updateUI();}return;
  }
  if(tMonsterMode){const r=$('battlefield').getBoundingClientRect(),point=battlefield.unproject(e.clientX-r.left,e.clientY-r.top),res=command('interfere',{worldX:point.x,worldY:point.y});if(res.ok){cancelBuild();}return;}
  if(!hit)return;
  if(kingMoveMode){const r=$('battlefield').getBoundingClientRect(),point=battlefield.unproject(e.clientX-r.left,e.clientY-r.top),res=command('kingMove',{worldX:point.x,worldY:point.y});if(res.ok){kingMoveMode=false;$('build-hint').hidden=true;}return;}
  if(hit.type==='cell'){
    const existing=game.state.players[hit.playerId]?.buildings.find(b=>b.col===hit.col&&b.row===hit.row);
    if(existing){select({type:'building',buildingId:existing.id,playerId:hit.playerId});return;}
    if(buildUnit){if(hit.playerId!==0){toast('请在自己的 1 路防线建造',true);return;}const entry=defs[buildUnit]?.heroEntry,r=command('build',{unitId:buildUnit,col:hit.col,row:hit.row});if(r.ok){const b=game.state.players[0].buildings.at(-1);if(entry){buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;panelKey='';}selected={type:'building',buildingId:b.id,playerId:0};battlefield.selected=selected;selectionKey='';updateUI();}return;}
    select(null);
  }else if(hit.type==='building'){select({...hit});}
  else if(hit.type==='entity'){select({...hit});}
  else if(!e.shiftKey){cancelBuild();}
}
function select(value){if(spellTargetMode&&value?.entityId!==spellTargetMode.entityId)clearSpellTarget();selected=value;battlefield.selected=value;selectionKey='';updateSelection();updateBuildPanel();}
function cancelBuild(){kingMoveMode=false;tMonsterMode=false;clearSpellTarget();battlefield.targetRadius=null;$('battlefield').classList.remove('targeting');buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;selected=null;battlefield.selected=null;panelKey='';selectionKey='';updateUI();}
const unitPopulation=u=>Number(u?.population??1),unitLevel=u=>u?.heroEntry?'':u?.heroLevel>0?`Lv.${u.heroLevel}`:u?.heroStage?`阶段 ${u.heroStage}`:'';
function population(p){return (p.workers+(p.economyTasks?.workerQueue?.length??0))*(RULES.workerPopulation??1)+p.buildings.reduce((sum,b)=>sum+Math.max(unitPopulation(defs[b.unitId]),b.construction?unitPopulation(defs[b.construction.targetId]):0),0)+(p.heroId?(defs[p.heroId]?.population??3):0);}
function reservedPopulation(p){return (p.economyTasks?.workerQueue?.length??0)*(RULES.workerPopulation??1)+p.buildings.reduce((sum,b)=>{if(!b.construction)return sum;const current=unitPopulation(defs[b.unitId]),target=unitPopulation(defs[b.construction.targetId]);return sum+(b.unitId===b.construction.targetId?Math.max(current,target):Math.max(0,target-current));},0);}
function unitPrice(u,upgrade=false){const cost=upgrade?(u.upgradeCost??u.upgradeGold??u.cost):u.cost,duration=Number(u.buildTime??u.buildingRawFields?.bldtm??0);return `${cost} 金${u.woodCost?`＋${u.woodCost} 木`:''} · ${unitPopulation(u)} 人口${duration?` · ${duration}秒`:''}`;}
function buildOptionStatus(u,building=null){
  const s=game.state,p=s.players[0],gate=game.requirementStatus?.(u.id),hero=u.heroEntry?game.heroStatus?.():null,cost=building?(u.upgradeCost??u.upgradeGold??u.cost):u.cost;
  let reason=s.phase==='ended'?'本局已结束':s.phase!=='build'?'等待战斗结束':building?.construction?'等待施工完成':hero?.canStart===false?hero.reason||'英雄祭坛当前不可建造':gate?.canStart===false?gate.reason||'未满足来源条件':'';
  if(!reason&&population(p)-(building?unitPopulation(defs[building.unitId]):0)+unitPopulation(u)>p.populationCap)reason=`人口不足 · 需要 ${unitPopulation(u)} 人口`;
  if(!reason&&(p.gold+1e-8<cost||p.wood+1e-8<(u.woodCost??0)))reason=`需要 ${cost} 金${u.woodCost?`＋${u.woodCost} 木`:''}`;
  return {canStart:!reason,reason};
}
function power(p){return p.buildings.reduce((sum,b)=>sum+(b.construction?0:(defs[b.unitId]?.sourcePoints??b.spent??b.totalSpent??defs[b.unitId]?.cost??0)),0)+(p.heroId?(defs[p.heroId]?.cost||280):0);}
const activeUnits=UNITS.filter(u=>!u.legacy);
const waveCount=w=>w.count??(w.boss?w.bossCount:w.baseCount*RULES.monsterMultiplier);
const kingCap=stat=>game.kingUpgradeCap?.(stat)??RULES.kingUpgradeCaps?.[stat]??RULES.kingUpgradeMax;
const healAmount=()=>RULES.kingHealFraction?Math.floor(game.state.kings[0].maxHp*RULES.kingHealFraction):RULES.kingHealAmount;
function waveInfo(){return WAVES[Math.min(game.state.wave-1,WAVES.length-1)];}

function renderHeroPanel(entries){
  return `<section id="hero-section" class="hero-section" aria-label="英雄祭坛"><div class="section-heading"><span>英雄祭坛</span><small data-hero-limit></small></div><div class="hero-status" role="status"><b data-hero-summary></b><span data-hero-military></span><p data-hero-help></p><div class="hero-owned" data-hero-owned></div></div><div class="document-heroes">${entries.map(id=>{const u=defs[id];return u?`<button class="hero-entry${buildUnit===id?' selected':''}" data-unit="${esc(id)}" aria-pressed="${buildUnit===id}">${unitIcon(u)}<span><b>${esc(u.name)}</b><small>${esc(unitPrice(u))}</small><em data-build-reason></em></span></button>`:'';}).join('')}</div><p class="hero-copy">建造祭坛 → 选定英雄 → 按本版阶段成长。施工完成或开波时生效。</p></section>`;
}
function updateBuildPanel(){
  const s=game.state,p=s.players[0],hero=game.heroStatus?.(),ids=hero?.buildingIds??(hero?.buildingId?[hero.buildingId]:[]),buildings=p.buildings.filter(b=>ids.includes(b.id)),building=buildings.find(b=>b.id===selected?.buildingId)??buildings.find(b=>b.construction)??buildings.at(-1),u=defs[building?.unitId],target=defs[building?.construction?.targetId];
  const summary=document.querySelector('[data-hero-summary]');
  if(summary){
    summary.textContent=hero?.limit?`祭坛次数 ${hero.count??buildings.length} / ${hero.limit}${hero.remaining?` · 还可建 ${hero.remaining} 次`:''}`:'建造英雄祭坛';
    document.querySelector('[data-hero-limit]').textContent=hero?.limit?`每局 ${hero.limit} 次${hero.limit>1?' · 英雄类型不重复':''}`:'';
    const military=document.querySelector('[data-hero-military]');military.textContent=hero?.requiredMilitary?`军力 ${num(hero.military)} / ${num(hero.requiredMilitary)}`:'';military.classList.toggle('met',!!hero&&hero.military>=hero.requiredMilitary);
    document.querySelector('[data-hero-help]').textContent=building?.construction?`${u?.name??'祭坛'}：${target&&target.id!==u?.id?`升级为 ${target.name}${unitLevel(target)?` ${unitLevel(target)}`:''}`:'施工'} · 剩余 ${Math.max(0,building.construction.finishAt-s.time).toFixed(1)}秒${s.paused?' · 已暂停':''}`:building?u?.heroEntry?'祭坛已完成，点击下方祭坛选择英雄。':`${u?.name??'英雄'}${unitLevel(u)?` ${unitLevel(u)}`:''} 已完成，点击下方英雄查看升级。`:hero?.reason||'选择祭坛后，点击自己的空格建造。';
    const owned=document.querySelector('[data-hero-owned]'),ownedKey=buildings.map(b=>`${b.id}:${b.unitId}:${!!b.construction}`).join('|');
    if(owned.dataset.key!==ownedKey){owned.dataset.key=ownedKey;owned.innerHTML=buildings.map(b=>{const def=defs[b.unitId];return `<button data-hero-building="${esc(b.id)}" title="查看 ${esc(def?.name??'祭坛')}">${esc(def?.name??'祭坛')}${unitLevel(def)?` ${unitLevel(def)}`:''}${b.construction?' · 施工中':''}</button>`;}).join('');}
    const shortcut=document.querySelector('[data-hero-shortcut-status]');if(shortcut)shortcut.textContent=hero?.limit?`${hero.count??0}/${hero.limit}`:'';
  }
  document.querySelectorAll('[data-unit]').forEach(button=>{
    const u=defs[button.dataset.unit];if(!u)return;const status=buildOptionStatus(u);
    button.disabled=!status.canStart;button.classList.toggle('unaffordable',p.gold<u.cost||p.wood<(u.woodCost??0));button.classList.toggle('selected',buildUnit===u.id);button.setAttribute('aria-pressed',String(buildUnit===u.id));
    const action=status.reason||(buildUnit===u.id?'已选择 · 点击自己的空格':u.heroEntry?'点击选择祭坛':'点击选择兵种');
    button.title=`${u.name} · ${unitPrice(u)}\n${u.description??''}\n${action}`;button.setAttribute('aria-label',`${u.name}，${unitPrice(u)}，${action}`);
    const reason=button.querySelector('[data-build-reason]');if(reason){reason.textContent=action;reason.classList.toggle('blocked',!status.canStart);}
  });
  document.querySelectorAll('[data-upgrade]').forEach(button=>{
    const u=defs[button.dataset.upgrade],building=p.buildings.find(b=>b.id===selected?.buildingId);if(!u||!building)return;const status=buildOptionStatus(u,building);
    button.disabled=!status.canStart;button.title=`${isAppearanceVariant(u)?`${unitBranchLabel(u)} · 对应本体：${appearanceBaseLabel(u,activeUnits)}。`:''}${u.name} · ${unitPrice(u,true)}\n${status.reason||'点击开始升级'}`;button.setAttribute('aria-label',button.title);
    const reason=button.querySelector('[data-upgrade-reason]');if(reason){reason.hidden=!status.reason;reason.textContent=status.reason;}
  });
  const deployment=document.querySelector('[data-deployment-status]'),selectedUnit=defs[selected?.unitId];if(deployment&&selectedUnit)deployment.textContent=`${unitPrice(selectedUnit)} · ${buildOptionStatus(selectedUnit).reason||'已选择，点击自己的空格建造'}`;
}

function renderTreasurePanel(){
  const rewards=game.treasureStatus();
  if(!rewards.length)return '';
  return `<section class="treasure-section" aria-label="宝藏奖励"><h3>宝藏奖励 <small>${rewards.length} 份待领取</small></h3><p>每份选择一项。军团护甲保留在建筑上，从下次出战生效。</p>${rewards.map(t=>`<details class="treasure-card" data-treasure-id="${esc(t.id)}" ${rewards.length===1?'open':''}><summary>第${t.sourceWave}波宝藏 · ${t.level}级奖励</summary><div class="treasure-options"><button data-treasure="${esc(t.id)}" data-reward="gold">金币 +${t.gold}</button><button data-treasure="${esc(t.id)}" data-reward="wood">木材 +${t.wood}</button><button data-treasure="${esc(t.id)}" data-reward="kingArmor">国王护甲 +${t.kingArmor}</button>${t.canLumber?`<button data-treasure="${esc(t.id)}" data-reward="lumber" ${t.lumberAvailable?'':'disabled'} title="${t.lumberAvailable?'立即免费提升1级伐木科技':'伐木科技已满，包含研究中的预留'}">伐木科技 +1</button>`:''}</div><label class="treasure-target">强化军团<select aria-label="选择宝藏护甲目标" data-treasure-target>${t.targets.length?t.targets.map(b=>`<option value="${esc(b.buildingId)}">${esc(b.name)} · 护甲${b.armor}</option>`).join(''):'<option value="">请先完成军团建筑</option>'}</select></label><button class="treasure-armor" data-treasure="${esc(t.id)}" data-reward="unitArmor" ${t.targets.length?'':'disabled'}>所选军团护甲 +${t.unitArmor}</button></details>`).join('')}</section>`;
}
function ensureBoxGiftPanel(){
  const panel=$('panel-content');
  if(!$('box-gift-section')){
    const section=document.createElement('section');section.id='box-gift-section';section.className='box-gift-section';section.setAttribute('aria-label','神秘礼物');
    section.innerHTML='<details data-box-details><summary><span>神秘礼物</span><small data-box-summary>暂无待领取礼物</small></summary><p class="box-gift-intro">普通对局清完第6波后随机三选一，清完第13波后替换当前组选项。领取一项即用完当前整组礼物，与宝藏分别领取。</p><div class="box-gift-offers" data-box-offers></div><p class="box-gift-empty" data-box-empty>尚未获得神秘礼物。</p></details>';
    const main=document.createElement('div');main.dataset.panelMain='';panel.replaceChildren(section,main);boxGiftDisplayKey='';
  }
  return $('box-gift-section');
}
function setBoxText(element,value){const text=String(value??'');if(element&&element.textContent!==text)element.textContent=text;}
function syncBoxOptions(select,entries,value,placeholder){
  const key=JSON.stringify(entries.map(entry=>String(entry.id)));
  if(select.dataset.optionsKey!==key){select.dataset.optionsKey=key;select.innerHTML='<option value=""></option>'+entries.map(entry=>`<option value="${esc(entry.id)}"></option>`).join('');}
  setBoxText(select.options[0],placeholder);entries.forEach((entry,index)=>setBoxText(select.options[index+1],entry.name));
  if(select.value!==value)select.value=value;
}
function updateBoxGiftPanel(){
  const section=ensureBoxGiftPanel(),reward=game.boxRewardStatus?.(0)??null,offers=reward?.offers??[],key=JSON.stringify([reward?.providerId??null,reward?.tier??null,reward?.sourceWave??null,reward?.pendingSwap??null,offers.map(offer=>[offer.id,offer.targetKind,offer.pendingSwap??null])]);
  if(boxGiftDisplayGame!==game||boxGiftDisplayKey!==key){
    boxGiftDisplayGame=game;boxGiftDisplayKey=key;boxGiftSelections=Object.create(null);
    section.querySelector('[data-box-offers]').innerHTML=offers.map((offer,index)=>`<article class="box-gift-card" data-box-offer="${esc(offer.id)}"><h4><span class="box-gift-number">${index+1}</span><span data-box-name></span></h4><p class="box-gift-description" data-box-description></p>${offer.targetKind==='none'?'':`<label class="box-gift-field">选择自己的建筑<select data-box-building aria-label="${esc(offer.name)}：选择建筑"></select></label>`}${offer.targetKind==='training'?'<label class="box-gift-field">训练目标分支<select data-box-unit aria-label="兵种训练：选择目标分支"></select></label><p class="box-gift-cost" data-box-cost></p><details class="box-gift-conditions"><summary>查看分支费用与条件</summary><ul data-box-conditions></ul></details><p class="box-gift-training-note">按目标原价40%支付金币和木材，即时训练；训练失败保留本组礼物。</p>':''}<p class="box-gift-reason" data-box-reason role="status" aria-live="polite"></p><button data-box-claim="${esc(offer.id)}">${offer.targetKind==='training'?'支付并训练':'领取此项礼物'}</button></article>`).join('');
    section.querySelector('[data-box-details]').open=!!offers.length;
  }
  section.classList.toggle('has-reward',!!offers.length);section.querySelector('[data-box-empty]').hidden=!!offers.length;
  setBoxText(section.querySelector('[data-box-summary]'),offers.length?`第${reward.sourceWave}波 · ${offers.length}选1`:'暂无待领取礼物');
  for(const offer of offers){
    const card=[...section.querySelectorAll('[data-box-offer]')].find(node=>node.dataset.boxOffer===String(offer.id));if(!card)continue;
    const selection=boxGiftSelections[offer.id]??={buildingId:'',unitId:''},buildings=offer.targets??[],buildingSelect=card.querySelector('[data-box-building]');
    setBoxText(card.querySelector('[data-box-name]'),offer.name);setBoxText(card.querySelector('[data-box-description]'),offer.description);
    if(buildingSelect){
      if(!buildings.some(target=>String(target.buildingId)===selection.buildingId)){selection.buildingId='';selection.unitId='';}
      syncBoxOptions(buildingSelect,buildings.map(target=>({id:target.buildingId,name:`${target.name}${target.canStart===false?' · 当前不可用':''}`})),selection.buildingId,buildings.length?'请选择建筑':'当前没有可选建筑');buildingSelect.disabled=!buildings.length;
    }
    let canStart=!!offer.canStart,reason=offer.reason||'';
    if(offer.targetKind==='training'){
      const building=buildings.find(target=>String(target.buildingId)===selection.buildingId),training=building?game.boxTrainingStatus?.(building.buildingId,0):null,targets=training?.targets??[],unitSelect=card.querySelector('[data-box-unit]');
      if(!targets.some(target=>String(target.unitId)===selection.unitId))selection.unitId='';
      syncBoxOptions(unitSelect,targets.map(target=>({id:target.unitId,name:`${target.name} · ${num(target.cost?.gold)}金＋${num(target.cost?.wood)}木${target.canStart?'':' · 未满足条件'}`})),selection.unitId,building?(targets.length?'请选择训练分支':'这座建筑没有训练分支'):'请先选择建筑');unitSelect.disabled=!building||!targets.length;
      const target=targets.find(target=>String(target.unitId)===selection.unitId);
      setBoxText(card.querySelector('[data-box-cost]'),target?`本次支付 ${num(target.cost?.gold)} 金币＋${num(target.cost?.wood)} 木材 · 原价40%`:'选定分支后显示本次训练费用（原价40%）');
      reason=offer.reason||(!building?'请选择要训练的建筑':!target?(training?.reason||'请选择训练目标分支'):target.reason||(!training?.canStart?training?.reason:'')||'');
      canStart=canStart&&!!building&&!!training?.canStart&&!!target?.canStart;
      const conditions=card.querySelector('[data-box-conditions]'),conditionsKey=JSON.stringify(targets.map(target=>[target.unitId,target.name,target.cost,target.canStart,target.reason]));
      if(conditions.dataset.key!==conditionsKey){conditions.dataset.key=conditionsKey;conditions.innerHTML=targets.length?targets.map(target=>`<li class="${target.canStart?'available':'blocked'}"><b>${esc(target.name)}</b><span>${num(target.cost?.gold)}金＋${num(target.cost?.wood)}木 · ${esc(target.canStart?'条件已满足':target.reason||'当前不可训练')}</span></li>`).join(''):'<li>选定建筑后查看目标分支。</li>';}
    }else if(offer.targetKind==='building'){
      const building=buildings.find(target=>String(target.buildingId)===selection.buildingId);canStart=canStart&&!!building&&building.canStart!==false;reason=reason||building?.reason||(!building?'请选择领取效果的建筑':'');
    }
    const button=card.querySelector('[data-box-claim]');button.disabled=!canStart;button.title=reason||(offer.targetKind==='training'?'支付所列费用，训练并用完本组礼物':'领取此项并用完本组礼物');
    const reasonElement=card.querySelector('[data-box-reason]');setBoxText(reasonElement,reason||(canStart?'可以领取 · 领取后本组其余选项消失':''));reasonElement.classList.toggle('blocked',!canStart);
  }
}
function claimBoxGift(button){
  if(!button.dataset.boxClaim)return false;
  const reward=game.boxRewardStatus?.(0),offer=reward?.offers?.find(offer=>String(offer.id)===button.dataset.boxClaim),selection=boxGiftSelections[button.dataset.boxClaim];
  if(!offer){updateBoxGiftPanel();return true;}
  const building=offer.targets?.find(target=>String(target.buildingId)===selection?.buildingId);
  if(offer.targetKind==='training')command('boxTrain',{buildingId:building?.buildingId,unitId:selection?.unitId});
  else command('boxReward',{abilityId:offer.id,...(offer.targetKind==='building'?{buildingId:building?.buildingId}:{})});
  return true;
}
function renderPanel(){
  const s=game.state,p=s.players[0],key=[tab,p.roster.join(','),p.builderId,p.heroId,s.phase,s.wave,p.populationCap,p.rerolls,p.raceChanges,p.builderChoices?.join(','),buildUnit,(p.treasures??[]).map(t=>t.id).join(','),p.treasures?.length?p.buildings.map(b=>[b.id,b.unitId,!!b.construction,b.treasureArmor]).join(';'):'',p.treasures?.length?p.lumberLevel:''].join('|');
  if(key===panelKey){if(tab==='king')updateKingPanel();if(tab==='attack')updateMercPanel();return;}panelKey=key;
  let html='';
  if(tab==='build'){
    const builder=BUILDERS.find(b=>b.id===p.builderId),entries=game.heroStatus?.().entries??builder?.heroEntryIds??[];
    html=`${p.builderChoices?.length?`<div class="builder-offer"><small>选择新的建造者</small>${p.builderChoices.map(id=>{const b=BUILDERS.find(b=>b.id===id);return `<button data-builder="${id}">${esc(b?.name||id)}</button>`;}).join('')}</div>`:''}<div class="panel-intro"><span>${esc(builder?.name||'旧局')}军团</span><b>${builder?.mode==='prophet'?'六阶随机 · 每阶一种':builder?.mode==='morph'?'六阶代理 · 随机变形':'种族专属 · 基础与升级'}</b></div><div class="roster-grid">`+p.roster.map(id=>{const u=defs[id];if(!u)return '';return `<button class="unit-card${buildUnit===id?' selected':''}" data-unit="${id}" title="${esc(u.name)} · ${u.cost}金币${u.woodCost?` ${u.woodCost}木`:''}\n${esc(u.description)}"><span class="tier">T${u.tier||'—'}</span>${unitIcon(u)}<span><b>${esc(u.name)}</b><small>${u.cost} 金${u.woodCost?` ${u.woodCost}木`:''}</small></span><span class="card-role">${u.morphProxy?'随机变形':roleNames[u.role]||'军团'}</span></button>`;}).join('')+`</div><div class="roster-toolbar">${builder?.mode==='prophet'?`<button class="reroll-button" data-action="reroll">${icon('refresh')}重选兵种 <span>${RULES.rerollCosts?.[p.rerolls]??RULES.rerollCost} 木 · ${p.rerolls}/${RULES.rerollCount}</span></button>`:''}<button class="reroll-button" data-action="farm" title="${RULES.farmCost}金币、${RULES.farmWoodCost||0}木，${RULES.farmTrainingSeconds}秒后增加${RULES.farmPopulation}人口">建造农场</button><button class="reroll-button" data-action="race" title="换族${p.raceChanges||0}/${RULES.rerollCount}次，下一次${RULES.builderChangeGoldCosts?.[p.raceChanges||0]??0}金＋${RULES.builderChangeWoodCosts?.[p.raceChanges||0]??0}木；抽两个建造者供选择">更换种族</button><button class="reroll-button hero-shortcut" data-action="heroes" aria-controls="hero-section">${icon('crown')}英雄<span data-hero-shortcut-status></span></button><button class="reroll-button" data-action="catalog">兵种图鉴</button></div>${renderHeroPanel(entries)}`;

  }else if(tab==='attack'){
    html=`<div class="panel-intro"><span>开战时分配敌军四路</span><b>独立库存 · 逐只补充</b></div><div class="merc-list">`+MERCENARIES.filter(m=>!m.shopPreview).map(m=>`<button class="merc-button" data-merc="${m.id}" title="${esc(m.description)}"><span class="merc-body">${unitIcon(m)}<span class="merc-info"><b>${esc(m.name)}<span class="queue-count" data-merc-queue hidden></span></b><small>${esc(m.ability?.name||'进攻佣兵')}</small></span><span class="merc-price">${m.wood} 木<small data-merc-income>收入 +${m.income}</small></span></span><span class="merc-stock-meta"><b data-merc-stock>库存 ${m.stockMax}/${m.stockMax}</b><span data-merc-timer>库存已满</span></span><span class="merc-cooldown" role="progressbar" aria-label="${esc(m.name)}库存补充" aria-valuemin="0" aria-valuemax="100"><i></i></span></button>`).join('')+`</div><p class="hero-copy">发兵对象按v14脚本阶段解锁及切换；库存独立恢复。第11波起木怪收入按点数整数减半；国王强化单独计收入。开战轮询分配敌军四路，${s.mode==='sandbox'?'沙盒请在布阵期发兵，参与本次测试。':'战斗中购买参与下一波。'}</p>`;
  }else{
    const k=s.kings[0];html=`<div class="king-panel"><svg class="king-large"><use href="#i-crown"/></svg><h3>联盟国王</h3><p>四路共同的最后防线<br>花费木材强化国王，同时获得回合收入</p><div class="king-health"><i id="king-panel-bar"></i></div><div id="king-panel-hp" class="king-hp-label"></div>`+[['hp','heart','生命上限',`下级 +${RULES.kingHpUpgradeIncrements?.[k.hpLevel]??RULES.kingHpPerUpgrade} 生命（静态映射）`,k.hpLevel],['attack','swords','攻击力',`每级 +${RULES.kingDamagePerUpgrade} 攻击`,k.attackLevel],['regen','spark','生命恢复',`每级 +${RULES.kingRegenPerUpgrade} 回复/秒`,k.regenLevel]].map(([stat,ico,label,desc,lv])=>`<button class="king-upgrade" data-king="${stat}" title="${RULES.kingUpgradeCost}木材，收入增加${RULES.kingIncome}">${icon(ico)}<span><b>${label} <small style="display:inline">Lv.${lv}/${kingCap(stat)}</small></b><small>${desc}</small></span><em>${RULES.kingUpgradeCost} 木</em></button>`).join('')+`<div class="team-heals">`+[0,1,2,3].map(i=>`<svg class="heal-charge ${i>=k.healCharges?'empty':''}"><use href="#i-heart"/></svg>`).join('')+`</div><p class="hero-copy">国王治疗每名玩家一口，全队共 4 次，每次回复 ${num(healAmount())} 生命（最大生命${Math.round((RULES.kingHealFraction??.5)*100)}%）。<br>团队治疗间隔 ${RULES.kingHealLockSeconds} 秒。</p><button class="king-move" data-action="kingmove" ${s.wave<31||s.phase==='ended'?'disabled':''}>移动国王<small>${s.wave<31?'第31波起开放':'选择后点击路面'}</small></button></div>`;
  }
  ensureBoxGiftPanel();$('panel-content').querySelector('[data-panel-main]').innerHTML=renderTreasurePanel()+html;if(tab==='king')updateKingPanel();if(tab==='attack')updateMercPanel();
}
function updateMercPanel(){
  const s=game.state,p=s.players[0],sandboxCombat=matchMode(s)==='sandbox'&&s.phase==='combat';
  document.querySelectorAll('[data-merc]').forEach(button=>{
    const m=defs[button.dataset.merc],status=game.mercenaryStatus(m.id),queue=s.pendingSends.filter(v=>v.senderId===0&&v.mercId===m.id).length;
    const timer=status.locked?(status.reason??`第 ${m.unlock} 波${m.unlockPhase?'开战':''}解锁`):status.stock===status.maxStock?'库存已满':`补充 ${status.remaining.toFixed(1)}s${s.paused?' · 暂停':''}`;
    button.disabled=sandboxCombat||status.locked||status.stock===0||p.wood<m.wood||s.phase==='ended';
    button.classList.toggle('locked',status.locked);button.classList.toggle('empty',!status.locked&&status.stock===0);button.classList.toggle('unaffordable',!status.locked&&p.wood<m.wood);button.classList.toggle('recharging',!status.locked&&status.stock<status.maxStock);
    button.querySelector('[data-merc-income]').textContent=`收入 +${status.income??(s.wave>=11?(m.incomeLate??Math.floor(m.income/2)):m.income)}`;
    button.querySelector('[data-merc-stock]').textContent=`库存 ${status.stock}/${status.maxStock}`;
    button.querySelector('[data-merc-timer]').textContent=timer;
    const badge=button.querySelector('[data-merc-queue]');badge.hidden=queue===0;badge.textContent=`已派 ${queue}`;
    const bar=button.querySelector('.merc-cooldown'),percent=Math.max(0,Math.min(100,status.locked?0:status.progress*100));
    bar.firstElementChild.style.width=`${percent}%`;bar.setAttribute('aria-valuenow',String(Math.round(percent)));bar.setAttribute('aria-valuetext',timer);
    const reason=sandboxCombat?'沙盒请在布阵期发兵，参与本次测试':status.locked?timer:s.phase==='ended'?'对局已结束':status.stock===0?'等待库存补充':p.wood<m.wood?'木材不足':'点击派出一只';
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
  $('worker').title=`招募小精灵：预付${price(w.cost)}，开始招募后返还；${w.duration}秒。${workerHint}。${workerTask?`当前剩余${workerTask.remaining.toFixed(1)}秒，`:'备战与战斗期间均可招募，'}${s.paused?'已暂停，':''}${w.canStart?'点击排入训练队列':w.reason}`;
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
  else if(selected?.type==='entity'){e=s.entities.find(v=>v.id===selected.entityId&&isEntityVisible(v));if(e){u={...(defs[e.unitId]||waveInfo()),...e,...(e.skillSpecs?{abilityIds:e.skillSpecs.map(a=>a.id)}:{})};p=s.players[e.ownerId];}else{selected=null;battlefield.selected=null;}}
  const key=[selected?.type,selected?.buildingId,selected?.entityId,u?.id,u?.unitId,s.phase,s.paused,b?.unitId,b?.construction?Math.ceil(b.construction.finishAt-s.time):'',Math.floor(s.players[0].gold),e?Math.ceil(e.hp):'',e?Math.floor(e.mana??0):'',e?Math.floor(s.time*4):'',e?.routeMode,buildUnit,spellTargetMode?.skillId].join('|');if(key===selectionKey)return;selectionKey=key;
  const manualSkills=e?.ownerId===0?(game.unitSkillStatus?.(e.id,0)??[]):[],manualById=new Map(manualSkills.map(a=>[a.id,a]));
  if(!u){$('selection').innerHTML=`<div class="selection-portrait"><canvas id="unit-portrait" width="100" height="100"></canvas></div><div class="selection-copy"><small>${esc(BUILDERS.find(b=>b.id===game.state.players[0].builderId)?.name||'军团')} · 建造者</small><h2>部署你的军团</h2><p>选择兵种后点击自己的格子布阵。<br>前排承伤，远程输出；多余金币发展经济。</p></div>`;drawPortrait($('unit-portrait'),null);$('selection-actions').innerHTML='';return;}
  const hp=e?`${num(e.hp)} / ${num(e.maxHp)}`:num(u.hp),damage=e?num(e.damage):num(u.damage),range=e?(e.range*100).toFixed(0):u.range;
  $('selection').innerHTML=`<div class="selection-portrait"><canvas id="unit-portrait" width="100" height="100"></canvas></div><div class="selection-copy"><small>${p?esc(p.name)+' · ':''}${u.race||'怪物'} · ${u.heroEntry?'英雄入口':u.hero?'英雄':isAppearanceVariant(u)?`${esc(unitBranchLabel(u))}（本体：${esc(appearanceBaseLabel(u,activeUnits))}）`:esc(documentUnit(u)?unitCategoryLabel(u):roleNames[u.role]||'系统怪')}${u.heroEntry?'':` · ${typeNames[u.attackType]||'普通'} / ${armorNames[u.armorType]||'中甲'}`}</small><h2>${esc(unitDisplayName(u))}${unitLevel(u)?` <span class="hero-level">${unitLevel(u)}</span>`:''}</h2>${u.heroEntry?'<p>先在自己的空格建造祭坛，完成后从下方选定英雄。</p>':`<div class="stat-chips"><span>生命<b>${hp}</b></span><span>攻击<b>${damage}</b></span><span>护甲<b>${u.armor??0}</b></span><span>射程<b>${range}</b></span></div><p>${esc(describeSkills(u).map(a=>a.name).join(' · ')||u.description||'自动作战的军团单位。')}</p>`}</div>`;
  const doc=documentUnit(u);if(doc?.acquisitionText){const note=document.createElement('p');note.className='document-acquisition';note.textContent=`获得方式：${doc.acquisitionText}`;note.title=doc.conditionText||'';$('selection').querySelector('.selection-copy').append(note);}
  drawPortrait($('unit-portrait'),u);
  if(e?.skillSpecs){const casts=e.skillSpecs.filter(a=>['implemented','partial'].includes(a.status)&&a.cooldown>0).sort((a,b)=>Math.max(e.skillStates?.[b.id]?.readyAt??0,e.skillStates?.[b.id]?.yseraAutoReadyAt??0)-Math.max(e.skillStates?.[a.id]?.readyAt??0,e.skillStates?.[a.id]?.yseraAutoReadyAt??0)).slice(0,3);if(casts.length){const node=document.createElement('div');node.className='live-skill-cds';node.innerHTML=casts.map(a=>{const manual=manualById.get(a.id),left=manual?.remaining??Math.max(0,(e.skillStates?.[a.id]?.readyAt??0)-s.time),autoLeft=manual?.autoRemaining??Math.max(0,(e.skillStates?.[a.id]?.yseraAutoReadyAt??0)-s.time),label=manual?.cooldownMode==='shared_native'?`共用冷却 ${left>0?`${left.toFixed(1)}s`:'就绪'}`:manual?`手动${left>0?`${left.toFixed(1)}s`:'就绪'} · 自动${autoLeft>0?`${autoLeft.toFixed(1)}s`:'就绪'}`:left>0?`${left.toFixed(1)}s`:'就绪',pct=100*(1-Math.min(1,Math.max(left,autoLeft)/a.cooldown));return `<span title="${esc(a.name)}${a.status==='partial'?' · 部分核定':''}：${esc(label)}"><small>${esc(a.name)}${a.status==='partial'?' · 部分核定':''}</small><small>${esc(label)}</small><i><em style="width:${pct}%"></em></i></span>`;}).join('');$('selection').querySelector('.selection-copy').append(node);}}
  if(b?.construction){const node=document.createElement('p'),target=defs[b.construction.targetId],upgrading=target&&target.id!==b.unitId,reserved=upgrading?Math.max(0,unitPopulation(target)-unitPopulation(u)):unitPopulation(u);node.className='unit-order';node.textContent=`${upgrading?`升级为 ${target.name}${unitLevel(target)?` ${unitLevel(target)}`:''}`:'建造中'} · 剩余 ${Math.max(0,b.construction.finishAt-s.time).toFixed(1)}秒${reserved?` · 已预留 ${reserved} 人口`:''}${s.paused?' · 已暂停':''}`;$('selection').querySelector('.selection-copy').append(node);}
  else if(b&&(u.heroEntry||u.hero)){const node=document.createElement('p');node.className='unit-order';node.textContent=u.heroEntry?'祭坛已完成 · 从右侧选择英雄':`${unitLevel(u)||'英雄'} · 已完成${u.upgrades?.length?' · 可继续升级':' · 已到当前升级链末端'}`;$('selection').querySelector('.selection-copy').append(node);}
  if(selected?.type==='unit'&&u.heroEntry){const node=document.createElement('p');node.className='unit-order';node.dataset.deploymentStatus='';node.textContent=`${unitPrice(u)} · ${buildOptionStatus(u).reason||'已选择，点击自己的空格建造'}`;$('selection').querySelector('.selection-copy').append(node);}
  if(e?.side==='defender'&&e.routeMode){const label={guard:'防区交战',return:'返回出生口',warp_wait:'等待协防传送',support:'王前协防'}[e.routeMode];if(label){const order=document.createElement('p');order.className='unit-order';order.textContent=`当前行动：${label}`;$('selection').querySelector('.selection-copy').append(order);}}
  if(b&&p.id===0){
    const groups=splitUnitCategories((u.upgrades||[]).map(id=>defs[id]).filter(Boolean));
    const renderGroup=(targets,label,appearance=false)=>targets.length?`<span class="unit-order upgrade-group-label">${label}</span>`+targets.map(v=>`<button data-upgrade="${esc(v.id)}" data-unit-category="${appearance?'appearance':'upgrade'}" title="${esc(unitCategoryLabel(v))} · ${esc(documentUnit(v)?.conditionText||'需满足原有资格与条件')}" ${s.phase!=='build'||b.construction?'disabled':''}>${appearance?esc(unitBranchLabel(v)):u.heroEntry?'选择':'升级'} ${esc(unitDisplayName(v))}${unitLevel(v)?` <span class="hero-level">${unitLevel(v)}</span>`:''}<small>${esc(unitPrice(v,true))}</small><em class="upgrade-reason" data-upgrade-reason hidden></em></button>`).join(''):'';
    $('selection-actions').innerHTML=renderGroup(groups.normal,u.heroEntry?'选择英雄':u.hero?'英雄升级':'兵种升级')+renderGroup(groups.easter,'彩蛋升级')+renderGroup(groups.pending,'彩蛋路径（待核定）')+renderGroup(groups.followups,'彩蛋后续升级')+renderGroup(groups.appearances,'外观与权益选项',true)+`<button class="sell" data-sell="${b.id}" ${s.phase!=='build'?'disabled':''}>出售<small>按当前阶段结算</small></button>`;
  }
  else if(selected?.type==='unit')$('selection-actions').innerHTML=`<button data-cancel="true">取消部署<small>Esc</small></button>`;
  else $('selection-actions').innerHTML='';
  if(b&&(u.hero||u.heroEntry||!u.legacy&&u.buildingAbilityIds&&!u.buildingAbilityIds.includes('A008')))$('selection-actions').querySelector('[data-sell]')?.remove();
  if(b&&p?.id===0&&['h062','h05Q'].includes(u.sourceRawcode))$('selection-actions').innerHTML+=`<button data-form="${b.id}" ${s.phase!=='build'||b.construction?'disabled':''}>切换形态<small>免费 · 1秒</small></button>`;
  if(b&&p?.id===0&&u.sourceRawcode==='h06I')$('selection-actions').innerHTML+=`<button data-stim="${b.id}" ${s.phase!=='build'||b.construction||p.gold<75?'disabled':''}>兴奋剂<small>75金 · 本波有效</small></button>`;
  if(manualSkills.length)$('selection-actions').innerHTML+=`<span class="unit-order upgrade-group-label">手动技能</span>`+manualSkills.map(a=>{const partial=a.status==='partial',active=spellTargetMode?.entityId===e.id&&spellTargetMode.skillId===a.id,manual=a.remaining>0?`${a.remaining.toFixed(1)}s`:'就绪',automatic=a.autoRemaining>0?`${a.autoRemaining.toFixed(1)}s`:'就绪',help=a.reason||(a.targetKind==='none'?'点击立即施放':`点击后选择${a.targetKind==='enemy'?'敌方单位':a.targetKind==='unit'?'单位目标':'地面位置'}`);return `<button data-cast-skill="${esc(a.id)}" data-cast-entity="${esc(e.id)}" aria-pressed="${active}" aria-label="${esc(a.name)}${partial?'，部分核定':''}，${a.manaCost}魔法，${a.cooldownMode==='shared_native'?`共用冷却${manual}`:`手动${manual}，自动${automatic}`}" title="${esc(help)}${partial?'；主效果可用，部分原生行为仍待核定':''}" ${a.canStart?'':'disabled'}>${esc(a.name)}${partial?' · 部分核定':''}<small>${a.manaCost}魔法 · ${a.cooldownMode==='shared_native'?'共用冷却':'手动'} ${manual}</small>${a.cooldownMode==='shared_native'?'':`<small>自动 ${automatic}</small>`}</button>`;}).join('');
  if(u&&(e?.unitId||u.id))$('selection-actions').innerHTML+=`<button data-inspect="${esc(e?.unitId||u.id)}">兵种详情<small>${e?`魔法 ${num(e.mana)} / ${num(e.maxMana)}`:'获得条件与技能'}</small></button>`;
}

function updateUI(){
  const s=game.state,p=s.players[0],wave=waveInfo();
  if(spellTargetMode&&!currentSpellTarget())clearSpellTarget();
  $('gold').textContent=num(p.gold);$('wood').textContent=num(p.wood);$('income').textContent=`+${num(p.income)}`;$('tech').textContent=`${p.workers} / ${p.lumberLevel}`;
  const sandbox=matchMode(s)==='sandbox';$('sandbox-tools').hidden=!sandbox;
  $('phase-label').textContent=s.phase==='build'?(s.roundMode==='arena-prep'?'竞技准备':s.roundMode==='arena-transition'?'竞技结束过渡':'布阵准备'):s.phase==='combat'?(s.roundMode==='arena'?'军团竞技':s.wave>=31?'最终攻防':'怪物来袭'):'对局结束';$('phase-label').style.color=s.phase==='combat'?'#d5aa7b':'#83ad80';$('wave-label').textContent=`第 ${String(s.wave).padStart(2,'0')} 波`;$('wave-time').textContent=sandbox&&s.phase==='build'?'手动开波':time(s.roundMode==='arena'?s.arenaRemaining:s.wave>=31&&s.continuousRemaining!=null?s.continuousRemaining:s.timer);
  for(const [id,k]of[['ally',s.kings[0]],['enemy',s.kings[1]]]){$(`${id}-hp`).style.width=`${Math.max(0,k.hp/k.maxHp)*100}%`;$(`${id}-hp-text`).textContent=`${Math.ceil(k.hp/k.maxHp*100)}%`;}
  $('team-list').innerHTML=s.players.map(pl=>{const alive=s.entities.filter(e=>e.ownerId===pl.id&&e.side==='defender'&&e.hp>0).length,max=pl.buildings.length+(pl.heroId?1:0);return `<button class="team-row${pl.id===0?' me':''}${pl.team===1?' enemy':''}" data-focus="${pl.id}" title="查看${esc(pl.name)}的战区"><span class="player-number">${pl.id%4+1}</span><span class="player-info"><b>${esc(pl.name)}</b><small>${pl.workers}-${pl.lumberLevel} 科技 <em>${s.phase==='combat'?`存活 ${alive}`:'布阵中'}</em></small></span><span class="player-value">${num(power(pl))}</span><span class="row-health"><i style="width:${s.phase==='combat'&&max?Math.min(100,alive/max*100):100}%"></i></span></button>`;}).join('');
  $('wave-name').textContent=wave.name;$('wave-kind').textContent=`${typeNames[wave.attackType]}攻击 · ${wave.armorDisplayName??armorNames[wave.armorType]}`;$('wave-count').textContent=`${waveCount(wave)} ${wave.boss?'首领':'只'}`;$('wave-bounty').textContent=`${wave.bounty} 金`;
  $('ribbon-wave-name').textContent=s.roundMode==='arena'?'军团竞技 · 120秒上限':`${wave.name} · ${waveCount(wave)+(wave.boss?'首领':'只')}`;$('ribbon-wave-name').title=`${typeNames[wave.attackType]}攻击 / ${wave.armorDisplayName??armorNames[wave.armorType]} · 点击图鉴`;
  $('wave-advice').textContent=wave.boss?'首领数量少但实力强，注意前排与单体输出。':wave.range>100?'远程怪物波。保护脆弱后排，避免近战脱节。':'密集怪潮，范围输出与前排协同更有效。';if(s.wave===5)$('wave-advice').textContent+=' 另有每路一只藏宝猎人，争夺全局首杀/末杀奖励。';else if(s.wave>=7&&s.wave<=19)$('wave-advice').textContent+=' 本波每队随机一路出现宝藏怪，奖励归原路线玩家。';
  if($('wave-portrait').dataset.wave!==String(s.wave)){drawPortrait($('wave-portrait'),{...wave,isMonster:true});$('wave-portrait').dataset.wave=String(s.wave);}
  $('entity-count').textContent=s.roundMode==='arena'?'双方军团竞技':s.phase==='combat'?`${s.entities.filter(e=>e.side==='monster'&&e.hp>0).length} 只怪物在场`:'6 × 8 建造区';
  updateEconomyPanel();
  $('ready').disabled=s.phase!=='build'||s.roundMode==='arena-transition';$('ready').innerHTML=`${icon('swords')}<b>${s.phase==='build'?(s.roundMode==='arena-prep'?'开始军团竞技':s.roundMode==='arena-transition'?'竞技结束过渡':`开始第 ${s.wave} 波`):s.phase==='combat'?(s.roundMode==='arena'?'竞技交战中':'军团交战中'):'对局已结束'}</b><kbd>空格</kbd>`;$('ready-subtext').textContent=s.phase==='build'?`${p.buildings.length} 个兵种已部署 · ${sandbox?'等待手动开波':`${Math.ceil(s.timer)} 秒后自动开战`}`:`守住自己的防线，支援队友与国王`;
  $('pause').disabled=s.phase==='ended';$('pause').textContent=s.paused?'▶':'Ⅱ';$('pause').title=s.paused?'继续':'暂停';$('pause').setAttribute('aria-label',s.paused?'继续':'暂停');document.querySelectorAll('[data-speed]').forEach(b=>{b.disabled=s.phase==='ended';b.classList.toggle('active',Number(b.dataset.speed)===s.speed);});
  $('heal-count').textContent=`${s.kings[0].healCharges}/4`;const healWait=Math.max(0,(s.kings[0].healBlockedUntil??0)-s.time);$('heal').disabled=s.phase==='ended'||p.healUsed||s.kings[0].healCharges<=0||s.kings[0].hp>=s.kings[0].maxHp||healWait>0;$('heal').title=healWait>0?`团队治疗间隔 ${healWait.toFixed(1)}秒`:`国王回复 ${num(healAmount())} 生命，每人一次`;const tWait=Math.max(0,(p.interfereUntil??0)-s.time),tReady=RULES.interfereEnabled&&s.phase==='combat'&&s.roundMode!=='arena'&&!s.paused&&tWait<=0;
  $('interfere').disabled=!tReady;$('interfere').querySelector('span').textContent=tMonsterMode?'选择位置':'T 怪';
  $('interfere-status').textContent=tWait>0?`${tWait.toFixed(1)}s`:s.paused?'已暂停':s.phase!=='combat'||s.roundMode==='arena'?'待开战':'选点';
  $('interfere').setAttribute('aria-pressed',String(tMonsterMode));$('interfere').title='T怪／防卡兵：点击或按T后选择位置，打断圆内双方怪物尚未出手的普通攻击，重发进攻指令。冷却5秒；Esc取消。';
  const tProgress=Math.max(0,Math.min(100,(1-tWait/RULES.interfereCooldown)*100));$('interfere-progress').firstElementChild.style.width=`${tProgress}%`;$('interfere-progress').setAttribute('aria-valuenow',String(Math.round(tProgress)));$('interfere-progress').setAttribute('aria-valuetext',tWait>0?`剩余${tWait.toFixed(1)}秒`:'冷却完成');
  if(tMonsterMode&&!tReady){tMonsterMode=false;battlefield.targetRadius=null;$('battlefield').classList.remove('targeting');$('build-hint').hidden=true;}

  $('army-power').textContent=num(power(p));$('army-pop').textContent=`${population(p)} / ${p.populationCap??RULES.initialPopulation}`;$('army-pop').title=`已使用人口 ${population(p)}，含训练与施工预留 ${reservedPopulation(p)} 人口`;$('army-pop').setAttribute('aria-label',$('army-pop').title);$('kill-count').textContent=num(p.stats.kills);
  $('logs').innerHTML=s.logs.slice(-5).reverse().map(l=>`<div><span>${time(l.time)}</span>${esc(l.text)}</div>`).join('');
  renderPanel();updateBoxGiftPanel();updateSelection();updateBuildPanel();if($('sandbox-dialog').open)updateSandbox();
  const raceButton=document.querySelector('[data-action="race"]'),rerollButton=document.querySelector('[data-action="reroll"]');if(raceButton){raceButton.disabled=s.phase!=='build'||!!p.builderChoices?.length||(p.raceChanges||0)>=RULES.rerollCount||game.heroStatus().used;if(game.heroStatus().used)raceButton.title='英雄祭坛名额已用完，不能再更换种族';}if(rerollButton)rerollButton.disabled=s.phase!=='build'||p.rerolls>=RULES.rerollCount;
  const farmButton=document.querySelector('[data-action="farm"]'),farm=p.economyTasks?.farmTask;if(farmButton){farmButton.textContent=farm?`农场 ${Math.max(0,farm.finishAt-s.time).toFixed(1)}s`:'建造农场';farmButton.disabled=!!farm||s.phase==='ended'||p.gold<RULES.farmCost||p.wood<RULES.farmWoodCost||p.populationCap>=RULES.maxPopulation;}
  if(s.wave!==lastWave){lastWave=s.wave;panelKey='';sound('wave');toast(`第 ${s.wave} 波${s.wave>=31&&!sandbox?'追加':'准备'}：${wave.name}`);save();}
  if(s.phase!==lastPhase){clearSpellTarget();if(s.phase==='combat'||s.phase==='arena'){if(s.roundMode==='arena'){focus('all');toast('军团竞技开始 · 最长120秒');}buildUnit=null;battlefield.buildUnit=null;$('battlefield').classList.remove('building');$('build-hint').hidden=true;if(selected?.type==='building'){const unit=s.entities.find(e=>e.buildingId===selected.buildingId&&isEntityVisible(e));selected=unit?{type:'entity',entityId:unit.id,laneId:unit.laneId}:null;battlefield.selected=selected;selectionKey='';updateSelection();}sound('wave');}else if(s.phase==='build')save();lastPhase=s.phase;panelKey='';}
  if(s.legacyMatch&&!$('save-label').dataset.legacy){$('save-label').dataset.legacy='true';toast('当前存档包含历史单位；v14.1A5请使用新开局。');}
  if(s.phase==='ended'&&!endShown){endShown=true;showEnd();save();}
  if(!spellTargetMode&&!tMonsterMode&&!kingMoveMode&&s.phase==='combat'&&s.timer>5&&battlefield.focusLane===0&&autoFollowWave!==s.wave&&!s.entities.some(e=>isEntityVisible(e)&&e.laneId===0)&&s.entities.some(e=>isEntityVisible(e)&&e.side==='monster'&&e.laneId===8)){autoFollowWave=s.wave;focus(8);autoFollowing=true;toast('战斗转入国王防线，镜头已跟随。');}
  if(s.phase==='build'&&autoFollowing){focus(0);autoFollowing=false;}
}
function showEnd(){$('sandbox-end-reset').hidden=matchMode(game.state)!=='sandbox';const s=game.state,p=s.players[0],win=s.winner===0,draw=s.winner===-1||s.winner===null||s.winner==='draw';$('end-title').textContent=draw?'战局平分秋色':win?'联盟军团获胜':'部落军团获胜';$('end-eyebrow').textContent=draw?'势均力敌':win?'VICTORY':'DEFEAT';$('end-description').textContent=draw?'双方军团战至最后，国王生命与兵力未能分出胜负。':win?'你的军团守住了国王。攻守与经济，共同决定这一局的胜负。':'国王的防线已经失守。尝试调整造位、升级前排，并及时强化国王。';$('end-stats').innerHTML=`<span><b>${s.wave}</b>抵达波次</span><span><b>${num(p.stats.kills)}</b>击杀</span><span><b>${num(p.stats.sent)}</b>派出木怪</span>`;$('end-dialog').showModal();sound(win?'win':'error');}

function help(which='play'){
  document.querySelectorAll('[data-help]').forEach(b=>b.classList.toggle('active',b.dataset.help===which));
  if(which==='play')$('help-content').innerHTML=`<div class="help-stats"><div><small>阵营对抗</small><b>4 vs 4</b></div><div><small>首波每路</small><b>${waveCount(WAVES[0])}</b></div><div><small>模式</small><b>v14.1A5 · 9×</b></div></div><h3>建造军团</h3><ol><li>选择${BUILDERS.length}种建造者之一。种族使用自己的基础兵；先知从六阶候选池各抽一种。点击兵种再点自己格子建造，升级费用、兵力与战斗属性分别读取v14来源。</li><li>手动或自动开波时，尚未完成的军团新建、升级、形态转换立即完成并参与当波。小精灵、科技、农场继续按各自计时完成。</li><li>开局${RULES.initialGold}金、${RULES.initialWood}木。小精灵上限${RULES.maxWorkers}，每名${RULES.workerCostBase}金、${RULES.workerTrainingSeconds}秒；科技共${RULES.maxLumberLevel}级，按逐级金木、时长与兵力门槛研究。</li><li>采木采用实际脚本的连续平均映射：每工人每10秒 2＋基础科技等级＋2.5×高级科技等级。高级物编每级+2与脚本+2.5分开保留。</li><li>“进攻”页按来源阶段切换发兵对象，各自库存独立恢复。第11波起木怪收入按点数整数除2；国王强化独立增加${RULES.kingIncome}收入。发兵在开波分配敌军四路。</li><li>国王强化早期上限20/30/20；攻击和恢复第16波、生命第17波放开至60/80/60。治疗每人一次，按国王最大生命的${Math.round((RULES.kingHealFraction??.5)*100)}%回复。第31波后持续推进至最终攻防。</li></ol><h3>宝藏与特殊收益</h3><p>第5波每路另有一只藏宝猎人，全局首杀和末杀各获得80金、150木。第7—19波每队随机一路额外出现宝藏怪，死亡后原路线玩家可在指令区选择金、木、国王护甲或军团护甲，第14波起还可立即免费提升1级伐木。每份宝藏只能领取一项，可以留到以后选择。军团护甲保留在建筑上，从下次普通战或竞技出战生效。</p><h3>测试沙盒</h3><p>从首页选择“测试沙盒”，以10万金、10万木和300人口开局。右上角控制台可指定1—35波、免费切换建造者、补充资源、一键完成已付款施工、返回布阵重测及清空军团。AI默认关闭，备战不限时；每次只测试一波。沙盒与普通对局独立存档，原有兵种升级和来源条件仍然生效。</p><h3>T怪／防卡兵</h3><p>战斗中按T或点击“T怪”，再点地图。圆内双方系统怪和已出场木怪取消未出手的普通攻击并重新向各自王区进攻。橙色短条显示抬手，冷却${RULES.interfereCooldown}秒；空点也耗冷却。Esc取消，暂停和竞技时不可用。</p><h3>位置与协防</h3><p>双方各四路按2×2排列，北路向南、南路向北，再经横廊进入王道。清线与走位决定协防时机。拖动、WASD/方向键平移，滚轮或双指缩放；小地图和玩家列表可定位。空格开波/暂停，H治疗国王，31波起可选“移动国王”。</p>`;
  else if(which==='waves')$('help-content').innerHTML=`<p>数量与生命已包含九倍脚本倍率，不再重复乘倍数。第20波每路10只、第30波6只；6—28波除10/20外有10%下一波替换。按原始计时器实现，同一批出怪各路共享替换结果。</p><table class="wave-table"><thead><tr><th>波</th><th>怪物</th><th>每路</th><th>实际攻击 / 护甲</th><th>有效生命</th></tr></thead><tbody>${WAVES.map(w=>`<tr class="${w.boss?'boss-row':''} ${w.id===game.state.wave?'current-wave':''}"><td>${w.id}</td><td>${esc(w.name)}</td><td>${waveCount(w)}</td><td>${typeNames[w.attackType]} / ${w.armorDisplayName??armorNames[w.armorType]}</td><td>${num(w.hp)}</td></tr>`).join('')}</tbody></table>`;
  else $('help-content').innerHTML=`<h3>v14.1A5 九倍模式</h3><p>数据依据本地“军团战争v14.1A5_九倍怪物模式_解析数据包”，平台地图ID 20197574。内部“8.2b”是遗留标题；当前使用${BUILDERS.length}建造者、v14兵种/技能与35波实际对象数据，不将5.0dJF数值混入新局。</p><h3>获取条件</h3><p>兵种图鉴可查完整登记对象、升级分支、实际条件与原始代码。外观选项单列对应本体和资格，皮肤不作为合成材料；原有费用与条件仍适用。菜单/预览对象不等于可建单位；外部账号资格按实际来源条件判断。九倍模式每局可建两座英雄祭坛，分别选择不同英雄，再按各自升级链成长；常规英雄有11级，特殊英雄保留原图阶段。图鉴逐项区分参与模拟、状态标记和待核定技能。</p><h3>脚本优先</h3><p>九倍有阶段生命倍率、下一波随机替换、第11波收入变化及首次漏怪全队扣木。实际脚本与说明有冲突时使用可定位的执行逻辑；例如20/30波数量、实际无甲类型、全队奖励检查标志和采木系数，不照抄旧提示。</p><h3>存档与模拟边界</h3><p>本版使用独立v14存档，旧5.0dJF存档保留在浏览器，不自动混合迁移。暂停、倍速与刷新保留经济任务、攻击抬手和技能进度。</p><p>浏览器采用Canvas/SVG表现，未包含魔兽模型、贴图或音频。原生对象参数、已核定JASS机制与未核定项分别展示；当前是本地4v4 AI模拟，不含平台联网或付费资格验证。</p>`;
  $('help-dialog').showModal();
}

$('panel-content').addEventListener('click',e=>{const target=e.target.closest('button');if(!target||target.disabled)return;if(claimBoxGift(target))return;if(target.dataset.treasure){command('treasure',{treasureId:target.dataset.treasure,reward:target.dataset.reward,buildingId:target.closest('[data-treasure-id]')?.querySelector('[data-treasure-target]')?.value});return;}if(target.dataset.unit){cancelBuild();buildUnit=target.dataset.unit;battlefield.buildUnit=buildUnit;selected={type:'unit',unitId:buildUnit};battlefield.selected=null;$('battlefield').classList.add('building');$('build-hint').textContent=`${defs[buildUnit].heroEntry?'建造':'部署'} ${defs[buildUnit].name} · ${unitPrice(defs[buildUnit])} · 点击自己的空格`; $('build-hint').hidden=false;panelKey='';selectionKey='';renderPanel();updateSelection();updateBuildPanel();sound();}if(target.dataset.heroBuilding){const building=game.state.players[0].buildings.find(b=>b.id===target.dataset.heroBuilding);if(building){cancelBuild();focus(0);select({type:'building',buildingId:building.id,playerId:0});}}if(target.dataset.builder)command('builder',{builderId:target.dataset.builder});if(target.dataset.merc)command('merc',{mercId:target.dataset.merc});if(target.dataset.hero)command('hero',{heroId:target.dataset.hero});if(target.dataset.king)command('king',{stat:target.dataset.king});if(target.dataset.action==='heroes'){const panel=$('panel-content'),section=panel.querySelector('.hero-section');if(section){panel.scrollTop=section.offsetTop-panel.offsetTop;section.querySelector('[data-unit]:not(:disabled)')?.focus({preventScroll:true});}}else if(target.dataset.action==='kingmove'){cancelBuild();kingMoveMode=true;buildUnit=null;battlefield.buildUnit=null;focus(8);$('build-hint').hidden=false;$('build-hint').textContent='点击可行走地面，移动联盟国王 · Esc取消';}else if(target.dataset.action==='catalog')openCatalog();else if(target.dataset.action)command(target.dataset.action);});
$('panel-content').addEventListener('change',e=>{const field=e.target;if(!field.matches('[data-box-building],[data-box-unit]'))return;const card=field.closest('[data-box-offer]'),selection=boxGiftSelections[card?.dataset.boxOffer];if(!selection)return;if(field.matches('[data-box-building]')){selection.buildingId=field.value;selection.unitId='';}else selection.unitId=field.value;updateBoxGiftPanel();});
$('selection-actions').addEventListener('click',e=>{const t=e.target.closest('button');if(!t||t.disabled)return;if(t.dataset.castSkill){const entity=game.state.entities.find(v=>String(v.id)===t.dataset.castEntity&&isEntityVisible(v)),skill=entity?game.unitSkillStatus?.(entity.id,0).find(a=>a.id===t.dataset.castSkill):null;if(!skill?.canStart){toast(skill?.reason||'当前技能不可用',true);return;}if(spellTargetMode?.entityId===entity.id&&spellTargetMode.skillId===skill.id){clearSpellTarget();updateUI();return;}if(skill.targetKind==='none'){clearSpellTarget();command('cast',{entityId:entity.id,skillId:skill.id,playerId:0});}else startSpellTarget(entity.id,skill);return;}if(t.dataset.upgrade)command('upgrade',{buildingId:selected?.buildingId,unitId:t.dataset.upgrade});if(t.dataset.sell){command('sell',{buildingId:t.dataset.sell});select(null);}if(t.dataset.cancel)cancelBuild();if(t.dataset.inspect)openCatalog(t.dataset.inspect);if(t.dataset.form)command('form',{buildingId:t.dataset.form});if(t.dataset.stim)command('stim',{buildingId:t.dataset.stim});});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>{const active=x===b;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active));});panelKey='';renderPanel();updateBuildPanel();}));
$('worker').onclick=()=>command('worker');$('lumber').onclick=()=>command('lumber');$('ready').onclick=()=>command('ready');$('pause').onclick=()=>command('pause');$('interfere').onclick=()=>{if(tMonsterMode){cancelBuild();return;}cancelBuild();tMonsterMode=true;battlefield.targetRadius=RULES.interfereRadius;const r=$('battlefield').getBoundingClientRect();battlefield.pointerPoint={x:r.width/2,y:r.height*.48};$('battlefield').classList.add('targeting');$('build-hint').hidden=false;$('build-hint').textContent='T怪：点击圆内怪物位置 · 双方怪物均可 · Esc取消';updateUI();};$('heal').onclick=()=>{const r=command('heal');if(r.ok)focus(8);};
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>command('speed',{value:Number(b.dataset.speed)}));
function focus(lane){autoFollowing=false;battlefield.focus(lane);$('arena-location').textContent=lane==='all'?'八路战场全景':lane===8?'联盟国王防线':lane===9?'部落国王防线':lane===0?'我的战区':`${lane<4?'联盟':'部落'} ${lane%4+1} 路`;document.querySelectorAll('.view-buttons button:not(#view-routes)').forEach(b=>b.classList.remove('active'));$(lane==='all'?'view-all':lane>=8?'view-king':'view-home').classList.add('active');}
$('view-home').onclick=()=>focus(0);$('view-all').onclick=()=>focus('all');$('view-king').onclick=()=>focus(8);
$('team-list').onclick=e=>{const b=e.target.closest('[data-focus]');if(b)focus(Number(b.dataset.focus));};
$('minimap').onclick=e=>{const r=e.currentTarget.getBoundingClientRect();focus(battlefield.minimapHit((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height));};
$('view-routes').onclick=()=>{battlefield.showRoutes=!battlefield.showRoutes;$('view-routes').classList.toggle('active',battlefield.showRoutes);$('view-routes').setAttribute('aria-pressed',String(battlefield.showRoutes));};
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{difficulty=b.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('active',x===b));});
$('start-game').onclick=()=>startMatch(false);$('continue-game').onclick=()=>startMatch(true);$('restart-game').onclick=()=>{$('end-dialog').close();startMatch(false);};$('new-game').onclick=showWelcome;
$('catalog').onclick=()=>openCatalog();$('help').onclick=()=>help();$('wavebook').onclick=()=>help('waves');$('welcome-about').onclick=()=>help('about');document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>help(b.dataset.help));
$('ribbon-wave-name').onclick=()=>help('waves');
$('sandbox-wave').innerHTML=WAVES.map(w=>`<option value="${w.id}">第 ${w.id} 波 · ${esc(w.name)} · ${waveCount(w)}只</option>`).join('');
$('sandbox-builder').innerHTML=BUILDERS.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');
$('sandbox-qualification').innerHTML=SANDBOX_QUALIFICATIONS.map(q=>`<option value="${esc(q.key)}">${esc(q.label)} · ${esc(q.key)}</option>`).join('');
document.querySelectorAll('[name="match-mode"]').forEach(input=>input.onchange=()=>{mode=input.value;updateModeChoice();});
$('sandbox-tools').onclick=()=>{if(matchMode(game.state)!=='sandbox')return;$('sandbox-feedback').textContent='';updateSandbox(true);$('sandbox-dialog').showModal();};
function showWelcome(){if(started){game.state.paused=true;save();mode=matchMode(game.state);}updateModeChoice();$('welcome').hidden=false;}
$('sandbox-modes').onclick=()=>{$('sandbox-dialog').close();showWelcome();};
$('sandbox-return').onclick=()=>{$('sandbox-dialog').close();$('battlefield').focus({preventScroll:true});};
$('sandbox-load-wave').onclick=()=>sandboxCommand('sandboxWave',{wave:Number($('sandbox-wave').value)});
$('sandbox-switch-builder').onclick=()=>sandboxCommand('sandboxBuilder',{builderId:$('sandbox-builder').value});
$('sandbox-ai').onchange=e=>{sandboxCommand('sandboxAI',{value:e.target.checked});updateSandbox();};
$('sandbox-super-sponsor').onchange=e=>sandboxCommand('sandboxQualification',{key:'h220',enabled:e.target.checked});
$('sandbox-qualification').onchange=()=>updateSandbox();
$('sandbox-enable-qualification').onclick=()=>sandboxCommand('sandboxQualification',{key:$('sandbox-qualification').value,enabled:true});
$('sandbox-disable-qualification').onclick=()=>sandboxCommand('sandboxQualification',{key:$('sandbox-qualification').value,enabled:false});
$('sandbox-enable-all').onclick=()=>sandboxCommand('sandboxQualification',{keys:[...SANDBOX_QUALIFICATION_KEYS],enabled:true});
$('sandbox-disable-all').onclick=()=>sandboxCommand('sandboxQualification',{keys:[...SANDBOX_QUALIFICATION_KEYS],enabled:false});
const boxTrainingTestButton=document.createElement('button');boxTrainingTestButton.id='sandbox-box-training';boxTrainingTestButton.dataset.sandbox='sandboxBoxTraining';boxTrainingTestButton.innerHTML='<b>训练礼物测试</b><small>测试赠予一组含兵种训练的礼物，替换当前组选项</small>';$('sandbox-dialog').querySelector('.sandbox-actions').append(boxTrainingTestButton);
const boxTrainingTestNote=document.createElement('p');boxTrainingTestNote.className='sandbox-foot box-gift-test-note';boxTrainingTestNote.textContent='测试礼物须显式点击赠予。普通对局清完第6波后随机三选一，清完第13波后替换当前组选项。';boxTrainingTestButton.parentElement.after(boxTrainingTestNote);
document.querySelectorAll('[data-sandbox]').forEach(button=>button.onclick=()=>sandboxCommand(button.dataset.sandbox));
$('sandbox-end-reset').onclick=()=>sandboxCommand('sandboxReset');
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('sound').onclick=()=>{soundOn=!soundOn;$('sound').classList.toggle('on',soundOn);$('sound').title=soundOn?'关闭音效':'开启音效';$('sound').setAttribute('aria-label',$('sound').title);sound();};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>toast('当前浏览器暂不支持全屏'));};
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,[contenteditable="true"]')||e.target.closest('button')&&['Space','Enter'].includes(e.code))return;if(!started||$('help-dialog').open||$('catalog-dialog')?.open||$('end-dialog').open||$('sandbox-dialog').open||!$('welcome').hidden||e.repeat)return;if(e.key==='Escape')cancelBuild();if(e.code==='Space'){e.preventDefault();command(game.state.phase==='build'?'ready':'pause');}if(RULES.interfereEnabled&&e.key.toLowerCase()==='t')$('interfere').click();if(e.key.toLowerCase()==='h')$('heal').click();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started){save();game.state.paused=true;}});window.addEventListener('beforeunload',save);
function frame(now){const dt=Math.min((now-(lastFrame||now))/1000,.15);lastFrame=now;if(started&&$('welcome').hidden&&!$('help-dialog').open&&!$('catalog-dialog')?.open&&!$('sandbox-dialog').open)game.tick(dt);updateEconomyPanel();if(tab==='attack')updateMercPanel();battlefield.draw(game.state,now/1000);battlefield.minimap($('minimap'),game.state);uiTimer+=dt;saveTimer+=dt;if(uiTimer>.18){uiTimer=0;updateUI();}if(saveTimer>8){saveTimer=0;save();}requestAnimationFrame(frame);}
$('builder-select').innerHTML=BUILDERS.map(b=>`<option value="${esc(b.id)}" ${b.id===builderId?'selected':''}>${esc(b.name)}${b.mode==='prophet'?' · 六阶随机':b.mode==='morph'?' · 随机变形':''}</option>`).join('');
function updateBuilderChoice(){builderId=$('builder-select').value;$('builder-description').textContent=BUILDERS.find(b=>b.id===builderId)?.mode==='prophet'?'从六阶107个候选中各抽一种（18/18/18/18/18/17），按来源分支升级。':BUILDERS.find(b=>b.id===builderId)?.mode==='morph'?'建造六阶变形体，完成后从对应候选池随机变形。':`使用本种族${BUILDERS.find(b=>b.id===builderId)?.rosterIds.length??0}种基础兵种，按v14来源分支与条件升级。`;}
$('builder-select').onchange=updateBuilderChoice;updateBuilderChoice();
updateUI();setTimeout(()=>battlefield.focus(0),50);requestAnimationFrame(frame);
// Deterministic read-only state is available to local QA and replay inspection.
window.legion={get game(){return game;},get renderer(){return battlefield;},get started(){return started;},get config(){return RULES;}};
