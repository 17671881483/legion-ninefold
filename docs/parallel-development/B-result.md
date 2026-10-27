# B 交付：噩梦分身与黑暗之魂

工作树：`/Users/a1/.codex/worktrees/nightmare-souls/legion-ninefold`。分支：`codex/nightmare-souls`。统一起点：`d17affb54754d4d78573837dd2948a90154d3751`。仅在此工作树编辑；未推送 main、未部署、未改总待办、README、RECONSTRUCTION、全局内容版本或 index 资源哈希。交付提交以本分支 `git log -1` 和最终回复中的 SHA 为准。

## 已接入的行为

- 建筑 `h020 → h03L`、`n06T → h0SX` 正常出战时注册 5 秒重复计时器。原图只有 `oldcodefn_Bg` 的这一个注册入口；竞技场和任意复制/直接创建不补发该计时器。注册不重入。
- 回调检测生命 `<1` 后销毁；当前魂数 `<15` 才增长，不把 `timenum` 当终身上限。计时器注册后不再检查 A0XM 是否仍在。满魂后仍继续计时，消耗后可以再次增长。
- 主死亡链原位置（42006）检查击杀者 A0XM、`killnum<15`、`mana<15` 后才抽一次 `GetRandomReal(1,101)<=20`；Web 用 `1+100U<=20`，不称精确 20%。既有初始炼金抽样仍在前；禁止重入和 Ju 排除仍由 `runMainUnitDeath` 负责。友军击杀、法术击杀及已经死亡的击杀者均不额外排除。
- 每魂：动态加 A0XN，`killnum+1`，计时来源额外 `timenum+1`；先魔法 `+1` 和生命 `+100`，再最大生命 `+100`、攻击 `+10`。补齐 type3 的 `YDb* / AIat` 证据与双武器 journal，第一武器只加一次，第二武器从原生基础重算后加灵魂净增量。
- 恰好到 10 魂且 `one=false` 时，h03L 创建 h03K，h0SX 创建 h0SU；原位置、朝向 270、继承宿主 owner/side/battleTeam 与原图 userData，标记 SUMMONED，无寿命或攻击命令。只走普通创建钩子，不把 CreateUnit + UnitAddType 编造成原生 summon 事件，也不复制本体灵魂/属性/计时器。未知原型无召唤，但与源码一致仍把 `one` 置真。
- 主伤害互斥链在欲火/冰爆/冻结标记之后检查 A0XM。只有 `GetEventDamage()>=当时生命 && killnum>=6` 真命中才取消本次待结算事件伤害，扣 6 魂及 6 魔法，先回复 1000 生命，再减最大生命 600、攻击 60。魔法不足 6 不阻止此分支。
- A0XN 等级按剩余魂同步，减到 0 移除。属性、计数、单次召唤标记都属于出战体，不写回建筑；普通换波重建，连续波存活者继续。
- `nightmare_souls` 任务只存实体 ID 和绝对 `nextAt`，JSON 无对象别名。补跑每个回调临时使用其计划时间并在 finally 恢复帧时间，因此粗步推进与逐秒推进的召唤 `createdAt`、事件时间和出生注册状态一致。暂停/倍速使用引擎模拟时间；尸体与移除停止任务。

## 与 A/C 的共享接口

`nightmareDamagePrefix(game, target, source, eventDamage, api)` 和 `nightmareMainDeath(game, killer, api)` 都返回完整条件及效果实际命中的布尔值。

`beforeSourceDamage` 现在在正常路径返回待结算数值；既有早退可能返回 undefined，`engine._hurt` 用 `beforeSourceDamage(...) ?? actual`。每个调用使用局部 `eventDamage`，不会把覆盖泄露给嵌套事件。A0XM 命中时 `eventDamage=0`，但 **不修改** `prefix.localDamage`；后续不屈和异蛇清理继续用原始/欲火改写后的 P8。测试包含 3000 原事件被取消、随后仍触发不屈的组合。

C 合并时在元素前缀未命中后先调用 A0XM，只有 A0XM 返回 false 才能执行 A0I5；随后把实际 `selected` 传给决斗。A0I5 魔法 `>24` 分支即使命令失败也应算选择。B 只移除了决斗中旧的“A0XM 持有且致命便阻挡”的近似，保留 C 尚未合入的旧 A0I5 守卫，不修改 C 家族。

A 合并时保留 `runMainUnitDeath` 的禁用深度；B 的 `nightmareKill` 回调已经置于该禁用区内、火噬/骷髅王后续 elseif 之前。A 的嵌套死亡不能绕过主死亡禁用。覆盖脚本新增运行时 A0XN 和 h03K/h0SU；三分支整合后应重新生成覆盖文件。

运行时字段：`status.sourceKillnum` 对应源码共享 hashtable 的 `killnum` 键，便于后续共享计数家族接线；`status.nightmareTimenum`、`nightmareOne`、`nightmareTimerRegistered`；独立 `sourceNightmareStatBonuses.flatDamage` 保存灵魂净攻击加成，不回算或重复应用。`sourceSkillJobs` 条目为 `{type:'nightmare_souls', sourceId, nextAt}`。

## 文件

- `dist/nightmare-rules.js`：规则、计时、增长、召唤、主死亡/伤害分支、独立攻击 journal。
- `dist/skills.js`：能力编译、正常出战注册、主链及任务接线、第二武器加成。
- `dist/engine.js`：接收本次事件伤害覆盖。
- `dist/huskar-duel.js`：删除旧 A0XM 过宽阻挡。
- `dist/death-trigger-rules.js`：禁用保护内的 A0XM 击杀回调。
- `package.json`、`tests/v14-nightmare.test.mjs`：专项入口和集成测试。
- `scripts/content-coverage.mjs`、`reference/content-coverage.json`：动态能力/召唤形态及 partial 状态。
- `reference/nightmare-evidence.json`：原始 SHA、Latin-1/LF 逐行证据、对象字段、接口和边界。
- 本文件：结果和整合说明。

## 验证

- 31 项黑暗之魂专项：通过；包括随机边界/抽样次数、15 上限与再积累、5/6 魂、等号、回血和上限顺序、10 魂两种召唤、单次锁、死亡链抑制、欲火/冰爆/决斗/不屈顺序、清尸/移除、存档、真实换波、竞技场、连续波、暂停倍速、粗步计划时间与双武器获得/消耗/JSON。
- 既有决斗 18、元素前缀 20、主死亡 19 项均已通过，之后纳入全量回归。
- 全量 `npm test`：958 项检查通过（867 项 Node 测试 + 91 项既有脚本检查）；使用应用内 Node 24.19.0（默认系统 Node 16 不满足 package engines，因此最终验收使用 PATH 指向 Node 24）。
- `npm run test:smoke`：通过，35 波各 12 秒，峰值 124 实体 / 16 个脚本任务，累计生成 2784，finiteState=true、saveContinuation=true。它是短时验证，不代表自然完整通关。
- `git diff --check`：通过。
- 覆盖生成：A0XM 从 unresolved 改为 partial，新增 A0XN partial；玩家 410 implemented / 76 partial / 34 marker / 116 unresolved，全战斗 460 / 78 / 47 / 136。本分支不修改公共总清单及全局版本。
- 本分支按任务不运行会更新资源哈希的 build；主聊天整合后统一 build、stamp 检查及浏览器验收。

## 保留 partial 的具体边界

1. h03L/h0SX 对象没有明确 `manaN/mana0`，不补造 15 蓝上限；已有解析宿主可能为 0。计数与魔法刻意分开，致命分支也不要求有 6 蓝。
2. A0XN 的 AOae `DataA/DataB` 及高等级继承字段缺失；能力/等级真实跟踪，不编造移动和攻速光环。
3. YDWE 用隐藏 AIml 能力加/设级/移除修改最大生命。其原生当前生命副作用未运行验证；Web 明确使用“先执行显式回血，再改上限并夹取”的适配。最大生命非法区间（<=0 或 >65535）和整数差量按源码处理，但不宣称此适配已等同原生。
4. 原生 CreateUnit 碰撞、原始句柄复用及命令/枚举仲裁未闭合；本体和召唤体保留不同外观原型，不凭文案调整数值。
5. 14221 属于 AuraStruggle 的 A0XM 嗜血排除，注册与整个父条件已记录；它不是灵魂普攻入口。未扩展该上游光环家族。
6. 没有历史灵魂字段的旧存档不能恢复未知储备和已过去的计时；不补抽、不追授。主聊天最终统一提升全局实现版本以刷新旧技能规格；本分支依指令未提高版本。
