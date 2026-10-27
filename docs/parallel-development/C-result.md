# C：噬魂毒素交付记录

日期：2026-10-27。工作树 `/Users/a1/.codex/worktrees/soul-toxin/legion-ninefold`，分支 `codex/soul-toxin`，起点 `d17affb54754d4d78573837dd2948a90154d3751`。实现、测试、逐行证据和本记录在同一功能提交中；提交 SHA 以该分支最终交付记录及 `git log -1` 为准。没有修改主聊天目录、主分支、全局内容版本号和 `dist/index.html`；没有发布网站。

## 已接入行为

- `dist/soul-toxin-rules.js` 负责 A0I5/A0I7 定义、受伤分支、原生命令适配、范围任务、计时结束及保留句柄。实际入口是 `beforeSourceDamage`，任务由 `tickSourceScriptJobs` 执行，不依赖测试专用调用。
- A0I5 原先只有通用 Acri 自动减速且误标 implemented。现改为专用 `soul_toxin_source`、partial，移除无来源的通用主动入口。受害者魔法严格 `>24` 才命中分支；命令目标为伤害来源。24 恰好不会命中。
- 记录 `status.soulToxinOrderRequest`，区分 `failed`、`adapted-success` 和 `unresolved`。分支命中与原生命令成功互不等价；失败或冷却未知仍跳过同链后续决斗。首次即时适配成功只扣一次24魔法。
- Cool1 缺失保持 `cooldown:null`，绝不自动代为0秒或0.1秒。首次成功后在技能状态中保留 `nativeCooldownUnresolved`；后续有效请求记录未决，等待原生就绪证据。该保守边界意味着当前不会凭空保证下一次施法。
- 全局 SPELL_EFFECT 回调入口及初始化调用均有证据。非 e008 的 A0I5 施法效果以主目标为中心枚举200原始距离敌军；只检查当时 B04U 去重。每个符合脚本条件的候选各建一个1秒任务。机械、魔免、无敌、超马甲射程、尸体或原生不可选目标的马甲命令可能失败，仍保留脚本创建的任务。
- 当前即时适配先对主目标施加 B04U，再调用范围回调，因此主目标已带 buff 时被循环排除，不强行补计时器。`soulToxinSpellEffect` 消费事件时真实观察到的 buff 状态；若直接观测到事件时主目标无 B04U，循环才会建立其任务。原生主目标事件/buff先后仍是 partial，不能把这个宿主选择称为原图既定结果。
- 每次回调仍有 B04U 且双方存活才造成10伤害；否则造成90伤害、请求 A0I7 等级1、销毁任务，当次不再叠加10。没有固定五次计数。当前5秒即时 buff 的正常结果为第1—4秒各10，第5秒90，共130；驱散、延长 buff、死亡和马甲失败都会改变实际次数。
- 两种脚本伤害均为 JASS `ATTACK_TYPE_NORMAL`（Spells攻击行）/`DAMAGE_TYPE_MAGIC`。接入已有原生伤害结算，受攻击行倍率、魔免和法抗影响，不按物理护甲值减伤。A0I7 只适配已知控制：普通单位1秒、原生英雄0.5秒；不按文案补伤害。
- 每次补跑回调临时将 `g.state.time` 和 `_soulToxinEventAt` 设为自身 `nextAt`，在 finally 恢复二者原值。因此嵌套伤害、死亡、事件和新任务期限从实际 tick 起算。专项验证第15秒终结伤害触发的不屈在第20秒到期，即使一次补跑到第18秒。
- 原始施法者/目标句柄保存在 `state.soulToxinHandles`，宿主清尸后仍按死亡状态运行结束回调；JSON恢复重绑活体，多个计时器共享同一目标。连续波保留任务和句柄，普通清波、沙盒重置和竞技切换清空。显式真实移除标记只记录 `native-removed-handle-unresolved`，不伪造死亡或爆发伤害。
- 同全局版本的旧档也会按能力局部 `soulToxinRevision` 识别旧通用 Acri。保留魔法、buff及既有计数，不补造过去的周期任务；旧档已有施法次数时将冷却转为未知，防止恢复后重复施法。没有提升公共版本号。

## 文件

- 新增：`dist/soul-toxin-rules.js`、`tests/v14-soul-toxin.test.mjs`、`reference/soul-toxin-evidence.json`、本记录。
- 接线：`dist/skills.js`、`dist/engine.js`、`dist/huskar-duel.js`、`package.json`。
- 覆盖：`scripts/content-coverage.mjs`、重新生成的 `reference/content-coverage.json`。e008 动态 A0I5/A0I7 均纳入，A0I5 改 partial，A0I7 为新增 partial；仅本分支快照为玩家409 implemented/76 partial/34 marker/117 unresolved，全战斗459/78/47/137。整合后须重新生成，不能沿用这些独立分支计数。

## 验证

- 专项34项：注册/SHA/逐行证据、三个真实建筑的战斗体及初始魔法、24边界、请求成功/失败/未知与分支选择、e008排除、主目标事件时buff、范围/阵营/原生目标条件、重复和重叠任务、实际tick/末次伤害、伤害类型/护甲/魔免/法抗、英雄控制时长、死亡/清尸/移除、存档共享句柄、同版本旧档、暂停/倍速、连续波及粗步补跑不屈期限。
- 受影响回归通过：`v14-elemental-procs`20、`v14-huskar-duel`18、`v14-huskar`24、`v14-skills`24、`skills`17、`skills-review`16、`v14-content-skills`20。
- `npm test`：最终完整运行961项检查通过（870个TAP用例及91个既有自定义检查）；34项C专项已加入测试入口。
- `npm run test:smoke`：35波各12秒通过，`finiteState:true`、`saveContinuation:true`，peakEntities124、peakSourceJobs16、spawned2784。该烟测不等于35波自然完整通关。
- `npm run content:coverage` 与 `git diff --check` 通过。
- `node scripts/stamp-assets.mjs --check` 按预期报告资源哈希过期。依分工没有运行会修改 `dist/index.html` 的 build；主聊天合并后统一执行 build 与哈希检查。
- 执行环境默认 Node v16.20.0，npm提示项目要求较新Node；上述测试确实运行并通过，没有以警告代替测试结果。

## 整合接口及剩余边界

- **B/A0XM前置**：`soulToxinDamageBranch(g,target,source,eventDamage,api)` 只处理自己的条件并返回 `{selected:'A0I5',request}` 或 null。应在元素前缀与B的真实A0XM判断均未选中后调用，将返回值的 selected 传给决斗。独立C分支在 `beforeSourceDamage` 保留现有 `unresolvedNightmare` 致命混合技能门槛，避免猜造B逻辑；整合B后删除这条粗门槛，改用B返回的真实命中结果，并相应替换专项中暂存的A0XM deferred用例。
- **主聊天A0I1后置**：B04U宿主buff同时带 `id/key/buffKey:'B04U'` 和 `expiresAt`。`hasSoulToxinBuff` 也接受明确存入的 `nativeBuffIds:['B04U']` 观察值（无隐含期限）；本模块不向 nativeBuffIds 写入限时buff，避免到期后误判常驻。A0I1需在 A0I5 未选中且 DemonStatueBounce未选中后检查。C只删除 `huskar-duel.js` 内旧的A0I5猜测阻挡；A0I1旧阻挡留给主聊天处理。
- **A/骷髅王**：周期/结束伤害均调用已有 `_hurt` 结算入口，死亡由现有主死亡/独立监听处理，不直接写死或复制复活逻辑。粗步补跑的临时时间上下文也覆盖这条死亡链。A的句柄与任务保留应和新增 soulToxinHandles 并列合并，不能覆盖任何一方的重置/连续波/恢复接线。
- 原生 Acri 的冷却、DataC、施法时间、命令排队/攻击打断、主目标buff与SPELL_EFFECT先后、弹道、A0I7伤害/消耗默认值、原生枚举和真实RemoveUnit句柄仍待来源或原生运行证据。虚拟e008记录能力授予、来源、生命设置请求和2秒移除期限，未把它伪造成可选战斗召唤物。A0I5/A0I7继续partial。
- 共享冲突预期集中在 `dist/skills.js` 进口/编译覆盖/伤害前缀/任务分派/heroScriptApi、`dist/engine.js` 各轮次重置/连续波/恢复、测试入口及覆盖清单。合并时逐项并列保留，之后全量测试、浏览器验收、build、stamp检查由主聊天负责。
