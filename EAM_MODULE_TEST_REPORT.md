# EAM 资产管理模块全面测试交接报告

> **报告日期**：2026-09-17
> **测试对象**：闪蜂推广管理后台 — 资产管理(EAM)模块（前后端 + 数据库全链路）
> **测试方式**：浏览器代理端到端测试 + API 验证 + 后端代码审查
> **报告目的**：更换新电脑后的工作交接。新环境 AI Agent 应先完整阅读本报告，识别已完成工作（避免重复修复），再执行「§7 下一步行动指南」。
> **配套提交**：本报告与全部代码修复同一批提交入库（见 §8 提交记录）。

---

## 1. 测试覆盖范围与进度总结

按业务流转顺序执行，**步骤 1-5 已完成测试且全部确认缺陷已修复部署验证；步骤 6-7 后端逻辑已通过代码审查预验证，端到端验证未执行**（原定浏览器代理执行被取消，任务移交新环境）。

| 步骤 | 范围 | 状态 | 修复数 |
|------|------|------|--------|
| 1. 基础配置 | 品牌库、模型库、参数库、存放地点、资产标签（不含导出 PDF 标签） | ✅ 完成 | 8（B4/B1-B3/B5/B7/B9/B11） |
| 2. 采购订单管理 | 直接录入 + 采购申请 OA 流程触发订单 | ✅ 完成 | 6（Bug1/2/3/A/B/D） |
| 3. 验收入库管理 | 验收通过/不通过/部分验收/多件边缘情况 | ✅ 完成 | 1（BUG-1 P0） |
| 4. 资产台账管理 | 登记、查询、详情、状态展示 | ✅ 完成 | 7（BUG-01/02/03/04/08/09/10，含领用） |
| 5. 领用管理 | 领用审批、签收、资产状态变更为使用中 | ✅ 完成 | （同上批次） |
| 6. 借用管理 | 借用人/期限/归还日期/状态流转 | ⚠️ 代码审查通过，**端到端验证未执行** | 0 |
| 7. 归还管理 | 状态检查/数量核对/状态回退 | ⚠️ 代码审查通过，**端到端验证未执行** | 0 |

**合计：确认并修复 22 个真实缺陷**（阻塞级 1、P0 4、高 3、中 7、低 7），另有误报排除 7 项、待产品确认 8 项。

---

## 2. 已修复 Bug 清单（22 项，全部已验证）

### 2.1 步骤1 基础配置（8 项）

| 编号 | 严重度 | 问题描述 | 修复文件 | 验证结果 |
|------|--------|----------|----------|----------|
| B4 | P0 | 参数类型表单分类树数据结构错误：用 `{label, options}` 传给 TreeSelect（应为 `{title, value, children}` 递归树），整棵分类树无法显示 | `src/pages/AssetManagement/ParamLibrary/ParamTypeForm.tsx` | 浏览器验证树正常展示、可搜索（treeNodeFilterProp="title"） |
| B1 | 中 | 品牌列表点击品牌后，右侧产品列表/总数未清空（脏数据残留） | `src/pages/AssetManagement/AssetModel/ModelList.tsx` | handleBrandClick 清空 products/total |
| B2 | 中 | 删除品牌后列表未刷新 | 同上 | handleDeleteBrand 无条件刷新 |
| B3 | 低 | 操作列点击冒泡到行，误触行点击（进入详情） | 同上 | 操作列 onCell stopPropagation |
| B5 | P0 | 参数描述字段全链路丢失：前端提交 description 但后端实体/DTO/VO/建表 SQL 均无该列 | `backend/.../entity/EamParamType.java`、`backend/.../dto/EamParamTypeSaveDTO.java`、`backend/.../service/impl/EamBasicDataServiceImpl.java`、`backend/.../config/DataInitializer.java`（versionTracker 迁移 `eam:param-type-description-v1`）、`backend/sql/123_eam_param_library.sql` | 运行时迁移自动补列，保存/回显正常 |
| B7 | 低 | i18n 缺 key：`common.enableSuccess` / `common.disableSuccess` | `src/i18n/locales/zh-TW.json`、`en.json` | 启用/停用提示正常 |
| B9 | 低 | 存放地点删除确认文案引用不存在的 `asset.confirmDeleteTitle` | `src/pages/AssetManagement/AssetLocation/LocationList.tsx` | 改用 `common.confirmDelete` 等通用 key |
| B11 | 低 | 繁体语言包混入简体文案（`assetTag.confirmDisableTitle`） | `src/i18n/locales/zh-TW.json` | 已改繁体 |

### 2.2 步骤2 采购订单（6 项）

| 编号 | 严重度 | 问题描述 | 修复文件 | 验证结果 |
|------|--------|----------|----------|----------|
| Bug1 | **阻塞** | 「開始採購/完成採購」处理器是死代码——按钮从未渲染，订单执行状态无法推进、无法走到验收入库 | `src/pages/AssetManagement/PurchaseOrder/OrderList.tsx`（操作列补按钮，width 200→240）、`OrderDetail.tsx`（extra 区按钮 + 经办人选择 Modal + updatePurchaseOrderExec） | 浏览器验证状态推进 pending→purchasing→completed |
| Bug2 | 中 | 登录后公司品牌下拉使用登录前旧缓存（Context 未感知认证态） | `src/contexts/CompanyBrandContext.tsx`（useEffect 依赖 isAuthenticated） | 登录后重拉正常 |
| Bug3 | 低 | 删除订单文案 key 不存在（asset.confirmDeleteTitle 等） | `OrderList.tsx` | 改用 common.* 通用 key |
| BugA | P0 | 审批详情页竞态：路由参数（flowNo）重复触发 effect 全量重复加载 | `src/pages/ApprovalDetail/index.tsx`（新增 `oaLoadedFlowNoRef` 守卫，成功加载后记录 flowNo） | 网络面板确认单次加载 |
| BugB | **P0 性能** | 请求风暴 44 req/s：useEffect 依赖不稳定引用（对象/数组字面量）+ setState 形成死循环；**是 SQLPUB `max_questions` 配额耗尽的直接原因** | `src/pages/AssetManagement/PurchaseOrder/OrderAdd.tsx`、`OrderEdit.tsx`、`src/pages/AssetManagement/AssetAdd/index.tsx`、`src/pages/OACenter/OaPurchaseRequest/index.tsx`（统一模式：useMemo 派生稳定字符串 key + let alive + cleanup） | 网络面板确认参数加载收敛为个位数请求 |
| BugD | 高 | 采购申请 OA 流程自动生成的订单明细 `categoryCode` 为空（台账分类筛选/统计查不到） | `backend/.../service/impl/EamPurchaseServiceImpl.java`（createOrderFromRequest 通过 modelId 反查 EamModel、categoryCode 反查 EamCategory 补全 categoryCode/brandId/brandName/modelName/categoryId/categoryName） | API 验证自动订单明细字段完整 |

### 2.3 步骤3 验收入库（1 项 P0）

| 编号 | 严重度 | 问题描述 | 修复文件 | 验证结果 |
|------|--------|----------|----------|----------|
| BUG-1 | **P0** | 单批次验收 qty≥2 必然失败：资产编号取号（SELECT MAX）在生成阶段执行，而资产 INSERT 在批次插入之后，同批次内后续件看不到前面件已占用的编号 → 编号重复 → DuplicateKeyException → 整个验收事务回滚。历史批次成功说明是回归 | `backend/.../service/impl/EamInboundServiceImpl.java`（createBatch 重构：**批次先插（计数暂置 0）→ 循环内即时 `asset.setBatchId(batch.getId()); assetMapper.insert(asset)`（事务内读己之写）→ 循环后 batchMapper.updateById 回写统计**） | **API 验证通过**：qty=3 单批次成功生成 3 个唯一编号（...-0012/-0013/-0014），批次统计回写正确 |

> 资产价值口径核实：取 `confirmedPrice`（确认单价）正确，非缺陷。

### 2.4 步骤4/5 资产台账 + 领用（7 项）

| 编号 | 严重度 | 问题描述 | 修复文件 | 验证结果 |
|------|--------|----------|----------|----------|
| BUG-01 | **P0** | 领用表单三个下拉（资产/领用人/部门）**永久 disabled**：`ClaimForm` 声明了 `onAssetQuery/onEmployeeQuery/assets/employees/departments/initialAsset/initialEmployee` 等 props，但父组件从未传入（`disabled={!onAssetQuery || submitting}` 恒真） | `src/pages/AssetManagement/AssetClaim/index.tsx`（接线全部 props：新增 handleAssetQuery（fetchAssetList status:'idle' → ClaimAssetOption 映射）、handleEmployeeQuery（fetchEmployees employmentStatus:'active' → employeeId/empNo/empName 映射）、?assetId/?employeeId 深层链接预填 effect） | 三下拉数据加载与联动恢复（后端部署验证） |
| BUG-02 | 低 | 详情页 i18n key 缺失（`asset.inboundInfo` 不存在） | `src/pages/AssetManagement/AssetDetail/index.tsx`（改用 `asset.inboundInfoTitle`） | 文案正常 |
| BUG-03 | 中 | 领用记录分页请求参数错：传 `{count}` 应为 `{total}`，记录总数始终错误 | `src/pages/AssetManagement/AssetClaim/ClaimList.tsx`、`ClaimRecordTable.tsx` | 分页总数正确 |
| BUG-04 | 中 | 资产编辑模式 `companyBrand` 未回填（setFieldsValue 缺字段），保存后被清空 | `src/pages/AssetManagement/AssetAdd/index.tsx`（补充 `companyBrand: data.companyBrand ?? undefined`） | 回填正常 |
| BUG-08 | 中 | 领用未回写资产 `usageDate`（启用日期缺失，台账无法统计使用时长） | `backend/.../service/impl/EamClaimServiceImpl.java`（registerClaim 代办分支 + signClaim 分支：`asset.setUsageDate(claim.getClaimDate().toString())`） | API 验证 usageDate 已写入 |
| BUG-09 | 低 | 领用记录详情操作人显示为空（updatedBy 兜底不全） | `src/pages/AssetManagement/AssetClaim/ClaimRecordDetail.tsx`（`record?.updatedBy \|\| record?.operator \|\| '—'`） | 显示正常 |
| BUG-10 | 高 | 「待签收」统计口径错误：stats 查 `status='pending_signature'`，实际签收态存于 `signatureStatus` 字段 | `backend/.../service/impl/EamClaimServiceImpl.java`（pendingSignatureCount 改 `in(signatureStatus,"pending","proxy_pending")`；proxyPendingCount 去掉多余 status 条件） | 统计卡数字与列表一致 |

---

## 3. 误报排除（未改代码，避免新环境重复排查）

| 项 | 现象 | 判定依据 |
|----|------|----------|
| BUG-4(入库) | 探测 `/api/eam/inbound/orders` 等端点返回 500 | grep 确认前端从不调用这些 URL（真实端点为 `/eam/basic/locations`、`/eam/assets`），是自动化代理探测了不存在的端点 |
| BUG-07 | 声称资产详情页 params/photos 是"计算了但从未渲染的死代码" | `AssetDetail/index.tsx` L137-161 存在条件渲染（`paramEntries.length > 0`、`imageList.length > 0`）；测试资产 params={}、图片为 1×1 透明占位，属数据驱动非缺陷 |
| Bug F | InputNumber valuemax=0 误读 | 自动化 a11y 快照误读，订单实际以 qty 2/3/5 成功创建 |
| Bug G | 弹窗首次点击丢失 | Modal 动画期点击时序问题（自动化伪影），人工节奏点击正常 |
| Bug C/E/H | 其他疑似异常 | 核实为非缺陷/设计行为 |

---

## 4. 遗留问题 / 待产品确认项清单

### 4.1 待产品确认（需要业务决策，勿擅自改）

| 项 | 问题描述 | 影响范围 |
|----|----------|----------|
| BUG-05 | 资产名称品牌前缀不一致：OrderAdd 入库链路拼接品牌前缀，AssetAdd 登记用 `model.name` 原名。需统一命名规则 | 台账名称一致性 |
| BUG-06 | 入库生成资产的 `company` 字段为空：需决策 company ↔ companyBrand 映射规则 | 台账公司维度筛选 |
| 入库BUG-3 | 让步接收（concession）语义：是否应生成资产、是否计入「已接收」数量 | 验收统计口径 |
| BorrowForm UX | 借用表单用 InputNumber 手输资产 DB id / 借用人 DB id（功能可用但反人类）。建议改造为下拉（参考领用表单接线模式） | 借用可用性 |

### 4.2 低优先级记录（不影响主流程）

| 项 | 描述 |
|----|------|
| BUG-11(领用) | 「我的领用」入口疑似死代码，需确认是否保留 |
| BUG-12 | 面包屑/页签未接 i18n |
| BUG-13 | 部分列表时间显示 ISO 原始字符串未格式化 |
| BUG-15 | React StrictMode 开发态双重请求（生产无影响，属已知行为） |
| AssetTagPrint | `Cannot find module 'qrcode'/'jspdf'/'html-to-image'`：package.json 已声明但 node_modules 缺失，**新电脑 `npm ci --legacy-peer-deps` 即可解决**；属预存在问题，与本次修复无关（用户明确跳过 PDF 标签验证） |

---

## 5. 代码质量检查结果（截至交接时）

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 前端类型检查 | `npm run typecheck` | **0 错误**（改动文件；AssetTagPrint 缺依赖为预存在独立问题，见 §4.2） |
| 前端 Lint | `npm run lint` | **0 errors**（12 个预存在 warnings，渐进修复中） |
| 后端单元测试 | `cd backend && mvn test -B` | **EAM 25 个全过**（EamInbound 10 + EamPurchase 15） |
| 后端编译 | `cd backend && mvn compile -q` | 通过 |
| BUG-1 修复专项 | API 实测 | qty=3 单批次生成 3 个唯一编号，批次统计回写正确 |
| 请求风暴回归 | 浏览器网络面板 | 参数加载收敛为个位数请求（修复前 44 req/s） |

---

## 6. 关键技术方案说明（防止新环境"好心"回退）

### 6.1 BUG-1：事务内「读己之写」取号（EamInboundServiceImpl.createBatch）
- **原缺陷根因**：资产编号 `SELECT MAX(asset_no)` 在生成阶段统一执行，INSERT 在批次插入后——同批次第 2+ 件看不到第 1 件未提交的编号 → 重号 → 事务回滚。
- **修复方案**：先 INSERT 批次记录（total/ok 计数暂置 0）→ 明细循环内**即时** `asset.setBatchId(batch.getId()); assetMapper.insert(asset)`（MySQL 同事务内 SELECT 可见自己未提交的 INSERT，即 read-your-writes）→ 循环结束 `batchMapper.updateById(batch)` 回写统计。
- **⚠️ 不可回退**：若把 INSERT 移回循环外批量执行，多件验收必然回归。

### 6.2 BugB：请求风暴根治模式（4 个页面统一）
- **根因**：useEffect 依赖数组含不稳定引用（对象/数组字面量每次渲染新建）+ effect 内 setState → 无限循环。
- **修复模式**（新页面同样适用）：
  ```tsx
  const selectFieldKeys = useMemo(() => fields.map(f => f.field).join(','), [fields])
  useEffect(() => {
    let alive = true
    // fetch with selectFieldKeys derived params
    return () => { alive = false }
  }, [selectFieldKeys])
  ```

### 6.3 BugA：审批详情页竞态守卫（ApprovalDetail/index.tsx）
- 新增 `const oaLoadedFlowNoRef = useRef<string | null>(null)`；oa_purchase 分支加载 effect 首行守卫 `if (type === 'oa_purchase' && oaLoadedFlowNoRef.current === flowNo) return`；加载成功后写入 ref。

### 6.4 BUG-01：领用表单 props 接线（AssetClaim/index.tsx）
- ClaimForm 需要的 7 个 props 全部由父组件传入；资产下拉数据源 = `fetchAssetList({ status: 'idle' })` 映射 ClaimAssetOption；员工下拉 = `fetchEmployees({ employmentStatus: 'active' })` 映射（employeeId=e.id, empNo=e.empId, empName=e.name）；支持 `?assetId=` / `?employeeId=` URL 深层链接预填。**新页面接入下拉选择时应复用此模式，而非 InputNumber 手输 id。**

### 6.5 BUG-10：签收状态口径
- 签收状态字段是 `signatureStatus`（pending / proxy_pending / signed），不是主 status。所有「待签收」类查询/统计必须 `in(signatureStatus, "pending", "proxy_pending")`。领用代办（proxy）创建即 `status=claimed` + 立即占用资产（in_use），签名留待补签。

### 6.6 后端本地启动流程（新电脑必读）
```bash
cd backend
# ⚠️ 不可直接 `source .env`：DB_URL 含未引号 & 会被 shell 截断
# 正确方式：逐行导出后启动
while IFS='=' read -r k v; do export "$k=$v"; done < .env
mvn spring-boot:run   # 端口 8080
```
- **重启旧进程**：`kill -9 <pid>` 在沙箱内可能不生效，需提升权限执行；重启前先确认 8080 已释放、`jps` 无残留 Java 进程，否则出现双实例/端口占用。
- **SQLPUB 测试库配额**：`max_questions=36000`，耗尽报错 `User 'fengsong_mt' has exceeded the 'max_questions' resource`，约 1 小时重置。请求风暴（BugB）是上次耗尽主因，已根治，但仍避免高频循环压测。

---

## 7. 下一步行动指南（新环境 AI Agent 执行入口）

### 7.0 环境快速启动
```bash
# 前端（仓库根目录）
npm ci --legacy-peer-deps     # 必须 --legacy-peer-deps
npm run dev                    # http://localhost:3000
# 后端
cd backend && （按 §6.6 加载 .env）&& mvn spring-boot:run   # http://localhost:8080
# 登录凭据：MF00001 / 111222（Bee，管理员）
```

### 7.1 步骤6 借用管理端到端验证（未完成）
后端逻辑已审查确认正确（`EamBorrowServiceImpl.register`：校验资产 idle → 创建借用单 status=active（dueDate<今天则 overdue）→ 资产置 in_use + userName=借用人）。
- **UI 路径**：资产管理 → 借用管理 → 新增借用。⚠️ 表单为原始 InputNumber 输入资产 id / 借用人 id（记录在 §4.1 UX 缺口，功能可用）。
- **API 替代方案**（推荐，绕开 UX 缺口）：
  1. `POST /api/eam/borrow/register`：`{ assetId: 29, holderId: 16, department: "後端研發部", startDate: "2026-09-17", dueDate: "2026-09-30", purpose: "测试借用" }` → 期望返回 borrowId，borrowNo 形如 `JY...`
  2. `GET /api/eam/asset/{id}` 验证资产 29：`status=in_use`、`currentHolderId=16`、`userName=刘卫`
  3. 反例验证：对同一资产再次借用 → 期望报错「僅閒置資產可借用」
- **参考快照数据**（2026-09-17，新环境需重新查询）：闲置资产 id=29(TB-M-0101-0011)、id=31(0013)、id=32(0014)；员工 sys_user.id=16 刘卫(後端研發部)、id=10 李科、id=14 周忠浩。

### 7.2 步骤7 归还管理端到端验证（未完成）
后端逻辑已审查确认正确（`EamReturnServiceImpl`）：
- **正常归还（normal）**：ret.returnStatus=completed → `releaseAsset`：资产回 idle、清 currentHolderId/activeClaimId/userName；来源单（claim/borrow）置 returned + returnDate。
- **损坏/遗失（damaged/lost）**：returnStatus=exception_pending，**不释放资产**；随后 `dispose`（scrapped/written_off→资产 scrapped；idle→资产回 idle；returnStatus→exception_closed）或 `recover`（资产回 idle，recovered=1 防重复）。
- **UI 路径**：归还管理 → 从借用记录进入归还登记（ReturnForm 会绑定 borrowId，无来源时确认按钮禁用——属设计）。表单文案为简体（「正常/损坏/遗失」），与全站繁体规范不一致，可顺带记录。
- **API 验证序列**：
  1. 承接 7.1 的 borrowId → `POST /api/eam/return/register` `{ borrowId, returnDate, assetCondition: "normal", returnReason: "测试正常归还" }` → 验证资产 29 回 idle、借用单 returned
  2. 再借用资产 31 → `register` with `assetCondition: "damaged"` → 验证资产 exception_pending → `POST /api/eam/return/dispose` `{ returnId, disposition: "scrapped" }` → 验证资产 scrapped
  3. 遗失分支：`register` with `lost` → `recover` → 验证资产回 idle；重复 recover 期望报错「已登記找回，不可重複操作」
- **数量核对**：归还针对单件资产（借用/领用均 1 资产 1 单），核对 return 记录与来源单一一对应即可。

### 7.3 回归验证（所有验证完成后必跑）
```bash
npm run typecheck && npm run lint          # 前端 0 错误基线
cd backend && mvn test -B                  # EAM 25 测试全过基线
```

### 7.4 后续任务优先级建议
1. 步骤 6/7 端到端验证（§7.1-7.2，API 方案约 15 分钟）
2. 待产品确认项决策（§4.1，尤其 BorrowForm 改造——可完全复用 §6.4 模式）
3. 低优先级清理（§4.2：BUG-12/13、ReturnForm 简体文案统一繁体）
4. 渐进修复 12 个预存在 lint warnings

---

## 8. 提交记录

- 本次修复与报告以两个提交入库：
  1. `fix(eam): 资产管理模块全面测试修复 22 项缺陷（26 文件）`
  2. `docs(eam): 新增 EAM 模块测试交接报告`
- 涉及文件清单：8 个后端 Java/SQL + 18 个前端 tsx/json + 本报告。以 `git log --oneline` 与 `git show --stat` 为准。
- 远程仓库：`origin https://github.com/fengsong7889/-mftb-admin-portal.git`（main 分支）。

## 9. 历史上下文（前序会话成果，供追溯）

- 采购订单→验收入库→资产台账数据流转、验收入库状态机重构（PR-1/2/3）、换货闭环、批次号规则、待验收件数统计、配件多计量单位等已在历史提交 `8dffed2`、`91721c5`、`02f7db5` 完成，本报告仅覆盖 2026-09-17 全量测试会话。
