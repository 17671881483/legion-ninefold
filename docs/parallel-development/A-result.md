# A 骷髅王复活交接结果

日期：2026-10-27。隔离工作树：`/Users/a1/.codex/worktrees/skeleton-king-revival/legion-ninefold`。分支：`codex/skeleton-king-revival`。基线：`d17affb54754d4d78573837dd2948a90154d3751`。本文件随功能提交保存，准确提交号以该分支包含本文件的提交为准。

## 已接入行为

- 主死亡入口保持 Ju 排除、执行期间禁用、点金抽样、A20D、种族、伊瑟拉与 A0HW 顺序。骷髅王加入火噬后的同一 elseif；精确 `h0JJ`、非空击杀者、正等级 `A0IA`、非幻象才进入，`h0JK` 建筑体不触发。
- 每次符合条件的死亡都抽一次 0/1。首次即使抽 1 也排 1 秒任务；带 `u1` 的后续体抽 1 失败并清掉已建模的来源哈希标志，不清引擎死亡元数据。回调到期才检查 LI，关闭则结束任务，不延期重试。
- 真正创建同原型新实体，使用模板和现有创建钩子。只显式传递 owner、当时位置/朝向、userData 和死亡时计时器预存的 `SMYinwei`，设置新体 `u1=true`；旧体的额外属性、buff、动态能力、目标、追击、冷却、buildingId、召唤身份和寿命不复制。新体保有模板 A0IA，可以立即再次死亡并抽样。
- 新体登记 JH/userData 与 JW 来源标志，使用新的 attack 请求及朝 `spawnWarpWorld(userData-1)` 的导航。普通和竞技部署为 h0JJ 初始化 userData；竞技新体也能实际沿新路线移动。
- 旧体被 `RemoveUnit`。下一秒的 A02ATimer 仍指向旧句柄，保存能力重加请求，未误作新体冷却。清尸只移除一般实体列表，任务保留原句柄；JSON 恢复时有活体则重绑该对象，已清理尸体则从任务保留句柄继续。
- 创建 e008、动态添加 A0IB，保存 `thunderclap` 请求和明确物编字段：200 范围、30 伤害、20% 移速/攻速降低、普通/英雄均 2 秒、B04V、`ground,neutral,organic`。马甲句柄放在其 1 秒移除任务中，不进入普通索敌/竞技存活列表；RemoveUnit 不制造死亡事件和赏金。

## LI 与时间

全部 LI 写入只有 15768 和 19375。没有战斗开始赋值；新局初值 false，第一波不能因 phase 为 combat 而开启。

`dc → Nl/hd → OZ/oldcodefn_cd` 在普通波末执行：先等待 1 秒、清理战斗单位，随后 LI=false；再等待 2 秒，第 16/24 波多等 8 秒，才启动 6 秒 J4。J4 到期经 K4/mbb，K5 为真时执行 K6/tb，枚举非空 Jc/sb 才写 LI=true。正常情况下相对波末为第 9 秒开启，第 16/24 波为第 17 秒。启动 J4 后的另外 2/4 秒等待不额外推迟 J4。

独立 `state.skeletonKingGate` 在备战和战斗都推进；暂停冻结模拟时间、倍速沿用模拟钟、JSON 保留剩余等待。竞技开始/结束不赋 LI；Dg>=30 的 hd 分支绕过 OZ，连续波不凭切波重置。旧存档无这段历史时置 false 并记录 `legacyUnknown`，不编造历史统计回调。

修复主聊天指出的同帧时序问题：保存 `initialLi` 与带时间的 LI 转换记录；即使 `_step` 已推进到帧末，A01ATimer 仍按 `job.at` 查询 LI。回调执行期间临时令 `state.time=job.at` 并在 finally 恢复，创建时间、事件时间、后续 1 秒任务都以真正到期时间为准。覆盖了复活在 close/statistics 前后到期、JSON 恢复历史、粗步补跑和异常时恢复外层时间。

## 文件与公共接线

- `dist/skeleton-king-rules.js`：独立规则、LI 生命周期及历史、复活/旧句柄/马甲任务。
- `dist/death-trigger-rules.js`：只在 A0HW 后加入同链分支。
- `dist/skills.js`：编译状态、死亡 API、任务分发；同版本旧 A0IA/A0IB 定义也刷新，保留运行状态，不改全局版本。
- `dist/engine.js`：LI 独立时钟、普通/竞技 h0JJ userData、竞技复活体导航、JSON 句柄重绑。
- `scripts/content-coverage.mjs`：动态 e008/A0IB 纳入玩家及战斗覆盖。
- `package.json`：全套测试末尾加入专项。
- `tests/v14-skeleton-king.test.mjs`：33 项专项。
- `reference/skeleton-king-evidence.json`：Latin-1、只按 LF 分行的逐行 JASS 证据、对象字段与边界。
- 本交接文件。

本分支没有改总待办、README/RECONSTRUCTION、内容版本、index.html 哈希或生成的覆盖总表，没有推 main 或部署网站。

## 验证结果

- Node v24.19.0：`npm test` 完整通过，其中骷髅王专项 33/33。
- 专项及受影响回归：死亡链、巫妖王、种族规则/集成、元素触发全部通过。
- `npm run test:smoke` 通过：35 波每波 12 秒，峰值实体 124、任务 16、累计出生 2784，有限数值和保存继续检查通过。这不是自然完整通关。
- `git diff --check` 通过。
- `node scripts/content-coverage.mjs`（只读，不写生成总表）通过：玩家 implemented 410 / partial 76 / marker 34 / unresolved 116；全战斗 460 / 78 / 47 / 136。相对基线 A0IA 从 unresolved 转 partial，新增动态 A0IB 为 partial。
- 未运行会写 index.html 哈希的 build/stamp；由主聊天合并后统一生成、检查并进行浏览器验收。

完整测试日志在 `/private/tmp/skeleton-king-npm-test-node22.log`（文件名沿用先前命名，实际运行 Node v24.19.0），烟测在 `/private/tmp/skeleton-king-smoke-node22.log`。此前默认 Node v16 下也通过过全量和烟测，最终使用项目支持范围内的 Node v24 重跑。

## 保留为 partial 的边界

1. A0IB 的原生 Cost/Cool/cast 默认字段、neutral 目标许可及执行仲裁缺失。因此保留请求和已知伤害/减速字段，不对附近敌人直接结算猜测伤害、buff 或魔法消耗。
2. 原生 CreateUnit 碰撞/出生钩子完整顺序、原始玩家出生坐标与 attack 命令仲裁未证实，Web 使用既有模板、创建钩子与出生点映射。无有效 userData 时仅记录未解析出生点，不猜坐标。
3. A02ATimer 对已移除旧句柄加能力的原生效果保留请求。如果 A01ATimer 前尸体已显式 RemoveUnit，同样保留移除句柄请求，不伪造仍有效的原型和 owner。正常清尸与显式 RemoveUnit 区分。
4. Web 正常/竞技结算立即清理任务与实体；原脚本 mg 在初始 1 秒等待后清理 GIANT/SUMMONED。未为复活延长战斗，也未虚构跨宿主清场后已移除句柄的后续效果。连续波保留任务，已专项验证。
5. yA 为基于定时器的轮询等待；本实现使用名义秒数，原生恢复抖动、严格同时到期的回调排序仍待原图验证。
6. SMYinwei 来源授予家族超出本任务，仅继承本分支明确预存的布尔值。源哈希其他未建模字段的 FlushChildHashtable 效果未扩散实现。

## 与 B/C 的整合关系

A 仅接主死亡链中火噬后的分支，没有改主伤害链或注册伤害监听。B 的 A0XM、C 的 A0I5 保留各自入口和优先级；它们造成死亡时仍走统一 sourceDeath。新生骷髅王不复制旧体上动态得到的 B/C 能力、计数或毒素状态。三者共用 `sourceSkillJobs` 实时数组，A 的临时时钟在每次回调 finally 恢复，不污染下一个家族任务。

合并时可能冲突的点是 skills.js 导入/编译/任务分发、engine.js 存档段、package.json 测试尾部、覆盖脚本动态列表。逐项叠加三个分支即可，不用替换整段函数。主聊天负责统一内容版本、重新生成覆盖总表、build/stamp、跨技能验收与发布。
