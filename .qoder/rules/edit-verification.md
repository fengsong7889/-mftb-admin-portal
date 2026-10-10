---
description: 编辑后验证规则（分级影响域验证）。每次代码编辑完成后，按 L0/L1/L2 三档执行对应验证命令；共享层改动或提交/推送前必须全量。
globs:
  - "src/**/*.{ts,tsx}"
  - "backend/**/*.java"
alwaysApply: false
---

# 编辑后验证：分级影响域（L0 / L1 / L2）

> 核心原则：**验证范围必须匹配改动的影响范围**。全量门禁不删除，只是从"每次编辑后"
> 移到"共享层改动 / 提交推送前 / CI"。CI（`deploy.yml`、`backend-docker.yml`）始终全量，
> 本地分级不会降低最终质量门禁。

## 档位定义

### L0 — 编辑期即时检查（秒级，每次编辑后必做）

只 lint 变更文件 + 增量类型检查，**不跑测试**：

```bash
npm run verify:quick                       # = node scripts/affected-tests.mjs --run --lint-only
# 等价手工命令：
npx eslint <变更的 .ts/.tsx 文件>
npx tsc --noEmit                           # tsconfig 已开 incremental，命中缓存时远快于全量
```

后端改动只做编译：`cd backend && mvn compile -q`

> `tsc` 已开 `incremental`（缓存在 `tsconfig.tsbuildinfo`，已 gitignore）。
> 若怀疑缓存异常（删文件、改过 `tsconfig.json`、拉了大分支），先
> `rm tsconfig.tsbuildinfo` 再做一次全量 typecheck。

### L1 — 影响域验证（日常主档位，交付"这个功能改完了"之前必做）

用依赖图算出受影响的测试，只跑这些：

```bash
# 分析（不执行）：打印受影响测试文件 + 推荐命令
npm run check:affected

# 分析并执行（lint + typecheck + 受影响前端测试 + 受影响后端测试类）
npm run test:affected

# 只跑影响域内后端
node scripts/affected-tests.mjs --skip-lint --skip-typecheck

# 精确指定本次编辑的文件（比 git diff 更准，AI 每次改完推荐用这个）
node scripts/affected-tests.mjs --run --files src/pages/Xxx/foo.ts,src/api/foo.ts
```

影响域规则（由 `scripts/affected-tests.mjs` 实现）：

- **前端**：静态 import 图（含 `@/` 别名、动态 `import()`、`vi.mock()`）反向扩散。
  改了被多个系统共用的 `src/api/*.ts`，所有间接引用它的页面测试都会入选；
  不相关系统的测试不会跑。
- **后端**：Java 类名共现图反向扩散 2 跳，映射到 `*Test` 类，转成
  `mvn test -B -Dtest='A,B,C' -Dsurefire.failIfNoSpecifiedTests=false`。
- **扩散失控自动升档**：命中比例超过 60%（`--max-ratio` 可调）或被过多文件引用
  （如 entity/util）→ 自动升级为 L2 全量。

### L2 — 全量门禁（提交/推送前必做；CI 兜底）

```bash
npm run verify        # lint + typecheck + check:menu + secret-scan + 全量 vitest
cd backend && mvn test -B
```

## 强制升档到 L2 的触发条件（命中任一即不得只用 L1）

| 触发条件 | 具体范围 |
|---|---|
| 提交 / 推送 / 部署前 | 任何档位改动收尾时 |
| 前端共享/契约层 | `src/App.tsx`、`src/main.tsx`、`src/api/request*`、`src/components/**`、`src/constants/**`、`src/contexts/**`、`src/hooks/**`、`src/i18n/**`、`src/styles/**`、`src/utils/**`、`src/test/**`、`src/pages/_shared/**` |
| 前端工程配置 | `package.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`eslint.config.js`、`index.html` |
| 后端共享/契约层 | `common/**`、`config/**`、`aspect/**`、`util/**`、`constant/**`、`mapper/**`、`entity/**`、`SecurityTestBase.java` |
| 后端配置与数据库 | `backend/pom.xml`、`application*.yml`、`db/migrations/**`、`backend/sql/**` |
| 工程链路 | `scripts/**`、`.github/**`、`.qoder/rules/**`、`AGENTS.md` |
| 业务判定 | 菜单/权限（`sys_menu`、`menuDataSource.ts`、`portalSystems.ts`）、数据字典枚举、金额/配额计算 |

脚本已把这些规则内置（`GLOBAL_FE` / `GLOBAL_BE` / `GLOBAL_BOTH`），命中即自动输出 FULL，
不需要人工判断。**禁止用 `--max-ratio 1` 之类手段绕过升档。**

## 界面纯样式改动的特例（配合「高效开发模式」第一阶段）

纯 UI（仅 TSX 结构/inline style/CSS 类名，无业务逻辑、无 i18n、无后端）：

- 必做：L0（变更文件 eslint + 增量 typecheck）
- 免做：L1 的 vitest（除非该页面本身有渲染用例且改动了交互逻辑）
- 补做：用户确认界面后进入第二阶段时，统一执行 L1，收尾执行 L2

## 失败处理

任一档验证失败必须修复，不得忽略、不得跳过、不得改小测试断言来"变绿"。
偶发超时先看 `vitest.config.ts` 的 `maxForks`（低配机器内存不足会造成"慢=超时"假红），
可用 `VITEST_MAX_FORKS=1 npm run test:affected` 串行复现确认，而不是直接放大超时。

## 例外登记

若确有理由跳过 L2（如紧急热修），必须在提交说明与 PR 描述中记录：原因、风险、
补偿措施（何时补跑全量）、负责人、到期时间；需长期保留时写入 `docs/` 下可版本控制的文档
（`.qoder/` 除 `rules/` 外均不入库，不得作为登记处）。
