# 原生方案文档管理系统 — 进度交接（2026-10-23）

> 本文只记录**实际完成与未完成**，避免接手人把原型预览当成可上线能力。
> 工作区同时存在并行的「企业 Agent 平台」任务，边界见第六节。

## 一、当前状态一句话

**接手主线已开发完毕且本机全量转绿：后端 `mvn test` 2433 项、前端 `npm run verify` 138 文件 / 1254 项均通过；菜单、真实读写页面（新建/编辑/确认/交接/执行/收窄 ACL/回收站/导出/审计）、空间与成员治理、集成凭据签发撤销、零依赖 MCP 适配器均已落地；当前远程测试库 10 表与菜单已迁移，真实 MySQL 集成测试 6/7 通过（1 项因无第二个 doc 授权账号跳过）。剩余仅干净库重放、双人浏览器验收、MCP 真实 IDE 联调与生产发布。**

### 1.1 原重构方案已找回

原方案标题为《文档中心重构与方案资产管理落地方案》，文件位于：
`/Users/yangjingjing/Library/Application Support/Qoder/SharedClientCache/cache/plans/文档中心_方案管理_重构落地_7bb1dba3.md`。

范围仍按原方案执行：保留腾讯外链和稳定 ID；原生正文、版本、确认、资源权限共用底座；不另建 RDM 审批与交付事实源。本文为进度，不替代原方案。

### 1.2 接手新增与修正

| 区域 | 本批实际结果 |
|------|-------------|
| 菜单与导航 | `App.tsx` 注册 `/doc-plans`、`/doc-plans/detail`、`/doc-governance`；`menuDataSource.ts`、`Permission/types.ts`、`Sidebar.tsx` 补映射/动作/离线阻断/图标，`MenuTabs.tsx` 补详情独立标题 |
| 真实只读 API | 新增 `src/api/docNative.ts`：列表、当前授权版本、固定修订读取；校验 ID、响应文档归属与修订号；适配 Jackson `non_null` 及毫秒时间戳 |
| 页面 | 新增 `DocPlans.tsx`、`DocPlanDetail.tsx`、`useDocNativeLoad.ts`；不复用 mock，失败不切换版本 |
| 写操作页面 | `DocPlanEdit`（新建/编辑；幂等键跟随内容版本，409 只提示重新载入）、`DocPlanConfirm`（提交/决策；退回必填原因）、`DocPlanHandoff`（发起/接收，绑定采用版本）、`DocPlanAcl`（收窄名单）、`DocPlanExecution`（合法状态转移与证据） |
| 空间与凭据治理 | `DocGovernance` 空间列表/新建 + 集成凭据签发/撤销/一次性明文展示；`DocGovernanceMembers` 用 `EmployeeSelect` 单选 + 位集 1/3/5/7/15，移除前二次确认 |
| ACL 回显接口 | 新增 `GET /api/doc/v2/documents/{id}/acl`（仅编辑者或空间管理员；集成身份 403），避免前端盲写覆盖他人名单 |
| 幂等回执修复 | 库内 JSON 改用专用 `ObjectMapper`（JSR-310、非时间戳），修复同键重放 500；真实库测试验证 |
| 真实库集成测试 | `DocNativeIntegrationTest`：幂等、并发单写、版本冲突、确认冻结/生效、执行跳级、令牌限流/撤销/过期/跨空间、机器审批阻断；7 项，6 通过 1 跳过 |
| MCP 适配器 | `mcp/doc-native-mcp/`（零依赖、Node 20、STDIO JSON-RPC）：`doc_search`、`doc_get`、`doc_create_draft`、`doc_save_revision`、`doc_get_save_receipt`、`doc_get_handoff_context` |
| 正文安全 | 本批只展示精确 Markdown 原文，不执行 HTML、不自动加载远程图片；后续富文本预览仍按原方案实施 |
| 国际化 | 本批真实页面新增 `docNative` 命名空间，繁中/英文同步；预览页的后续 i18n 工作未冒称完成 |
| 安全链启动修复 | `SecurityConfig` 将集成过滤器顺序锚点改为 JWT Bean 实际类，兼容 `@Lazy` 代理；保留 JWT → 集成认证的顺序。此前全量测试出现 130 项上下文错误，修复后全量通过 |
| Repository 代理修复 | `DocNativeStore.jdbc` 改为私有字段，五个服务的 30 处访问改走 `jdbc()`；避免直接读取 CGLIB 代理空字段导致所有原生查询/写入失败。新增真实代理包装下的搜索与成员读取回归 |
| 后端测试 | 新增 `DocNativeServiceTest`（28）、`DocNativeSpaceServiceTest`（4）、`DocIntegrationGrantServiceTest`（9）、`DocIntegrationAuthenticationFilterTest`（18）、`DocNativeSecurityTest`（4），共 63 项，doc 域目标测试全部通过 |
| 前端测试 | 新增 `DocNativeRoutes.test.tsx`（31）、`DocPlanActions.test.tsx`（5）；拓展菜单、路由守卫、ACL/凭据契约测试 |

### 1.3 最新实测与未验证边界

- 静态门禁（新增 5 条子路由与 200+ i18n 键后复跑）：`check:menu` 通过；`check:i18n` 通过（引用完整、无新增硬编码）；`check:confirm-modal` 通过（271 处）；`check:stat-order` 通过（157 页）；变更文件 eslint 0 error；增量 `tsc` 通过；`secret-scan` 914 文件无硬编码凭据。
- **后端全量通过**（本机，不注入 `DB_URL`，与 CI 口径一致）：`mvn -o clean test -B` → **2433 项，0 failure / 0 error / 14 skipped，BUILD SUCCESS**（耗时 1:38）。条件型真实库用例按预期跳过。
- **前端全量通过**（本机）：`npm run verify` 全链路（lint、typecheck、menu、stat-order、confirm-modal、i18n、secret-scan、全量 vitest）→ **138 个测试文件 / 1254 项全部通过**（196s）。
- 早期默认并发下的超时问题已不再复现；现未修改测试配置或放宽断言。
- 真实 MySQL 集成测试：`mvn clean test -Dtest=DocNativeIntegrationTest`（注入 `backend/.env.local`）最终 7 项、0 failure / 0 error / 1 skipped、BUILD SUCCESS。首次失败暴露了两个真实缺陷：幂等回执用 Spring 时间戳序列化导致重放 500；测试清理顺序漏删审计行。两者均已修复。
- 后端 doc 域目标测试（非全量）：`mvn -o test -Dtest='DocNativeSpaceServiceTest,DocNativeServiceTest,DocNativeSecurityTest,DocIntegrationGrantServiceTest,DocIntegrationAuthenticationFilterTest'` → 63 项，0 failure / 0 error，BUILD SUCCESS。新增 `DocNativeSpaceServiceTest` 覆盖 ACL 回显（编辑器/空间管理员/普通读者/集成身份）。
- MCP 适配器 `node --test test/server.test.mjs`：9/9 通过（凭据格式/明文 http 拒绝、幂等键强制、工具面黑名单、回执路径、JSON-RPC 握手与错误）。
- 服务状态：本机网络/DNS 从 2026-10-24 08:37 起中断（`mysql3.sqlpub.com` 与公共域名均无法解析），后端无法连接数据库；16:48 已重新打包 `target/mftb-admin.jar`（含 P0 知识库、密级授权、制度签收、`effective_from` 补列及 `292/293/294` 迁移资源）。当前已启动（PID 37341，`live/ready=200`）；本机默认 DNS 仍不解析 `mysql3.sqlpub.com`，本次用解析 IP 临时启动，详见 14.3 环境注记。
- **MCP 真实后端端到端通过**（临时脚本 `.local/doc_mcp_e2e.py` + `.local/doc_mcp_e2e.mjs`，不属仓库）：临时空间+集成凭据（库内仅 SHA-256）→ stdio 启动适配器 → `initialize`/`tools/list`（6 工具）→ `doc_create_draft` 生成 `PLAN-2026-000022`（1 个修订、1 条 `CREATE_DRAFT` 审计）→ `doc_get_save_receipt` 回执一致 → `doc_search` 命中 1 → `doc_get` 标题正确；回执 `contentHash` 与库内 `doc_revision.content_hash` 一致；未暴露的 `doc_approve` 在适配器层被拒；直接用同一令牌请求审批/导出/签发/删除均 **403**；适配器 stderr 不含令牌。结束后清理：临时空间/文档/凭据/回执行均为 0。
- 浏览器复核尝试：Vite dev 已启动但原登录会话已过期，跳转 `/#/login`；未使用任何凭据，因此本轮未做新增页面的浏览器链路，留待独立机器登录后执行。
- **已知阻塞已解除**：并行企业 Agent 任务曾因构造器改动未同步测试导致 test-compile 失败；现已修复，`mvn -o test-compile`、`--rebuild` 与全量 `mvn test` 均恢复可用。
- **升级前只读预检**：远程 MySQL 8.4 中两个原生迁移版本、原生表和新菜单均为 0；原交接“菜单种子已入库”在接手时不成立。随后用户明确选择“使用当前远程测试库”，授权迁移及重建。
- **已执行迁移与重启**：首次 `--rebuild`（编译 48s、启动 156s），再 `--fast`（160s）验证重复启动；代理字段修复后再次 `--rebuild`。最终 `live=200`、`ready=200`，76 项结构契约通过，运行 PID 为 67956。
- **数据库三方实查通过**：`doc:native-content-v2.0` 于 23:23:27、`doc:native-menu-v2.0` 于 23:23:33 首次 SUCCESS；后续重启时间戳未变，审计各只有 1 次 SUCCESS。10/10 表、22 个外键、7 个 CHECK、10 个主键及 5 个额外唯一索引、ngram FULLTEXT 均就绪。菜单 ID 稳定为 `doc-plans=2013`、`doc-governance=2014`，管理员动作分别为 `view/edit/confirm/export` 与 `view`。
- **浏览器四项只读冒烟完成**：列表真实请求成功并显示空态，无 mock；非法修订链接被前端拒绝且不发详情请求；合法格式链接进入方案版本详情并请求固定修订端点（无测试文档，返回资源不存在）；治理入口可读。**本轮新增写入/治理页面尚未做浏览器全链路，按用户要求留待独立机器。**
- 重复启动期间曾出现一次 `SysMenuMapper` 查询读超时；后续菜单树请求恢复 200。最终代理修复重启后的日志未出现 Doc Native 系统异常；初始化后的只读列表已成功。
- 本批未提交、未发布，企业 Agent 平台并行改动未纳入编辑或回滚。

验证日志（本机 `.local/`，不入 Git）：`doc-native-gates-final-20261023.log`、`doc-native-vitest-limited-20261023.log`、`doc-native-backend-proxy-final.log`（最新全量）、`doc-native-restart-20261023.log`、`doc-native-replay-20261023.log`、`doc-native-proxy-restart.log`。数据库前后快照：`doc-native-db-first.log` / `doc-native-db-second.log` / `doc-native-db-final.log`；只读核查脚本：`.local/doc_native_precheck.py`。

---

## 二、总体架构与权限模型

```
doc_node (稳定身份，腾讯外链沿用)
  └── doc_native_document (原生扩展表，一对一，旧接口 notInSql 排除)
        ├── doc_revision (不可变修订，追加式，ngram 全文索引)
        ├── doc_document_acl (收窄授权，1/3)
        ├── doc_confirmation (精确版本确认 1待/2通过/3退回/4撤回)
        ├── doc_handoff (版本交接 1待接收/2已接收)
        └── doc_audit_event (追加式审计，仅 INSERT)

doc_space → doc_space_access (原生空间配置) → doc_space_member (权限位集 1/3/5/7/15)
doc_integration_grant (docint_ 令牌，仅存 SHA-256，120 次/分钟)
doc_ingest_request (幂等回执，actor+key+request_hash)
```

**权限四层取交集**：菜单准入 → 空间位集(READ=1/EDIT=2/CONFIRM=4/MANAGE=8) → 文档收窄 ACL → 版本可见性。

**注解不等于边界**（接手必读）：
| 场景 | 注解门禁 | 服务层真实要求 |
|------|---------|---------------|
| 绝大多数 `/api/doc/v2/*` | `doc-plans` + 动作 | 同名 `documentMenu` + 空间位集 + 资源归属 |
| `POST /spaces` | `doc-space:edit` | 人类身份，新建私有空间并授予创建者管理位集 |
| 成员写入/移除 | `doc-space:edit` | **`doc-space:edit` + 当前空间 MANAGE** |
| 治理页 `/grants` | `doc-plans:edit` | 本人持有、空间权限 |
| `doc-governance` 菜单 | 仅前端页面准入 | 当前无接口绑定该菜单 key |

> 风险：`verifyNativeMenus()` 只校验菜单存在，不校验动作授权；`doc-governance` 只授予 `view`。

---

## 三、已完成

### 3.1 前端隔离预览（doc-ui-a1 ~ a4，COMPLETE）

| 文件（`src/pages/DocCenter/preview/`） | 说明 |
|------|------|
| `DocCenterPreview.tsx` | 隔离预览主入口，12 个页面视图 |
| `PlanLibraryPreview.tsx` | 方案列表（搜索、统计卡、状态筛选、含历史选项） |
| `PlanDocumentPreview.tsx` | 正文阅读/编辑/版本对比，纯文本渲染不执行 HTML |
| `PlanFormsPreview.tsx` | 确认/交接/回收站表单 |
| `DocGovernancePreview.tsx` | 空间治理/AI 接入/备份，明确标注未接入 |
| `PreviewPrimitives.tsx` / `previewActions.tsx` / `preview.css` | 原子组件、操作逻辑、样式 |
| `previewData.ts` | 8 笔演示数据，纯 mock，不触真实接口 |
| `DocCenterPreview.test.tsx` | **13 项测试全部通过** |

入口：`/doc-center?preview=plans`（仅 `import.meta.env.DEV` 可见，生产环境 query 不生效）。

### 3.2 数据库迁移

| 文件 | 说明 |
|------|------|
| `backend/src/main/resources/290_doc_native_content.sql` | 10 张表 DDL，含外键、CHECK、FULLTEXT(ngram) |
| `backend/src/main/resources/db/migrations/catalog.json` | **新增两个条目**：`doc:native-content-v2.0`（依赖 `doc:schema:v1.0`）、`doc:native-menu-v2.0`（依赖前者 + `doc:menu:v1.3`） |

10 张表：`doc_space_access`、`doc_space_member`、`doc_native_document`、`doc_revision`、`doc_document_acl`、
`doc_confirmation`、`doc_handoff`、`doc_audit_event`、`doc_ingest_request`、`doc_integration_grant`。

### 3.3 后端代码（doc-api-b1 主体）

DTO：`backend/src/main/java/com/mftb/admin/dto/DocNativeDTO.java`（21 个 record/class）。

Service（`backend/src/main/java/com/mftb/admin/service/doc/`，8 类）：
| 文件 | 职责 |
|------|------|
| `DocNativeStore.java` | 固定 SQL 数据访问、行锁、审计、版本自增 |
| `DocNativeAccess.java` | 四级权限判定、集成身份判定、`human()` 阻断 |
| `DocContentValidation.java` | 2 MiB 限制、凭据模式检测、SHA-256、JSON 编解码 |
| `DocNativeService.java` | 创建/保存/搜索/阅读/回收站/幂等回执 |
| `DocNativeSpaceService.java` | 空间、成员、文档 ACL |
| `DocNativeWorkflowService.java` | 确认提交/决策、交接创建/接收、执行状态机 |
| `DocIntegrationGrantService.java` | 签发/撤销/认证/限速 |
| `DocIntegrationAuthentication.java` | 独立认证类型，机器不可审批 |

Controller：`DocNativeController.java`，**24 个端点**（`/api/doc/v2/*`）：文档列表/详情/固定版本/创建/保存/回执、
确认提交/决策、交接创建/接收、执行、回收站/恢复、ACL、审计、导出、空间列表/创建/成员增删改、凭据列表/签发/撤销。

### 3.4 菜单种子与迁移注册（当前远程测试库已执行并复验）

`DocSchemaMigrationInitializer.java` 新增：
- `doNativeMenus()` / `verifyNativeMenus()`，版本键 `doc:native-menu-v2.0`；
- 菜单 `doc-plans`「方案管理」→ `/doc-plans`，动作 `view/edit/confirm/export`；
- 菜单 `doc-governance`「治理與集成」→ `/doc-governance`，动作 `view`；
- 调整 `doc-library/doc-learning/doc-stats/doc-space` 排序为 2/3/4/5；
- admin 角色授权、`deriveSystemAccess()`、`permissionService.evictAll()`。
- 无内容迁移、无数据搬运，旧方案保持只读不变。

### 3.5 安全集成与向后兼容

| 文件 | 改动 |
|------|------|
| `DocNativeSchema.java`（新） | DDL 解析 + 迁移 + 列/约束/全文索引契约验证 |
| `DocIntegrationAuthenticationFilter.java`（新） | 白名单方法/路径、3 MiB 拦截、`no-store` |
| `ContractRegistry.java` | 注册 DocNativeSchema 契约 |
| `SecurityConfig.java` | JWT 过滤器之后挂集成认证过滤器 |
| `JwtAuthenticationFilter.java` | `docint_` 前缀跳过 JWT |
| `DocService.java` | 5 个查询位置共 8 处 `notInSql`，排除原生文档/私有空间 |
| `DocLearningService.java` | 2 个查询位置共 4 处 `notInSql` |
| `src/pages/DocCenter/index.tsx` | 新增 DEV 预览入口与提示横幅 |

导出接口强制 `access.human()`；集成令牌不能审批、不能导出、不能越空间。

---

## 四、首次交接验证快照（最新接手结果见第一节）

| 项目 | 结果 |
|------|------|
| 后端 `mvn compile -q -o`（JDK 17） | ✅ EXIT=0 |
| 后端 `mvn test-compile -q -o` | ✅ EXIT=0 |
| 前端 `tsc --noEmit`（typecheck） | ✅ 通过 |
| 前端 preview 测试 | ✅ 13/13 通过 |
| `check:stat-order` | ✅ 通过（156 页） |
| `check:confirm-modal` | ✅ 通过（260 处） |
| `check:i18n` | ✅ 通过（doc 域未纳入基线，见 P3） |
| `secret-scan` | ✅ 901 文件无硬编码凭据 |
| **`check:menu`** | **❌ 失败 10 项，全部为本模块菜单** |
| 后端 doc 域单元测试 | ❌ 0 条（`backend/src/test` 下无 doc 目录/文件） |
| 数据库迁移执行 | ⏸ 未执行（需真实 DB） |
| 浏览器端到端验收 | ⏸ 未做 |
| `npm run verify` | ❌ 会在 `check:menu` 中断 |

---

## 五、未完成与阻塞项（按优先级）

### P0-1 菜单一致性（本批已修复，0 失败）

| 登记项 | 实际修复位置 |
|--------|---------|
| `CONTROLLED_MENU_KEYS`、`ROUTE_MENU_KEY_MAP`、`MENU_ACTIONS_MAP` | `src/pages/Permission/types.ts`（并非 `App.tsx`） |
| 三条新页面路由与懒加载 | `src/App.tsx` |
| `keyToPath`、`pathToKey`、`BACKEND_CONNECTED_KEYS` | `src/constants/menuDataSource.ts` |
| `FileTextOutlined` / `SafetyCertificateOutlined` 兜底图标 | `src/components/Sidebar.tsx` 的 `keyToIcon` |
| 详情独立页签标题 | `src/components/MenuTabs.tsx` 的 `SUB_PAGE_FULL_TITLE` |

动作仍与后端种子一致：方案 `view/edit/confirm/export`，治理仅 `view`；不扩大任何资源权限。

### P0-2 回执落地页（代码与组件回归已补齐）

`/doc-plans/detail?id={id}&revision={revisionId}` 已注册，并读取 `/api/doc/v2/documents/{id}/revisions/{revisionId}`。
非法/重复版本参数直接阻断；错版本、失败响应不会回退为当前版本。只持方案菜单权不必另持文档库菜单权。
应用使用 HashRouter，浏览器地址为 `/#/doc-plans/detail?...`；MCP 适配器展示可点击链接时须结合部署 base 与 hash 路由。
新本地服务已部署并恢复真实空列表。浏览器已核验详情入口与固定修订请求；缺少授权样本文档，保存回执与正文 hash 的完整端到端验收仍待完成。

### P1-1 数据库迁移执行与契约验证

用户已确认当前远程库是本次允许迁移的测试目标，两个原生版本已执行，10 表/两条菜单及契约验证均通过，重复启动未产生额外版本或菜单。
已交叉核对 `sys_schema_version`、`sys_schema_migration_log` 与实际结构，详见第一节。**独立干净库升级与业务数据并发/恢复演练仍待完成**，不能把存量测试库重复启动等同于全部迁移验收。

### P1-2 后端测试（本批 63+7 项通过，真实库集成已完成）

已补权限、幂等回放、版本冲突、工作流分支、集成范围与 HTTP 安全链测试，文件和计数见第一节。
真实 MySQL 集成测试 `DocNativeIntegrationTest` 覆盖：
- 幂等回执（同键同内容复用、同键异内容 409、重放仍重校权限）；
- 乐观锁并发（两线程同 `expectedVersion` 仅一个成功，另一个 409）；
- 工作流状态机（待确认冻结编辑、确认生效不改执行基线、执行不可跳级）；
- 集成令牌（120 次/分钟限流、撤销、过期、跨空间 403、机器不可审批）。

**未覆盖**：交接接收（库内无第二个已开通 doc 系统的账号，测试按 `assumeTrue` 跳过）；交接创建/接收分支由 Mockito 单测覆盖。

### P2-1 前端接通真实 API（已完成）

`src/api/docNative.ts` 已接通：列表/当前版本/固定修订、创建/保存（`Idempotency-Key` + `expectedVersion`）、提交确认/决策、交接创建/接收、执行状态、回收站/恢复、ACL 读取/保存、审计、Markdown 导出与 JSON 清单导出（Blob）、空间/成员、集成凭据。
页面覆盖新建/编辑/确认/交接/执行/ACL/治理/成员；409 统一提示并重新载入，禁止静默覆盖。
后端 ACL 回显接口为本轮新增；`/api/doc/v2` 现共 25 个端点。

### P2-2 AI 入库端到端（适配器已完成，真实 IDE 联调待做）

`mcp/doc-native-mcp/` 为第一版 STDIO 适配器（零依赖，避免新增第三方依赖）：
```bash
DOC_NATIVE_BASE_URL=https://<host> DOC_NATIVE_TOKEN=docint_xxx node mcp/doc-native-mcp/src/cli.mjs
```
- 凭据只从环境变量读，不写日志/URL；明文 http 仅限 localhost；禁止重定向；
- 工具面仅 6 个：搜索、读、建草稿、存修订、查回执、读交接上下文；无发布/审批/改权限/导出；
- 写工具强制显式 `idempotencyKey` 与 `sourceSessionKey`，客户端不自动生成，避免重复草稿；
- 后端仍有第二道闸：`DocIntegrationAuthentication` 在 `human()` 处永远 403。

**未完成**：真实 IDE 客户端接入（需先由管理员在治理页签发凭据）与实际生成→归档链路验收；不能仅凭适配器单测宣称 AI 已能入库。

### P3 i18n 登记

本轮新增的写操作、治理、凭据、ACL、执行页面全部使用 `docNative.*` 键，繁中/英文同步（`docNative` 共 223 个顶层键 / 233 个叶子键）。
预览页仍未迁入 i18n（`previewData.ts` 标注第二阶段）；预览仅 DEV 可进，不影响生产编译。

---

## 六、工作区边界（重要）

`git status` 中的以下改动属于**并行的「企业 Agent 平台」任务**，与本模块无关，**勿一起提交或回滚**：

- `AgentGatewayController.java`、`AgentOrchestrationService.java`、`AiToolVisibility.java`、
  `ConversationSummaryService.java`、`AiToolPolicyServiceImpl.java`、`McpExecServiceImpl.java`、
  `AiModelAdmissionService.java`（新）及对应测试；
- `src/pages/AiAssistant/OverviewPage.tsx`、`src/pages/AiAssistant/preview/`（新）；
- `docs/Enterprise_Agent_Platform_Progress_2026-10-23.md`（新，已有独立交接）。

> 另注：该文档已记录 `check:menu` 失败来自本模块，与第四节结论一致。

---

## 七、接手第一步

```bash
# 0. 前置：确认 backend/.env.local 已配置 DB_URL/DB_USERNAME/DB_PASSWORD/JWT_SECRET
cd /Users/yangjingjing/Desktop/SARY/backend
export JAVA_HOME=/Users/yangjingjing/Desktop/SARY/.local/jdk-17.0.2.jdk/Contents/Home
MVN=/Users/yangjingjing/Desktop/SARY/.local/apache-maven-3.9.6/bin/mvn

# 1. 编译基线（已实测通过，用于确认环境一致）
$MVN compile -q -o && $MVN test-compile -q -o

# 2. 源码变更后的重建（本批已获当前测试库授权并执行；其他环境需重新确认）
bash restart-service.sh --rebuild
bash restart-service.sh --status

# 3. 核对数据库（库名/账号以 .env.local 为准）
mysql -e "SELECT version_key,applied_at FROM sys_schema_version WHERE version_key LIKE 'doc:native-%';"
mysql -e "SELECT version_key,status,created_at FROM sys_schema_migration_log WHERE version_key LIKE 'doc:native-%' ORDER BY id DESC;"
mysql -e "SHOW TABLES LIKE 'doc\_%';"

# 4. 前端门禁（顺序同 npm run verify）
cd ..
npm run lint && npm run typecheck && npm run check:menu   # 本批均已通过

# 5. 继续执行静态门禁与回归
npm run check:stat-order && npm run check:confirm-modal && npm run check:i18n && npm run secret-scan
npm run test:run -- --maxWorkers=2
# 后端全量测试前不要加载真实库环境，避免触发共享库条件测试。
```

---

## 八、回滚方案

| 层 | 方式 |
|----|------|
| 代码 | 本批未提交时仅逆向撤销本批补丁；保留接手时已有 Doc Native 与企业 Agent 平台改动。形成独立提交后才按提交回滚。兼容服务仍须保留新内容过滤与权限边界 |
| 数据库 | 保留 10 张新增表及已保存内容；通过兼容版本关闭新写入口，不以删表、删列或清除迁移版本回滚。旧接口的原生内容过滤仍须保留 |
| 菜单 | 需要收回入口时通过独立版本化迁移停用新菜单并处理授权，保留菜单 ID；不手工删除远程菜单，恢复旧排序也须留迁移记录 |
| 配置 | 通过既有受控接口撤销集成凭据并关闭新写入口；不移除鉴权、审计、资源权限和原生内容隔离，不恢复缺少这些边界的旧服务 |

---

## 九、完成定义（DoD）

- [x] `npm run verify` 全绿（138 文件 / 1254 项，含 `check:menu` 0 失败）
- [x] 后端全量 `mvn test` 通过（2433 项，0 failure / 0 error）
- [x] 当前远程存量测试库迁移、契约与重复启动验证通过
- [ ] 独立干净库重放及恢复演练
- [x] 后端 doc 域单测 63 项、全量 2433 项均通过
- [x] 真实 MySQL 集成测试 6/7 通过（交接接收因无第二个 doc 授权账号跳过）
- [x] 新建/编辑/确认/交接/执行/ACL/回收站/导出/审计页面与路由锚点
- [x] 空间、成员、集成凭据治理
- [x] MCP 适配器仅暴露草稿与只读能力，9 项单测通过
- [x] AI 写入仅产生草稿、回执可核验、审批/导出/签发/删除均 403（真实后端 + 临时凭据验收）
- [ ] 真实 IDE 客户端接入 MCP
- [ ] 双人浏览器验收：创建→保存→确认→生效→交接→接收→回收站恢复
- [x] 正式页面 i18n 登记完成（`docNative` 233 个叶子键双语同步；预览页仍待第二阶段）
- [x] Markdown + JSON 清单导出（清单不含正文/凭据/ACL/审计）

---

## 十、剩余待办（需要独立环境）

1. **干净库重放**：需要一个**独立的空库**（当前账号仅对 `fengsong` 库有权限，不能自建 schema，也不能在共享库上清表）。在空库执行全部迁移，确认两个原生版本首次执行、10 表/约束/ngram 与菜单就绪，再重复启动一次验证不变更。
2. **真实 MySQL 集成（含交接接收）**：注入测试库 `DB_URL` 跑 `mvn test -Dtest=DocNativeIntegrationTest`；交接接收需先授予第二个账号 doc 系统准入。
3. **浏览器全链路**：管理员逐项走新建空间→新建方案→编辑保存→提交确认→确认生效→登记执行→收窄 ACL→交接创建→（第二账号）接收→回收站→恢复→导出→审计。
4. **MCP 真实 IDE 联调**：治理页签发凭据（明文只显示一次）→在 IDE 配置 `DOC_NATIVE_BASE_URL`/`DOC_NATIVE_TOKEN` →调用 `doc_create_draft` 与 `doc_get_save_receipt`；验收后立即撤销并轮换凭据。
5. **生产发布**：后端镜像构建/滚动更新、`/api/health/ready` 验收、前端发布；发布前确认 `SCHEMA_STRICT=true` 与备份策略。
6. **待后端补齐**：备份状态/审计导出接口、模板与到期复核/离职接管（方案阶段二 B），当前治理页已明确标注未接入。

---

## 十一、文件清单

**新建（23）**
- `backend/src/main/resources/290_doc_native_content.sql`
- `backend/src/main/java/com/mftb/admin/dto/DocNativeDTO.java`
- `backend/src/main/java/com/mftb/admin/config/DocNativeSchema.java`
- `backend/src/main/java/com/mftb/admin/config/DocIntegrationAuthenticationFilter.java`
- `backend/src/main/java/com/mftb/admin/controller/DocNativeController.java`
- `backend/src/main/java/com/mftb/admin/service/doc/` 下 8 个类（见 3.3）
- `src/pages/DocCenter/preview/` 下 10 个文件（见 3.1）

**修改（8）**
- `DocSchemaMigrationInitializer.java`（原生内容迁移 + 原生菜单种子）
- `JwtAuthenticationFilter.java`（跳过 `docint_`）
- `SecurityConfig.java`（注册集成过滤器）
- `ContractRegistry.java`（注册结构契约）
- `DocService.java`（5 处查询、8 处 `notInSql`）
- `DocLearningService.java`（2 处查询、4 处 `notInSql`）
- `catalog.json`（两个迁移条目）
- `src/pages/DocCenter/index.tsx`（DEV 预览入口）

**接手首批补充文件**
- `src/App.tsx`、`src/constants/menuDataSource.ts`、`src/pages/Permission/types.ts`、`src/components/Sidebar.tsx`、`src/components/MenuTabs.tsx`（菜单、权限与页签登记）
- `src/api/docNative.ts`、`src/pages/DocCenter/{DocPlans,DocPlanDetail,DocGovernance}.tsx`、`useDocNativeLoad.ts`、`DocNativeRoutes.test.tsx`
- `src/constants/menuDataSource.test.ts`、`src/components/MenuPermissionGuard.test.tsx`、两份 locale 文件（只新增 docNative 命名空间）
- `backend/src/test/java/com/mftb/admin/service/doc/{DocNativeServiceTest,DocIntegrationGrantServiceTest}.java`
- `backend/src/test/java/com/mftb/admin/config/DocIntegrationAuthenticationFilterTest.java`
- `backend/src/test/java/com/mftb/admin/security/DocNativeSecurityTest.java`
- `SecurityConfig.java` 在既有未提交改动上仅追加过滤器代理顺序修复；不得整文件回退覆盖接手前内容
- `DocNativeStore.java`、`DocNativeAccess.java`、`DocNativeService.java`、`DocNativeSpaceService.java`、`DocNativeWorkflowService.java`、`DocIntegrationGrantService.java`：封装 JDBC 字段并替换 30 处代理字段旁路访问，不改 SQL 与权限判定

**本轮新增（写入/治理/MCP）**
- `src/pages/DocCenter/{DocPlanEdit,DocPlanConfirm,DocPlanHandoff,DocPlanAcl,DocPlanExecution,DocGovernance,DocGovernanceMembers}.tsx`、`docPlanUi.tsx`、`docPlanStyle.ts`、`useDocNativeLoad.ts`
- `src/api/docNative.ts`（写操作、ACL、空间/成员、凭据、导出）、`src/api/request.ts`（Blob 直返）
- `src/pages/DocCenter/{DocNativeRoutes,DocPlanActions}.test.tsx`
- `backend/.../controller/DocNativeController.java`（GET ACL）、`dto/DocNativeDTO.java`（AclView）、`service/doc/DocNativeSpaceService.java`（acl）
- `backend/src/test/java/com/mftb/admin/service/doc/DocNativeIntegrationTest.java`
- `mcp/doc-native-mcp/{package.json,src/{client,tools,server,cli}.mjs,test/server.test.mjs}`

---

## 十二、下一阶段设计（P0 已开发）

《文档中心 → 企业知识中台（Doc Knowledge v3）改造设计》见
`docs/design/文档中心_企业知识中台改造设计_2026-10-24.md`。

覆盖：统一内容形态（Markdown/PDF/Office/外链/OpenAPI）、分类树与受控标签、对象存储与文件安全、
部门/角色 ACL 与密级、制度生效/签收/复核、图书书目与阅读服务、接口文档导入与破坏性变更门禁、
档案保管期限与销毁清册、搜索索引与 RAG 权限过滤，以及 P0–P3 分期路线图。

设计稿第二十四节的 6 项决策仍待确认；其中 P0 的默认取舍已在第十三节按“可先落地”的方式实现，
不阻塞后续按确认结果调整。

---

## 十三、P0 知识库地基（2026-10-24 已开发，待真实库验证）

### 13.1 已落地范围

| 层 | 内容 |
|----|------|
| 数据库 | `292_doc_knowledge_p0.sql`：`doc_category`、`doc_tag`、`doc_node_tag`、`doc_asset`、`doc_revision_asset`、`doc_acl_entry`、`doc_user_clearance`、`doc_search_index` 共 8 表；`doc_space`/`doc_node`/`doc_native_document`/`doc_integration_grant` 扩展列 |
| 迁移 | `DocKnowledgeSchema`：可重入建表、补列、分类/标签/索引/ACL 回填、结构契约校验；版本键 `doc:knowledge-v3.0`；`ContractRegistry` 登记 8 表契约 |
| 后端 | `DocKnowledgeController`（`/api/doc/v3`）：空间、分类树、标签、检索/统计、文档详情、创建/修订、ACL、资产上传/预览/下载、索引重建 |
| 后端安全 | `DocAclResolver`：USER/DEPT/ROLE/ALL、有效期、密级硬门槛、ALL 不适用于敏感文档；`DocNativeAccess` v2 读写同步收口；机器令牌密级上限默认 INTERNAL |
| 文件 | `DocObjectStorage` + `LocalDocObjectStorage`；原始字节流上传，扩展名/文件头/大小/路径校验；对象键服务端生成；下载走鉴权流并写审计 |
| 索引 | `DocIndexService`：v2/v3 写入同步 upsert；旧文档库登记/更新/删除与腾讯同步也同步 upsert/delete；重建按派生数据幂等；PDF/Office 暂不提取正文 |
| 前端 | `src/api/docKnowledge.ts`；`DocLibrary` 改版（空间/分类树、形态/密级筛选、统计卡、上传弹窗）；`DocKnowledgeDetail`（Markdown/PDF 预览、版本历史、ACL 维护）；`DocTaxonomy`（分类/标签治理） |
| 路由与 i18n | `/doc-center/knowledge`、`/doc-governance/taxonomy`；`menuDataSource`/`Permission/types`/`MenuTabs` 同步；`docKnowledge.*` 繁中/英文各 208 个顶层键 / 229 个叶子键 |

### 13.2 P0 默认取舍（需在 P1 复核）

1. **上传即生效**：`doc_node.status=3`，`effective_revision_id` 与 `draft_revision_id` 同步指向首版；评审/签收在 P1 接入。
   这样可保证列表不会展示“读者点开却 403”的草稿。
2. **PDF 只索引标题/摘要/标签**：当前无 PDFBox/`pdftotext`，不伪造正文检索；P1 接入文本提取后再补 `body_text`。
3. **Office 不做在线转换**：页面明确提示下载查看，不伪造预览。
4. **病毒扫描未接入**：资产标记 `UNSCANNED`，详情页显示警告；P1 接 ClamAV 或等价方案。
5. **存储为本地磁盘**：`LocalDocObjectStorage` 仅适合单实例开发；生产必须替换 S3 兼容实现后再开多副本。
6. **搜索排除非本人草稿**：`status=1` 仅负责人/创建人可见，避免标题泄露。
7. **资产内容可重复建行**：对象按 SHA-256 复用，但每篇文档各自持有资产行，避免跨文档权限串用。
8. **负责人/创建人始终可读自己的文档**：他们本来持有原文；密级约束的是其他读者。`doc_user_clearance` 的授权管理页/接口留 P1，因此 P0 的 SENSITIVE/RESTRICTED 文档在未授密级前对其他 ACL 用户仍不可读（fail-closed）。
9. **历史空间只读**：历史空间没有 `doc_space_access` 行，`doc_native_document.space_id` 外键要求原生空间。P0 上传只允许 `managed=true` 的原生空间；历史空间继续浏览旧文档，需先在“治理与集成”新建原生空间再上传。

### 13.3 已执行验证

- 后端定向测试：`DocAssetValidatorTest`(11) + `DocAclResolverTest`(9) + `DocKnowledgeSchemaTest`(3) + `DocNativeServiceTest`(28) + `DocIntegrationGrantServiceTest`(9) + `DocNativeSpaceServiceTest`(4) + `DocKnowledgeSecurityTest`(4) = **68 项全部通过**。
- 后端全量：`mvn -o test` -> **2463 项，0 failure / 0 error / 17 skipped，BUILD SUCCESS**（新增真实库集成测试在无 `DB_URL` 时按预期跳过）。
- 前端全量：`npm run verify` -> **139 个测试文件 / 1260 项全部通过**（含 lint、typecheck、menu、stat-order、confirm-modal、i18n、secret-scan）。
- 静态 SQL 校验：8 条 DDL 与 9 条关键查询通过 JSqlParser 语法解析；这只是语法层检查，**不能替代 MySQL 真实执行**。
- **已执行（2026-10-24 16:49，17:32 补回归）**：真实 MySQL 中 `doc:knowledge-v3.0`、`doc:clearance-v1.0`、`doc:ack-v1.0` 三个版本均 SUCCESS；`DocKnowledgeIntegrationTest` 5/5 通过；26 张 doc 表、45 个强制约束、`ft_doc_search` 全文索引与 `effective_from` 列均就绪。详见 14.5、14.6。
- **已补做**：浏览器上传/预览/签收全链路已在 14.6 完成（单管理员）。

### 13.4 网络恢复后的第一组命令

```bash
cd backend
export JAVA_HOME=/Users/yangjingjing/Desktop/SARY/.local/jdk-17.0.2.jdk/Contents/Home
MVN=/Users/yangjingjing/Desktop/SARY/.local/apache-maven-3.9.6/bin/mvn

# 1. 编译 + 启动（会执行 doc:knowledge-v3.0）
bash restart-service.sh --rebuild
bash restart-service.sh --status   # 期望 live=200 ready=200

# 2. 核对迁移版本与新增表
mysql -e "SELECT version_key,applied_at FROM sys_schema_version WHERE version_key IN ('doc:knowledge-v3.0','doc:clearance-v1.0','doc:ack-v1.0');"
mysql -e "SHOW TABLES LIKE 'doc\_%';"

# 3. 契约与索引
mysql -e "SHOW INDEX FROM doc_search_index WHERE Key_name='ft_doc_search';"
mysql -e "SELECT COUNT(*) FROM doc_search_index;"

# 4. P0 真实库集成测试（会实际写入并清理唯一夹具）
set -a && source .env.local && set +a
$MVN -o test -Dtest=DocKnowledgeIntegrationTest -B

# 5. 前端门禁
cd .. && npm run verify
```

### 13.5 P0 未做（按设计留给 P1/P2）

- 制度生效/失效、到期复核、离职接管（签收 P1a 已补，见第十四节）；
- 图书书目、阅读进度、收藏、笔记、借阅；
- 接口文档 OpenAPI 导入与 diff；
- 档案保管期限与销毁清册；
- PDF 文本提取、Office 转换、病毒扫描、S3 适配器；
- 浏览器双人复核（单管理员全链路已完成，见 14.6）与生产发布。

---

## 十四、P0 补口与 P1a：密级授权 + 制度签收（2026-10-24 已开发）

### 14.1 已落地

| 能力 | 实现 |
|------|------|
| 密级授权管理 | `293_doc_clearance_audit.sql`；版本键 `doc:clearance-v1.0`；`doc_user_clearance` 为当前值，`doc_clearance_audit` 追加审计；API `GET/PUT/DELETE /api/doc/v3/clearances*`；页面 `/doc-governance/clearance` |
| 制度签收 | `294_doc_ack.sql`（`doc_ack_target` + `doc_ack_receipt`）；版本键 `doc:ack-v1.0`；API 签收范围/状态/签收/回执/我的待签收；详情页签收横幅与范围弹窗；“我的待签收” `/doc-center/my-acks` |
| 权限 | 密级授权仅 `doc-space:edit`；签收范围维护要求负责人/空间管理；签收要求当前用户可读且在范围内；待签收列表复用统一检索的 ACL/密级过滤 |
| 审计 | 密级授予/调整/撤销写 `doc_clearance_audit`；签收范围变更与签收写 `doc_audit_event` |

### 14.2 P1a 口径

1. 签收只对当前 `effective_revision_id` 生效，换版后需重新签收；
2. 签收范围主体为 `DEPT/ROLE/ALL`，不逐个员工生成目标；`ALL` 仅适用于 PUBLIC/INTERNAL；
3. 撤销密级授权回落到 `INTERNAL(2)`，不删除历史审计；
4. 负责人/创建人始终可读自己的文档；密级约束其他读者；
5. P1a 不含签收提醒、逾期通知、回执导出，后续补。

### 14.3 验证

- 迁移清单：`catalog.json` 已登记 `doc:knowledge-v3.0`、`doc:clearance-v1.0`、`doc:ack-v1.0`，`MigrationCatalogTest` **6/6 通过**。
- 真实 MySQL：`doc:knowledge-v3.0`（16:49:55）、`doc:clearance-v1.0`（16:49:56）、`doc:ack-v1.0`（16:49:57）均 SUCCESS；16:47:59 曾因缺 `doc_native_document.effective_from` FAILED，补列后重跑成功。
- 结构：26 张 doc 表、45 个强制约束、`ft_doc_search` 全文索引（4 列）、`effective_from` 列均就绪；`doc_category` 8 行、`doc_search_index` 1 行（存量原生方案回填）。
- 后端全量（注入真实库 `DB_URL`）：**2488 项，0 failure / 0 error / 1 skipped，BUILD SUCCESS**；未注入库的 CI 口径为 2472 项 / 17 skipped。
- `DocKnowledgeIntegrationTest`：**5/5 通过**（Markdown 创建/检索/会话幂等、PDF 上传/绑定/下载、空间列表 SQL 别名回归、待签收查询 `only_full_group_by` 回归）。
- `DocKnowledgeSecurityTest`：**9/9 通过**（含密级账号搜索仅 `doc-space:edit` 可用的鉴权用例）。
- `DocNativeIntegrationTest`：**7 项，0 failure / 0 error / 1 skipped**。
- 前端全量：`npm run verify` -> **140 个测试文件 / 1264 项全部通过**。
- 静态门禁：`check:menu`、`check:stat-order`、`check:confirm-modal`、`check:i18n`、`secret-scan` 全通过。
- 服务：PID 86969，`live=200`、`ready=200`，JAR 17:51:49。
- 测试夹具清理：测试空间、测试文档、签收回执、测试密级授权及审计残留均为 **0**。
- 浏览器验收：**已完成**（单管理员全链路，见 14.6）；双账号可见性/双人复核仍留待后续。
- **环境注记**：本机默认 DNS 仍不解析 `mysql3.sqlpub.com`；本次用 `dig @8.8.8.8` 取得 `47.99.240.202`，临时把 `DB_URL` 主机替换为 IP 启动/跑测试，`.env.local` 已恢复为域名。当前运行中的后端进程仍持有 IP 连接；下次重启前需修复默认 DNS 或重复该临时方式。

### 14.4 后续待办

- 签收提醒/逾期通知、回执导出、按部门覆盖率看板；
- 图书书目/阅读进度/收藏/笔记/借阅；
- 接口文档 OpenAPI 导入与 diff、档案保管期限与销毁清册；
- PDF 文本提取、Office 转换、病毒扫描、S3 适配器；
- 浏览器双账号可见性/双人复核与生产发布。

### 14.5 真实库执行记录（2026-10-24）

| 项 | 结果 |
|----|------|
| 首次迁移 | 16:47:59 `doc:knowledge-v3.0` FAILED：`Unknown column 'd.effective_from'`；补 `DocKnowledgeSchema.addColumn` 并重打 JAR |
| 重跑迁移 | 16:49:55 / 16:49:56 / 16:49:57 三个版本 SUCCESS，`sys_schema_migration_log` 可追溯 |
| 结构核对 | 26 张 `doc_*` 表；45 个 enforced 约束；`effective_from=1`；`ft_doc_search` FULLTEXT 4 列 |
| 数据回填 | `doc_category=8`、`doc_search_index=1`；`doc_acl_entry`/`doc_asset`/`doc_ack_*` 为 0（存量无对应数据） |
| 服务 | PID 37341；`/api/health/live=200`、`/api/health/ready=200`；契约 87 个全部就绪 |
| 集成测试 | `DocKnowledgeIntegrationTest` 3/3；`DocNativeIntegrationTest` 6 通过 + 1 跳过（无第二个 doc 授权账号） |
| 残留清理 | 测试空间/幂等回执/测试资产均 0；手工清理了历史 `DOCNATIVE-IT-OTHER-*` 两处残留并修正交接用例清理顺序 |

> 浏览器验收已完成，见 14.6；本节保留首次真实库执行的时间线。

### 14.6 浏览器端到端验收与回归修复（2026-10-24 17:15-18:00）

**验收环境**：`http://127.0.0.1:5173`（Vite dev）+ `http://127.0.0.1:8080`（PID 86969，真实库 IP 连接）；登录账号为内置管理员。

**通过的主链路**：

1. 登录成功；`/doc-governance` 新建原生空间 `E2E-DOC-20261024`（space id=73，owner=32）。
2. `/doc-center` 空间树正确加载，上传 Markdown 成功：文档 `DOC-2026-000044`（node=44，revision=57），密级“內部”、标签 `E2E`、状态“已生效”，正文可见。
3. 详情页 `簽收範圍` 新增 `全員`（ALL）并保存；横幅显示“此制度需要您簽收（截止 不限）”，点击 `確認簽收` 成功，回执时间 `2026-10-24 17:23:21`；重新进入详情页签收态保持。
4. `/doc-center/my-acks` 不再出现测试文档，空态“目前沒有待簽收”。
5. `/doc-governance/taxonomy` 空间下拉包含测试空间，分类/标签卡片正常；`/doc-governance/clearance` 可正常列出授权。
6. 密级账号搜索：输入 `admin` 可选中 `系統管理員`（内置账号无 HR 员工档案），授予“敏感(3)” 30 天成功，撤销后列表恢复空态，接口 `GET /api/doc/v3/clearances` 返回空数组。

**首轮浏览器验收发现并修复的 3 个真实缺陷**：

| 缺陷 | 根因 | 修复 | 回归测试 |
|------|------|------|----------|
| `/api/doc/v3/spaces` 500，文档库树/上传空间/分类空间全空 | `COALESCE(a.space_kind,1)` 误取 `doc_space_access` 的列；`space_kind` 属于 `doc_space` | 改为 `COALESCE(s.space_kind,1)` | `spacesListsNativeSpaceWithoutSqlAliasError` |
| `/api/doc/v3/me/pending-acks` 500，页面弹“數據庫操作異常” | `ORDER BY due_at IS NULL,due_at` 在 MySQL `only_full_group_by` 下引用未聚合列 | 改为 `ORDER BY MIN(t.due_at) IS NULL,MIN(t.due_at),i.updated_at DESC` | `pendingAcksQueryWorksUnderOnlyFullGroupBy` |
| 密级授权页搜不到内置 `admin` | 页面用 `EmployeeSelect` 只查 HR 在职员工，内置账号无员工档案 | 新增 `GET /api/doc/v3/clearances/users`（查 `sys_user` 登录账号）+ 前端可搜索 Select；仍只对 `doc-space:edit` 开放 | `clearanceUserSearchRequiresSpaceEdit` |

**证据截图**（`.local/`，未纳入版本控制）：`e2e-doc-20261024-03-ack-success.png`、`e2e-doc-20261024-07-doccenter-tree.png`、`e2e-doc-20261024-05-taxonomy.png`、`verify-my-acks-20261024-viewport.png`、`e2e-clearance-search-20261024-01-granted.png`、`e2e-clearance-search-20261024-02-revoked.png`。

**清理结果**：space 73、node 44、revision 57、签收目标/回执、测试密级授权及审计 行均已删除；当前 `doc_space` 仅保留 5 个业务空间，测试命名空间/测试文档/测试授权/审计残留均为 0。

---

## 十五、P1a 补口：回执导出、覆盖率、站内提醒（2026-10-24）

| 能力 | 实现 | 验证 |
|------|------|------|
| 回执导出 | `GET /api/doc/v3/documents/{id}/ack-receipts/export`；UTF-8 BOM CSV；负责人/空间管理才能导出；CSV 单元格做引号与公式注入防护；写 `ACK_EXPORT` 审计 | 真实库 `DocKnowledgeIntegrationTest` 6/6；浏览器接口返回 `text/csv;charset=UTF-8`，首行表头正确；错误 JSON 不再被前端当 CSV 下载 |
| 覆盖率 | `GET /api/doc/v3/documents/{id}/ack-coverage`；按 DEPT（直属在职成员）/ROLE（角色成员）/ALL（全部在职账号）聚合，返回目标/已签/覆盖率；SQL 内做 ACL/密级校验 | 浏览器验证 `全員` 目标 30、已签 0、覆盖率 0%；MySQL `only_full_group_by` 下通过 |
| 站内提醒 | `NotificationServiceImpl` 增加 `doc_ack_pending` 铃铛通知；待签收/逾期从统一 `DocAckService.pending` 实时生成，不新增提醒表；`DocMyAcks` 对过期截止日显示“已逾期” | 首页铃铛可跳详情；无文档菜单权限时静默跳过，不影响赠送到达提醒 |

说明：外部钉钉个人提醒尚未单独接入；当前“提醒”为站内铃铛 + 我的待签收逾期标记，避免在未配置场景时误发外部消息。

### 15.1 关键修复

- `DocAckService.coverage` 的 `ONLY_FULL_GROUP_BY` 兼容：`MAX(COALESCE(...))`，并按 `subject_type/subject_id/due_at` 分组。
- CSV 导出端点缺失 `MediaType` import 曾导致运行时 500；补 import 并重启后浏览器复验通过。
- 前端 blob 导出识别 `application/json` 错误体，避免“错误 JSON 被当作 CSV 保存”。

---

## 十六、P1b 阅读域：书籍角 / 进度 / 收藏 / 笔记（2026-10-24）

### 16.1 已落地

| 能力 | 实现 |
|------|------|
| 表结构 | `295_doc_reading.sql`：`doc_reader_state`、`doc_favorite`、`doc_note`、`doc_book_meta`；版本键 `doc:reading-v1.0`，已登记 catalog |
| 阅读进度 | `GET/PUT /api/doc/v3/documents/{id}/reader-state`；按人×文档覆盖写，进度只增不减，位置 JSON 校验 |
| 收藏 | `GET /api/doc/v3/favorites`、`PUT /api/doc/v3/documents/{id}/favorite`；只返回当前用户可读文档 |
| 笔记 | `GET/POST /api/doc/v3/documents/{id}/notes`、`DELETE /api/doc/v3/notes/{noteId}`；默认仅本人；空间可见仅负责人/空间管理 |
| 书目 | `GET/PUT /api/doc/v3/documents/{id}/book-meta`；PDF 书目元数据（ISBN/作者/出版社/年份/页数/封面/分类） |
| 书籍角 | `GET /api/doc/v3/books`；复用统一检索过滤，PDF + 书目 + 本人进度；前端 `/doc-books` 卡片、搜索、收藏、续读 |
| 详情页 | 收藏按钮、阅读进度滚动采集（Markdown）、阅读笔记弹窗；笔记支持私密/空间可见 |

### 16.2 浏览器验收

- 空间 `E2E-BOOK-20261024`，PDF 文档 `DOC-2026-000072`（node=72，revision=89）；收藏持久化、笔记新增/删除、“书籍角”卡片作者/出版社/35% 进度均通过。
- 证据：`.local/e2e-books-shelf-20261024.png`、`.local/e2e-note-delete-click-20261024.png`、`.local/verify-ack-export-20261024-02-exported-toast.png`、`.local/e2e-ack2-20261024-coverage.png`。
- 测试数据已清理：space 117、node 72、asset 9、reader/favorite/note/book-meta/ack 残留均为 **0**。

### 16.3 口径与边界

1. 实体借阅、条码/馆藏、逾期罚金仍属于可选的 P2，不在本轮；`access_mode=2` 暂不允许保存。
2. 书籍角按 `content_kind=2`（PDF）聚合；Office 书籍需等 Office 转换/预览接入后再纳入。
3. 阅读进度只对 Markdown 自动采集；PDF 页码进度需 PDF.js（P2 依赖评审），当前可通过 API 写入。
4. 空间可见笔记要求负责人/空间管理，避免普通读者把私人批注批量暴露。

---

## 十七、P1c 接口文档中心（2026-10-24）

| 能力 | 实现 |
|------|------|
| 表结构 | `296_doc_api_spec.sql`：`doc_api_spec`、`doc_api_operation`、`doc_api_change`；版本键 `doc:api-v1.0`，catalog 已登记 |
| 导入 | `POST /api/doc/v3/documents/{id}/api-specs`；支持 OpenAPI 3 JSON 与 YAML（SnakeYAML SafeConstructor）；固定 revision，不另造内容 |
| 操作清单 | 按 `METHOD + path` 稳定键入库；operationId/summary/tag/deprecated/schema_hash |
| 两版 diff | 同 node+systemCode 比较上一版；新增 1、删除 2、结构变更 3（保守判定）、弃用 4 |
| 破坏性确认 | `POST /api/doc/v3/api-changes/{id}/ack`，仅负责人/空间管理；未确认项在页面显示“待確認”，不会擅自改文档状态 |
| 页面 | 文档详情“API 規格”弹窗：粘贴 spec、选择历史版本、操作表、差异表、逐条确认 |

- 修复：`DocKnowledgeService` 原先对 `contentKind=5` 直接拒绝（“接口文檔將在 P2 開放”），P1c 落地后只禁止内容形态修改；`contentKind=5` 允许文本正文。
- 浏览器验收：文档 `DOC-2026-000109`，crm 1.0.0 导入 GET /users + POST /orders；2.0.0 导入新增 GET /new、删除 POST /orders、变更 GET /users；“待確認 2 項” → 确认删除后降为 1 项并持久化。证据：`.local/e2e-api-diff-20261024-before-confirm.png`、`.local/e2e-api-diff-20261024-confirmed-viewport.png`。

---

## 十八、P1d 档案室（2026-10-24）

| 能力 | 实现 |
|------|------|
| 表结构 | `297_doc_archive.sql`：`doc_archive_meta`、`doc_disposal_request`；版本键 `doc:archive-v1.0`，catalog 已登记 |
| 归档 | `POST /documents/{id}/archive`；保管年限/起始日/冻结；`doc_node.status=4`、`lifecycle=2`，写 `ARCHIVE` 审计 |
| 销毁申请 | `POST /documents/{id}/disposal-requests`；必须先归档；冻结拒绝；`status=6`，写 `DISPOSAL_REQUEST` |
| 审批 | `POST /disposal-requests/{id}/approve`；`requested_by != actor` 强制校验；通过后清空正文、删除资产绑定、写证书号、`status=7/lifecycle=3`，保留标题/摘要/哈希；写 `DISPOSAL_DESTROY` |
| 清册 | `GET /disposal-requests/export`：UTF-8 BOM CSV，公式注入防护 |
| 页面 | `/doc-archives`：档案清单、销毁申请、审批/驳回、清册导出；详情页归档入口、已归档/已销毁墓碑提示 |

- 修复：销毁申请返回 id 原用 `LAST_INSERT_ID()`，在真实库下取到 0 导致“銷毀申請不存在”；改为按 node 最新申请查询。
- 浏览器验收：`DOC-2026-000127` 归档（5 年）、申请销毁（申请人 admin）；同人审批返回 409；将申请人夹具改为另一账号后管理员审批成功，证书 `DC-20261024-3`，详情正文为空、状态“已銷毀”、标题/编号保留。证据：`.local/p1d-verify-20261024-01-list-destroyed.png`、`.local/p1d-verify-20261024-02-requests-approved.png`、`.local/p1d-verify-20261024-03-detail-destroyed.png`。

---

## 十九、最终回归与剩余 P2（2026-10-24 20:24）

- 后端全量（真实库）：**2494 项，0 failure / 0 error / 1 skipped，BUILD SUCCESS**。
- 前端全量 `npm run verify`：**141 个测试文件 / 1270 项全部通过**（含 lint/typecheck/menu/stat-order/confirm-modal/i18n/secret-scan）。
- `DocKnowledgeIntegrationTest`：**8/8**（含 API 导入/diff、归档/销毁双人审批、阅读/收藏/笔记/书目、签收覆盖/导出）；`DocAckServiceTest`：3/3；`DocKnowledgeSecurityTest`：9/9。
- 服务：PID 11534，`live=200`、`ready=200`，JAR 21:20:30；`.env.local` 已恢复域名，运行进程持 IP 连接（Office 预览适配器已包含）。
- 迁移：`doc:api-v1.0`、`doc:archive-v1.0` 均 SUCCESS；测试空间/文档/API spec/operation/change/archive/disposal/reading 数据残留均为 **0**。

**P2 文件能力（按最新口径收敛）**：

用户明确：文件直接存储、点击能在线查看即可，不需要解析/抽取文字；但 **Word/Excel/PPT 也必须在 线查看**。

- 不实施：PDF 文本提取/OCR、PDFBox/pdftotext、ClamAV/病毒扫描服务、S3 适配器、实体借阅/条码馆藏；
- 继续使用本地对象存储，单文件 50 MB、按空间配额；`scan_result` 保持 `UNSCANNED`，不宣称已扫描；
- Markdown 在页面内渲染；PDF/图片改为详情页“在瀏覽器打開”，新標籤頁用系統 PDF/圖片查看器打開原文件（不再內嵌 iframe）；
- **Office 在线预览适配器已实现**：`DocOfficeConverter` 调 Gotenberg `/forms/libreoffice/convert`，`GET /assets/{id}/office-preview` 返回预览 PDF；详情页用 iframe 展示，下载仍用原件；未配置时明确返回 503，不伪造预览。
- 推荐 Gotenberg sidecar（内部地址，不公网暴露）。当前本机无 Docker/Gotenberg，运行态尚未验收；启动服务并设置 `DOC_OFFICE_CONVERTER_URL` 后即可。

因此当前唯一新增运行前置条件是 Office 转换服务（Docker/Gotenberg 或等价内部服务）；PDFBox/ClamAV/S3 仍不需要。双账号与生产发布另行授权。

---

## 二十、系统方案库（2026-10-24）

| 能力 | 实现 |
|------|------|
| 表结构 | `298_doc_system_plan.sql`：`doc_system_plan`，版本 `doc:system-plan-v1.0` |
| 同步 | `POST /api/doc/v3/system-plans/scan`，扫描 `docs/design` 下 MD；可配置 `doc.system-plan.root` / `DOC_SYSTEM_PLAN_ROOT` |
| 元数据 | 标题、所属系统、方案类型、生成时间（文件 mtime）、来源路径（`docs/design/xxx.md`）、内容哈希、文件大小 |
| 追溯 | 正文独立落库；后续仓库文件被修改/删除仍可查看归档快照 |
| 页面 | `/doc-system-plans` 列表 + `/doc-system-plans/detail?id=` 详情；搜索、系统筛选、同步按钮 |
| 权限 | 菜单 `doc-system-plans`，view/edit；仅授权角色可见 |

浏览器验收：同步 **22** 个方案；`企业 HCM 全套建设与组织人事重构方案` 所属系统“员工管理”、类型“整改方案”、来源 `docs/design/员工管理_Core_HR_整改方案_94e06fc1.md`、哈希与正文均正确。

---

## 二十一、接口管理与分类只读（2026-10-24）

### 21.1 接口管理

| 能力 | 实现 |
|------|------|
| 表结构 | `299_doc_api_catalog.sql`：`doc_api_catalog`，版本 `doc:api-catalog-v1.0` |
| 同步 | `POST /api/doc/v3/api-center/scan`，扫描 `RequestMappingHandlerMapping`，批量写入 |
| 分类 | 左侧按 `system_code` 分组，系统名来自 `sys_system`；支持搜索、分页 |
| 明细 | 方法、路径、处理类、入参名称/类型/注解、DTO 字段（最多 40 个）、返回类型、来源、同步时间 |
| 页面 | `/doc-api-center`：系统分类 + 接口表 + 右侧 Drawer |
| 权限 | 菜单 `doc-api-center`，view/edit |

- 浏览器验收：同步 **1290** 个接口、**51** 个系统；文档中心 107 条；`GET /api/doc/nodes` 6 个参数名可见；`GET /api/eam/assets` 的 `EamAssetQuery` 展开 27 个字段。
- 性能修复：扫描从 1290 条单条 update 改批量写入；前端 scan 超时单独放宽 120s（实测约 47-57s）；`-parameters` 与反射 Parameter 兜底解决参数名为空。
- 边界：当前是代码扫描清单，入参/出参是 Java 类型与 DTO 字段，不是完整 OpenAPI schema；后续可由 OpenAPI 导入补充。

### 21.2 文档库分类只读

- 文档库左侧树已移除“新增分類/停用分類”入口和按钮；分类只做导航。
- 分类/标签的新增、重命名、停用仍集中在 `/doc-governance/taxonomy`（空间管理/治理）。
- 浏览器验收：树面板 button 数量为 0；治理页四个分类操作按钮仍存在。

---

## 二十二、最终回归（2026-10-25 00:11）

- 后端全量（真实库）：**2496 项，0 failure / 0 error / 1 skipped，BUILD SUCCESS**。
- 前端全量 `npm run verify`：**141 个测试文件 / 1270 项全部通过**。
- `DocKnowledgeSecurityTest` 9/9；`MigrationCatalogTest` 6/6；系统方案/接口扫描为浏览器真实验收。
- 服务：PID **73165**，`live=200`、`ready=200`，JAR `23:54:41`。
- 数据：系统方案 **22** 条、接口清单 **1290** 条（51 系统）已按功能同步保留；测试空间/文档残留 0。
- 新增菜单：`doc-system-plans`（系統方案庫，sort=7）、`doc-api-center`（接口管理，sort=8）；原 `doc-plans` 方案流程保留，新菜单为专题视图。

---

## 二十三、接口管理升级为对外接口文档（2026-10-25）

> 本节取代 21.1 中“51 个系统、仅代码扫描清单”的描述；接口管理从内部清单升级为可发布的对外文档。

### 23.1 开放平台调研与字段映射

调研 DeepSeek、飞书、腾讯文档、钉钉、企微等开放平台的接口详情页，共性结构为：

| 开放平台共性 | 本系统落地字段 |
|---|---|
| 接口名称、一句话说明 | `api_name`、`description` |
| 使用场景 / 前置条件 / 权限申请 | `scenario`、`auth_scope` |
| 鉴权方式（Bearer/API Key/OAuth） | `auth_type` |
| 调用基地址 + 请求方法 + 路径 | `base_url` + `method` + `path` |
| 请求参数表、请求示例 | 扫描得到的参数/DTO 字段 + `request_example` |
| 响应结构、响应示例 | 扫描得到的返回类型 + `response_example` |
| 错误码 | `error_codes` |
| 版本与变更记录 | `version`、`changelog` |
| 对外开放范围 | `visibility`（内部/合作方/公开）、`doc_status`（草稿/已发布/已弃用） |

### 23.2 系统名称统一为中文

- 新增 `DocApiSystemMap`（`constant`）：路由前缀 → 16 个正式业务系统（与 `SystemCode`、门户种子名称一致），未知前缀统一归入「平台支撐系統」，**永不回退英文代码**。
- 组织/职位/部门前缀统一归入「人力資源系統」（不再产生不存在的 `organization` 系统）。
- 新增迁移 `doc:api-catalog-v1.2`（`300` 结构变更不属于本迁移）：按 `path` 重算 `system_code` 并回写中文 `system_name`；只更新 `source='code'` 的机器行，不碰 OpenAPI 人工导入行；每次启动幂等重放。
- 左侧聚合：未知/历史系统代码在读取时并入平台支撐系統，按门户顺序排序，避免同名重复项。

### 23.3 文档编辑与发布

- `PUT /api/doc/v3/api-center/apis/{id}`（`doc-api-center:edit`）：保存名称、说明、场景、鉴权、scope、可见性、发布状态、版本、基地址、请求/响应示例、错误码、变更记录。
- 发布（`doc_status=2`）前必须填写接口名称；后端强校验，前端表单同步提示。
- 重新扫描（`POST /scan`）为幂等增量：保留人工填写的名称/场景/示例等，只刷新方法、路径、参数、返回类型与同步时间；本次未出现的旧接口标记 `active=0`。
- 页面：左侧「全部系統 + 15 个中文系统」；列表展示接口名称、场景、发布状态、可见范围、版本、同步时间；抽屉展示接口地址（可复制）、接口說明、使用場景、請求參數、請求示例（可复制 cURL）、響應示例、錯誤碼、變更記錄；编辑弹窗 920px。

### 23.4 验证结果

- 迁移：`doc:api-catalog-v1.0/v1.1/v1.2` 均已落地；`doc_api_catalog` 文档字段 10/10 就绪。
- 数据：重新扫描 **1291** 个接口、**15** 个有接口的系统，系统名全部为中文；人工发布的「員工資訊匯出」（`GET /api/employees/roster/export`）在重扫后名称/场景/示例/错误码完整保留。
- 接口契约：发布缺名称返回业务码 400；系统列表按门户顺序返回；搜索可按接口名称/路径/场景命中。
- 浏览器验收（admin）：左侧「全部系統 + 15 个中文系统」全中文；抽屉 8 个区块齐全，标题为「請求參數 / 響應示例」；无 `docKnowledge.` 原始 key；控制台无错误（仅 antd rowKey 弃用警告）。截图：`.local/verify-doc-api-center-20261025-01-list-systems.png`、`.local/verify-doc-api-center-20261025-02-drawer.png`。
- L0：`eslint DocApiCenter.tsx`、`tsc --noEmit` 通过；后端 `mvn test-compile` 与 `DocApiSystemMapTest`（3 项）通过。
- L2 全量回归：前端 `npm run verify` **141 文件 / 1270 项全部通过**；后端 `mvn test -B` **2499 项，0 failure / 0 error / 22 skipped，BUILD SUCCESS**。
- 服务：PID **10647**，`live=200`、`ready=200`，JAR 编译于 2026-10-25 08:33:29。

### 23.5 边界

- 出参字段仍以 Java 返回类型 + 响应示例为主，尚未生成 OpenAPI 级 schema 字段表；后续可从 `springdoc /v3/api-docs` 导入补齐。
- 可见范围/发布状态目前只作为文档属性，不改变接口本身的鉴权；对外接入仍需单独的令牌、IP 白名单与限流方案。

---

## 二十四、P0 收口：双账号验收与发布前检查（2026-10-25）

### 24.1 P0 状态

| P0 项 | 状态 | 说明 |
|---|---|---|
| Office 在线预览运行态 | **暂缓（用户决定）** | 适配器已就绪；本机无 Docker/LibreOffice/Gotenberg，未配置 `DOC_OFFICE_CONVERTER_URL`，Word/Excel/PPT 仍返回 503 |
| 干净库重放 | **阻塞** | 当前 DB 账号仅 `fengsong` 的 ALL 权限，`CREATE DATABASE` 被拒；需第二个空库/账号 |
| 备份恢复演练 | **阻塞** | 同上；无法在隔离库恢复验证，不在共享库上做破坏性演练 |
| 双账号浏览器/API 验收 | **完成** | 临时账号 + 角色已创建并清理，API 全链路与 B 端浏览器验收通过 |
| 生产发布 | **仅发布前检查完成** | 前后端构建、健康探针、迁移清单通过；未实际部署 |

### 24.2 双账号验收（临时账号已停用）

临时 `DOCQA001`（id=42）仅授 `doc-library`、`doc-plans` 的 view/edit，系统准入仅 `doc`；验收后 `status=0/deleted=1`，角色 `DOC_QA_READER`（id=24）同步停用。测试空间/文档/回执/交接/销毁申请已物理清理，残留均为 **0**。

| 场景 | 结果 |
|---|---|
| B 无密级、无 ACL 读取敏感文档 | 403；检索结果不包含该文档 |
| 仅授予 B 密级 3，不加文档 ACL | 仍 403（验证密级与 ACL 双闸门） |
| 补文档 ACL（只读）后 | B 可读；签收成功 |
| 签收覆盖率 | 目标 1 人、已签 1 人、覆盖率 **100%** |
| 原生方案确认 | 管理员提交给 B，B 确认通过，生成生效版本 |
| 交接接收 | 管理员发起交接，B 接收，负责人变更为 B |
| 销毁双人审批 | 管理员归档并发起销毁，B（空间管理者 + 文档编辑 ACL）审批通过，状态 7 |
| B 端浏览器 | 仅见「首頁/方案管理/文檔庫」；敏感文档正文可见、已签收、无签收按钮；看不到治理/空间管理；控制台无错误 |

> 截图受本机 Browser 面板隐藏（`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`）未落盘；以 DOM 文本、网络响应与接口状态为验收证据。

### 24.3 发布前检查

- 前端：`npm run build:strict` 成功（tsc + vite，52.47s）；产物 `dist/`，仅 chunk 体积警告。
- 后端：`mvn -o -q -DskipTests package` 成功；`target/mftb-admin.jar` 66 MB；运行服务 `live=200`、`ready=200`。
- 数据库：doc 迁移版本 **20** 个、doc 表 **37** 张、外键 **63** 个；`doc_api_catalog` 活跃接口 **1291** 条。
- **发布前必须显式注入 `SCHEMA_STRICT=true`**：`application.yml` 默认 false，模板未列；不设置时结构漂移只告警不阻断。
- 回滚：本批未新增数据库结构；回滚前端 `dist/` 与后端 JAR 即可；测试数据已清理，无需回滚迁移。

### 24.4 干净库重放 / 备份恢复（待第二个库）

需在 `backend/.env.replay.local`（已被 `.env.*.local` 忽略）提供：

```
REPLAY_DB_URL=jdbc:mysql://host:3306/empty_schema?...
REPLAY_DB_USERNAME=...
REPLAY_DB_PASSWORD=...
```

获得后执行：1）以 replay 库启动 JAR 两次，验证全部迁移与 `ready=200`；2）核对 `sys_schema_version`、表/约束/ngram；3）导出 doc 域 schema+data，清空后恢复，比对行数与内容哈希；4）保留演练报告，不触碰 `fengsong`。

---

## 二十五、P0 重放实测：备份恢复通过、基线不足（2026-10-25）

### 25.1 备份 / 恢复演练（通过）

- 重放前对 `fengsong_test` 全库导出：**120 张表、10,495 行、2.59 MB（gzip）**，附每表行数/CHECKSUM/建表哈希清单。
- 清空后从备份恢复：**120 张表全部回来，逐表行数比对 0 处不一致**。
- 演练结束后再次恢复原备份，测试库保持原始状态；未触碰生产库 `fengsong`。
- 产物：`.local/backups/fengsong_test-before-replay-20261025-092420.sql.gz`（仅本地，已忽略）。

### 25.2 空库启动：当前不支持裸库自建（P0 发现）

只执行 `backend/sql/01_init_system.sql`（5 张核心表）后启动应用，连续暴露缺失：

| 缺失/错误 | 原因 | 本轮处理 |
|---|---|---|
| `sys_role` 缺 `permissions` 时 `AFTER permissions` 失败 | `OrgScopeSchemaInitializer(@Order 2)` 依赖 `DataInitializer(@Order 5)` 才补的列 | 去掉 `AFTER permissions` |
| `sys_user.department_en/last_active_at/active_token/active_login_ip/force_logout_*` 缺失 | 只在历史参考 SQL，应用从未建 | 新增 `UserSessionSchemaInitializer(@Order 1)` 自愈补列 |
| `biz_workflow_config` 不存在 | 建表在无序 `BizDataInitializer`，晚于 DataInitializer 种子 | DataInitializer 先 `CREATE TABLE IF NOT EXISTS` |
| `sys_biz_seq_rule` 不存在 | 同上 | DataInitializer 先建表 |
| `sys_config` 不存在 | 仅 `sql/38_sys_config.sql` | DataInitializer 先建表 |
| `biz_eam_handover.receiver_type` 失败 | EAM 建表在 DataInitializer 之后且 DDL 缺列 | EAM DDL 补 `receiver_type`；`addColumnIfAbsent` 对未建表跳过 |
| `sys_permission_revision` 不存在 | `PermissionRevisionInitializer @Order 16` 晚于使用 | 提前到 `@Order(1)` |
| `sys_menu.system_code` 不存在 | `SystemPortalSchemaInitializer @Order 15` 晚于 DataInitializer 菜单种子 | DataInitializer 先补列；SystemPortal 即使列已存在也补索引 |
| `syncOrganizationDomain` NPE | 查询 `system_code` 返回 null 后 `findFirst().orElse` | 过滤 null |
| `permission` 父菜单缺失导致系统授权/授权中心初始化失败 | 生产已拍平，空库无壳 | 缺父级时按顶级菜单落地；`queryMenuIdByKey` 缺行返回 null |

> 这些修复让应用在空库上前进了多个模块，但仍未完成裸库启动：后续还有 `mcp_tool`、`hr_perf_score_item` 等大量“成熟库才存在”的表/菜单假设。结论：**当前应用没有完整的 schema baseline，不能只靠 `01_init_system.sql` 从零启动**。

### 25.3 旧开发库重放：基线过旧（已绕过）

- 恢复用户提供的 `fengsong_test` 旧开发备份（120 表）后启动：菜单、EAM、门店、OA、系统门户、HR 等大量迁移通过，但在 `rdm:schema:v1.4` 处因 `hr_perf_score_item` 不存在失败。
- 与当前 `fengsong` 对比：旧库比当前生产结构少 **187 张表**（AI、考勤、会议、用车、RDM 大部分、绩效、文档中心等），属于多轮功能上线前的旧基线，不是当前代码可升级的最近版本。
- 继续逐表补 schema 等于重建一条历史升级链，不属于 P0；已停止。测试库先恢复原 120 表状态，再改用 25.4 的当前 schema 基线。

### 25.4 当前 schema 基线重放（通过）

从 `fengsong` 导出 **schema-only（348 表，95.9 KB）** 到 `fengsong_test`，再复制最小配置种子（不复制用户、业务数据和敏感配置值）：

| 种子 | 行数 |
|---|---|
| `sys_system` / `sys_menu` / `sys_role` | 17 / 279 / 20 |
| `sys_role_menu` / `sys_role_system` | 643 / 49 |
| `sys_department` / `sys_position` | 37 / 27 |
| `sys_department_menu` / `sys_department_system` | 114 / 105 |
| `sys_schema_version` | 395 |
| `sys_biz_seq_rule` / `biz_workflow_config` / `sys_permission_revision` | 107 / 14 / 1 |
| `rdm_flow_config`（仅 GLOBAL）/ `sys_config`（值清空） | 1 / 39 |
| `sys_translation`（批量导入，避免启动逐行同步） | 8,487 |

启动结果（`SCHEMA_STRICT=true`，端口 18080）：

- 第 1 次：`READY after 142s live=200 ready=200`
- 第 2 次（幂等）：`READY after 153s live=200 ready=200`
- 备份恢复后：`READY after 148s live=200 ready=200`
- 日志：权限注解校验 171 个 menuKey 均存在；结构契约 **87/87** 通过；菜单/角色/文档中心专题菜单均就绪。

> 测试库账号 `fengsong_mt` 有 `max_questions=36000/小时` 限制；多次启动会耗尽。解决办法是先批量导入 `sys_translation`（避免 8005 条逐行同步），并等待限额窗口重置后重跑。

### 25.5 基线备份 / 恢复演练（通过）

- 基线全库导出：**348 表、10,434 行、0.92 MB（gzip）**，含每表行数/CHECKSUM/建表哈希清单。
- 清空后恢复：**348 表全部回来，逐表行数比对 0 处不一致**；恢复后重启应用 `ready=200`（148s）。
- 产物：`.local/backups/fengsong_test-baseline-20261025-123735.sql.gz` + `.manifest.json`；schema-only：`.local/backups/fengsong-schema-20261025-112251.sql.gz`。
- 当前测试库：348 表、395 个迁移版本、8,487 条翻译、279 条菜单；**0 个用户、0 条业务文档/接口数据**（未复制生产数据）。

### 25.6 结论

- P0「干净库重放 + 备份恢复」已按当前代码的可行口径完成：**当前 schema 基线 + 配置种子 → 应用启动 ready=200 → 备份/清空/恢复 → 再启动 ready=200**。
- **裸库（只跑 `01_init_system.sql` 的 5 张表）仍不支持自建**，这是待补的产品/工程债；本轮的 11 个顺序修复已让裸库多推进多个模块，但仍有 `mcp_tool` / HR 绩效等成熟库假设。
- 测试库没有复制任何用户，无法直接登录 UI；如需浏览器验收，需另行创建测试账号。

### 25.7 当前验证状态

- 生产库服务：PID **14588**，`live=200`、`ready=200`，JAR 12:42:25；接口管理 15 个中文系统、系统方案库 22 条。
- 生产类编译：`mvn -Dmaven.test.skip=true package` 成功；JAR 已复制回 `target/mftb-admin.jar`，重启用 `restart-service.sh --fast`。
- 后端测试：被并行改动 `AgentRunWorkerAndActionExecutionTest` 的构造器不匹配阻断（`AgentRunWorker` 新增 `SysUserMapper` 参数，测试未同步），非本轮改动；待其修复后补跑全量。
- 本轮新增的 `OrgScopeSchemaInitializerTest`、`UserSessionSchemaInitializerTest`、`MigrationCatalogTest` 在并行阻断前已通过。




