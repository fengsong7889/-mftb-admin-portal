# 代码注释覆盖度审计与例外登记

> 审计日期：2026-10-05  
> 范围：全仓 1856 个源文件（前端 632 个 ts/tsx、后端 1224 个 Java、SQL 240 个、脚本 9 个）  
> 依据：`.qoder/rules/frontend-ui-design-spec.md` §I 代码注释规范、§M 例外登记、`AGENTS.md` 强制元规则

## 一、基线结论（修正后数字）

审计过程中我的检测器先后产生过两批严重虚高的数字，下表为**复核后的真实值**，
原始虚高值一并保留，便于后续对照，避免再被同样的假信号误导。

| 分层 | 审计前真实缺口 | 现状 | 原始误报值 | 误报原因 |
|------|---------|--------|-----------|---------|
| 零注释源文件 | 45（前端 21 + 后端 24） | **0** | — | — |
| Java 类级 Javadoc | 37（17 Mapper + 18 Service/接口） | **0** | — | — |
| Controller 端点 | 42（报称 131） | 仅剩 2（HealthController live/ready，类注释已覆盖，故意不加） | **131** | 检测器不认 `@Operation` 为文档；且 `@Operation` 常写在 `@GetMapping` <b>之后</b>，只向上回溯会看不到它 |
| Service/Mapper 接口方法 | 819 个中 98 缺（报称“11% 覆盖”） | **813/819 = 99%**，剩余 6 个均为 default 方法体内语句被误判为声明 | 报告为「**11% 覆盖率**」 | 正则只匹配显式 `public`，漏掉接口隐式方法；`@Override` 实现类的注释本应从接口继承。实际审计前接口覆盖率已达 **88%** |
| `src/api` 导出函数 | 949 个中 206 缺 | **868/949 = 91%**，新增 125 条 | 215（估算） | 剩余 81 个为本地函数（localStorage、字符串格式化、Mock 构造），不对应任何后端接口，**有意不加** |
| SQL 迁移文件 | 0 | 0 | — | 240 个全部有头部注释，无缺口 |
| 前端页面文件头注释 | 308 个文件无头注释 | **未做（有意）** | — | 这些文件内部已有注释体系，缺的只是文件头，不影响理解；经确认不在本次补齐范围 |

上述“现状”由同一套已修正的检测脚本得出（`.qoder/temp/audit/ctrl_gaps3.py`、
`iface_final.py`、`api_gaps.py`）；过程中同一指标曾出现 131/42/38/2 四个值，
差异均来自检测口径，因此**后续引用时请使用本表数值并保留脚本**。

Controller 的 2 处缺口位于 `HealthController`（`live` / `ready`），其类级注释已完整
覆盖两个端点语义，**故意不加重复注释**。

`src/api` 剩余 81 个未加注释的导出是有意跳过的：它们是本地函数（localStorage 读写、
字符串格式化、Mock 数据构造），不对应任何后端接口。曾有一版脚本把 `POST /mcp/exec`
错贴到只做 localStorage 写入的 `setEngineMode` 上，原因就是用「到下一个 export 为止」
划定函数体会跳函数边界；改为大括号配对后这类误贴消失。

同理，`formatContextWindow`、`probeEngineStatus`、`CERT_DETAIL_PATH` 等导出也被
排除在自动注释之外——给不是请求封装的函数写“请求封装”本身就是错注释。

## 二、§M 例外登记：繁体注释

| 项目 | 内容 |
|------|------|
| 例外内容 | 391 个文件中的注释使用繁体中文，不符合 §I「注释统一使用简体中文」 |
| 原因 | 项目默认语言为 zh-TW，这些注释与相邻的繁体界面文案、繁体业务术语逐字对应；转写为简体不会提升可读性，反而会让「注释用词」与「代码里的文案常量」对不上，制造纯 churn diff |
| 风险 | 跨简体背景协作者阅读注释需额外适应；与 §I 存在字面冲突 |
| 补偿措施 | 本次新增的全部注释一律使用简体中文（含 Java JSDoc/Javadoc、TS JSDoc、行内注释）；后续新写内容按 §I 执行，逐步自然收敛，不做集中转写 |
| 负责人 | 待指派（本次登记由注释覆盖度审计发起） |
| 到期时间 | 建议 6 个月后复审实际收敛情况，具体到期时间待确认 |

检测口径说明：初版检测把「置/列/移」等**简繁同形字**误计入繁体，报出 1162 个文件；
改为人工整理的「仅收录繁简字形不同者」对照表后降为 391 个，并抽查 5 个文件确认为真实繁体。

## 三、审计过程中发现的非注释问题

以下问题在补注释时逐个 grep 实现验证语义而暴露，**均为既有缺陷，不是本次改动造成的**。

### 1. 指向已删除表的死代码

- `ConsumableCategoryMapper` / `ConsumableBrandMapper` 及其实体 `ConsumableCategory` /
  `ConsumableBrand`：目标表 `biz_consumable_category`、`biz_consumable_brand` 已由
  `EamSchemaMigrationInitializer` 迁移至统一表 `biz_eam_category` / `biz_eam_brand`
  （以 `biz_type` 区分）后 DROP，全仓无调用方。
- 处置：已在两个 Mapper 上标注「遗留代码」，**未删除**（删除需另行确认）。

### 2. 会误导阅读者的错误注释（已修正）

- `ConsumableBasicDataService.listBrands` 原文写「null 表示全部」，实现是
  **null 默认退为 CONSUMABLE**，需要全量时必须自行合并多次调用。
- `EamConsumableItem.consumableCategoryId` / `brandId` 注释仍指向已 DROP 的两张旧表，
  实际走 `EamCategoryMapper` / `EamBrandMapper`（`biz_eam_category` / `biz_eam_brand`）。

### 3. 校验缺失与状态写入无约束

- `AiDeptQuotaService.toggleDeptQuotaStatus`：Controller 与 Service **均未校验** status
  取值，任意整数会被直接写入 `status` 字段（数据库无 CHECK 约束）。
- `AiDeptQuotaService.saveDeptQuota`：字段写入是「全量覆盖」而非「null 保留原值」，
  仅 currency / softThreshold / totalEmployeeCount / status 四项有默认值兜底，
  其余字段（含 `quotaValue`、`downgradeModelId`）传 null 会**清空库里原值**。
- `ConsumableBasicDataService.deleteBrand`：只校验品牌存在，未校验是否仍被耗材档案引用。
- `SysHrDictService.delete` / `SysPurchaseCompanyService.delete`：均只校项是否存在，
  **不校是否仍被员工/耗材/资产档案引用**，可直接删掉正在使用的字典项。
- `SysHrDictService.update`：只校 id 存在，**不重校 code 唯一性**（同类的
  `SysPurchaseCompanyService.update` 则会校），编辑时可以把 code 改到与同类型另一项重复。
- 对比参考：`EmployeeSalaryService` 与 `EmployeeContractService` 均做了完整归属校验
  （`requireOwned` / `!userId.equals(entity.getUserId())`），且越权与不存在共用
  同一措辞，不泄露他人记录存在性 —— 同一项目内校验强度不一致，新增写接口时应向这套对齐。

### 4. 编译阻塞（已修复）

- `RdmAnalyticsService.java`：`buildOverview` 的 SQL 字符串拼接中，某行字符串字面量
  **外侧多出一个 `)`**，提前闭合了 `queryForList(`，导致整个模块编译失败。该文件此前
  未被纳入增量编译所以未暴露，本次因改动触发全量编译才显现。已删除多余括号，
  修复后 `mvn -o compile` 通过。

### 5. 重复实现（仅记录，未改）

- 表单页头至少 5 套并行实现：`DetailPageHeader`、`AccountBalance/FormPageHeader`、
  `AssetTransfer/TransferLayout`、`AssetClaim/ClaimLayout`、`NotificationFormHeader`，
  `headerGradientShift` 渐变动画在 20+ 文件中重复。已在相关文件头注明「不要再第六次拷贝」。
- `Recommend/components/ChannelSelector.tsx`：**全仓无调用方**，各页面均自行使用
  antd Select + `RECOMMEND_CHANNEL_OPTIONS`。已标注为遗留代码。

### 6. 技术债标注

- `AssetClaim/ClaimRecordTable.tsx` 的 `STATUS_META` 中，`transferred` 一项的 `label`
  存的是 i18n key 而非文案，`ClaimStatusTag` 对该值特判走 `t()`。已注明
  **不要把该行「修正」成直接文案，也不要去掉特判**，否则单元格会原样输出字面量。

## 四、验证方式

| 检查 | 命令 | 结果 |
|------|------|------|
| 后端编译 | `mvn -o -q compile -DskipTests` | 通过（EXIT=0） |
| 前端类型检查 | `npm run typecheck` | 本次改动 0 错误；剩余 3 个错误全部集中在 `src/pages/Rdm/requirementExport.ts`（untracked，本次未触碰，于 13:35 被外部修改），为 `RdmRequirementRow` 缺少 `stayDays` / `reworkCount` / `changeCount` 三个字段 |
| 前端 Lint | `npx eslint <改动目录>` | 0 error；10 个 warning 均为既有问题（fast-refresh、未使用的 `Tag` import） |

本次全程未启动或重启任何服务，未执行 git commit / push。
