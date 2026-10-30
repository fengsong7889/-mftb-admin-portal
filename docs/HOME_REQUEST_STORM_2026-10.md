# 首页请求风暴与自动写库 · 排查与修复立项（2026-10-30）

> 来源：企业 Agent 控制台收尾的浏览器深度走查中，顺带观测到首页请求异常（见
> `docs/Enterprise_Agent_Platform_Progress_2026-10-23.md` 第二十五节末尾）。
> 本文是该问题的**独立立项记录**：只写实测数据、已修内容、剩余待办与判读口径，
> 不重复业务方案。
>
> 影响面：前端共享层（`MenuContext` / `portal.ts` / `useSystemNavigation`）与首页。
> **后端、数据库、API 契约零改动。**

## 一、一句话结论

`StrictMode` 只解释了一半现象。真正在**生产也会发生**的是两类问题：
菜单树与系统导航的**焦点事件风暴**（放大 5~12 倍流量），以及首页**打开即写库**
（用户偏好数据被无脏判断地原样回写）。两者均已修复并实测确认。

## 二、判读口径（后续复测必读，否则会误判）

| 口径 | 说明 |
|---|---|
| dev 与生产的差异 | `src/bootstrap.tsx` 启用 `React.StrictMode`，mount effect 被双调用（setup→cleanup→setup）。**dev 请求数 = 生产 ×2** 是正常现象，不得当成缺陷。判据：同一接口成对出现、间隔 0~16ms。 |
| 采集手段 | 优先 `performance.getEntriesByType('resource')`（带毫秒时间戳、不受探针丢失影响）；PUT 的 method 需 monkey-patch `XMLHttpRequest.open/send` 与 `fetch` 才能区分，resource-timing 不直接给 method。 |
| 「静置」并不真的静 | CDP 附着、`take_snapshot`、`take_screenshot`、点击都会产生**真实** `focus`/`visibilitychange` 事件。归类时按「轮询拍（= 挂载时刻 + 30k，误差 <0.3s）」与「事件驱动」分开计数，否则会把工具自身造成的合法回前台补拉误判为风暴。 |
| 后台标签页会跳过刷新 | `MenuContext` 的 30s 轮询与 `visibilitychange` 都有 `visible` 守卫。IDE 内置浏览器视图常为 `hidden`，此时轮询直接被跳过（实测确认），测出的次数会**偏低**而非偏高。 |

## 三、实测数据

### 3.1 修复前

| 接口 | 实测 | 设计预期 | 定性 |
|---|---|---|---|
| `/api/menus/my-tree` | 静置 75~80s 内 **31 次**；120~130s 内 **22 次**（每 2.6~5.9s 一次）；单次响应 **56,731 B** | 30s 轮询 → 2~4 次 | **P0 真实缺陷**，生产同样发生；折算约 37 MB/小时只花在菜单树 |
| `/api/portal/systems/{code}/navigation` | 每次焦点风暴一发，**12,894 B**；且 `load(true)` 先清空 tree → 首页快捷入口闪「加載中...」 | 同上 | **P0 同类残留**（排查中追加发现） |
| `PUT /api/auth/quick-favorites` | 冷加载 20s 内 **1 次**（用户未操作） | 0 次 | **P1 正确性缺陷** |
| `PUT /api/auth/ai-settings` | 冷加载 20s 内 **2 次**（间隔 4.4s）；此后每分钟 1 次 | 0 次 | **P1 正确性缺陷** |
| `/api/portal/context` | 冷加载 **4 次** | 生产 1 次 | 4 = 2 对 StrictMode，但来自 **3 个组件各自调用**，生产仍 2 次 → P2 真实冗余 |
| `/api/agent/status` | 冷加载 **6 次** | — | 6 = 3 逻辑调用 × StrictMode；生产 3 次 |
| `/api/auth/check` | 8 次/75-80s、13 次/120-130s | 10s 心跳 | **符合设计，非缺陷** |
| 首页 SPA 往返 | 回首页 **+27** 请求；`my-tree` +0 | — | 首页无 keep-alive，每次进入全量重发（P3） |

冷加载首页合计：首屏 ~12.4s 内 **41 次 GET + 3 次 PUT**。

### 3.2 修复后

| 项 | 实测结果 | 判定 |
|---|---|---|
| `my-tree` 焦点风暴 | 120 个事件（3 轮 ×40）→ **1 次**请求；跨 10s 边界后再风暴仍发 **1 次**（只合并、不永久屏蔽） | ✅ |
| `my-tree` 静置 90s | **5 次** = 3 次轮询拍（间隔精确 30.0s）+ 2 次合法回前台补拉；**2.6~5.9s 一次的形态消失** | ✅ |
| `navigation` 焦点风暴 | 单测验证 10 个串行事件 → ≤1 次；刷新在途时 tree 不清空、`loading` 保持 false | ✅ |
| 首页自动写库 | 6 次冷加载 + 2 段 90s 静置（跨 2 个引擎轮询周期）→ **PUT 0 次** | ✅ |
| **未修成「永远不写」** | 收藏 → `PUT` 200；移除 → `PUT` 200；整页刷新后状态保持、`GET` 返回空列表 → 确实落库 | ✅ |
| `portal/context` | 6 次冷加载全部 **2 次**（dev 的 1 对 StrictMode），生产 1 次 | ✅ |
| `agent/status` | 仍 **6 次**（未因本次改动变多/变少）；60s 轮询每次 1 发 | ✅ 无回归 |
| 功能回归 | 侧栏 7 分组完整；菜单跳转正常；系统切换器列出 17 系统；切换后菜单确实变化；6 次刷新菜单齐全 | ✅ |
| Console / 状态码 | 无新增 error 级报错、无 unhandled rejection、无 5xx | ✅ |

## 四、已完成修复

### P0 焦点事件风暴限流

`MenuContext`：`focus` / `visibilitychange` 驱动的刷新加 **10s 最小间隔**
（`EVENT_REFRESH_MIN_INTERVAL_MS`）。**有意不限流**的：`online`/`offline`（真实连通性
跳变，稀疏且语义强）、30s 轮询、失败重试、用户手动重试 —— 一并压掉会造成真实功能退化。

`useSystemNavigation`：同款 10s 限流（`FOCUS_REFRESH_MIN_INTERVAL_MS`），并补两条：
- **后台静默刷新**：已有可展示的树时不清空、不进 `loading`，修掉首页快捷入口闪「加載中...」；
- 静默刷新**失败时保留**已展示的导航，不把「后台没更新成功」渲染成数据消失。

### P1 停止无脏判断的回写

| 位置 | 根因 | 修法 |
|---|---|---|
| `ai-settings` 持久化 effect | deps 含 `engine?.mode`（60s 轮询回来的**派生值**），而写入载荷用 `getEngineMode()`（本地选择）→ 轮询一变就 PUT 相同内容。**不能直接删该 dep**：引擎切换正靠它触发，删了会丢写 | 两道判断：`aiSettingsDirtyRef`（无用户改动一律不写）+ **载荷签名 `aiSettingsSyncedRef`**（脏过之后相同内容不重写）。签名比对比「保存后清零 dirty」更不易遗漏 |
| `quick-favorites` 持久化 effect | `.then(setFavorites).finally(置 loaded)` 的时序使「首次加载未完成前不写回」守卫形同虚设，把刚读回的值原样写回 | 显式 `favoritesDirtyRef`，由 `addFavorite`/`removeFavorite` 置位；hydration 路径不置位 |

dirty 标记在 5 处真实用户改动点置位：引擎模式选择、受限通道自动回退、上下文窗口、思考开关、思考深度。

### P2 `portal/context` 在途去重

`fetchPortalContext` 被 Home / Sidebar / SystemSwitcher / Portal 四处各自调用。
**只合并「同时在途」的请求，不做 TTL 缓存** —— 该接口是授权派生数据，缓存会把后端
已撤销的系统继续展示成「幽灵入口」（`portal.ts` 文件头本身警告过这点）。
后发生的挂载仍必须重新拉取，此约束有单测锁定。

## 五、剩余待办

| 项 | 内容 | 为什么没在本次做 |
|---|---|---|
| **`agent/status` 三探测合并** | 需后端提供**一次返回三通道**的接口（`auto` 解析结果 + primary + off-peak）。当前 3 次调用携带的是不同信息：`auto` 由服务端按峰谷时段决定走哪条通道，客户端无法推导 | 纯前端合并不掉；本次实测确认仍为 6 次（=3×StrictMode），未变差 |
| **P3 首页 keep-alive** | 首页无缓存，每次 SPA 进入重发自身 27 个请求 | 收益/成本比最低，且涉及路由层结构改动 |
| **`auth/check` 多标签放大** | 10s 心跳符合设计，但是**每标签页**一个定时器，多开线性放大；可用 `BroadcastChannel` 收敛为单标签代理 | 属体验优化，非缺陷 |
| 引擎轮询与配额轮询的周期复核 | 首页另有 60s `quota/check`、~30s `meeting/my/summary` 轮询，本次未评估其必要性 | 不在本次范围 |

## 六、验证与门禁记录

全量 **167 测试文件 / 1614 条测试全部通过**；`eslint` 0 error（622 warning 为历史基线）；
`tsc --noEmit` 0 error（需 `NODE_OPTIONS=--max-old-space-size=6144`，默认堆在本机 OOM；
以输出正文无 crash trace 且无 `error TS` 为判据，**不看管道退出码**）；
`check:i18n` 12179 条静态引用零缺失；`check:menu` / `check:stat-order`(172 页) /
`check:confirm-modal`(306 处) / `secret-scan` / `check:boundary` 全通过。

改动文件（7 改 1 新增）：

```
frontend/packages/platform-client/src/contexts/MenuContext.tsx        (+ 测试)
frontend/packages/platform-client/src/api/portal.ts                   (+ 新增 portal.test.ts)
frontend/packages/ui/src/hooks/useSystemNavigation.ts                 (+ systemNavigation.test.tsx)
src/pages/Home/index.tsx                                              (+ Home.test.tsx)
```

## 七、纪律沉淀（本次两次踩到的「空测试」）

对任何「**不应该发生**」型断言（不请求 / 不写入 / 只请求一次），必须做一次
**变异验证**：临时摘掉守卫，确认对应用例真的翻红，再恢复并确认变异标记残留数为 0。

本次抓到两条新写的测试是空的：

1. **同步派发的事件被 in-flight 去重合并** —— 10 个 `focus` 在同一轮 `act` 里同步派发，
   模块级去重直接合并成 1 发，摘掉限流也照样绿。真实风暴是**串行**的（间隔 > 单次请求
   耗时），必须用 fake timers 在事件之间留出落地时间，才能把「限流」与「去重」区分开。
2. **jsdom 的 Promise 时序与真实浏览器不同** —— 「冷加载不回写」在 jsdom 里根本复现不出
   缺陷（`.finally` 置标记的时机不同）。必须改为**主动驱动那个错误触发源**
   （让轮询接口连续返回不同派生值，使依赖数组变化）。

另：静态门禁（lint / tsc / vitest）全绿**不能**证明取数类改动正确 —— 本仓已有一次
「StrictMode 去重守卫搭配 cleanup 取消，导致请求数达标但数据全丢」的 P0，
只有浏览器实测「接口返回 N 条 vs 界面渲染 M 行」才能抓到。

## 八、归属边界

排查过程中 `check:i18n` 曾报 `meeting` 域超基线 +9、一条会议测试失败。
已用「只暂存本次改动文件后重跑」证明**与本文无关**（失败原因完全相同），
来源是并行进行中的 `MinutesAiInputPanel.tsx` / `MinutesForm.tsx` 在途编辑。
**未使用 `--update` 把他人技术债洗成基线。** 后续该两项已自行转绿。
