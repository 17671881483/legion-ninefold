#!/usr/bin/env python3
"""Rebuild the v14.1A5 ninefold catalog from a checked-in data snapshot.

  python3 scripts/import-v14.py
  python3 scripts/import-v14.py --source /path/to/军团战争v14.1A5_九倍怪物模式_解析数据包

Only CSV/JSON and literal JASS arrays are read. No supplied executable or JASS
function is executed. Rawcodes are case-sensitive; no name-based joins.
"""
import argparse, csv, hashlib, json, re, shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVENANCE = 'v14.1A5-dataset'
VERSION = '军团战争 v14.1A5 · 九倍怪物'
SCALE = 1 / 3
COLORS = ['#87b879','#d4b66f','#a9bcd3','#ad9ad0','#c8a57a','#76b9bd']
ARMOR = {'small':'light','medium':'medium','large':'heavy','normal':'unarmored','none':'unarmored','fort':'fortified','hero':'hero','divine':'divine'}
ARRAYS = ['KK','KL','KM','KN','KO','FS']

def clean(value):
    return re.sub(r'\|[cC][0-9a-fA-F]{8}|\|[rR]', '', str(value or '')).replace('|n',' ').strip().strip('"')
def split(value): return [x.strip() for x in str(value or '').split(',') if x.strip() not in ['', '_']]
def num(value, default=0):
    try: return float(value) if value not in [None,'','_'] else default
    except (ValueError,TypeError): return default
def compact(value): return int(value) if float(value).is_integer() else round(value,8)
def boolean(value): return str(value).lower()=='true'
def code(hex_value): return bytes.fromhex(hex_value).decode('ascii')
def uid(raw): return 'v14_'+raw
def source(table,row,rawcode=None):
    return {'table':table,'row':row,**({'rawcode':rawcode} if rawcode else {})}
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def fields(row):
    # Missing source fields stay missing. Numeric-looking strings are kept as
    # original strings so source provenance does not silently coerce blanks.
    return {k:v for k,v in row.items() if v not in [None,'','_']}
def read_table(snapshot, name):
    with (snapshot/'data'/name).open(encoding='utf-8-sig',newline='') as f:
        return list(csv.DictReader(f))
def jass_function(jass, name):
    match=re.search(r'^function '+re.escape(name)+r'\b.*?^endfunction\b',jass,re.M|re.S)
    if not match:raise ValueError('Missing JASS function '+name)
    return match[0],{'file':'war3map.j','function':name,'line':jass.count('\n',0,match.start())+1,'endLine':jass.count('\n',0,match.end())+1}
def literal_special_monsters(jass):
    """Read literal registration/spawn values without evaluating source code."""
    register,register_source=jass_function(jass,'GoldMonsterType___registerMonstertypeNext')
    by_wave=[]
    for match in re.finditer(r'set Bw\[(\d+)\]=\$([0-9A-F]{8})',register):
        by_wave.append({'wave':int(match[1]),'rawcode':code(match[2]),'source':{**register_source,'line':register_source['line']+register.count('\n',0,match.start())}})
    init,init_source=jass_function(jass,'GoldMonsterType___initMonstertypeNext')
    maximum=re.search(r'set Bx\[BB\]=(\d+)',init)
    if not maximum:raise ValueError('Missing treasure monster wave cap')
    reward,reward_source=jass_function(jass,'SpawnWaveFiveRewardUnitForLane')
    spawn=re.search(r'SpawnWaveUnitForLane\(OR,\$([0-9A-F]{8}),false\)',reward)
    lifetime=re.search(r'UnitApplyTimedLife\(i,\$([0-9A-F]{8}),(\d+)\)',reward)
    maximum_hp=re.search(r'SetUnitState\(i,UNIT_STATE_MAX_LIFE,(\d+)\)',reward)
    lane_hp=re.search(r'if OR==(\d+) then\s+call SetUnitState\(i,UNIT_STATE_LIFE,(\d+)\)',reward)
    batch,batch_source=jass_function(jass,'ib')
    if not all([spawn,lifetime,maximum_hp,lane_hp]) or 'if ON-OM==1 and Dg==5 then' not in batch:raise ValueError('Unrecognized wave-five reward spawn')
    selection,selection_source=jass_function(jass,'RandomSetGoldBoxPlayer')
    if 'RandomSetGoldBoxPlayerForIndex(1,4)' not in selection or 'RandomSetGoldBoxPlayerForIndex(5,8)' not in selection:raise ValueError('Unrecognized treasure team selection')
    scale,scale_source=jass_function(jass,'Trig_CreateUnitHookGetLifeScale')
    if not re.search(r'if Dg<=10 then\s+return 1\.5\s+endif\s+return 3\.',scale):raise ValueError('Unrecognized special monster life scale')
    return {'waveFive':{'wave':5,'rawcode':code(spawn[1]),'perLane':1,'spawnAt':'last-main-batch','lifetimeSeconds':int(lifetime[2]),'timedLifeBuffRawcode':code(lifetime[1]),'maxHp':int(maximum_hp[1]),'laneOneCurrentHp':int(lane_hp[2]),'setCurrentHpLane':int(lane_hp[1]),'otherLaneCurrentHpPolicy':'native-current-life-after-max-life-change','ordinaryKillGold':False,'firstAndLastKillReward':{'gold':80,'wood':150,'scope':'global-cumulative-spawn-and-death-counts','source':{'file':'war3map.j','line':19152,'endLine':19167}},'source':reward_source,'batchSource':batch_source},'treasure':{'byWave':by_wave,'perTeam':1,'maximumPerWave':int(maximum[1]),'spawnAt':'first-batch-after-main-monsters','recipient':'random-living-player-per-team','creationHpScale':{'requires':'ninefold-and-sapper-not-structure-summoned-or-giant','firstWave':6,'throughWave10':1.5,'fromWave11':3,'source':scale_source},'source':register_source,'initializationSource':init_source,'selectionSource':selection_source,'batchSource':batch_source}}
def literal_box_training(jass):
    """Keep the native reward-only selection graph separate from Upgrade."""
    body,registration=jass_function(jass,'BoxUpgradeTreeRegister___Register')
    def literal_rows(prefix,raw_key,values_key):
        counts={};choices=defaultdict(dict)
        for offset,line in enumerate(body.split('\n')):
            match=re.fullmatch(r'call SaveInteger\(O,\$([0-9A-F]{8}),StringHash\("'+prefix+r'_(count|\d+)"\),(\$[0-9A-F]{8}|\d+)\)\r?',line)
            if not match:continue
            raw,key,target=match.groups();raw=code(raw);script_line=registration['line']+offset
            if key=='count':
                if target.startswith('$') or raw in counts:raise ValueError('Duplicate/nonliteral '+prefix+' count '+raw)
                counts[raw]={'count':int(target),'line':script_line}
            else:
                index=int(key)
                if not target.startswith('$') or index in choices[raw]:raise ValueError('Duplicate/nonliteral '+prefix+' value '+raw)
                choices[raw][index]={'rawcode':code(target[1:]),'line':script_line}
        if set(counts)!=set(choices):raise ValueError(prefix+' source/count mismatch')
        result={}
        for raw,count in counts.items():
            ordered=choices[raw]
            if sorted(ordered)!=list(range(1,count['count']+1)):raise ValueError(prefix+' indexes differ from count '+raw)
            result[raw]={raw_key:raw,'count':count['count'],values_key:[ordered[i]['rawcode'] for i in sorted(ordered)],'indices':sorted(ordered),'scriptLines':[ordered[i]['line'] for i in sorted(ordered)],'countScriptLine':count['line']}
        return result
    selections=literal_rows('box_train_select','sourceRawcode','rawTargets')
    requirements=literal_rows('box_train_upgrade_require','targetRawcode','rawRequirements')
    action,action_source=jass_function(jass,'BoxGiftTryUpgradeTargetUnitNowByType')
    target,target_source=jass_function(jass,'BoxGiftIsTrainTarget')
    owned,owned_source=jass_function(jass,'BoxGiftIsOwnedAlive')
    consume,consume_source=jass_function(jass,'BoxGiftTrainUpgradeDialogAction')
    tech,tech_source=jass_function(jass,'BoxGiftIsUpgradeTechReady')
    limit,limit_source=jass_function(jass,'BoxGiftIsUpgradeLimitReady')
    count_limits,count_limits_source=jass_function(jass,'BoxGiftCountPlayerLimitUsed')
    count_enum,count_enum_source=jass_function(jass,'BoxGiftCountPlayerLimitUsedEnum')
    alias=re.search(r'^integer Oh=\$([0-9A-F]{8})\r?$',jass,re.M)
    if not alias or 'if not IsUnitType(Om,UNIT_TYPE_HERO) then' not in target or 'Om!=Pf' not in target or 'GetOwningPlayer(i)==h and not IsUnitType(i,UNIT_TYPE_DEAD)' not in owned:raise ValueError('Unrecognized box training target contract')
    if 'set BU=GetUnitGoldCost(Y4)*40/100' not in action or 'set BV=GetUnitWoodCost(Y4)*40/100' not in action or 'GetUnitAbilityLevel(Pf,Oh)<=0' not in action or 'BoxGiftIsUpgradeLimitReady(h,Om,Y4)' not in action or 'BoxGiftIsUpgradeTechReady(h,Y4)' not in action:raise ValueError('Unrecognized box training cost/requirement contract')
    if 'if BoxGiftTryUpgradeTargetUnitNowByType(Pf,Om,Y4) then\r\ncall BoxGiftConsumeBoxReward(Pf)' not in consume:raise ValueError('Unrecognized box training reward consumption')
    if 'StringHash("box_train_upgrade_require_count")' not in tech or 'HaveSavedInteger(O,Y4,StringHash("count"))' not in limit or 'LoadBoolean(O,Y9,StringHash("limitid_ex"))' not in count_enum:raise ValueError('Unrecognized box training native requirement/cap helpers')
    return {'selections':selections,'targetRequirements':requirements,'targetLimits':{},'contract':{'abilityRawcode':code(alias[1]),'costPercent':40,'costRounding':'JASS integer multiplication/division','ownedAliveOnly':True,'excludesNativeHeroes':True,'excludesBuildings':False,'excludesRewardProvider':True,'requiresActiveReward':True,'checksTargetRequirements':True,'checksTargetBuildLimit':True,'requirementCountAbsent':'zero-checks','limitCountAbsent':'unlimited-by-training-helper','limitCountPolicy':'max(group-count,all-owned-unit-count), excluding replaced unit and dead units; exact type or base_id lineage unless limitid_ex','consumeReward':'once-on-success','immediate':True,'source':{'action':action_source,'target':target_source,'ownedAlive':owned_source,'consume':consume_source,'tech':tech_source,'limit':limit_source,'countLimits':count_limits_source,'countLimitEnum':count_enum_source,'abilityAlias':{'file':'war3map.j','line':jass.count('\n',0,alias.start())+1}}},'source':registration,'selectionCount':sum(x['count'] for x in selections.values()),'requirementCount':sum(x['count'] for x in requirements.values()),'importedRawcodes':[]}
def refresh(src, dest):
    (dest/'data').mkdir(parents=True,exist_ok=True)
    for path in sorted((src/'data').iterdir()):
        if path.suffix.lower() in ['.csv','.json']: shutil.copy2(path,dest/'data'/path.name)
    (dest/'raw_extracted').mkdir(exist_ok=True)
    for name in ['war3map.j','war3mapMisc.txt','war3mapSkin.txt']:
        if (src/'raw_extracted'/name).is_file(): shutil.copy2(src/'raw_extracted'/name,dest/'raw_extracted'/name)
    for name in ['README.md','DATA_DICTIONARY.md','开发者速查.md']:
        if (src/name).is_file(): shutil.copy2(src/name,dest/name)
    manifest = {'policy':'Source CSV/JSON plus original JASS and map text; supplied tools and binary objects are not executed or copied.','files':{str(p.relative_to(dest)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(dest.rglob('*')) if p.is_file() and p.name!='import-manifest.json'}}
    (dest/'import-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

def generate(snapshot):
    tables = {p.name:read_table(snapshot,p.name) for p in (snapshot/'data').glob('*.csv')}
    all_units=tables['all_units.csv']; raw_units={r['rawcode']:r for r in all_units}; raw_rows={r['rawcode']:i+2 for i,r in enumerate(all_units)}
    unit_overrides=defaultdict(list)
    unit_field_map={'umdl':'file','uico':'Art','unam':'name','unsf':'EditorSuffix','utip':'tip','utub':'ubertip','ubui':'Builds','uhot':'hotkey','ua1m':'Missileart1','umh1':'MissileHoming1','ua1z':'launchZ','ua2z':'launchZ2'}
    for rowno,ov in enumerate(tables['war3map_w3u_modifications.csv'],2):
        c=ov['object_rawcode'];target=unit_field_map.get(ov['field_rawcode'])
        if not target:raise ValueError('Unsupported W3U field '+ov['field_rawcode'])
        if c not in raw_units:raise ValueError('Unresolved W3U object '+c)
        raw_units[c][target]=ov['value'];unit_overrides[c].append({**ov,'source':source('war3map_w3u_modifications.csv',rowno,c),'resolvedField':target})
    roster=tables['player_buildable_units.csv']; by_roster={r['rawcode']:r for r in roster}
    # The source JASS contains mixed-encoding strings. Latin-1 is a reversible
    # byte mapping; this parser reads only ASCII identifiers and hex literals.
    jass=(snapshot/'raw_extracted/war3map.j').read_bytes().decode('latin1')
    box_training=literal_box_training(jass)
    pairs=[]
    for m in re.finditer(r'set Mk\[Bi\]=\$([0-9A-F]{8})\s+set Ml\[Bi\]=\$([0-9A-F]{8})',jass):
        pairs.append({'combat':code(m[1]),'building':code(m[2]),'line':jass.count('\n',0,m.start())+1})
    combat_map={}
    for p in pairs:
        if p['building'] in combat_map and combat_map[p['building']]['combat']!=p['combat']:
            raise ValueError('Conflicting building/combat mapping '+p['building'])
        combat_map[p['building']]=p
    assert len(pairs)==723 and len(combat_map)==722
    pools=[];tiers={};pool_sources={}
    for tier,array in enumerate(ARRAYS,1):
        entries=[]
        for m in re.finditer(r'set '+array+r'\[(\d+)\]=\$([0-9A-F]{8})',jass):
            c=code(m[2]);entries.append((int(m[1]),c));tiers[c]=tier;pool_sources[c]={'file':'war3map.j','line':jass.count('\n',0,m.start())+1,'array':array,'index':int(m[1])}
        pools.append([uid(c) for _,c in sorted(entries)])
    assert [len(p) for p in pools]==[18,18,18,18,18,17]
    pool_codes={x[4:] for group in pools for x in group}
    requirements=defaultdict(list)
    for rowno,r in enumerate(tables['unit_upgrade_requirements.csv'],2):
        requirements[r['target_rawcode']].append({'rawcode':r['requirement_rawcode'],'name':r['requirement_name'],'kind':r['requirement_kind'],'source':source('unit_upgrade_requirements.csv',rowno,r['target_rawcode']),'scriptLine':int(num(r['source_line']))})
    source_edge_rows=tables['unit_upgrade_edges.csv'];edge_rows=list(source_edge_rows)
    # Retain the established ordinary pool/CSV closure supplements. Hero
    # training branches are resolved separately after hero registration below;
    # a reward-only selection must not become an ordinary upgrade by accident.
    preliminary=set(pool_codes)
    while True:
        expanded=preliminary|{r['target_rawcode'] for r in edge_rows if r['source_rawcode'] in preliminary}
        if expanded==preliminary:break
        preliminary=expanded
    present={(r['source_rawcode'],r['target_rawcode']) for r in edge_rows};supplemental_edges=[]
    for m in re.finditer(r'call SaveInteger\(O,\$([0-9A-F]{8}),StringHash\("box_train_select_(\d+)"\),\$([0-9A-F]{8})\)',jass):
        a,b=code(m[1]),code(m[3])
        if a not in preliminary or (a,b) in present:continue
        r=raw_units[b];line=jass.count('\n',0,m.start())+1
        addition={'source_rawcode':a,'source_name':raw_units[a]['name'],'target_rawcode':b,'target_name':r['name'],'choice_slot':m[2],'is_immediate_select_edge':'True','not_in_immediate_select_table':'False','target_in_easter_catalog':'False','explicit_easter_text':'False','target_gold_cost':r['goldcost'],'target_lumber_cost':r['lumbercost'],'target_build_time':r['bldtm'],'target_total_power_points':r['points'],'requirement_rawcodes':','.join(x['rawcode'] for x in requirements.get(b,[])),'requirement_names':','.join(x['name'] for x in requirements.get(b,[])),'source_line':str(line),'supplemental':True}
        supplemental_edges.append(addition);edge_rows.append(addition);present.add((a,b));preliminary.add(b)
    literal_training_edges={(a,b) for a,entry in box_training['selections'].items() for b in entry['rawTargets']}
    assert all((r['source_rawcode'],r['target_rawcode']) in literal_training_edges for r in supplemental_edges)
    assert len({(r['source_rawcode'],r['target_rawcode']) for r in supplemental_edges})==len(supplemental_edges)
    successors=defaultdict(list);parents=defaultdict(list)
    for r in edge_rows:
        successors[r['source_rawcode']].append(r['target_rawcode']);parents[r['target_rawcode']].append(r['source_rawcode'])
    reachable=set(pool_codes)
    while True:
        expanded=reachable|{r['target_rawcode'] for r in edge_rows if r['source_rawcode'] in reachable}
        if expanded==reachable:break
        reachable=expanded
    # Tiers/races propagate only along explicit edges.
    cat_rows=tables['easter_egg_catalog.csv'];catalog={r['unit_rawcode']:r for r in cat_rows}
    races={c:clean(catalog.get(c,{}).get('root_ability_name')) for c in pool_codes}
    # These two literal pool entries have no row in the player's catalog view;
    # they belong to the new fish race. This supplemental association is kept
    # explicit; it never creates an entrance from a Chinese name match.
    for c in ['n085','n2YS']:races[c]='鱼人'
    for _ in range(len(edge_rows)):
        changed=False
        for r in edge_rows:
            a,b=r['source_rawcode'],r['target_rawcode']
            if a in tiers and b not in tiers:tiers[b]=tiers[a];changed=True
            if races.get(a) and not races.get(b):races[b]=races[a];changed=True
        if not changed:break
    ability_table={}
    for rowno,r in enumerate(tables['all_abilities.csv'],2):
        resolved=fields(r)
        ability_table[r['rawcode']]={'rawcode':r['rawcode'],'name':clean(r['name']) or r['rawcode'],'base_code':r['code'] or r['rawcode'],'base_object':r['code'] or r['rawcode'],'status':'available','fields':resolved,'resolved_fields':resolved,'native_slk_fields':resolved,'object_overrides':[],'description':clean(r['ubertip']),'tooltip_text':clean(r['ubertip']),'source':source('all_abilities.csv',rowno,r['rawcode']),'provenance':PROVENANCE,'sourceVersion':VERSION}
    # A full object definition is evidence that an object exists, not evidence
    # of a shop/research entrance. In particular the supplied unit CSV does
    # not contain native Sellitems/Researches fields. Keep these records
    # inspectable without inventing purchase access or replacing blank costs.
    object_catalogs={}
    for export_name,table_name in [('V14_ITEMS','all_items.csv'),('V14_TECHNOLOGIES','all_upgrades.csv')]:
        object_catalogs[export_name]={r['rawcode']:{'rawcode':r['rawcode'],'name':clean(r['name']) or r['rawcode'],'description':clean(r['ubertip']),'fields':fields(r),'status':'source-record','availability':'source-only','source':source(table_name,rowno,r['rawcode']),'provenance':PROVENANCE,'sourceVersion':VERSION} for rowno,r in enumerate(tables[table_name],2)}
    sacrifice_rewards=[]
    sacrifice_init,sacrifice_source=jass_function(jass,'EggResource___Init')
    for rowno,r in enumerate(tables['easter_egg_sacrifice_rewards.csv'],2):
        tier=int(r['tier']);gold=int(r['gold']);wood=int(r['lumber']);hp=int(r['king_max_HP']);bonus=r['king_bonus_ability']
        literal=f'call EggResource___InitEggResourceLevel({tier},{gold},{wood},{hp},${bonus.encode().hex().upper()})'
        if literal not in sacrifice_init:raise ValueError('Sacrifice reward CSV differs from JASS: '+str(tier))
        sacrifice_rewards.append({'tier':tier,'abilityRawcode':r['ability_rawcode'],'gold':gold,'wood':wood,'kingMaxHp':hp,'kingBonusAbilityRawcode':bonus,'preservesKingLifePercent':True,'consumesUnit':True,'disablesUnitTypeForPlayer':True,'carrierRawcodes':[],'carrierStatus':'unresolved-in-supplied-unit-and-script-fields','source':source('easter_egg_sacrifice_rewards.csv',rowno,r['ability_rawcode']),'scriptSource':sacrifice_source})
    special_monsters=literal_special_monsters(jass)
    special_gold_rewards=[{**r,'source':source('special_gold_rewards.csv',rowno)} for rowno,r in enumerate(tables['special_gold_rewards.csv'],2)]
    applied_ability_modifications=0
    for rowno,ov in enumerate(tables['war3map_w3a_modifications.csv'],2):
        c=ov['object_rawcode'];a=ability_table.get(c)
        if a is None:raise ValueError('Unresolved W3A object '+c)
        level=max(1,int(num(ov['level'],1)));col=int(num(ov['data_column']))
        field={'adur':'Dur','ahdu':'HeroDur'}.get(ov['field_rawcode'])
        target=field+str(level) if field else 'Data'+chr(64+col)+str(level) if 1<=col<=9 else None
        if target is None:raise ValueError('Unsupported W3A field '+ov['field_rawcode'])
        if not a['object_overrides']:a['resolved_fields']=dict(a['native_slk_fields']);a['fields']=a['resolved_fields']
        a['resolved_fields'][target]=ov['value'];a['object_overrides'].append({'field':ov['field_rawcode'],'level':level,'dataPointer':col,'value':ov['value'],'resolvedValue':ov['value'],'resolvedField':target,'source':source('war3map_w3a_modifications.csv',rowno,c)})
        applied_ability_modifications+=1
    injections=defaultdict(list)
    for r in tables['x9_bonus_abilities.csv']:
        injections[r['unit_rawcode']].append({'id':r['ability_rawcode'],'wave':20 if r['unit_rawcode']=='h03O' else None,'condition':r['condition']})
    def stats(c):
        r=raw_units[c];f=fields(r);weapon_keys={k for k in r if re.match(r'^(?:atkType|backSw|cool|dice|dmgpt|rangeN|RngBuff|showUI|sides|targCount|targs|weapTp|weapType|Farea|Harea|Hfact|Qarea|Qfact|splashTargs|dmgplus|damageLoss|spillRadius|spillDist)[12]$',k)}|{'weapsOn','acquire','minRange'}
        wf={k:f[k] for k in sorted(weapon_keys) if k in f};ids=list(dict.fromkeys(split(r['abilList'])+split(r['heroAbilList'])));rng=num(r['rangeN1'],90);hp=num(r['HP'],1);damage=num(r['damage_avg_1']);armor=ARMOR.get(r['defType'],'medium');flags=split(r['type'])
        sap='sapper' in [x.lower() for x in flags] and not any(x.lower() in ['summoned','giant'] for x in flags) and num(r['isbldg'])!=1
        return {'id':'v14_raw_'+c,'name':clean(r['name']) or c,'hp':compact(hp),'baseHp':compact(hp),'damage':compact(damage),'interval':compact(num(r['cool1'],1)),'range':compact(rng*SCALE),'speed':compact(num(r['spd'],270)*SCALE),'armor':compact(num(r['def'])),'attackType':r['atkType1'] or 'normal','armorType':armor,'sourceArmorTypeRaw':r['defType'],'armorDisplayName':r['armor_type_zh'],'ability':None,'abilityIds':ids,'autoAbilityIds':split(r['auto']),'mana':compact(num(r['manaN'])),'manaStart':compact(num(r['mana0'])),'manaRegen':compact(num(r['regenMana'])),'hpRegen':compact(num(r['regenHP'])),'unitType':r['type'],'targetType':r['targType'] or 'ground','movementType':r['movetp'] or 'foot','weapon1':{k:v for k,v in wf.items() if k.endswith('1') or k in ['weapsOn','acquire','minRange']},'weapon2':{k:v for k,v in wf.items() if k.endswith('2') or k in ['weapsOn','acquire','minRange']},'weaponsOn':num(r['weapsOn'],1),'sourceHP':compact(hp),'sourceDamage':compact(damage),'sourceDamageMin':compact(num(r['damage_min_1'])),'sourceDamageMax':compact(num(r['damage_max_1'])),'sourceRange':compact(rng),'sourceSpeed':compact(num(r['spd'],270)),'sourceRawFields':f,'sourceRawcode':c,'combatRawcode':c,'sourcePoints':compact(num(r['points'])),'sourceLevel':int(num(r['level'])),'provenance':PROVENANCE,'sourceVersion':VERSION,'sourceObjectOverrides':unit_overrides.get(c,[]),'distanceScale':SCALE,'abilityCoverage':{'implemented':[],'omitted':ids,'compiler':'dist/skills.js'},'role':'ranged' if rng>180 else 'tank' if armor in ['heavy','fortified','divine'] else 'frontline','color':'#a9bcd3','shape':'circle','source':source('all_units.csv',raw_rows[c],c),'sapScalingTarget':sap,'sapperScalingTarget':sap,'x9InjectedSkills':injections.get(c,[])}
    templates={c:stats(c) for c in raw_units}
    builders=[];builder_map={}
    for m in re.finditer(r'set Mi\[(\d+)\]=(\$[0-9A-F]{8}|Kf\[1\])',jass):
        i=int(m[1]);c='U00T' if m[2]=='Kf[1]' else code(m[2][1:]);name='先知' if i==13 else clean(raw_units[c]['name']) or c
        bid='v14_builder_'+c;builder_map[name]=bid
        builders.append({'id':bid,'rawcode':c,'name':name,'index':i,'rosterIds':[],'heroEntryIds':[],'mode':'prophet' if i==13 else 'morph' if i==0 else 'race','menuPath':'Mi['+str(i)+']','requires':[],'availability':'JASS建造者登记；当前不模拟平台账号付费资格。','notes':'鱼人名称与Builds采用W3U覆盖层，基础名册5项及英雄祭坛。' if i==19 else '', 'source':{'file':'war3map.j','line':jass.count('\n',0,m.start())+1,'rawcode':c},'provenance':PROVENANCE})
    assert len(builders)==20
    morph_codes=['h07D','h07E','h07G','h07F','h07H','h07I']
    all_catalog_codes=set(by_roster)-{'e003'}|reachable|set(morph_codes)
    units=[];archive=[]
    limits=defaultdict(list);build_limits=[];ban_limits=[]
    # RegisterBudingLimit's Tp is an automatically created counter unit, not
    # paid/platform eligibility. All 47 InitBudingLimit calls run initially;
    # the two BD branches both set n04W=3 and are equivalent in this mode.
    init_limit=re.search(r'function InitBudingLimit\b.*?endfunction',jass,re.S)
    actual_calls=re.findall(r'call (RegisterBudingLimit(?:Ex)?)\(\$([0-9A-F]{8}),(0|\$[0-9A-F]{8}),(\d+)\)',init_limit[0])
    normalized_calls=[(api,code(c),'' if marker=='0' else code(marker[1:]),int(cap)) for api,c,marker,cap in actual_calls]
    expected_calls=[(r['limit_api'],r['unit_rawcode'],r['requirement_rawcode'],int(r['max_allowed'])) for r in tables['easter_egg_build_limits.csv']]
    if normalized_calls!=expected_calls:raise ValueError('Build-limit CSV differs from initial JASS calls')
    for rowno,r in enumerate(tables['easter_egg_build_limits.csv'],2):
        c=r['unit_rawcode'];marker=r['requirement_rawcode'];maximum=int(num(r['max_allowed']));extended=r['limit_api']=='RegisterBudingLimitEx'
        scope='type' if extended else 'lineage'
        entry={**r,'unitRawcode':c,'unitId':uid(c),'maxAllowed':maximum,'maximum':maximum,'api':r['limit_api'],'counterMarkerRawcode':marker,'counterMarkerName':clean(raw_units.get(marker,{}).get('name')) if marker else '', 'counterMarkerRole':'automatically_created_capacity_marker' if marker else None,'counterMarkerAvailableBelowLimit':bool(marker),'requirementRawcode':marker,'requirementName':clean(raw_units.get(marker,{}).get('name')) if marker else '', 'requires':[],'scope':scope,'releaseOnUpgrade':extended,'initial':True,'initialDelaySeconds':1,'condition':'BD' if c=='n04W' and len(limits[c])==0 else '!BD' if c=='n04W' else 'always','conditionEquivalentForNinefold':True,'source':source('easter_egg_build_limits.csv',rowno,c),'scriptLine':int(num(r['source_line'])),'scriptEvidence':{'file':'war3map.j','registerLines':[28382,28418],'enforceLines':[28427,28483]}}
        build_limits.append(entry);limits[c].append(entry)
    # BoxGift reads the hashtable count written by RegisterBudingLimit, not
    # SetPlayerTechMaxAllowed's separate BAN initialization. Preserve exactly
    # those saved-count targets, including the source's base_id/Ex distinction.
    for c,entries in limits.items():
        box_training['targetLimits'][c]={'targetRawcode':c,'hasSavedCount':True,'count':entries[-1]['maxAllowed'],'limitidEx':any(e['releaseOnUpgrade'] for e in entries),'registrations':[{'api':e['api'],'count':e['maxAllowed'],'counterMarkerRawcode':e['counterMarkerRawcode'],'scriptLine':e['scriptLine'],'condition':e['condition']} for e in entries],'source':{'file':'war3map.j','countStoreLine':28408,'extendedFlagLine':28416}}
    bans={}
    for rowno,r in enumerate(tables['easter_egg_ban_limits.csv'],2):
        c=r['unit_rawcode'];cap=int(num(r['initial_max_allowed'],-1));entry={**r,'unitRawcode':c,'unitId':uid(c),'maxAllowed':cap,'initial':True,'scope':'type','source':source('easter_egg_ban_limits.csv',rowno,c),'scriptLine':int(num(r['source_line'])),'alsoAppliesToRawcodes':['h0NP'] if c=='h0JM' else [],'interactiveBanEnabled':False}
        ban_limits.append(entry);bans[c]=entry
    # Initial max-allowed values from BAN registration are superseded after
    # one second by explicit RegisterBudingLimit calls on the same object.
    initial_caps={c:int(r['maxAllowed']) for c,r in bans.items()}
    for c,entries in limits.items():initial_caps[c]=entries[-1]['maxAllowed']
    roster_rows={r['rawcode']:i+2 for i,r in enumerate(roster)}
    for c in sorted(all_catalog_codes):
        r=raw_units[c];f=fields(r);registered=by_roster.get(c,{});proxy=c in morph_codes;combat=combat_map.get(c,{}).get('combat');tier=morph_codes.index(c)+1 if proxy else tiers.get(c,6);race='变形' if proxy else races.get(c) or clean(catalog.get(c,{}).get('root_ability_name')) or '条件彩蛋';active=c in reachable or proxy
        if not combat and not proxy:raise ValueError('Missing proven combat form '+c)
        st=templates[combat or c];reqs=requirements.get(c,[]);non_end=[x for x in reqs if x['rawcode']!='u004'];base=c in pool_codes or proxy
        entry={**st,'id':uid(c),'name':clean(r['name']) or c,'race':race,'races':[race],'builderIds':[builder_map[race]] if race in builder_map else [],'tier':tier,'cost':compact(num(r['goldcost'])),'woodCost':compact(num(r['lumbercost'])),'population':int(num(r['fused'],1)),'sourceRawcode':c,'combatRawcode':combat or c,'upgrades':[uid(x) for x in successors.get(c,[]) if x in all_catalog_codes],'sourceUpgradeRawcodes':successors.get(c,[]),'omittedUpgradeRawcodes':[x for x in successors.get(c,[]) if x not in all_catalog_codes],'requires':[x['rawcode'] for x in reqs],'requirementDetails':reqs,'requiresDetails':reqs,'sourcePoints':compact(num(r['points'])),'buildingRawFields':f,'buildingAbilityIds':split(r['abilList']),'randomPool':c in pool_codes,'isBase':base,'legacy':False,'morphProxy':proxy,'morphTargets':pools[tier-1] if proxy else [],'specialForm':False,'hero':False,'heroEntry':False,'heroLevel':0,'color':COLORS[(tier-1)%6],'shape':'diamond' if st['range']>60 else 'square','source':source('player_buildable_units.csv',roster_rows[c],c) if c in roster_rows else source('all_units.csv',raw_rows[c],c),'sourceEvidence':{'combatMapping':combat_map.get(c),'randomPool':pool_sources.get(c)},'acquisition':'随机变形占位' if proxy else '基础可建造' if base else '条件升级' if non_end else '普通升级' if parents.get(c) else '图鉴登记','sourceCategory':registered.get('record_scope','JASS即时升级补录' if c not in pool_codes and not proxy else 'JASS明确基础/变形入口'),'reachability':'有JASS入口/升级闭包；资格需求另判' if active else '仅登记，无已证实基础入口','description':clean(r['ubertip']),'playable':active,'requiresUnlock':bool(non_end),'easterEgg':boolean(registered.get('explicit_easter_text')) or bool(catalog.get(c)) and not base,'skinBaseRawcode':registered.get('skin_base_rawcode',''),'catalogPath':catalog.get(c,{}).get('breadcrumb_names',''),'buildLimits':limits.get(c,[]),'buildLimitDetails':limits.get(c,[]),'buildLimit':initial_caps.get(c,-1),'initialBuildLimit':initial_caps.get(c,-1),'buildLimitScope':limits[c][-1]['scope'] if limits.get(c) else 'type','sourceCaps':{'initialBuildLimit':limits.get(c,[]),'banInitialLimit':bans.get(c),'policy':'Explicit initial build-limit call supersedes BAN max-allowed after 1 second; marker units are counters, not account qualifications.'},'sourceRegistryMember':c in by_roster}
        if active:units.append(entry)
        else:entry.update({'reason':'未在107候选/变形入口或302升级边闭包内找到入口；不把图鉴登记当作可直接建造。'});archive.append(entry)
    for b in builders:
        if b['mode']=='morph':b['rosterIds']=[uid(c) for c in morph_codes]
        elif b['mode']=='race':b['rosterIds']=[u['id'] for u in units if u['randomPool'] and u['race']==b['name']]
        # prophet deliberately leaves rosterIds empty: engine draws one each tier.
        b['rosterIds'].sort(key=lambda x:(next(u['tier'] for u in units if u['id']==x),x))
    # Hero entries are absent from the packet's 374-row player view. The two
    # pages nevertheless enumerate their exact rawcodes in the current JASS.
    # Each family then has a contiguous Mk/Ml run with numbered building
    # stages. Reconstruct the Web upgrade path from that run, explicitly
    # distinguishing it from the packet's literal box_train upgrade edges.
    # No older workbook, name-based cross-version join, or old hero price is
    # used. Native Upgrade/Requires fields are not included in this packet.
    hero_page=re.search(r'function Trig_heroPageActions\b.*?endfunction',jass,re.S)
    hero_choices=[];hero_choice_sources={}
    for m in re.finditer(r'call LimitHeroTypeCount\(h,\$([0-9A-F]{8}),true\)',hero_page[0]):
        c=code(m[1])
        if c in hero_choices:continue
        hero_choices.append(c);hero_choice_sources[c]={'file':'war3map.j','line':jass.count('\n',0,hero_page.start()+m.start())+1,'rawcode':c}
    assert len(hero_choices)==17
    init_hero_page=re.search(r'function InitHeroPage\b.*?endfunction',jass,re.S)
    second_page_choices={code(m[1]) for m in re.finditer(r'call LimitHeroTypeCount\(h,\$([0-9A-F]{8}),false\)',init_hero_page[0])}
    assert len(second_page_choices)==7
    hero_choices.sort(key=lambda c:c in second_page_choices)
    short_hero_families={'hh01','n067','n03U','n08J','n091'}
    hero_runs={}
    for c in hero_choices:
        start=next(i for i,p in enumerate(pairs) if p['building']==c)
        run=pairs[start:start+(3 if c in short_hero_families else 11)]
        assert len(run)==(3 if c in short_hero_families else 11)
        # Numbered labels validate the registration sequence; they never
        # create a join or find a target by a translated unit name.
        for stage,p in enumerate(run,1):
            name=clean(raw_units[p['building']]['name'])
            label=re.search(r'等级\s*(\d+)',name)
            expected=stage+9 if c=='hh01' else stage
            if label:assert int(label[1])==expected,(c,p,name)
            else:assert stage==len(run) or c=='hh01' and stage==2,(c,p,name)
        hero_runs[c]=run
    hero_codes={p['building'] for run in hero_runs.values() for p in run}
    assert len(hero_codes)==147 and not hero_codes.intersection(all_catalog_codes)
    all_catalog_codes.update(hero_codes|{'h0DB'})
    # The alchemist tooltip names the same conjunction implemented by the
    # current creation trigger: h0AF + h0AO permanently grants R2Z0.
    upgrade_names={r['rawcode']:r['name'] for r in tables['all_upgrades.csv']}
    alchemist_grant=jass.index('call SetPlayerTechResearchedSwap($52325A30,1,h)')
    alchemist_requirement={'rawcode':'R2Z0','name':clean(upgrade_names['R2Z0']),'kind':'technology','source':source('all_units.csv',raw_rows['n091'],'n091'),'scriptLine':jass.count('\n',0,alchemist_grant)+1,'evidence':'n091 tooltip and h0AF+h0AO -> R2Z0 in EggWhiteEx'}
    assert '需要发条地精和地精伐木机'==alchemist_requirement['name']
    requirements['n091'].append(alchemist_requirement)
    hero_edges=[];hero_entries=[uid('h0DB')]
    hero_builder_ids=[b['id'] for b in builders]
    for b in builders:b['heroEntryIds']=hero_entries.copy()
    def hero_record(c,combat,family,stage,level,targets,choice=False,page=0,total=0):
        r=raw_units[c];st=templates[combat or c];reqs=requirements.get(c,[])
        return {**st,'id':uid(c),'name':clean(r['name']) or c,'race':'英雄','races':['英雄'],'builderIds':hero_builder_ids,'tier':0,'cost':compact(num(r['goldcost'])),'woodCost':compact(num(r['lumbercost'])),'population':int(num(r['fused'])),'sourceRawcode':c,'combatRawcode':combat,'upgrades':[uid(x) for x in targets],'sourceUpgradeRawcodes':targets,'omittedUpgradeRawcodes':[],'requires':[x['rawcode'] for x in reqs],'requirementDetails':reqs,'requiresDetails':reqs,'sourcePoints':compact(num(r['points'])),'buildingRawFields':fields(r),'buildingAbilityIds':split(r['abilList']),'randomPool':False,'isBase':False,'legacy':False,'morphProxy':False,'specialForm':False,'hero':True,'heroEntry':c=='h0DB','heroAltar':c=='h0DB','heroChoice':choice,'heroLevel':level,'heroStage':stage,'heroStageCount':total,'heroFamily':family,'heroTypeRawcode':family,'heroPage':page,'heroAllowedBuilderIds':[b['id'] for b in builders if b['mode']!='morph'] if family=='hh01' else hero_builder_ids,'color':'#d4b66f','shape':'star','source':source('all_units.csv',raw_rows[c],c),'sourceEvidence':{'combatMapping':combat_map.get(c),'heroPage':hero_choice_sources.get(family),'progressionPolicy':'Web reconstruction of numbered stages in the current contiguous Mk/Ml hero-family registration; native Upgrade/Requires fields are absent from the CSV packet.'},'acquisition':'建造英雄祭坛' if c=='h0DB' else '英雄祭坛选择' if choice else '英雄等级升级','sourceCategory':'JASS英雄祭坛与英雄分页补录','reachability':'JASS英雄分页入口及本版编号阶段重建','description':clean(r['ubertip']),'playable':True,'requiresUnlock':bool(reqs),'easterEgg':False,'buildLimits':[],'buildLimitDetails':[],'buildLimit':-1,'initialBuildLimit':-1,'buildLimitScope':'type','sourceRegistryMember':False}
    altar=hero_record('h0DB',None,'h0DB',0,0,hero_choices)
    altar_initial=jass.index('call SetPlayerTechMaxAllowedSwap($68304442,1,GetEnumPlayer())')
    altar_completion=re.search(r'if x==\$68304442 then\s+call SaveBoolean.*?call DisplayTimedTextToPlayer\(',jass,re.S)
    altar['sourceEvidence']['altarRules']={'file':'war3map.j','initialLimitLine':jass.count('\n',0,altar_initial)+1,'completionLines':[jass.count('\n',0,altar_completion.start())+1,jass.count('\n',0,altar_completion.end())+1],'pageLines':[jass.count('\n',0,hero_page.start())+1,jass.count('\n',0,hero_page.end())+1],'ninefoldMaximum':2,'uniqueType':True,'sellable':False,'replaceable':False}
    altar['sourceEvidence']['missingNativeFields']=['goldcost','lumbercost','fused','points','Upgrade','Requires']
    altar['sourceEvidence']['pricingPolicy']='The current CSV leaves altar gold/lumber fields blank; Web adaptation uses zero rather than importing an older-version price.'
    units.append(altar)
    for family,run in hero_runs.items():
        page=2 if family in second_page_choices else 1
        for index,p in enumerate(run):
            c=p['building'];name=clean(raw_units[c]['name']);label=re.search(r'等级\s*(\d+)',name)
            level=int(label[1]) if label else (11 if family=='hh01' else len(run)) if 'Max' in name else 0
            targets=[run[index+1]['building']] if index+1<len(run) else []
            record=hero_record(c,p['combat'],family,index+1,level,targets,index==0,page,len(run))
            record['sourceEvidence']['progressionMappingLines']=[x['line'] for x in run]
            units.append(record)
        for a,b in zip(['h0DB']+[p['building'] for p in run], [p['building'] for p in run]):
            target=raw_units[b];reqs=requirements.get(b,[])
            hero_edges.append({'fromId':uid(a),'toId':uid(b),'fromRawcode':a,'toRawcode':b,'resolved':True,'cost':compact(num(target['goldcost'])),'woodCost':compact(num(target['lumbercost'])),'requires':[r['rawcode'] for r in reqs],'requirementNames':[r['name'] for r in reqs],'immediateSelect':True,'hidden':False,'source':{'file':'war3map.j','line':hero_choice_sources[family]['line'] if a=='h0DB' else combat_map[b]['line'],'rawcode':b,'kind':'hero-page-entry' if a=='h0DB' else 'hero-numbered-stage-reconstruction'},'supplemental':False,'heroProgression':True,'inferred':a!='h0DB','sourceLines':[combat_map[b]['line']],'scriptLine':combat_map[b]['line']})
    assert len(hero_edges)==147
    # BoxGift can train the final altar stages into five extra source objects.
    # Resolve this graph only after the numbered hero entries exist. Keep it
    # separate from successors/hero_edges: native training needs A2ZA and pays
    # forty percent of the target price, rather than a normal Upgrade order.
    training_by_source=box_training['selections']
    training_parents=defaultdict(list);training_evidence=defaultdict(list)
    for a,selection in training_by_source.items():
        for index,b,line in zip(selection['indices'],selection['rawTargets'],selection['scriptLines']):
            if b not in raw_units:raise ValueError('Unknown literal box training target '+b)
            training_parents[b].append(a);training_evidence[b].append({'sourceRawcode':a,'index':index,'scriptLine':line,'file':'war3map.j'})
    existing_units={u['sourceRawcode']:u for u in units}
    ordinary_unit_count=len(units);training_codes=[]
    while True:
        added=False
        for a,selection in training_by_source.items():
            if a not in existing_units:continue
            parent=existing_units[a]
            for b in selection['rawTargets']:
                if b in existing_units:continue
                mapping=combat_map.get(b)
                if not mapping:raise ValueError('Training target has no proven combat mapping '+b)
                if not parent.get('hero') or not parent.get('heroFamily'):raise ValueError('Unreviewed non-hero training-only extension '+a+' -> '+b)
                r=raw_units[b];reqs=requirements.get(b,[])
                entry=hero_record(b,mapping['combat'],parent['heroFamily'],None,None,[],False,parent.get('heroPage',0),None)
                entry.update({'trainingOnly':True,'trainingSources':training_parents[b].copy(),'specialForm':True,'isNativeHero':raw_units[mapping['combat']].get('Primary') in ['STR','AGI','INT'],'acquisition':'宝箱兵种训练','sourceCategory':'JASS宝箱兵种训练补录','reachability':'JASS即时训练入口；不属于普通升级树','easterEgg':bool(catalog.get(b)),'buildLimits':limits.get(b,[]),'buildLimitDetails':limits.get(b,[]),'buildLimit':initial_caps.get(b,-1),'initialBuildLimit':initial_caps.get(b,-1),'buildLimitScope':limits[b][-1]['scope'] if limits.get(b) else 'type','sourceCaps':{'initialBuildLimit':limits.get(b,[]),'banInitialLimit':bans.get(b),'trainingLimit':box_training['targetLimits'].get(b),'policy':'Normal initial caps are retained separately; BoxGift checks only saved RegisterBudingLimit count, not BAN max-allowed.'},'sourceEvidence':{'combatMapping':mapping,'trainingSelections':training_evidence[b],'trainingContract':box_training['contract']['source'],'progressionPolicy':'BoxGift literal training leaf, separate from the Web numbered-stage reconstruction and ordinary Upgrade edges.','nativeHeroClassification':'Primary of the mapped combat object; Web altar-family identity does not imply UNIT_TYPE_HERO.','missingNativeFields':[field for field in ['goldcost','lumbercost','fused','points'] if r[field] in [None,'','_']],'pricingPolicy':'Normal numeric catalog adapters retain their existing empty-field fallback; original missing fields remain absent in buildingRawFields.'}})
                units.append(entry);existing_units[b]=entry;training_codes.append(b);all_catalog_codes.add(b);added=True
        if not added:break
    box_training['importedRawcodes']=sorted(training_codes)
    box_training['ordinaryUnitCount']=ordinary_unit_count
    box_training['trainingOnlyUnitCount']=len(training_codes)
    box_training['ordinaryUpgradeEdgesAdded']=0
    for entry in units:
        selection=training_by_source.get(entry['sourceRawcode'])
        if selection:entry['trainTargets']=[uid(c) for c in selection['rawTargets'] if c in existing_units]
    edges=[]
    for rowno,r in enumerate(edge_rows,2):
        edges.append({'fromId':uid(r['source_rawcode']),'toId':uid(r['target_rawcode']),'fromRawcode':r['source_rawcode'],'toRawcode':r['target_rawcode'],'resolved':r['target_rawcode'] in all_catalog_codes,'cost':compact(num(r['target_gold_cost'])),'woodCost':compact(num(r['target_lumber_cost'])),'requires':split(r['requirement_rawcodes']),'requirementNames':split(r['requirement_names']),'immediateSelect':boolean(r['is_immediate_select_edge']),'hidden':boolean(r['not_in_immediate_select_table']),'source':{'file':'war3map.j','line':int(r['source_line']),'rawcode':r['target_rawcode'],'kind':'immediate-select-supplement'} if r.get('supplemental') else source('unit_upgrade_edges.csv',rowno,r['target_rawcode']),'supplemental':bool(r.get('supplemental')),'sourceLines':[int(num(r['source_line']))],'scriptLine':int(num(r['source_line']))})
    edges.extend(hero_edges)
    rewards={int(r['wave']):r for r in tables['wave_kill_gold.csv']};waves=[]
    for rowno,r in enumerate(tables['waves_x9.csv'],2):
        w=int(r['wave']);c=r['rawcode'];st=templates[c];count=int(r['x9_count_per_lane']);boss=w in [10,20,30] or w>=31
        waves.append({**st,'id':w,'name':clean(r['name']),'count':count,'referenceCount':count,'baseCount':num(r['base_count']),'boss':boss,'bossCount':count if boss else 0,'hp':compact(num(r['x9_effective_HP'])),'baseHp':compact(num(r['base_object_HP'])),'x9HpScale':num(r['x9_HP_scale'],1),'sourceHP':compact(num(r['base_object_HP'])),'recommendedValue':int(num(r['recommended_power'])),'bounty':int(num(rewards[w]['base_gold_per_normal_kill'])),'kingGoldReward':int(num(r['protect_king_gold_reward'])),'nextWaveSubstitutionProbability':num(r['next_wave_unit_probability']),'nextWaveSubstitutionRawcode':tables['waves_x9.csv'][w]['rawcode'] if w<35 else None,'randomNextWave':boolean(r['x9_10pct_next_wave_substitution']),'nextWaveSubstitutionBonus':int(num(rewards[w]['next_wave_substitute_bonus_per_kill'])),'expectedHP':num(r['expected_x9_HP_per_unit_with_random_replacement']),'countAdaptation':'直接采用v14.1A5九倍每活跃路数量，不再次乘9或3。','runtimeStatPolicy':'采用CSV计算后的九倍HP；替换怪按当前波创建钩子单独计算。','source':source('waves_x9.csv',rowno,c),'killGoldSource':source('wave_kill_gold.csv',w+1,c),'declaredArmorType':r['declared_armor_type'],'actualArmorType':r['armor_type_zh'],'notes':r['notes']})
    sent=tables['sent_units.csv'];mercs=[];groups=defaultdict(list)
    for r in sent:groups[r['name']].append(r)
    for rowno,r in enumerate(sent,2):
        c=r['rawcode'];st=templates[c];group=groups[r['name']];base=next((x for x in group if num(raw_units[x['rawcode']]['stockMax'])>0),group[0]);variant=next((x for x in group if x['rawcode']!=base['rawcode']),None)
        # Object stockMax identifies the actual stocked item. The same-name
        # opposite object is a disabled/preview shop entry in several cases;
        # it is retained, but may not be purchased beside the real item.
        is_stocked=num(raw_units[c]['stockMax'])>0
        unlock_after=int(num(r['unlock_after_wave']));availability='stocked' if is_stocked else 'shop-preview'
        stock_capacity=int(num(raw_units[c]['stockMax']))
        mercs.append({**st,'id':'v14_merc_'+c,'name':clean(r['name']),'cost':0,'wood':int(num(r['lumber_cost'])),'income':int(num(r['x9_income_credit_wave_1_10'])),'incomeLate':int(num(r['x9_income_credit_wave_11_plus'])),'incomeRawPoints':int(num(r['unit_point_value'])),'unlock':unlock_after+1,'unlockAfterWave':unlock_after,'availableFromWave':unlock_after+1,'availableUntilWave':35,'recordClass':r['record_class'],'variantGroup':'v14_merc_'+base['rawcode'],'sameNameVariantRawcodes':split(r['same_name_variant_rawcodes']),'variantSuccessorId':None,'shopAvailability':availability,'shopPreview':not is_stocked,'stock':{'max':stock_capacity,'initial':stock_capacity,'regenSeconds':num(raw_units[c]['stockRegen']),'startDelaySeconds':num(raw_units[c]['stockStart'])},'stockMax':stock_capacity,'stockRegen':num(raw_units[c]['stockRegen']),'stockStart':num(raw_units[c]['stockStart']),'population':0,'description':clean(r['description']),'source':source('sent_units.csv',rowno,c),'x9EffectiveHp6to10':num(r['x9_effective_HP_wave_6_10']),'x9EffectiveHp11plus':num(r['x9_effective_HP_wave_11_plus']),'x9SapperHpScalingApplies':boolean(r['x9_sapper_hp_scaling_applies'])})
    meta={'dataRevision':'v14.1A5-ninefold-dataset-v1','heroDataRevision':'v14.1A5-hero-paths-v1','title':'军团战争 · v14.1A5 九倍怪物','sourceVersion':VERSION,'provenance':PROVENANCE,'distanceScale':SCALE,'defaultBuilderId':builder_map['先知'],'sourceRegistryCount':len(roster),'activeUnitCount':len(units),'activeBaseUnitCount':len(pool_codes),'activeMercenaryCount':len(mercs),'activeWaveCount':len(waves),'builderCount':len(builders),'heroEntryCount':len(hero_entries),'heroChoiceCount':len(hero_choices),'heroStageCount':len(hero_codes),'heroUpgradeEdgeCount':len(hero_edges),'morphProxyCount':6,'archiveCount':len(archive),'upgradeEdgeCount':len(edges),'sourceUpgradeEdgeCount':len(source_edge_rows),'supplementalUpgradeEdgeCount':len(supplemental_edges),'resolvedUpgradeEdgeCount':sum(e['resolved'] for e in edges),'abilityCount':len(ability_table),'sourceAbilityCount':len(ability_table),'sourceUnitCount':len(templates),'templateCount':len(templates),'units':len(units),'baseUnits':len(pool_codes),'upgradeUnits':len(units)-len(pool_codes)-6-len(hero_codes)-1,'mercenaries':len(mercs),'waves':len(waves),'unitPolicy':'374登记含工人。107随机候选含n085/n2YS两项JASS池补录；375普通建筑可达再加6变形代理（即时升级表补n2YS→n2YR与n085→n084两边）；英雄祭坛与17分支147阶段单列补录，n07D/n07E仅图鉴。保留全部需求，不把资格彩蛋当直接建造入口。','statPolicy':'建筑体取价格/人口/建造时间/兵力；Mk/Ml映射的战斗体取HP/武器/能力。','waveCountPolicy':'直接采用九倍108等计数，20波10、30波6。','abilityPolicy':'保留2949完整能力与原生最终字段，脚本实际执行以skills.js支持状态为准。','legacyPolicy':'旧5.0dJF数据仅旧档兼容；新局只使用v14_前缀。','counts':{'sourceRegistry':374,'units':len(units),'baseUnits':107,'builders':20,'heroes':len(hero_choices),'heroStages':len(hero_codes),'heroAltars':1,'morphProxies':6,'archived':len(archive),'mercenaries':60,'waves':35,'abilities':2949,'easterCatalog':248,'easterMenuNodes':372,'easterRecipes':88,'upgradeRequirements':461},'worker':{'rawcode':'e003','catalog':tables['wisp_data.csv'][0]},'limitations':['英雄祭坛/17分页入口由本版JASS确认，147阶段战斗映射/价格/人口来自本版Mk/Ml与CSV；等级升级链是按当前注册顺序和编号提示重建的Web适配，CSV缺少native Upgrade/Requires，未引入旧版350/450军力门槛。','平台账号、付费/皮肤/赞助资格无法由静态数据模拟；非战斗结束需求保留并按资格门槛限制。','n07E娜迦火蜥、n07D娜迦雷蜥登记存在，但未找到107随机池和302边闭包的基础入口，仅列图鉴。','发兵CSV同名变体有24个stockMax空白/零的预览对象；不把60对象都作为同时可购买商品，实际商店切换待静态原生商品表补全。','魔兽原生寻路、碰撞、动画和未实现脚本仍为浏览器适配。'],'sourceFiles':{'manifest':'reference/v14-source/import-manifest.json','datasetManifest':'reference/v14-source/data/source_manifest.json','jass':'reference/v14-source/raw_extracted/war3map.j'},'combatMappingCount':len(combat_map),'appliedUnitModifications':sum(map(len,unit_overrides.values())),'appliedAbilityModifications':applied_ability_modifications,'buildLimitRecordCount':len(build_limits),'banLimitRecordCount':len(ban_limits),'initialCappedUnitCount':sum(v>=0 for v in initial_caps.values()),'buildLimitPolicy':'47 calls in InitBudingLimit; second parameter is an automatically created capacity marker. RegisterBudingLimitEx releases count on upgrade; ordinary variant tracks lineage until explicit capped-target replacement. Initial call overrides prior BAN initialization; no interactive BAN flow enabled.','sourceValidation':json.loads((snapshot/'data/validation_report.json').read_text()),'sourceMetadata':json.loads((snapshot/'data/mode_rules_x9.json').read_text())}
    meta.update({'sourceItemCount':len(object_catalogs['V14_ITEMS']),'sourceTechnologyCount':len(object_catalogs['V14_TECHNOLOGIES']),'specialGoldEventCount':len(special_gold_rewards),'sacrificeRewardTierCount':len(sacrifice_rewards),'objectCatalogPolicy':'Complete source object dictionaries; source-only records do not establish shop or research access. Empty source fields are not assigned fabricated prices or values.','rules':{'specialMonsters':special_monsters,'easterSacrifice':{'tiers':sacrifice_rewards,'availability':'ability-carrier-source-absent','policy':'The reward handler is proven, but the packet does not identify units granted A1U4/A1U5/A1U6. Do not grant sacrifice access by name or easter-egg category.'}}})
    meta['counts'].update({'items':meta['sourceItemCount'],'technologies':meta['sourceTechnologyCount'],'specialGoldEvents':len(special_gold_rewards),'sacrificeRewardTiers':len(sacrifice_rewards)})
    meta['trainingOnlyUnitCount']=len(training_codes);meta['boxTrainingSelectionCount']=box_training['selectionCount']
    meta['upgradeUnits']-=len(training_codes)
    meta['counts'].update({'trainingLeaves':len(training_codes),'trainingSelections':box_training['selectionCount']})
    meta['unitPolicy']+='另按完整225条宝箱即时训练选择补入5个英雄转职叶子，独立于普通升级；训练奖励、40%目标费用、全部资格和数量条件另判。'
    return [('V14_REFERENCE',meta),('V14_ABILITIES',ability_table),('V14_UNIT_TEMPLATES',templates),('V14_UNITS',units),('V14_BUILDERS',builders),('V14_POOLS',pools),('V14_HERO_ENTRIES',hero_entries),('V14_HERO_UPGRADE_EDGES',hero_edges),('V14_UPGRADE_EDGES',edges),('V14_SUPPLEMENTAL_UPGRADE_EDGES',[e for e in edges if e['supplemental']]),('V14_BOX_TRAINING_RULES',box_training),('V14_ARCHIVE',archive),('V14_WAVES',waves),('V14_MERCENARIES',mercs),('V14_REQUIREMENTS',dict(requirements)),('V14_BUILD_LIMITS',build_limits),('V14_BAN_LIMITS',ban_limits),('V14_EASTER_RECIPES',tables['easter_egg_recipes.csv']),('V14_EASTER_MENU',tables['easter_egg_menu_tree.csv']),('V14_EASTER_CATALOG',cat_rows),('V14_SCRIPTED_SKILLS',tables['x9_scripted_skills.csv']),('V14_SPECIAL_MONSTERS',special_monsters),('V14_SPECIAL_GOLD_REWARDS',special_gold_rewards),('V14_SACRIFICE_REWARDS',sacrifice_rewards),*object_catalogs.items()]

def encode(exports):
    data=dict(exports);dump=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'));out='/* Generated by scripts/import-v14.py from checked-in reference/v14-source. */\n'
    # Store each ability field map once. Hydration retains the established
    # compiler contract without tripling a 2949-row table on disk.
    compact_abilities={c:{k:v for k,v in a.items() if k not in ['fields','tooltip_text'] and (k!='native_slk_fields' or a['native_slk_fields']!=a['resolved_fields'])} for c,a in data['V14_ABILITIES'].items()}
    out+='export const V14_ABILITIES = '+dump(compact_abilities)+';\n'
    out+='for(const a of Object.values(V14_ABILITIES)){a.fields=a.resolved_fields;a.native_slk_fields??=a.resolved_fields;a.tooltip_text=a.description;}\n'
    out+='const sourceAbilities=ids=>(ids??[]).map(rawcode=>{const a=V14_ABILITIES[rawcode]??{};return{rawcode,baseCode:a.base_code,name:a.name??rawcode,fields:a.fields??{},nativeFields:a.native_slk_fields??{},objectOverrides:a.object_overrides??[],description:a.description??"",implemented:false,source:a.source??{}}});\n'
    out+='const hydrate=u=>({...u,sourceAbilities:sourceAbilities(u.abilityIds),...(u.buildingAbilityIds?{buildingAbilities:sourceAbilities(u.buildingAbilityIds)}:{})});\n'
    templates=data['V14_UNIT_TEMPLATES'];out+='export const V14_UNIT_TEMPLATES = Object.fromEntries(Object.entries('+dump(templates)+').map(([c,u])=>[c,hydrate(u)]));\n'
    for name,values in exports:
        if name in ['V14_ABILITIES','V14_UNIT_TEMPLATES']:continue
        if name in ['V14_UNITS','V14_ARCHIVE','V14_WAVES','V14_MERCENARIES']:
            slim=[]
            for u in values:
                t=templates.get(u.get('combatRawcode'),{})
                slim.append({k:v for k,v in u.items() if k not in t or v!=t[k] or k in ['id','name','source','sourceRawcode','combatRawcode']})
            out+='export const '+name+' = '+dump(slim)+'.map(u=>hydrate({...V14_UNIT_TEMPLATES[u.combatRawcode],...u}));\n'
        else:out+='export const '+name+' = '+dump(values)+';\n'
    return out

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path);args=parser.parse_args();snapshot=ROOT/'reference/v14-source'
    if args.source:refresh(args.source,snapshot)
    exports=generate(snapshot);output=encode(exports);(ROOT/'dist/v14-reference.js').write_text(output)
    generated=dict(exports);meta=generated['V14_REFERENCE'];training=generated['V14_BOX_TRAINING_RULES']
    report={'generator':'scripts/import-v14.py','sourceVersion':VERSION,'activeUnitCount':len(generated['V14_UNITS']),'boxTraining':{**training,'importedUnits':[{key:u.get(key) for key in ['id','sourceRawcode','combatRawcode','heroFamily','hero','isNativeHero','trainingOnly','trainingSources','cost','woodCost','population','sourcePoints','requiresDetails','initialBuildLimit','buildLimits','sourceEvidence']} for u in generated['V14_UNITS'] if u.get('trainingOnly')]}}
    (ROOT/'reference/v14-import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:meta[k] for k in ['sourceRegistryCount','activeUnitCount','activeBaseUnitCount','builderCount','activeMercenaryCount','activeWaveCount','abilityCount','archiveCount']}|{'generatedBytes':len(output.encode()),'trainingOnlyUnitCount':len(training['importedRawcodes']),'trainingSelectionCount':training['selectionCount']},ensure_ascii=False))
if __name__=='__main__':main()
