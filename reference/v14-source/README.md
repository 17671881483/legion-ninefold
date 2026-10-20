# 军团战争 v14.1A5「新彩蛋伊瑟拉」九倍怪物模式数据包

这是对本机地图文件做的静态解析结果，面向玩法复刻、数值建模和平衡设计。数据包不包含原地图的美术、音频等资源。

## 版本确认

- 平台显示名：`军团战争v14.1A5新彩蛋伊瑟拉`
- 平台地图 ID：`20197574`
- 本地缓存：`D:\Warcraft3-11hf\Maps\Download\qcloud_20197574.w3x`
- 文件大小：306,966,320 字节
- MD5：`00F6B097F578D7F9C83AA5593C0E353A`
- SHA-256：`E079EE0D558552990882FACC4E6F371241A8CA23CFAA272772ABF9B3259FFDB1`
- 脚本生成时间：`2026-10-09 16:00:57.209`

平台日志明确把地图 ID 20197574 映射到上述版本名。地图内部仍保留旧标题“军团战争8.2b”，这是遗留元数据，不代表实际平台版本。

## 最重要的九倍模式结论

- 每个激活路线的怪物数一般为基础数量的 3 倍；第 20 波强制为 10 只/路，第 30 波强制为 6 只/路。35 波合计每路生成 2,932 只（不改变总只数的随机替换仍计为一只）。
- 第 6—10 波，符合条件的系统怪最大/当前生命乘 1.5；第 11 波起乘 3。条件是单位带 `SAPPER` 类型，且不是建筑、召唤物或巨型单位。第 31 波是 `mechanical`，不吃该倍率。
- 第 6—28 波中，除第 10、20 波外，共 21 波会让每次生成独立地以 10% 概率替换为下一波单位。
- 初始资源为 500 金、94 木。
- 第 11 波起，发送单位提供的收入按单位点数整数除以 2；例如点数 1 会得到 0。
- 国王实际升级总上限为生命 60、攻击 80、恢复 60；早期分别被限制为 20、30、20，生命限制在第 17 波解除，攻击/恢复限制在第 16 波解除。
- 普通非特权玩家的工人 `e003` 上限改为 10；伐木科技为 `R003` 7 级加 `R00H` 23 级，总计可到 30 级。
- 第 11 波起，某队首次漏怪会让该队每人扣 1,000 木；无漏回合奖励为每人 +100 金、+200 木。
- 击杀系统怪的实际金币来自脚本数组 `Ie[Dg]`，不是单位对象的 `bounty*` 字段。第 1—30 波单只基础金币为 `3,3,4,5,5,5,6,6,5,51,5,6,7,12,9,8,10,8,10,86,20,20,11,11,27,36,48,49,14,164`，第 31—35 波为 0；允许 10% 下一波替换的波次，替换怪额外 +3 金。

## 已确认的脚本/显示问题

- 第 20、30 波界面仍显示 7/4 只，实际脚本生成 10/6 只。
- 模式说明仍写“六倍怪物”和国王上限 60/40/40，实际变量为 60/80/60。
- 漏怪提示写成“10倍怪物”，实际分支是九倍模式。
- 两队的无漏奖励都错误检查队伍 1 的标志：队伍 1 不漏时两队都得奖；队伍 1 漏时两队都不得奖。
- 第 6、11、17、22、28、30、35 波界面宣称“城甲”，最终单位对象的 `defType=normal`，即实际对象数据是无甲。`war3map.w3u` 覆盖层不含这 35 个波次 rawcode，因此数据表同时保留“界面宣称”和“对象实际”两列。
- `A1TT` 技能文本称 15% 生命时造成 88 伤害，但该函数没有调用点；实际九倍创建钩子运行的是每秒 5 点范围伤害、死亡时 56 点范围伤害。

## 建议从这些文件开始

1. `player_buildable_units.csv`：374 个在升级树或彩蛋图鉴中登记的玩家兵种/升级对象，含价格、建造时间、兵力、生命、攻击、防御、技能、父子升级与需求。
2. `player_unit_abilities.csv`：1,372 条兵种—技能明细，含技能说明与逐等级原始数据 JSON。
3. `unit_upgrade_edges.csv` / `unit_upgrade_requirements.csv`：302 条升级边和 461 条目标需求，是重建兵种树与合成条件的主表。
4. `sent_units.csv`：60 个实际发兵对象，区分基础发兵和后期变体，含价格、收入、属性和技能。
5. `wisp_data.csv` / `lumber_technology_levels.csv`：小精灵本体和 30 级九倍伐木科技逐级花费、时间、需求；另保留 2 级其他模式分支作对照。
6. `wave_kill_gold.csv`：35 波实际单只/每路击杀金币、10%替换期望、漏怪和国王分配规则。
7. `easter_egg_recipes.csv`：88 条显式彩蛋或未进入即时选择表的条件/隐藏合成边；配合 `easter_egg_catalog.csv`、菜单树、建造上限和 BAN 表使用。
8. `waves_x9.csv` / `mode_rules_x9.json`：35 波九倍数值和模式规则。
9. `all_units.csv`、`all_abilities.csv`、`all_upgrades.csv`、`all_items.csv`：完整对象主表。
10. `script_evidence.csv`：关键结论对应的 `war3map.j` 行号，便于审计。

## 新增兵种、经济和彩蛋数据

- 玩家兵种主表只收录脚本升级树/彩蛋图鉴登记对象及小精灵，避免把 Warcraft 原生战役中同样以“建造/升级”开头的单位误收进来。
- `gold_cost` 是该对象的本次建造/升级价格；`total_power_points` 是对象总兵力值。多段升级的累计投入应沿 `unit_upgrade_edges.csv` 自行求和。
- `player_unit_abilities.csv` 的 `x9_injected_bonus_ability=True` 表示该能力由九倍创建钩子追加，而不是对象表常驻技能。
- `easter_egg_recipes.csv` 中 `not_in_immediate_select_table=True` 是可审计的脚本事实，表示该升级边存在于完整升级树、但不在普通即时选项表；通常对应科技、会员、皮肤或彩蛋条件分支。表内保留全部需求 rawcode 和名称，不把所有这类分支武断地等同为免费彩蛋。
- `explicit_easter_egg_units.csv` 的 39 行来自名称/提示中明确出现“彩蛋”的对象，其中有浏览页和预览对象，不应一律当作可直接建造单位。
- `easter_egg_catalog.csv` 有 248 个单位节点；`easter_egg_menu_tree.csv` 有 372 个单位/菜单节点。伊瑟拉 `A2YK/h0YM` 是独立注册项，不属于 18 个旧根菜单的父子链。
- 3 档彩蛋献祭依次奖励 600金/2000木/国王最大生命+5000、1000金/3500木/+8000、2000金/8000木/+15000。

## `waves_x9.csv` 关键字段

- `base_count`：模式倍率应用前的脚本数量。
- `x9_count_per_lane`：九倍模式下每个激活路线实际生成数量。
- `base_object_HP`：单位对象表原始生命。
- `x9_HP_scale`：创建钩子应用的生命倍率。
- `x9_effective_HP`：倍率后的实际最大生命。
- `x9_total_HP_per_lane_without_random_replacement`：不考虑 10% 替换时的每路总生命。
- `expected_x9_total_HP_per_lane`：按 10% 独立替换计算的每路总生命期望值；这是数学期望，不是每局固定值。
- `declared_attack_type` / `declared_armor_type`：地图波次提示中的类型。
- `attack_type_zh` / `armor_type_zh`：最终单位对象表的实际类型。
- `damage_min` / `damage_max`：由基础伤害、骰子数和骰子面数计算。
- `average_dps`：平均单次伤害除以攻击间隔，未计技能、护甲、攻击前摇、目标切换和溅射。
- `protect_king_gold_reward`：该波“保王”脚本奖励值；31—35 波为空/0。它不是击杀金币。
- `bounty_min/max/avg`：对象编辑器赏金参考值；实际死亡奖励请以 `wave_kill_gold.csv` 为准。

## 其他文件

- `waves_x9.json`：与波次 CSV 对应的 JSON。
- `x9_bonus_abilities.csv`：创建时给指定单位永久添加的能力。
- `buildable_fighters_candidates.csv`：按造价和描述筛出的可建战斗单位候选视图。
- `easter_egg_catalog.csv`、`easter_egg_menu_tree.csv`、`easter_egg_recipes.csv`：彩蛋图鉴、菜单层级和条件/隐藏合成边。
- `explicit_easter_egg_units.csv`：文本明确写“彩蛋”的对象集合。
- `easter_egg_ban_limits.csv`、`easter_egg_build_limits.csv`：44 个 BAN 选项和 47 条建造上限登记。
- `easter_egg_sacrifice_rewards.csv`：3 档彩蛋献祭资源及国王生命奖励。
- `special_gold_rewards.csv`：飞行怪首末杀、娜迦农夫、宝藏怪等额外金币/木材事件。
- `runtime_literal_data.csv`：脚本中 `SaveStr/Integer/Real/Boolean` 的 3,494 条直接字面量数据。
- `script_rawcode_usage.csv`：脚本引用的 4,666 个 rawcode 及引用次数。
- `all_buffs.csv`、`all_destructables.csv`、`all_doodads.csv`：其余对象表。
- `war3map_w3u_modifications.csv`：47 条单位对象二进制覆盖记录。
- `war3map_w3a_modifications.csv`：849 条技能对象二进制覆盖记录。
- `source_manifest.json`：源文件、哈希和平台版本证据。
- `parse_summary.json`：表规模统计。
- `validation_report.json`：34 项自动一致性检查，状态应为 `PASS`。
- `raw_extracted/`：用于复核的脚本与少量配置/对象覆盖原文件。
- `tools/`：只读 MPQ 提取器、解析器和验证器，可重复运行。

所有 CSV 使用 UTF-8 with BOM，便于 Excel 正确显示中文；JSON/Markdown 使用 UTF-8。

## 数据层次与限制

最终有效数据来自三层：SLK/字符串对象表、`war3map.w3u/w3a` 覆盖层、`war3map.j` 运行时逻辑。本数据包保留三层的结果与证据。随机数、玩家数量、付费/VIP 状态、平台服务端注入和局内触发顺序会影响某些实际局面，静态解析无法枚举每一种运行时状态。

`mercenaries.csv` 和 `buildable_fighters_candidates.csv` 是兼容旧版数据包的宽松筛选视图。开发新游戏时优先使用 `player_buildable_units.csv`、`player_unit_abilities.csv`、`unit_upgrade_*` 和 `sent_units.csv`；需要底层全量数据时，再回到 `all_*`、W3U/W3A 覆盖表及脚本规则。

用于新游戏时，建议复用数值结构和机制思想，但重新设计名称、文本、角色、美术、音频与特效，以降低知识产权风险。

## 重跑

在本数据包上级目录运行：

```powershell
python tools\mpq_extract.py "D:\Warcraft3-11hf\Maps\Download\qcloud_20197574.w3x" --out unpacked
python tools\parse_legion_v14.py unpacked --out data --source-map "D:\Warcraft3-11hf\Maps\Download\qcloud_20197574.w3x"
python tools\validate_legion_dataset.py data
```
