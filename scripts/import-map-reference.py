#!/usr/bin/env python3
"""Generate browser reference data from a compact, auditable static map snapshot.

Normal use: python3 scripts/import-map-reference.py
Refresh selected source records: --analysis /path/to/legion-map-analysis
The supplied map was 5.0dJF x3. x9 population and coordinate scaling below are
explicit Web adaptations; this script does not certify 15A2 or execute JASS.
"""
import argparse, csv, hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_TIERS = [
 ['h01C','h07J','h00M','h0CF'], ['h0CI','h09W','h012','h01E'],
 ['h01H','h0BX','h09N','h0AB'], ['h09R','h06O','h046','h07S'],
 ['h0AL','h0CW','h0S3','h00Q'], ['h0BO','h06S','h04A','h07W'],
]
ARMOR = {'small':'light','medium':'medium','large':'heavy','normal':'fortified','fort':'fortified','none':'unarmored','hero':'heavy','divine':'fortified'}
COLORS = ['#87b879','#d4b66f','#a9bcd3','#ad9ad0','#c8a57a','#76b9bd']
ATTACK_LABEL = {'normal':'普通','pierce':'穿刺','magic':'魔法','siege':'攻城','chaos':'混乱'}
ARMOR_LABEL = {'light':'轻甲','medium':'中甲','heavy':'重甲','fortified':'城甲','unarmored':'无甲'}
ALIASES = {'h04O':'merc_militia','h04P':'merc_archer','h04S':'merc_orc','h04T':'merc_witchdoctor','h04V':'merc_komodo','h04X':'merc_wyvern','h050':'merc_frostwolf','h05A':'merc_infernal'}
PROVENANCE = '5.0dJF-static'
SCALE = 1/3
# war3map.j Jv -> D[L] in qC: base kills before GG/army-value/leak discounts.
WAVE_BOUNTIES = [3,3,4,5,5,5,6,6,5,51,5,6,7,12,9,8,10,8,10,86,10,9,11,11,9,12,12,23,14,123,0,0,0,0,0]

def clean(value):
    value = re.sub(r'\|c[0-9a-fA-F]{8}|\|r', '', str(value or ''))
    return value.replace('|n',' ').strip().strip('"')

def split(value):
    return [v for v in str(value or '').split(',') if v and v != '_']

def number(fields, key, default=0):
    v=fields.get(key, default)
    return float(v) if v not in ('',None,'_') else default

def compact(n):
    return int(n) if float(n).is_integer() else round(n,8)

def general_attack_targets(targets):
    # A target mask such as mechanical or air-only is conditional, whereas
    # this Web engine's crit applies to every target. Keep those effects omitted.
    flags=set(split(targets))
    allowed={'air','ground','enemy','enemies','vulnerable','invulnerable','vuln','invu'}
    dimensions=flags & {'air','ground'}
    return bool(flags & {'enemy','enemies'}) and flags <= allowed and (not dimensions or dimensions == {'air','ground'})

def damage(f):
    return number(f,'dmgplus1') + number(f,'dice1') * (number(f,'sides1')+1)/2

def refresh(analysis, dest):
    u=json.loads((analysis/'data/units-raw.json').read_text())
    a=json.loads((analysis/'data/abilities-raw.json').read_text())
    j=(analysis/'extracted/war3map.j').read_text()
    pairs={b:c for c,b in re.findall(r"set xv\[K\]='(.{4})'\s+set ev\[K\]='(.{4})'",j)}
    selected=[]
    for tier in BASE_TIERS:
        for code in tier: selected.extend([code]+split(u[code]['fields'].get('Upgrade')))
    waves=list(csv.DictReader((analysis/'waves-with-object-fields.csv').open(encoding='utf-8-sig')))
    shops=list(csv.DictReader((analysis/'data/send-unit-shops.csv').open(encoding='utf-8-sig')))
    mercs=[r for r in shops if r['scriptUse']=='initial normal summon shop']
    mercs += [r for r in shops if r['shopRawcode']=='h0AZ' and r['rawcode'] in ['h050','h054','h052','h053','h055','h056','h057','h05M']]
    mercs += [r for r in shops if r['shopRawcode']=='h0B0' and r['rawcode'] in ['h059','h05B','h05A','h0BR']]
    ids=set(selected)|{pairs[c] for c in selected}|{r['unit_rawcode'] for r in waves}|{r['rawcode'] for r in mercs}
    units={c:{'name':u[c]['name'],'fields':u[c]['fields']} for c in sorted(ids)}
    ability_ids={ac for c in ids for ac in split(u[c]['fields'].get('abilList'))}
    abilities={c:a[c] for c in sorted(ability_ids) if c in a}
    summary=json.loads((analysis/'analysis-summary.json').read_text())
    sources=['data/units-raw.json','data/abilities-raw.json','waves-with-object-fields.csv','data/send-unit-shops.csv','extracted/war3map.j','extracted/war3mapMisc.txt','data/upgradedata.json','data/neutralupgradestrings.json','extracted/units/unitbalance.slk','extracted/units/upgradedata.slk','extracted/units/campaignunitfunc.txt','extracted/units/neutralupgradestrings.txt']
    upgrades={r['upgradeid']:r for r in json.loads((analysis/'data/upgradedata.json').read_text())['rows']}
    upgrade_strings=json.loads((analysis/'data/neutralupgradestrings.json').read_text())
    economy_sources={'worker':u['e003'],'townHall':u['h023'],'upgrades':{c:upgrades[c] for c in ['R003','R00H']},'upgradeStrings':{c:upgrade_strings[c] for c in ['R003','R00H']},'harvestAbility':a['A09C'],'evidence':{'training':'h023 Trains=e003; war3map.j Pt/qt and EVENT_PLAYER_UNIT_TRAIN_FINISH, lines13612-13620/16881-16883','research':'h023 Researches=R003,R00H; war3map.j St/ut, lines13621-13635; R003 level8 opens R00H level7','workerPrice':'e003 goldcost50, bldtm20; Qu budget dr=(workers-1)*50 is cumulative spent gold, not escalating next-worker price','harvestBoundary':'A09C retained as evidence only. This change preserves the existing Web production formula; the 8-second Ku loop is anti-cheat, not a harvest timer.'}}
    snapshot={'schema':1,'sourceVersion':'Legion TD 5.0dJF','sourceMode':'x3','sourceUrl':'https://wc3maps.com/map/175858','mapSha256':summary['target']['sha256'],
      'sourceFiles':{f:hashlib.sha256((analysis/f).read_bytes()).hexdigest() for f in sources},
      'waveBounties':WAVE_BOUNTIES,'waveBountySource':'war3map.j Jv / D[L] / qC; Web发放基础赏金，不模拟GG动态折扣','economySources':economy_sources,'baseTiers':BASE_TIERS,'combatPairs':{c:pairs[c] for c in selected},'units':units,'abilities':abilities,'waves':waves,'mercenaries':mercs,
      'misc':(analysis/'extracted/war3mapMisc.txt').read_text()}
    dest.write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':'))+'\n')

def ability_sources(snap, f):
    result=[]
    for rawcode in split(f.get('abilList')):
        o=snap['abilities'].get(rawcode,{}).get('sources',{})
        af=o.get('abilitydata.slk',{})
        text=o.get('campaignabilitystrings.txt',{})
        result.append({'rawcode':rawcode,'baseCode':af.get('code'),'name':clean(text.get('Name',rawcode)),'fields':af,'description':clean(text.get('Ubertip',''))})
    return result

def adapt_ability(source, f):
    # Only passive effects with directly interpretable fields and existing engine
    # equivalents are adapted. Mana, active spells, summons, target restrictions,
    # additional abilities and inherited/default fields remain visible as metadata.
    for a in source:
        af=a['fields']; base=a['baseCode']; v=number(af,'DataA1'); targets=af.get('targs1','')
        common={'name':a['name'],'sourceRawcode':a['rawcode'],'provenance':PROVENANCE}
        if base=='AIva' and v:
            return dict(common,type='lifesteal',value=v,description=f'攻击吸取造成伤害的{v*100:g}%生命。'),[a['rawcode']]
        if base=='AOcr' and general_attack_targets(targets) and v and number(af,'DataB1'):
            return dict(common,type='crit',value=number(af,'DataB1'),chance=v/100,description=f'{v:g}%几率造成{number(af,"DataB1"):g}倍伤害。'),[a['rawcode']]
        if base=='Aakb' and v and number(af,'Area1'):
            return dict(common,type='aura_damage',value=v,radius=number(af,'Area1')*SCALE,description=f'附近友军攻击提高{v*100:g}%。'),[a['rawcode']]
        if base=='AHad' and v and number(af,'Area1'):
            return dict(common,type='aura_armor',value=v,radius=number(af,'Area1')*SCALE,description=f'附近友军护甲提高{v:g}。'),[a['rawcode']]
        if base=='Aoar' and v and number(af,'Area1'):
            return dict(common,type='aura_heal',value=v,radius=number(af,'Area1')*SCALE,description=f'附近友军每秒恢复{v:g}生命。'),[a['rawcode']]
        if base=='Aasl' and v<0 and number(af,'DataB1')==v and 'enemies' in targets:
            return dict(common,type='aura_slow',value=-v,radius=number(af,'Area1')*SCALE,description=f'附近敌军攻击和移动速度降低{-v*100:g}%。'),[a['rawcode']]
    if f.get('weapTp1')=='msplash' and number(f,'Qarea1') and number(f,'Qfact1'):
        # Preserve the outer ring only; the renderer/engine currently has one ring.
        return {'type':'splash','value':number(f,'Qfact1'),'radius':number(f,'Qarea1')*SCALE,'name':'范围攻击','description':'普通攻击对外圈目标附带伤害。','provenance':PROVENANCE,'adaptation':'使用物编最外圈半径与倍率，内圈分层伤害待实现。'},['weapon:outer-splash']
    return None,[]

def stats(snap, code):
    f=snap['units'][code]['fields']; source=ability_sources(snap,f); ability,implemented=adapt_ability(source,f)
    armor=ARMOR.get(f.get('defType'),'medium'); raw_range=number(f,'rangeN1',90)
    result={'hp':compact(number(f,'HP',1)),'damage':compact(damage(f)),'interval':compact(number(f,'cool1',1)),
        'range':compact(raw_range*SCALE),'speed':compact(number(f,'spd',270)*SCALE),'armor':compact(number(f,'def')),
        'attackType':f.get('atkType1','normal'),'armorType':armor,'ability':ability,
        'sourceHP':compact(number(f,'HP',1)),'sourceDamage':compact(damage(f)),'sourceRange':raw_range,'sourceSpeed':number(f,'spd',270),
        'sourceDamageMin':compact(number(f,'dmgplus1')+number(f,'dice1')),
        'sourceDamageMax':compact(number(f,'dmgplus1')+number(f,'dice1')*number(f,'sides1')),
        'sourceAbilities':[dict(a,implemented=a['rawcode'] in implemented) for a in source],
        'abilityCoverage':{'implemented':implemented,'omitted':[a['rawcode'] for a in source if a['rawcode'] not in implemented]},
        'sourceRawFields':{k:f[k] for k in ['HP','realHP','def','realdef','dmgplus1','dice1','sides1','mindmg1','maxdmg1','rangeN1','cool1','spd','atkType1','defType','bountyplus','level','points'] if k in f},
        'provenance':PROVENANCE,'distanceScale':SCALE}
    result['role']='support' if ability and ability['type'].startswith('aura_') else ('ranged' if raw_range>180 else 'frontline')
    if raw_range<=180 and armor in ['heavy','fortified']:result['role']='tank'
    return result

def generate_economy(snap):
    src=snap['economySources'];worker=src['worker']['fields'];levels=[]
    for target in range(1,31):
        code='R003' if target<=8 else 'R00H';row=src['upgrades'][code];local_level=target if target<=8 else target-8
        entry={'level':target,'gold':compact(number(row,'goldbase')+(local_level-1)*number(row,'goldmod')),'wood':compact(number(row,'lumberbase')+(local_level-1)*number(row,'lumbermod')),'duration':compact(number(row,'timebase')+(local_level-1)*number(row,'timemod')),'sourceUpgrade':code,'extended':target>15}
        if target<=15:entry['sourceLevel']=local_level
        levels.append(entry)
    return {'worker':{'gold':compact(number(worker,'goldcost')),'wood':compact(number(worker,'lumbercost')),'duration':compact(number(worker,'bldtm')),'queueLimit':3},'lumberLevels':levels,'sourceWorkerRawcode':'e003','sourceTownHallRawcode':'h023','sourceMaxLumberLevel':15,'targetMaxLumberLevel':30,'sourcePolicy':'小精灵固定50金、20秒，科技1—15级金木与时间读取R003/R00H物编；16—30级沿R00H每级+10金木、35秒作Web延伸。','queuePolicy':'三格招募队列为Web交互适配，不作为原图训练队列证据。','availabilityPolicy':'保留用户要求的最多10工人、30级科技和随时操作，不加入原图军力门槛。','productionPolicy':'本轮只修价格和耗时，产木仍采用工人数×1.5×(1+0.12×科技等级)的既有Web公式。'}

def generate(snap):
    included={c for bases in snap['baseTiers'] for base in bases for c in [base]+split(snap['units'][base]['fields'].get('Upgrade'))}
    units=[]
    for tier,bases in enumerate(snap['baseTiers'],1):
        for base in bases:
            codes=[base]+split(snap['units'][base]['fields'].get('Upgrade'))
            for code in codes:
                build=snap['units'][code]; bf=build['fields']; combat=snap['combatPairs'][code]; st=stats(snap,combat)
                name=clean(build['name']); successors=split(bf.get('Upgrade'))
                units.append(dict(st,id='map_'+code,name=name,race='原图兵种',tier=tier,cost=compact(number(bf,'goldcost')),
                    population=max(1,int(number(bf,'fused',1))),randomPool=code==base,isBase=code==base,legacy=False,
                    upgrades=['map_'+n for n in successors if n in included],sourceRawcode=code,combatRawcode=combat,omittedUpgradeRawcodes=[n for n in successors if n not in included],
                    sourceUpgradeRawcodes=successors,sourceTier=tier,color=COLORS[tier-1],shape='diamond' if st['range']>60 else 'square',
                    description=f'{name}，{ATTACK_LABEL.get(st["attackType"],st["attackType"])}攻击/{ARMOR_LABEL[st["armorType"]]}。'+(st['ability']['description'] if st['ability'] else '')))
    waves=[]
    for row in snap['waves']:
        i=int(row['wave']);code=row['unit_rawcode'];st=stats(snap,code);sourcecount=int(row['system_creeps_per_active_lane']); special=i in [10,20,30] or i>=31
        waves.append(dict(st,id=i,name=clean(row['name']),sourceRawcode=code,referenceCount=sourcecount,
          count=sourcecount if special else sourcecount*3,baseCount=sourcecount/3,boss=special,specialWave=special,
          bossCount=sourcecount if special else 0,bounty=snap.get('waveBounties',WAVE_BOUNTIES)[i-1],sourceBounty=snap.get('waveBounties',WAVE_BOUNTIES)[i-1],bountyAdaptation='JASS基础击杀赏金直接发放，未模拟GG军力/漏怪折扣。',
          recommendedValue=int(row['displayed_recommended_army_value']),color=COLORS[(i-1)%6],shape='star' if special else 'circle',
          countAdaptation='保留5.0dJF特殊波数量' if special else '历史x3每路数量×3，作为Web九倍适配（非15A2验证数）'))
    mercs=[]
    for row in snap['mercenaries']:
        code=row['rawcode'];f=snap['units'][code]['fields'];st=stats(snap,code);unlock=1 if row['shopRawcode']=='h05C' else (10 if row['shopRawcode']=='h0AZ' else 15)
        name=clean(row['name']);mercs.append(dict(st,id=ALIASES.get(code,'merc_'+code),name=name,race='佣兵',tier=1,cost=0,population=0,
          wood=int(row['lumbercost']),income=compact(number(f,'points')),bounty=compact(number(f,'level')),sourceBounty=compact(number(f,'level')),unlock=unlock,unlockPhase='combat' if unlock>1 else None,stockMax=int(row['stockMax']),cooldown=float(row['stockRegen']),
          sourceRawcode=code,shopRawcode=row['shopRawcode'],sourceStockStart=f.get('stockStart'),sourceStockMax=int(row['stockMax']),
          sourceStockRegen=float(row['stockRegen']),initialStockPolicy='Web适配：首次可用时满库存；空白stockStart不作为证据',
          color=COLORS[(len(mercs)//4)%6],shape='diamond' if st['range']>60 else 'square',upgrades=[],
          description=f'{name}，{ATTACK_LABEL.get(st["attackType"],st["attackType"])}攻击/{ARMOR_LABEL[st["armorType"]]}。'+(st['ability']['description'] if st['ability'] else '')))
    for m in mercs:
        if m['unlock']==1: m.pop('unlockPhase',None)
    meta={'title':'军团战争 · 地图数据参考','sourceVersion':snap['sourceVersion'],'dataRevision':'5.0dJF-static-web9-economy-v2','activeUnitCount':len(units),'activeBaseUnitCount':24,'activeMercenaryCount':len(mercs),'activeWaveCount':35,'version':snap['sourceVersion'],'sourceMode':'x3','targetMode':'Web九倍适配','sourceUrl':snap['sourceUrl'],'mapSha256':snap['mapSha256'],
      'units':len(units),'baseUnits':24,'upgradeUnits':len(units)-24,'mercenaries':len(mercs),'waves':35,'distanceScale':SCALE,
      'counts':{'units':len(units),'baseUnits':24,'upgradeUnits':len(units)-24,'mercenaries':len(mercs),'waves':35},
      'waveCountPolicy':'普通波使用历史x3配置的每路数×3；10/20/30及31—35波保留历史特殊波数。该适配不是15A2九倍数据。',
      'statPolicy':'采用战斗形态原始SLK HP、def、dmgplus1+dice1×(sides1+1)/2；不使用并列realHP、realdef、mindmg/maxdmg代替；普通系统怪运行时仍乘Web生命0.25/伤害0.20。',
      'unitPolicy':'从JASS确认的6档随机池各选4个基础兵，收录基础兵的直接Upgrade，未收录的后续分支只保留原始rawcode、不可点击；不是全部可玩兵种，1115注册对象不作为可玩数。建筑形态取价格、人口、升级，战斗形态取战斗属性。',
      'abilityPolicy':'只适配可由源字段解释的吸血、通用暴击、回复/伤害/护甲/减速光环及武器外圈溅射；未适配技能和主动施法保留原始元数据，未声称完整复现。',
      'economyPolicy':'300金/97木开局，首波80秒、常规40+floor(即将开始波次/2)秒，逐波金币奖励。小精灵固定50金、20秒；科技1—15级金木及时间读物编，16—30级沿高级曲线延伸（每级+10金木、35秒）。三格招募队列、10工人/30科技及无军力门槛为Web交互/用户覆盖；产木和国王基础保持既有Web配置。',
      'bountyPolicy':'系统怪取JASS D[L]基础赏金，木怪取GetUnitLevel对应物编level；Web直接发放基础值，尚未实现GG军力/漏怪折扣。',
      'legacyPolicy':'54个旧Web单位只服务旧存档，退出新随机池；4名英雄仍为Web配置。',
      'limitations':['静态解析，未运行魔兽验证JASS最终状态。','来源为5.0dJF默认x3，未确认用户记忆的15A2或原生9倍配置。','同一兵种多技能、主动法术、蓝量和武器内圈溅射尚未完整实现。'],
      'sourceFiles':snap['sourceFiles']}
    return units,waves,mercs,meta

def integrate_data():
    path=ROOT/'dist/data.js';s=path.read_text()
    if 'const LEGACY_UNITS =' not in s:
        start=s.index('const A =')
        s='''/* 5.0dJF static-reference subset with explicit Web ninefold adaptations.
 * Legacy Web units remain for existing saves. See REFERENCE and reference/map-source.json.
 */
import { MAP_REFERENCE, MAP_UNITS, MAP_WAVES, MAP_MERCENARIES, MAP_ECONOMY } from './map-reference.js';
export { MAP_REFERENCE as REFERENCE, MAP_ECONOMY as ECONOMY } from './map-reference.js';

'''+s[start:]
        s=s.replace('export const UNITS = [','const LEGACY_UNITS = [',1)
        s=s.replace('const merc =',"export const UNITS = [...MAP_UNITS, ...LEGACY_UNITS.map(u => ({...u,legacy:true,randomPool:false,isBase:false,provenance:'legacy-web'}))];\n\nconst merc =",1)
        s=s.replace('export const MERCENARIES = [','export const LEGACY_MERCENARIES = [',1)
        begin=s.index('// baseline counts are per lane')
        end=s.index('export const HEROES',begin)
        s=s[:begin]+"export const MERCENARIES = MAP_MERCENARIES;\nexport const WAVES = MAP_WAVES;\n\n"+s[end:]
    s=s.replace('\nconst LEGACY_MERCENARIES = [','\nexport const LEGACY_MERCENARIES = [')
    s=s.replace("MAP_MERCENARIES } from './map-reference.js'","MAP_MERCENARIES, MAP_ECONOMY } from './map-reference.js'")
    s=s.replace("MAP_REFERENCE as REFERENCE } from './map-reference.js'","MAP_REFERENCE as REFERENCE, MAP_ECONOMY as ECONOMY } from './map-reference.js'")
    replacements={
      'version':"'web-2.0-mapref'",'provenance':"'以5.0dJF默认x3静态物编与JASS配置为参考，选取24基础+25升级兵、24木怪和35波；Web九倍数量、坐标及密集战斗缩放为明确适配，不声称15A2原版。旧54兵只兼容旧存档，4英雄保留Web配置。详见REFERENCE。'",
      'sourceVersion':"'Legion TD 5.0dJF（默认x3；15A2未核验）'",'initialGold':'300','initialWood':'97','buildSeconds':'40',
      'countFormula':"'普通波每路count=历史x3参考数量×3；10/20/30和31—35特殊波直接采用referenceCount，不再倍增。'",
      'webBalanceNotes':"'普通系统怪运行生命=sourceHP×0.25、伤害=sourceDamage×0.20；特殊波/Boss与木怪不缩放。原始射程与速度×1/3进入Web数据，再由Web引擎换算。'",
      'kingUpgradeCost':'80','kingDamagePerUpgrade':'10','kingRegenPerUpgrade':'5','kingUpgradeMax':'30',
      'incomeFormula':"'每波结束金币=waveRewards[当前波-1]+永久收入；10/20/30波基础奖励翻倍，另计击杀赏金。'",
      'workerCostBase':'50','workerCostStep':'0','lumberUpgradeCostBase':'60','lumberUpgradeCostStep':'20',
      'workerCostFormula':"'每名小精灵固定50金币、0木材，训练20秒；三格招募队列为Web交互适配。'",
      'lumberUpgradeCostFormula':"'使用lumberLevels逐级表：1—8级金木60+20×(目标级-1)，9—30级金木200+10×(目标级-9)；16—30级为Web延伸。'",
      'rerollPool':"'新49个物编子集中的24个基础单位；6档各抽1种，每档4选1。旧54Web兵不再进入随机池。'",
    }
    # Restrict substitutions to RULES so similarly named unit fields cannot change.
    head,rules=s.split('export const RULES = {',1)
    for key,value in replacements.items():
        rules,n=re.subn(r'^  '+key+r': [^\n]+,\s*$',lambda m:'  '+key+': '+value+',',rules,flags=re.M)
        if n!=1: raise ValueError(f'Expected one RULES.{key}, found {n}')
    rules=re.sub(r'^  kingHealFraction:.*\n','',rules,flags=re.M)
    rules=re.sub(r'  waveNameSources: \[.*?\n  \],',"  waveNameSources: [{url:'https://wc3maps.com/map/175858',version:'Legion TD 5.0dJF',scope:'静态地图SLK与JASS；非15A2九倍验证'}],",rules,flags=re.S)
    rules=re.sub(r'  attackMultipliers: \{.*?\n  \},', '''  attackMultipliers: {
    normal: { light: .90, medium: 1.20, heavy: .90, fortified: .80, unarmored: 1, hero: .90 },
    pierce: { light: 1.30, medium: .90, heavy: .80, fortified: .70, unarmored: 1, hero: .90 },
    magic: { light: 1.10, medium: .80, heavy: 1.20, fortified: .70, unarmored: 1, hero: .90 },
    siege: { light: .90, medium: .90, heavy: .90, fortified: 1.25, unarmored: 1, hero: .90 },
    chaos: { light: 1, medium: 1, heavy: 1, fortified: 1, unarmored: 1, hero: 1 },
    hero: { light: 1, medium: 1, heavy: 1, fortified: 1, unarmored: 1, hero: 1 },
  },''',rules,flags=re.S)
    additions={
      'firstBuildSeconds':'80','spawnInterval':'.1','workerTrainingSeconds':'20','workerQueueLimit':'3','workerWoodCost':'0','lumberLevels':'MAP_ECONOMY.lumberLevels',
      'buildTimeFormula':"'首波80秒；后续准备40+floor(即将开始波次/2)秒。'",
      'waveRewards':'[11,12,13,14,16,18,20,23,26,30,35,40,45,50,55,60,70,80,90,100,110,120,130,140,150,160,170,180,190,200,0,0,0,0,0]',
      'kingHealAmount':'10000','kingHealLockSeconds':'2','kingUpgradeCaps':'{hp:20,attack:30,regen:20}',
      'kingArmorPerFourWaves':'2','kingAttackSpeedPerFourWaves':'.1',
    }
    for key,value in additions.items():
        if re.search(r'^  '+key+':',rules,re.M):
            rules=re.sub(r'^  '+key+r': [^\n]+,\s*$',lambda m:'  '+key+': '+value+',',rules,flags=re.M)
        else:rules='\n  '+key+': '+value+','+rules
    path.write_text(head+'export const RULES = {'+rules)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--analysis',type=Path);parser.add_argument('--reference-only',action='store_true',help='只更新生成的map-reference.js，不重写data.js规则');args=parser.parse_args()
    dest=ROOT/'reference/map-source.json';dest.parent.mkdir(exist_ok=True)
    if args.analysis:refresh(args.analysis,dest)
    snap=json.loads(dest.read_text());units,waves,mercs,meta=generate(snap);economy=generate_economy(snap)
    assert len(units)==49 and sum(u['randomPool'] for u in units)==24
    assert len(mercs)==24 and len(waves)==35
    out='/* Generated by scripts/import-map-reference.py; edit the snapshot/generator, not this file. */\n'
    for name,value in [('MAP_REFERENCE',meta),('MAP_UNITS',units),('MAP_WAVES',waves),('MAP_MERCENARIES',mercs),('MAP_ECONOMY',economy)]:
        out+='export const '+name+' = '+json.dumps(value,ensure_ascii=False,separators=(',',':'))+';\n'
    (ROOT/'dist/map-reference.js').write_text(out)
    if not args.reference_only:integrate_data()
    print(json.dumps({'units':len(units),'baseUnits':24,'mercenaries':len(mercs),'waves':len(waves),'snapshotBytes':dest.stat().st_size,'generatedBytes':len(out.encode())},ensure_ascii=False))

if __name__=='__main__':main()
