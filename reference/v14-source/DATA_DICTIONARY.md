# 数据字典

## 标识与通用约定

- `rawcode`：Warcraft III 四字符对象 ID，大小写敏感。
- 空字符串：源对象没有该字段、该字段不适用，或脚本未给值；不要一律当作 0。
- 布尔值：CSV 为 `True/False`，JSON 为 `true/false`。
- 伤害公式：`最小伤害 = dmgplus1 + dice1`；`最大伤害 = dmgplus1 + dice1 × sides1`。
- 对象赏金公式与伤害类似，使用 `bountyplus/bountydice/bountysides`；但本地图系统怪的实际击杀金币由 JASS `Ie[Dg]` 覆盖，应使用 `wave_kill_gold.csv`。
- Warcraft `defType=normal` 在本数据字典中译为“无甲”，不是“普通攻击”。

## 核心九倍模式表

### waves_x9.csv / waves_x9.json

每行一波，共 35 行。`x9_count_per_lane` 是每个激活路线的数量，而非整张地图总量。地图最多检查 8 条玩家路线。

`same_wave_unit_probability` 和 `next_wave_unit_probability` 只在脚本允许 10% 替换的 21 波中为 0.9/0.1。期望生命字段已经用当前回合的创建钩子规则计算下一波替换单位的生命倍率。

### mode_rules_x9.json

结构化保存模式开关、初始资源、生命/数量/收入规则、国王上限、工人和伐木科技、漏怪规则、英雄例外及脚本缺陷。

### x9_scripted_skills.csv

`actual_script_mechanic` 是从 JASS 执行路径得到的实际行为；优先级高于对象编辑器技能文本。`source_lines` 指向随包提供的 `raw_extracted/war3map.j`。

### x9_bonus_abilities.csv

列出创建钩子按单位 rawcode 追加的永久能力。`condition` 说明是否只在特定波次追加。

### script_evidence.csv

每行一条关键结论，包括规则名、JASS 行区间和解释，用于快速复核。

## 经济与单位视图

### player_buildable_units.csv

脚本登记的玩家兵种/升级对象主表，共 374 行。收录升级树、彩蛋图鉴及小精灵，不按中文提示词泛猜，因此排除了原生战役单位。

- `record_scope`：对象进入表中的脚本依据。
- `button_action`：提示文本表现为建造、升级或购买；空值表示隐藏/菜单/预览对象。
- `gold_cost/lumber_cost/build_time`：本次对象价格和时间，不代表整条路线累计投入。
- `total_power_points`：对象点数，也是地图界面中的总兵力基础字段。
- `parent_*` / `upgrade_target_*`：完整升级图的直接父/子节点。
- `requirement_*`：成为升级目标时必须满足的单位/科技/资格标记。
- `x9_bonus_ability_*`：九倍模式创建钩子追加的能力。

### player_unit_abilities.csv

兵种—技能规范化明细，共 1,372 行。`level_data_json` 保存技能 SLK 中非空的逐等级范围、消耗、冷却、持续时间、DataA-I 等字段。技能的最终行为可能被 JASS 覆盖；九倍专属脚本以 `x9_scripted_skills.csv` 为准。

### unit_upgrade_edges.csv / unit_upgrade_requirements.csv

- `unit_upgrade_edges.csv`：302 条完整升级边。`is_immediate_select_edge` 表示普通即时选择表也包含此边；`not_in_immediate_select_table` 表示完整树有该边、即时表没有。
- `unit_upgrade_requirements.csv`：461 条目标需求，一行一个条件。`u004` 名为“等到战斗结束”，其他条件可能是兵力门槛、科技、会员/赞助标记或彩蛋解锁。

同一目标可有多个条件，也可有多个父单位。重建合成逻辑时按 `target_rawcode` 连接两表，不要只按名称连接。

### sent_units.csv

60 个实际发兵对象，不含 3 个国王升级条目。`record_class` 区分基础发兵与后期变体；`same_name_variant_rawcodes` 用于关联同名版本。第 11 波后的九倍收入字段已经按整数除 2 计算。

### wisp_data.csv / lumber_technology_levels.csv

- `wisp_data.csv`：小精灵 `e003` 的价格、建造/训练时间、生命、移动速度和九倍数量上限。
- `lumber_technology_levels.csv`：32 行；其中 `available_in_x9=True` 的 30 行是 `R003` 1—7级与 `R00H` 8—30级，另 2 行 `R06W` 是其他模式分支。
- `technology_effect_value_at_local_level`：Warcraft 当前科技对象等级的总效果值。
- `harvest_increment_this_level`：从上一级升到本级新增的采伐量。
- `cumulative_harvest_bonus_in_branch`：按该模式分支累计后的采伐加成；九倍 30 级为 +53。

### wave_kill_gold.csv / special_gold_rewards.csv

`wave_kill_gold.csv` 每波一行，使用死亡脚本实际数组，而不是 `bounty*`：

- `base_gold_per_normal_kill`：本波非召唤系统怪的基础金币。
- `next_wave_substitute_bonus_per_kill`：10%替换怪额外 +3。
- `minimum/maximum/expected_*_per_lane`：全部直接击杀情况下每路总金币；期望值按每只独立10%计算。
- `cross_lane_kill_before_leak_marker_gold_per_kill`：怪物尚未带漏怪标记但由其他路线玩家击杀时通常被改为1金。
- `leaked_monster_gold_formula`：漏怪后按原路线赏金比例缩减，并可能叠加标记与替换奖励。
- `king_kill_distribution`：国王击杀进入队伍池，回合末整数平分。

召唤/发兵怪的基础击杀金币取单位等级，不取 `Ie[Dg]`。`special_gold_rewards.csv` 另列首末飞行怪、娜迦农夫、宝藏怪等事件。

## 彩蛋与合成

### easter_egg_recipes.csv

88 条显式彩蛋或未进入普通即时选择表的条件/隐藏升级边。字段继承 `unit_upgrade_edges.csv`，并增加 `recipe_scope`。其中“未进入即时选择表”是脚本结构事实，通常代表科技、皮肤、资格或彩蛋条件；是否在具体账号可用还取决于需求标记和平台状态。

### easter_egg_catalog.csv / easter_egg_menu_tree.csv

- `easter_egg_catalog.csv`：248 个图鉴单位节点，含菜单路径、父单位、价格、属性、技能、皮肤基底、兵营彩蛋层级和需求。
- `easter_egg_menu_tree.csv`：372 个单位/子菜单/根菜单节点。`breadcrumb_*` 从根到当前节点；伊瑟拉 `A2YK/h0YM` 是单独注册项，因此根字段为空。

### explicit_easter_egg_units.csv

39 个名称或提示文本明确含“彩蛋”的对象。此集合包括浏览页/预览对象，`in_player_upgrade_graph` 和 `in_easter_catalog` 用于判断是否进入实际登记树，不能直接视为可建名单。

### easter_egg_ban_limits.csv / easter_egg_build_limits.csv

- BAN 表有 44 个可选类型；`initial_max_allowed=-1` 表示初始化时不限数量，非负数表示初始最大允许数。被玩家选中 BAN 后脚本会把全玩家该单位上限置 0。
- 建造上限表有 47 条调用记录；`limit_api` 保留普通/扩展登记方式，`requirement_*` 保存附加资格标记。

### easter_egg_sacrifice_rewards.csv

3 档献祭的金币、木材、国王最大生命与永久奖励能力 rawcode。献祭后该玩家对应单位类型会被设为不可再用。

### mercenaries.csv

- `income`：从提示文本解析出的收入。
- `unit_point_value`：对象表点数；九倍收入脚本实际使用此值。
- `x9_income_credit_wave_1_10`：第 1—10 波计入收入的值。
- `x9_income_credit_wave_11_plus`：第 11 波起的整数除 2 结果。
- `record_class`：`base_send_unit`、`late_wave_variant`、`king_upgrade` 或 `other_income_unit`。
- `x9_sapper_hp_scaling_applies`：完整检查 `SAPPER` 且非建筑/召唤/巨型后的结果，不能只看 `SAPPER` 标签。

### buildable_fighters_candidates.csv

从全单位表中按正金币造价和战斗描述词筛出的候选视图。它适合检索，不是游戏内可用名单的唯一权威来源。

## 全量对象表

- `all_units.csv`：2,154 个单位，合并 UnitData/Balance/UI/Abilities/Weapons，并添加中文名称、伤害、DPS、赏金和技能名派生列。
- `all_abilities.csv`：2,949 个技能。
- `all_buffs.csv`：459 个魔法效果/状态。
- `all_upgrades.csv`：815 个科技升级。
- `all_items.csv`：114 个物品。
- `all_destructables.csv`：6 个可破坏物。
- `all_doodads.csv`：42 个装饰物。

列名大多保留 Warcraft SLK 原字段名，便于与 Warcraft 对象格式资料或自建导入器对应。派生字段集中在表头前部或尾部，例如 `name`、`damage_min_1`、`dps_avg_1`、`ability_names`。

## 覆盖层与脚本索引

### war3map_w3u_modifications.csv

单位对象覆盖层。`table` 区分原对象修改和自定义对象；`base_rawcode/new_rawcode/object_rawcode` 描述继承关系；`field_rawcode` 是字段 ID；`variable_type` 为 0 整数、1/2 浮点、3 字符串。

### war3map_w3a_modifications.csv

技能对象覆盖层，字段含义同 W3U，另有 `level` 与 `data_column`。最终技能行为可能同时受此表和 JASS 影响。

### runtime_literal_data.csv

提取脚本中直接调用 `SaveStr`、`SaveInteger`、`SaveReal`、`SaveBoolean` 写入哈希表的字面量。动态表达式保留在 `value_raw`，可直接解析的 rawcode/字符串写入 `value_resolved`。

### script_rawcode_usage.csv

统计 `war3map.j` 中四字节 rawcode 常量的引用次数，并尽量关联对象类别与名称。`unknown` 表示可能是字段键、哈希键、平台常量或未载入的对象类型，不代表无效。

## 溯源与质量

- `source_manifest.json`：源地图路径、大小、时间、MD5/SHA-256、平台日志匹配行。
- `parse_summary.json`：每张表的记录数和缺失统计。
- `validation_report.json`：核心数量、生命倍率、类型一致性、哈希、编码等自动检查。
