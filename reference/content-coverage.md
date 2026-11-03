# 内容覆盖快照

来源版本：`v14.1A5`；技能实现版本：`v14-content-20261104-v74-1`。由 `node scripts/content-coverage.mjs --write` 同时生成本文件与 [逐项 JSON](content-coverage.json)。

| 范围 | 总数 | implemented | partial | marker | unresolved |
| --- | ---: | ---: | ---: | ---: | ---: |
| 玩家可达能力 | 692 | 406 | 199 | 40 | 47 |
| 全部战斗能力 | 777 | 455 | 208 | 53 | 61 |

当前单位 534、佣兵记录 60、主波次 35、特殊怪类型 14。运行时动态能力、召唤形态及建筑专属命令均按来源单列于 JSON；sourceOnlyCombatForms 未计作玩家可达入口。

这些标签描述已接入的规则范围，不是整套单位或原图完成率。partial 仍有已知原生差异；marker 仍需确认没有脚本副作用；implemented 也不替代调用入口、组合行为与原生运行验收。逐项规则和剩余缺口见 JSON 的 abilities 与 remainingSourceGaps；批次证据见 [整合记录目录](../docs/parallel-development/)。
