#!/usr/bin/env python3
"""Rebuild the complete document catalog without external Python packages.

python3 scripts/import-workbook.py
Refresh the auditable snapshot from the supplied workbook and its extraction:
  --workbook /path/to/军团战争5.0dJF_兵种怪物技能数据.xlsx
  --analysis /path/to/legion-map-analysis
  --skill-analysis /path/to/legion-skill-analysis
  --triggered /path/to/triggered-skills.json

The workbook is the authority for reachability, upgrade edges and wave counts.
Raw SLK extraction supplements weapon/mana fields absent from its readable table.
No JASS is executed; unresolved case-sensitive IDs remain unresolved.
"""
import argparse, copy, hashlib, json, re, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SCALE = 1/3
PROVENANCE = '5.0dJF-workbook'
ARMOR = {'small':'light','medium':'medium','large':'heavy','normal':'fortified','fort':'fortified','none':'unarmored','hero':'hero','divine':'divine'}
COLORS = ['#87b879','#d4b66f','#a9bcd3','#ad9ad0','#c8a57a','#76b9bd']
NS = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def clean(value): return re.sub(r'\|c[0-9a-fA-F]{8}|\|r','',str(value or '')).replace('|n',' ').strip().strip('"')
def split(value): return [s for s in str(value or '').split(',') if s and s != '_']
def number(value,default=0):
    if value in (None,'','_'): return default
    try: return float(value)
    except (ValueError,TypeError): return default

def compact(value): return int(value) if float(value).is_integer() else round(value,8)
def loc(sheet,row,rawcode=None):
    obj={'sheet':sheet,'row':row}
    if rawcode: obj['rawcode']=rawcode
    return obj

def read_workbook(path):
    with zipfile.ZipFile(path) as z:
        strings=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS): strings.append(''.join(n.text or '' for n in si.findall('.//s:t',NS)))
        rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        targets={r.attrib['Id']:r.attrib['Target'] for r in rels}
        result={}
        for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
            target=targets[sheet.attrib['{'+NS['r']+'}id']]
            target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
            root=ET.fromstring(z.read(target)); grid={}
            for row in root.findall('s:sheetData/s:row',NS):
                ri=int(row.attrib['r']); grid[ri]={}
                for cell in row.findall('s:c',NS):
                    column=re.match(r'[A-Z]+',cell.attrib['r']).group(); ci=0
                    for c in column: ci=ci*26+ord(c)-64
                    ty=cell.attrib.get('t'); node=cell.find('s:v',NS); value=node.text if node is not None else None
                    if ty=='s' and value is not None: value=strings[int(value)]
                    elif ty=='inlineStr': value=''.join(n.text or '' for n in cell.findall('.//s:t',NS))
                    elif ty=='b' and value is not None: value=value=='1'
                    elif ty not in ('str','e') and value is not None:
                        try: value=compact(float(value))
                        except ValueError: pass
                    grid[ri][ci]=value
            header=grid.get(6,{}); end=max((c for c,v in header.items() if v is not None),default=1)
            headers=[header.get(i) for i in range(2,end+1)]
            rows=[]
            for ri in sorted(r for r in grid if r>6):
                values=[grid[ri].get(i) for i in range(2,end+1)]
                if any(v is not None for v in values): rows.append({'row':ri,'values':values})
            result[sheet.attrib['name']]={'headers':headers,'rows':rows}
        return result

def table(snap,name):
    sheet=snap['sheets'][name]
    for row in sheet['rows']:
        yield dict(zip(sheet['headers'],row['values'])),row['row']

def parse_old_exports(path):
    text=path.read_text(); out={}
    for name in ['MAP_MERCENARIES','MAP_WAVES']:
        match=re.search(r'export const '+name+r' = (.*);\n',text)
        if not match: raise ValueError('Missing '+name)
        out[name]=json.loads(match.group(1))
    return out

def supplemental_evidence(analysis):
    path=analysis/'extracted/war3map.j';lines=path.read_text().splitlines()
    def excerpt(first,last):return {'file':'war3map.j','line_start':first,'line_end':last,'code':'\n'.join(lines[first-1:last])}
    return [
        {'id':'heartstopper_aura','abilityRawcode':'A0BH','unitRawcode':'h0CU','summary':'每1秒遍历B03Q目标；生命百分比>2才减1.2个百分点，结果至少1%。直接设置生命，不是普通伤害事件。原生Area1=800用于Buff覆盖。','script_evidence':[excerpt(8679,8699),excerpt(9121,9125),excerpt(16254,16258)],'verification':'静态JASS及SLK交叉核对，未运行原地图'},
        {'id':'guardian_spirit','abilityRawcode':'A061','unitRawcode':'h071','summary':'施法时160原始坐标范围内同玩家、非施法者且没有A060的单位，添加A060/A065/A063；A060 DataB1=.65，其余缺省字段不能从原型同名字段擅自继承。','script_evidence':[excerpt(10021,10049),excerpt(16373,16376)],'verification':'静态JASS及SLK交叉核对，未运行原地图'},
        {'id':'aimp_weapon_markers','abilityRawcodes':['A00I','A00J','A01D','A01E','A01J'],'unitRawcodes':['h02V','h02W','h04E','h04F','h04H'],'summary':'前四种分别由msplash/msplash/mbounce/mbounce武器字段提供效果；蓝鸟h04H的额外攻击由A01F(Apxf)提供，A05I为self Area1图标。单位及能力的直接字面/十进制/十六进制引用未发现专属触发；Aimp本身不重复赋予武器或Apxf效果。','verification':'静态搜索及武器字段交叉核对；没有直接引用不等于证明不存在任何泛型逻辑'}
    ]

def refresh(args,dest):
    required=[args.analysis,args.skill_analysis,args.triggered]
    if any(p is None for p in required): raise ValueError('--workbook refresh requires --analysis, --skill-analysis and --triggered')
    units_path=args.analysis/'data/units-raw.json'; abilities_path=args.analysis/'data/abilities-raw.json'; linked_path=args.skill_analysis/'abilities-linked.json'
    units=json.loads(units_path.read_text()); raw_abilities=json.loads(abilities_path.read_text()); linked=json.loads(linked_path.read_text())
    raw_units={code:{'name':u['name'],'fields':u['fields'],'weaponFields':u.get('sources',{}).get('unitweapons.slk',{})} for code,u in sorted(units.items())}
    snap={'schema':1,'document':{'name':args.workbook.name,'sha256':sha(args.workbook),'sourceVersion':'Legion TD 5.0dJF','sourceMode':'x3','sourceUrl':'https://wc3maps.com/map/175858','mapSha256':'3e15fe3f912fbc8c3ed45192c2fb807c94e55f48b255bbe2633cc50eef5af267'},'sheets':read_workbook(args.workbook),'sourceUnits':raw_units,'rawAbilities':raw_abilities,'linkedAbilities':linked,'triggeredSkills':json.loads(args.triggered.read_text()),'supplementalEvidence':supplemental_evidence(args.analysis),'preparedCatalog':parse_old_exports(ROOT/'dist/map-reference.js'),'sourceFiles':{str(p.name):sha(p) for p in [args.workbook,units_path,abilities_path,linked_path,args.triggered,args.analysis/'extracted/war3map.j']}}
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(snap,ensure_ascii=False,separators=(',',':'))+'\n')

def abilities(snap):
    result=copy.deepcopy(snap['linkedAbilities'])
    def native(code,seen=None):
        seen=set(seen or ())
        if code in seen: return {}
        seen.add(code); obj=snap['rawAbilities'].get(code,{}); fields=obj.get('sources',{}).get('abilitydata.slk',{})
        # 'code' identifies an engine ability archetype, not an inheritance
        # relation between sparse SLK rows. Explicit W3A parent-object merging
        # has already been recorded by linkedAbilities.native_slk_fields.
        return fields
    overview={r['技能代码']:(r,ri) for r,ri in table(snap,'技能概览')}
    for code in sorted(set(snap['rawAbilities'])|set(result)):
        raw=snap['rawAbilities'].get(code,{}); sources=raw.get('sources',{}); fields=native(code); strings=sources.get('campaignabilitystrings.txt',{})
        a=result.setdefault(code,{'rawcode':code,'name':clean(strings.get('Name',code)),'base_code':fields.get('code',code),'base_object':fields.get('code'),'status':'available' if fields else 'unresolved','native_slk_fields':fields,'object_overrides':[],'tooltip_text':clean(strings.get('Ubertip',''))})
        # Keep original numeric layer intact; an explicit resolved layer applies
        # only the override field IDs whose native mappings are established.
        resolved={**fields,**a.get('native_slk_fields',{})}
        names={'aare':'Area','atar':'targs','abuf':'BuffID','Cac1':'DataA','Iatt':'DataA','Ilif':'DataA','Oar1':'DataA'}
        used=[]; unapplied=[]
        for ov in a.get('object_overrides',[]):
            key=ov.get('field'); level=max(1,int(ov.get('level',1))); val=ov.get('resolvedValue',ov.get('value'))
            if key in names: resolved[names[key]+str(level)]=val;used.append(key)
            elif key=='anam': a['name']=clean(val);used.append(key)
            elif key=='aub1': a['tooltip_text']=clean(val);used.append(key)
            elif key in ['arac','atp1','aart','abpy','atat']: used.append(key)
            else: unapplied.append(key)
        a['resolved_fields']=resolved;a['fields']=resolved;a['description']=a.get('tooltip_text','');a['overrideResolution']={'appliedFieldIds':sorted(set(used)),'unappliedFieldIds':sorted(set(unapplied))}
        a['source']=loc('技能概览',overview[code][1],code) if code in overview else {'supplement':'abilities-raw.json','rawcode':code}
    return result

def ability_sources(ids,ability_table):
    return [{'rawcode':code,'baseCode':ability_table.get(code,{}).get('base_code'),'name':ability_table.get(code,{}).get('name',code),'fields':ability_table.get(code,{}).get('resolved_fields',{}),'nativeFields':ability_table.get(code,{}).get('native_slk_fields',{}),'objectOverrides':ability_table.get(code,{}).get('object_overrides',[]),'description':ability_table.get(code,{}).get('description',''),'implemented':False,'source':ability_table.get(code,{}).get('source',{})} for code in ids]

def unit_stats(snap,code,ability_table):
    obj=snap['sourceUnits'].get(code,{});f=obj.get('fields',{});wf={k:v for k,v in obj.get('weaponFields',{}).items() if not any(x in k.lower() for x in ['art','sound','sw1','sw2','dps','mindmg','avgdmg','maxdmg'])};ids=list(dict.fromkeys(split(f.get('abilList'))+split(f.get('heroAbilList'))))
    raw_range=number(f.get('rangeN1'),90);dmg=number(f.get('dmgplus1'))+number(f.get('dice1'))*(number(f.get('sides1'))+1)/2
    armor=ARMOR.get(f.get('defType'),'medium');hp=number(f.get('HP'),1)
    result={'hp':compact(hp),'damage':compact(dmg),'interval':compact(number(f.get('cool1'),1)),'range':compact(raw_range*SCALE),'speed':compact(number(f.get('spd'),270)*SCALE),'armor':compact(number(f.get('def'))),'attackType':f.get('atkType1','normal'),'armorType':armor,'ability':None,'abilityIds':ids,'sourceAbilities':ability_sources(ids,ability_table),'mana':compact(number(f.get('manaN'))),'manaStart':compact(number(f.get('mana0'))),'manaRegen':compact(number(f.get('regenMana'))),'hpRegen':compact(number(f.get('regenHP'))),'unitType':f.get('type',''),'targetType':f.get('targType','ground'),'movementType':f.get('movetp','foot'),'weapon1':{k:v for k,v in wf.items() if k.endswith('1') or k in ['weapsOn','acquire','minRange']},'weapon2':{k:v for k,v in wf.items() if k.endswith('2') or k in ['weapsOn','acquire','minRange']},'weaponsOn':f.get('weapsOn',1),'autoAbilityIds':split(f.get('auto')),'sourceHP':compact(hp),'sourceDamage':compact(dmg),'sourceDamageMin':compact(number(f.get('dmgplus1'))+number(f.get('dice1'))),'sourceDamageMax':compact(number(f.get('dmgplus1'))+number(f.get('dice1'))*number(f.get('sides1'))),'sourceRange':compact(raw_range),'sourceSpeed':compact(number(f.get('spd'),270)),'sourceRawFields':{k:v for k,v in f.items() if k in set(wf)|{'HP','realHP','regenHP','regenType','manaN','mana0','regenMana','def','realdef','defType','spd','movetp','targType','type','race','points','fused','goldcost','lumbercost','bldtm','abilList','heroAbilList','auto','Upgrade','Trains','Builds','Researches','Requires','collision','death','canFlee','sight','nsight'}},'sourceRawcode':code,'combatRawcode':code,'provenance':PROVENANCE,'distanceScale':SCALE,'abilityCoverage':{'implemented':[],'omitted':ids,'compiler':'dist/skills.js'}}
    result['role']='ranged' if raw_range>180 else ('tank' if armor in ['heavy','fortified','divine'] else 'frontline')
    return result

def generate(snap):
    ability_table=abilities(snap); rows=list(table(snap,'可玩防守兵种')); bycode={r['建筑代码']:r for r,_ in rows}; active={c for c,r in bycode.items() if r['对象类别']!='仅注册待确认'}
    pool=[[] for _ in range(6)]; tiers={}
    for r,ri in table(snap,'先知与变形池'):
        tier=int(number(r['阶数']));code=r['候选建筑代码'];pool[tier-1].append('b_'+code);tiers[code]=tier
    builder_rows=list(table(snap,'建造者与入口'));builder_map={r['种族名称']:'builder_'+r['建造者代码'] for r,_ in builder_rows}
    for r,_ in builder_rows:
        if r['种族名称']=='先知':continue
        for tier,code in enumerate(split(r['基础建筑代码序列']),1):tiers.setdefault(code,tier)
    # Propagate tier through the full graph, preserving branch reachability.
    changed=True
    while changed:
        changed=False
        for code,r in bycode.items():
            if code not in tiers:continue
            for target in split(r['升级目标']):
                if target in active and target not in tiers:tiers[target]=tiers[code];changed=True
    tiers['h05Q']=tiers.get('h062',2);tiers['h076']=tiers.get('h06I',6)
    edges=[]
    for r,ri in table(snap,'防守升级链'):
        target=r['目标建筑代码'];edges.append({'fromId':'b_'+r['前置建筑代码'],'toId':'b_'+target if target in active else None,'fromRawcode':r['前置建筑代码'],'toRawcode':target,'resolved':bool(r['目标对象已解析']) and target in active,'cost':compact(number(r['目标金价配置'])),'woodCost':compact(number(r['目标木价配置'])),'requires':split(r['目标需求']),'source':loc('防守升级链',ri,target),'evidence':r['来源'],'limitation':r['缺失或冲突'] or ''})
    hero_entries=[e['toId'] for e in edges if e['fromRawcode']=='h0DB' and e['resolved']]
    units=[];archive=[]
    for r,ri in rows:
        code=r['建筑代码'];combat=r['战斗单位代码'];bf=snap['sourceUnits'].get(code,{}).get('fields',{});tier=tiers.get(code,6);name=clean(r['兵种名称']);proxy=r['获得方式']=='随机变形占位';special=r['对象类别']=='特殊形态';hero=r['对象类别']=='英雄等级建筑阶段';sources=[s.strip() for s in str(r['建造者或种族'] or '').split('/') if s.strip()];ids=split(bf.get('abilList')); successors=split(r['升级目标'])
        entry=unit_stats(snap,combat,ability_table) if combat else unit_stats(snap,code,ability_table)
        entry.update({'id':'b_'+code,'name':name,'race':'英雄' if hero else next((s for s in sources if s not in ['先知','变形']),'变形'),'races':sources,'builderIds':[builder_map[n] for n in sources if n in builder_map],'tier':tier,'cost':compact(number(r['金价原始'])),'woodCost':compact(number(r['木价原始'])),'population':int(number(r['人口占用'],1)),'sourceRawcode':code,'combatRawcode':combat,'upgrades':['b_'+v for v in successors if v in active],'sourceUpgradeRawcodes':successors,'omittedUpgradeRawcodes':[v for v in successors if v not in active],'requires':split(bf.get('Requires')),'sourcePoints':compact(number(bf.get('points'))),'buildingRawFields':{k:v for k,v in bf.items() if k in ['points','goldcost','lumbercost','fused','abilList','Upgrade','Requires','bldtm']},'buildingAbilityIds':ids,'buildingAbilities':ability_sources(ids,ability_table),'randomPool':code in tiers and 'b_'+code in sum(pool,[]),'isBase':r['获得方式'] in ['基础可建造','随机变形占位'],'legacy':False,'morphProxy':proxy,'morphTargets':pool[tier-1] if proxy and 1<=tier<=6 else [],'specialForm':special,'hero':hero,'heroEntry':'b_'+code in hero_entries,'heroLevel':int(re.search(r'等级\s*(\d+)',name).group(1)) if hero and re.search(r'等级\s*(\d+)',name) else 0,'color':COLORS[(tier-1)%6],'shape':'star' if hero else ('diamond' if entry['range']>60 else 'square'),'source':loc('可玩防守兵种',ri,code),'sourceEvidence':r['来源'],'acquisition':r['获得方式'],'sourceCategory':r['对象类别'],'reachability':r['可达性与限制'],'description':f'{name}。{r["可达性与限制"]}'})
        if code in active:units.append(entry)
        else:entry.update({'playable':False,'reason':'未证实菜单或生成入口'});archive.append(entry)
    builders=[]
    for r,ri in builder_rows:
        name=r['种族名称'];raw=split(r['基础建筑代码序列']);ids=list(dict.fromkeys('b_'+c for c in raw if c in active));builders.append({'id':'builder_'+r['建造者代码'],'rawcode':r['建造者代码'],'name':name,'index':int(number(r['qo索引'])),'rosterIds':ids,'heroEntryIds':hero_entries,'mode':'prophet' if name=='先知' else 'morph' if name=='变形' else 'race','menuPath':r['对象菜单路径'],'requires':split(r['前置需求']),'availability':r['可获得范围'],'notes':r['特殊说明'] or '', 'source':loc('建造者与入口',ri,r['建造者代码']),'sourceEvidence':r['来源']})
    raw_rows={r['兵种代码']:ri for r,ri in table(snap,'原始单位注册')};templates={}
    for code,u in snap['sourceUnits'].items():
        templates[code]={**unit_stats(snap,code,ability_table),'id':'raw_'+code,'name':clean(u['name']),'color':'#a9bcd3','shape':'circle','source':loc('原始单位注册',raw_rows[code],code) if code in raw_rows else {'supplement':'units-raw.json','rawcode':code}}
    waves=[];old_waves={w['id']:w for w in snap['preparedCatalog']['MAP_WAVES']}
    for r,ri in table(snap,'35波怪物'):
        wave=int(number(r['波次']));code=r['兵种代码'];count=int(number(r['每活跃路怪物数']));prior=old_waves[wave];st=unit_stats(snap,code,ability_table)
        waves.append({**prior,**st,'id':wave,'name':clean(r['名称']),'count':count,'referenceCount':count,'baseCount':count/3,'bossCount':count if prior.get('boss') else 0,'countAdaptation':'直接使用文档每活跃路怪物数，不再乘3。','runtimeStatPolicy':'文档HP/伤害直接参与战斗，不再应用旧Web0.25/0.20缩放。','recommendedValue':int(number(r['显示推荐军力'])),'source':loc('35波怪物',ri,code),'sourceEvidence':r['来源']})
    shop_rows={}
    for r,ri in table(snap,'木怪与国王商品'):shop_rows.setdefault(r['商品代码'],[]).append((r,ri))
    mercs=[]
    for prior in snap['preparedCatalog']['MAP_MERCENARIES']:
        code=prior['sourceRawcode'];st=unit_stats(snap,code,ability_table);candidates=shop_rows.get(code,[]);matched=next(((r,ri) for r,ri in candidates if r['商店代码']==prior['shopRawcode']),candidates[0] if candidates else ({},None));r,ri=matched
        mercs.append({**prior,**st,'id':prior['id'],'name':prior['name'],'cost':0,'wood':prior['wood'],'population':0,'source':loc('木怪与国王商品',ri,code) if ri else {'supplement':'map-source.json','rawcode':code},'sourceEvidence':r.get('来源',''),'description':clean(r.get('商品说明文本',prior.get('description','')))})
    needed_units={u['combatRawcode'] for u in units if u.get('combatRawcode')}|{w['sourceRawcode'] for w in waves}|{m['sourceRawcode'] for m in mercs}
    needed_abilities={c for u in units+waves+mercs for c in u['abilityIds']+u.get('buildingAbilityIds',[])}
    needed_abilities.update(['A060','A063','A065','A06Z','A0RA','A02V','A019','A02I','A0BN'])
    # Every exact four-character literal in trigger evidence is a safe inclusion
    # candidate, but still does not by itself become executable gameplay.
    trigger_text=json.dumps(snap['triggeredSkills'],ensure_ascii=False)
    for code in re.findall(r"(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9]{3}(?![A-Za-z0-9])",trigger_text):
        if code in templates:needed_units.add(code)
        if code in ability_table:needed_abilities.add(code)
    changed=True
    while changed:
        old=(len(needed_units),len(needed_abilities))
        for code in list(needed_units):needed_abilities.update(templates[code]['abilityIds'])
        for code in list(needed_abilities):
            a=ability_table.get(code,{})
            for field,value in a.get('resolved_fields',{}).items():
                if not isinstance(value,str) or not field.startswith(('Data','Unit','Effect')):continue
                for target in split(value):
                    if target in templates:needed_units.add(target)
                    if target in ability_table:needed_abilities.add(target)
        changed=old!=(len(needed_units),len(needed_abilities))
    templates={c:v for c,v in templates.items() if c in needed_units}
    ability_table={c:v for c,v in ability_table.items() if c in needed_abilities}
    meta={**snap['document'],'dataRevision':'5.0dJF-workbook-complete-v1','title':'军团战争 · 文档完整兵种与技能','activeUnitCount':len(units),'activeBaseUnitCount':sum(u['randomPool'] for u in units),'activeMercenaryCount':len(mercs),'activeWaveCount':len(waves),'builderCount':len(builders),'heroEntryCount':len(hero_entries),'heroStageCount':sum(u['hero'] for u in units),'morphProxyCount':sum(u['morphProxy'] for u in units),'archiveCount':len(archive),'upgradeEdgeCount':len(edges),'resolvedUpgradeEdgeCount':sum(e['resolved'] for e in edges),'abilityCount':len(ability_table),'documentAbilityCount':len(snap['sheets']['技能概览']['rows']),'sourceAbilityCount':len(snap['rawAbilities']),'sourceUnitCount':len(snap['sourceUnits']),'templateCount':len(templates),'units':len(units),'baseUnits':90,'upgradeUnits':len(units)-90-6,'mercenaries':len(mercs),'waves':len(waves),'distanceScale':SCALE,'sourceFiles':snap['sourceFiles'],'counts':{'units':len(units),'baseUnits':90,'builders':17,'heroes':10,'heroStages':110,'morphProxies':6,'archived':2,'mercenaries':len(mercs),'waves':len(waves)},'unitPolicy':'可玩防守表315项中313项接入：201普通建筑含6变形代理，110英雄阶段，2特殊形态；2仅注册对象保留图鉴。90候选每阶15项，先知每阶抽1，变形按阶随机转换；17建造者可选择。','abilityPolicy':'完整保留物编能力与脚本证据，技能执行及覆盖状态由skills.js编译；工具、出售、菜单技能不强行当作战斗技能。','waveCountPolicy':'文档5.0dJF默认x3的每活跃路数量直接采用，不再应用先前九倍覆盖。','statPolicy':'建筑体取价格、木价、人口及Upgrade；战斗体取HP、def、攻击骰子、间隔、射程与能力。HP/伤害不再使用旧Web倍率。','legacyPolicy':'旧Web与map_兵种保留存档兼容；新局只使用本表b_兵种。','limitations':['来源为5.0dJF默认x3静态文档，不能认证15A2或11平台当前九倍。','精确H0DC未解析，保留记录且不生成可点升级。','参数与触发器完整保留；魔兽寻路、动画、碰撞和原生引擎边界仍为浏览器实现。']}
    rules=[{'id':r['规则ID'],'conclusion':r['完整结论'],'source':loc('玩法规则',ri),'limitation':r['适用限制']} for r,ri in table(snap,'玩法规则')]
    return [('WORKBOOK_REFERENCE',meta),('WORKBOOK_UNITS',units),('WORKBOOK_BUILDERS',builders),('WORKBOOK_POOLS',pool),('WORKBOOK_HERO_ENTRIES',hero_entries),('WORKBOOK_UPGRADE_EDGES',edges),('WORKBOOK_ARCHIVE',archive),('WORKBOOK_ABILITIES',ability_table),('WORKBOOK_UNIT_TEMPLATES',templates),('WORKBOOK_TRIGGERED_SKILLS',{**snap['triggeredSkills'],'document_catalog_checks':snap.get('supplementalEvidence',[])}),('WORKBOOK_WAVES',waves),('WORKBOOK_MERCENARIES',mercs),('WORKBOOK_RULES',rules)]

def encode_output(exports):
    data=dict(exports)
    dump=lambda value:json.dumps(value,ensure_ascii=False,separators=(',',':'))
    out='/* Generated by scripts/import-workbook.py from reference/workbook-source.json. */\n'
    minimal={}
    for code,a in data['WORKBOOK_ABILITIES'].items():
        obj={k:a[k] for k in ['rawcode','name','base_code','base_object','status','native_slk_fields','object_overrides','description','source','overrideResolution'] if k in a}
        if a['resolved_fields']!=a['native_slk_fields']:obj['resolved_fields']=a['resolved_fields']
        minimal[code]=obj
    out+='export const WORKBOOK_ABILITIES = '+dump(minimal)+';\n'
    out+="for(const a of Object.values(WORKBOOK_ABILITIES)){a.resolved_fields??=a.native_slk_fields;a.fields=a.resolved_fields;a.tooltip_text=a.description;}\n"
    out+="const sourceAbilities=ids=>(ids??[]).map(rawcode=>{const a=WORKBOOK_ABILITIES[rawcode]??{};return{rawcode,baseCode:a.base_code,name:a.name??rawcode,fields:a.fields??{},nativeFields:a.native_slk_fields??{},objectOverrides:a.object_overrides??[],description:a.description??'',implemented:false,source:a.source??{}}});\n"
    out+="const hydrate=u=>({...u,sourceAbilities:sourceAbilities(u.abilityIds),...(u.buildingAbilityIds?{buildingAbilities:sourceAbilities(u.buildingAbilityIds)}:{})});\n"
    templates={c:{k:v for k,v in u.items() if k not in ['sourceAbilities','buildingAbilities']} for c,u in data['WORKBOOK_UNIT_TEMPLATES'].items()}
    out+='export const WORKBOOK_UNIT_TEMPLATES = Object.fromEntries(Object.entries('+dump(templates)+').map(([c,u])=>[c,hydrate(u)]));\n'
    for name,values in exports:
        if name in ['WORKBOOK_ABILITIES','WORKBOOK_UNIT_TEMPLATES']:continue
        if name in ['WORKBOOK_UNITS','WORKBOOK_ARCHIVE','WORKBOOK_WAVES','WORKBOOK_MERCENARIES']:
            slim=[]
            for u in values:
                template=templates.get(u.get('combatRawcode'),{})
                slim.append({k:v for k,v in u.items() if k not in ['sourceAbilities','buildingAbilities'] and (k not in template or v!=template[k] or k in ['id','combatRawcode','sourceRawcode','name','source'])})
            out+='export const '+name+' = '+dump(slim)+'.map(u=>hydrate({...WORKBOOK_UNIT_TEMPLATES[u.combatRawcode],...u}));\n'
        else:out+='export const '+name+' = '+dump(values)+';\n'
    return out

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['workbook','analysis','skill-analysis','triggered']:parser.add_argument('--'+name,type=Path)
    args=parser.parse_args();dest=ROOT/'reference/workbook-source.json'
    if args.workbook:refresh(args,dest)
    snap=json.loads(dest.read_text());exports=generate(snap);out=encode_output(exports)
    (ROOT/'dist/workbook-reference.js').write_text(out)
    meta=dict(exports)['WORKBOOK_REFERENCE'];print(json.dumps({'units':meta['activeUnitCount'],'bases':meta['activeBaseUnitCount'],'builders':meta['builderCount'],'heroStages':meta['heroStageCount'],'archive':meta['archiveCount'],'abilities':meta['abilityCount'],'waves':meta['activeWaveCount'],'mercenaries':meta['activeMercenaryCount'],'snapshotBytes':dest.stat().st_size,'generatedBytes':len(out.encode())},ensure_ascii=False))

if __name__=='__main__':main()
