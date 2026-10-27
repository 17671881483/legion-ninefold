# A：骷髅王复活

本任务来自用户授权的三路独立开发。先阅读[总待办](../RESTORATION_TODO.md)，代码基线为 `bdb91a4f6826306a94226fc569e89d40f38d1f8f`。在独立工作树创建 `codex/skeleton-king-revival` 分支；不得编辑主聊天工作目录或其他聊天工作树。

## 负责范围

- A0IA 复活的真实注册入口与计时任务；A0IB 骷髅王复活重击的已知原生字段与调用。
- 建议新增 `dist/skeleton-king-rules.js`、`tests/v14-skeleton-king.test.mjs`、`reference/skeleton-king-evidence.json`、`docs/parallel-development/A-result.md`。
- 允许最小修改 `dist/death-trigger-rules.js`、`dist/skills.js`、`dist/engine.js`、覆盖脚本和测试运行入口，以完成实际引擎接线。不要改 B/C 家族、总文档、全局版本号或发布资源。

## 已查到的源码线索（须复核）

- `Trig_UnitDeathActions` 的 42090—42105：先检查击杀者 A0HW 火噬；否则仅死者精确类型 h0JJ、非空击杀者、正等级 A0IA、非幻象才进入复活分支。h0JK 是建筑体，不可无条件套用。
- 42096：先抽 `GetRandomInt(0,1)`；结果大于 0 且旧体 `u1` 为 true 才失败并 `FlushChildHashtable`。首次死亡也消耗抽样，但没有 u1 时不因此失败。
- 42104：定时器 **1 秒**，不是文案的 3 秒。
- 41665—41702 `A01ATimer`：仅 `LI==true` 执行。新建 e008（Pn）马甲及同原型新单位；仅显式继承旧体 owner/位置/朝向/userData、计时器预存的 SMYinwei，设置新体 u1=true。重新登记 JH/JW 并下发朝玩家出生点的 attack 命令，移除旧体；不能把旧体回血当作新建，也不能复制全部状态/技能。
- 41674、41682—41683 与 41642—41650：1 秒后重加 A0IA 的计时器保存的是**旧句柄**，而旧体随后已 RemoveUnit。不能把它编成新体 1 秒复活冷却。
- 新体没有 `UnitAddType(...SUMMONED)`，不能沿用 Web 通用召唤 helper 的默认 `isSummon=true` 或限时寿命。
- 41692—41694：马甲加 A0IB、命令 thunderclap，1 秒后移除。对象 AHtc：Area1=200、DataA1=30、DataC1=.2、DataD1=.2、Dur1/HeroDur1=2、BuffID1=B04V、targs1=ground,neutral,organic。缺失默认字段和原生命令/目标许可仍需补证，不把请求等同必然命中。
- **LI 尚需完整追踪，不能直接等同 phase==='combat'**：1094 声明；15768 `sb` 设置 true；15772 `tb` 枚举 Jc 调 sb；15709 `mbb` 在 K5 时执行 K6；26926—26932 将 J4 到期→mbb→K6/tb 注册起来；19528 在 `oldcodefn_cd` 末部 `StartTimerBJ(J4,false,6.)`。19375 同一结束回调先 LI=false，19336/19377 等有等待。务必追踪首次 OZ 运行、整段等待、竞技/连续波与暂停；不要把它误写成战斗开始 6 秒或结束后无条件立即 true。
- SMYinwei 9009—9013 是另一监听的标志；本次只继承源显式标志，不顺带实现未知授予家族。

## 当前接口

- 主死亡入口为 `runMainUnitDeath`（已经处理 Ju 排除、回调中禁用、点金随机、A20D、种族、伊瑟拉、A0HW/骨龙链）。新分支应加入火噬后同一 elseif 顺序。
- `heroScriptApi.spawnUnit` 经 `summon` 创建实体；显式控制 isSummon、expiresAt、状态与导航。
- `tickSourceScriptJobs` 遍历实时数组；回调追加任务可在同轮继续处理。`_clearDead` 会移除尸体，必须保留待复活源句柄，JSON 恢复时处理身份重绑。
- `engine` 普通波/竞技结束会清理任务，连续波保留任务；须在证据支持下映射 LI，不为等待复活擅自延长战斗。

## 验收与交付

验证首次/后续复活随机边界、1 秒延迟、主死亡禁用/Ju/火噬优先级、空击杀者/幻象/建筑体/零等级排除；新旧身份与状态隔离、清尸后的任务、JSON 恢复、连续波和结束门槛；重击的命令请求及已知伤害/减速/目标限制。保留真实原生边界为 partial。

先跑专项及死亡链、巫妖王、种族和元素回归，再交付提交号与 `A-result.md`。只提交自己的隔离分支；不推 main，不部署 Sites。主聊天会读取结果并负责整合发布。不要自行新建更多聊天。
