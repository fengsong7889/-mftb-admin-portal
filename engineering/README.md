# engineering/ — 工程归属登记表

> 产物来源：`docs/design/分系统独立工程改造_63bd100a.md` §4.1 与 P0 验收项
> 「建立系统、文件、表、任务和测试归属清单，检测重叠、遗漏、循环与跨事务写入」。

## 这里放什么

| 文件 | 作用 |
|---|---|
| `systems.json` | 系统 → 前端页面目录 / 后端类名前缀 / 隔离状态的登记表（含显式未归属清单） |
| `generate-systems.py` | 登记表生成器：派生部分自动重算，人工映射在脚本内维护 |
| `probe-menu-system.py` | 只读刷新 `menu-system-snapshot.json`（从 `sys_menu` 取 `system_code`） |
| `menu-system-snapshot.json` | 菜单归属快照（不含凭据），使生成可在干净 checkout 上复现 |

## 归属是怎么算出来的

1. `sys_menu.system_code`（DB 快照）给出**菜单 key → 系统**；
2. `src/constants/menuDataSource.ts` 的 `keyToPath` 给出**菜单 key → 路由**；
3. `src/App.tsx` 的 `<Route path element>` 给出**路由 → 页面目录**（v1 曾用目录名猜测，命中率极低，已废弃）；
4. 三者连接得到「页面目录 → 系统」，再由脚本内的人工映射补齐非菜单直达的子页面目录与后端类名前缀；
5. 既没被派生命中、也没被人工登记的，一律进 `unattributed`，**显式承认未归属，而不是假装分完**。

## 怎么维护

```bash
# 新增/删除页面目录、重命名后端类前缀后：
python3 engineering/generate-systems.py
npm run check:registry            # 门禁：漂移会失败并指出该重跑哪条命令

# 菜单系统归属发生变化（改了 sys_menu）时，先刷新快照再重新生成：
python3 engineering/probe-menu-system.py   # 需要 backend/.env.local 的只读库连接
python3 engineering/generate-systems.py
```

## 门禁规则（`scripts/check-engineering-registry.mjs`）

- **C1** 每个 `src/pages/*` 目录必须有归属：公共层 / 唯一系统 / 已登记的多系统共享 / 显式未归属。
- **C2** 登记表里出现的目录必须仍然存在（防止清单腐化成「看着通过其实什么都不管」）。
- **C3** 多系统共享目录必须逐条写明处置方式（当前：`Permission`、`Hcm`、`LoginLog`）。
- **C4** `isolation=isolated` 必须有真实的 `frontend/apps/<code>/{package.json,tsconfig.json}` 或
  `backend/modules/<code>/pom.xml` —— **不允许只在文档里声称已独立**。本期全部为 `pending`。
- **C5** 后端类名前缀双向棘轮：新增未登记的前缀会失败，登记了但代码里已消失的前缀同样失败。

## 与依赖边界门禁的关系

`npm run check:boundary`（`scripts/check-boundary.mjs` + `scripts/boundary-baseline.json`）管的是
**包依赖方向**：contracts / i18n 为叶子，platform-client 只依赖二者，ui 可依赖前三者，
legacy（仓库根 `src/`）可依赖所有包；任何包不得反向依赖 legacy 业务页面。
本目录管的是**归属**：某个目录属于哪个系统、是否已独立。两者一起构成 P2 拆应用的前置约束。

共享层的物理位置（2026-10-26 拆包后）：

| 旧路径 | 现位置 |
|---|---|
| `src/contracts/`、`src/constants/` | `frontend/packages/contracts/src/` |
| `src/i18n/` | `frontend/packages/i18n/src/` |
| `src/api/`、`src/contexts/`、`src/utils/` | `frontend/packages/platform-client/src/` |
| `src/components/`、`src/hooks/`、`src/styles/`、`src/assets/` | `frontend/packages/ui/src/` |

消费方仍写 `@/api/…`、`@/components/…` 等旧别名（tsconfig / vite / vitest 三处重指向），
因此归属表里的前端目录只登记 `src/pages/*`；包内文件不参与系统归属。
