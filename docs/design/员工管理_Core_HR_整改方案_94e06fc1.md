# 员工管理 Core HR 整改方案

## 一、结论与评估边界

**当前模块更接近“员工账号管理 + 部分人事档案”，尚不是成熟的 Core HR。优先级应是数据可信、权限边界和人事事件闭环，而非单纯增加页面。**

- 用户已确认：面向中国境内，范围为组织、员工档案、雇佣任职、入转调离、合同、权限与审计；招聘、考勤、完整薪酬核算仅考虑接口边界。
- **边界已变更（2026-10）**：考勤不再只是“接口边界”，已按用户决策拆为**独立的第 14 个门户系统「考勤假勤系統」**（`system_code = attendance`），并把原本挂在集团人事下的「請假管理 / 假期額度」两条菜单迁入。原因与代码地图见第十节。本节的其余结论仍针对集团人事本身。
- 流程入口统一原则：所有申请流程统一从现有 OA「流程中心」发起，在「流程事项」查看、审核和跟踪；各业务模块不独立新增流程菜单、申请列表或审批列表。本次按此原则接入 HR 流程，不额外扩大为全仓现有流程改造。
- 不新增「员工服务/OA」分组，也不新增集团人事下的「人事事务」流程菜单；员工和经理自助是权限与场景能力，不等于新建一套流程入口。
- 本方案来自当前工作区的静态代码核验与公开资料调研；未读取生产员工明细、未执行生产接口写入、未进行浏览器保存回归，因此“有真实接口”不等于“生产数据已核实准确”。
- 此前专项代码审查被中断，没有形成独立审查报告；以下为后续直接核验的现状与整改建议，不将中断审查作为依据。
- 当前集团人事已有四个菜单：员工管理、组织管理、职位管理、员工动态。员工详情实际包含六个 Tab：职务数据、费用信息、基础信息、账号管理、合同信息、奖惩信息；紧急联系人位于基础信息内。
- 保留已有建设成果：统一 API、组织树、职位字典、职务历史、菜单操作权限、OA 审批和资产交接。采用增量改造，不推倒重建、不立即拆微服务。

## 二、哪些字段仍是 Mock 或不可信数据

### 2.1 已接真实 API 的部分

这里的“真实”仅指读取/写入数据库的代码链路存在，不代表字段业务口径已正确。

| 位置 | 字段/功能 | 当前来源与结论 |
|---|---|---|
| 员工列表、详情头部 | 工号、姓名、部门、职位中英文、职级序列、职级、职等、角色 ID、账号状态 | `/employees` → `sys_user`；不是 Mock。任职快照与职务历史存在双来源问题 |
| 在职状态 | 在职、离职 | 后端从职务记录派生；不是 Mock，但未正确排除未来生效记录 |
| 基础信息 | 姓名、国籍、民族、出生日期、婚姻状况、政治面貌、宗教信仰 | `/employees/{id}/basic-info/*` → `sys_user`；已有保存链路 |
| 证件信息 | 证件类型、号码、地址、户籍类型、户籍所在地、籍贯 | 同上；已有保存链路，但校验、脱敏和访问边界不足 |
| 通讯信息 | 住址国家、城市、详细地址 | 已持久化；国家代码与中文名称混用导致城市联动有问题 |
| 紧急联系人 | 姓名、联系电话、关系 | `/emergency-contacts` → `emp_emergency_contact`；真实 CRUD |
| 职务记录 | 生效日期、同日序号、操作、原因、服务部门、职级、任职公司、员工类别、工时制、上级、导师、工作国家/城市、办公地址、合同签订地 | `/position-records` → `emp_position_record`；真实 CRUD，但三个任职字段映射有缺陷，详见下表 |
| 费用信息 | 收入项目/金额/固定或浮动/备注；扣除项目/比例/金额/备注；薪资结构、结算方式、发薪日、银行、账号、计税城市 | `/salary/*` → `emp_salary_income/deduction/config`；不是 Mock |
| 费用概览 | 收入总额、扣除总额、净额 | 对接口返回的金额前端求和；不是 Mock，但并非已核算、已发放工资 |
| 账号管理 | 登录账号、冻结/解冻、重置密码、钉钉用户 ID | 已接真实接口；密码显示的圆点仅为安全占位，不是真实密码，也不应返回真实密码 |
| 授权展示 | 角色标签、部门授权标签 | 基于角色 ID、部门权限数据生成；详情使用“角色#ID”式标签属于展示不足，不是虚构角色 |

依据：[员工 API](file:///Users/yangjingjing/Desktop/SRAS/src/api/employee.ts)、[员工服务](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/service/impl/EmployeeServiceImpl.java#L347-L408)、[费用服务](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/service/impl/EmployeeSalaryServiceImpl.java)。

### 2.2 必须整改的非真实闭环

| 分类 | 具体字段/功能 | 核验结果 | 整改要求 |
|---|---|---|---|
| 仅前端看似保存 | **性别 `gender`、手机 `mobile`、邮箱 `email`** | 表单提交、请求 DTO 均有字段，但实体及保存/查询服务没有对应处理；前端更新 state 并提示成功，重新加载后无法从服务端恢复 | 补齐持久化、返回模型、校验与保存后重新查询测试 |
| 前后端字段不匹配 | **职位、职级序列、职等** | 职务表单提交 `position/sequence/rank`，API DTO 接收 `positionName/sequenceType/rankCode`；保存函数直接透传表单，未转换。初始入职记录由后端另行生成，因此可能造成“原有有值、新增或编辑丢值” | 显式转换请求和响应；不要用表单值覆盖服务端返回值冒充保存成功 |
| 未接通占位 | 合同编号、合同类型、开始/结束/签订日期、签约公司、状态、备注 | 列表初始为空；保存与删除仅提示“尚未接入后端 API”，没有真实读写，也不是可用的本地合同库 | P0 明示未开放并禁用入口；P1 建立合同台账及生命周期 |
| 未接通占位 | 奖惩类型、标题、日期、原因、级别、签发人、备注 | 与合同类似，只存在页面结构和未接通提示 | 暂不对外声称已支持；后续作为员工档案附属记录落地 |
| 本地伪审计 | 各 Tab 最后更新人、最后更新时间；列表同名字段的覆盖值 | 详情用浏览器时间和当前用户写 `emp_tab_update_*`；列表用 localStorage 覆盖后端结果。不同浏览器可不一致，且详情未从服务器恢复各 Tab 更新信息 | 审计与更新时间全部以服务端为准；localStorage 只保留列宽、筛选偏好等非业务状态 |
| 系统推定、未经核实 | 初始入职日期、初始工作国家、历史任职快照 | 新建账号即按当天生成“入职”；历史补录以账号创建日生成“入职”，缺日期时甚至兜底 `1970-01-01`，国家固定为中国 | 标记为“系统补录/待核实”，不得作为法定工龄、福利年限等权威依据；经 HR 确认再纳入正式人事口径 |
| 错误派生，非 Mock | 工龄、当前任职、详情在职状态 | 工龄按最小序号挑记录；当前任职按序号大小挑选；而后端序号是“同一天内递增”，不能跨日期比较 | 改由后端统一按生效日和雇佣期间计算；区分司龄、本次任职时长、认可工龄 |

关键证据：
- [基础信息前端读写](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/EmployeeDetail.tsx#L477-L543)、[后端保存遗漏](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/service/impl/EmployeeServiceImpl.java#L382-L408)。
- [职务提交函数](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/EmployeeDetail.tsx#L698-L752)、[后端职务 DTO](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/dto/PositionRecordRequest.java#L13-L40)。
- [合同和奖惩占位处理](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/EmployeeDetail.tsx#L1208-L1263)。
- [本地更新时间覆盖](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/index.tsx#L277-L327)。
- [历史入职补录](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/config/DataInitializer.java#L1180-L1234)。

### 2.3 静态字典不等于 Mock，但应集中治理

- 任职公司写死为“珠海闪蜂科技有限公司、珠海麦峰科技有限公司”；属于硬编码业务选项，不能据此确认真实雇主关系。
- M/T/P 序列、职务弹窗的 1～7 职级、R1～R5 职等、员工类别、工时制、收入/扣除项目、婚姻/民族/证件/关系等为静态选项。
- 国家/城市取自权限模块的静态配置，不是员工业务的独立地理主数据。通讯国家保存中文名称，但城市映射使用 `china` 等代码；工作地点又使用代码，回显口径不统一。
- 稳定法定枚举可以保留代码常量；公司、工作地点、职务体系等可变主数据必须由后台维护，并使用稳定 ID/code。
- `src/api/mock/hr-mock.ts` 确实存在员工种子和 localStorage CRUD，但**当前员工 API 没有调用它，也未接入请求失败自动降级**。其在 `merchantMock.ts` 中仍有源码引用，不能因为文件存在就把当前员工列表判定为 Mock，也不应未核验引用便全仓删除。

依据：[静态选项](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/EmployeeDetail.tsx#L128-L217)、[国家城市映射](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/types.ts#L896-L939)、[真实请求层](file:///Users/yangjingjing/Desktop/SRAS/src/api/request.ts)。

## 三、整体设计是否合理

### 3.1 合理且值得保留

1. 列表与详情分离、分组维护员工资料，基本的信息架构方向正确。
2. 使用职务记录承载人事变化，并引入生效日期和同日序号，是向成熟 Core HR 演进的合适基础。
3. 账号启停状态与在职状态已有概念上的区分，应继续保持，而不是合并成单一“状态”。
4. 已有真实组织、职位、OA 和 EAM 能力，具备渐进构建人事闭环的基础。

### 3.2 主要设计缺口及影响

| 优先级 | 问题 | 当前表现及业务影响 | 调整方向 |
|---|---|---|---|
| P0 | 数据写入不完整 | 性别/手机/邮箱不持久化，三个任职字段映射不一致，清空可选字段也可能因“null 不更新”失效 | 明确字段契约、清空语义、保存后回查；补回归测试 |
| P0 | 生效日期口径分裂 | 后端取未来记录也可派生离职；详情按跨日期序号选当前记录；列表、头部、时间轴可互相矛盾 | 后端唯一的 as-of 查询口径：已批准、未作废、生效日不晚于查询日，再按日期与同日序号取最新 |
| P0 | 当前任职存在多个事实来源 | 列表读 `sys_user` 部门/职位快照，详情优先读职务记录；职务服务不更新用户快照 | 任职历史成为权威源，账号中的任职信息仅为兼容投影，并集中更新/重建 |
| P0 | 列表筛选和导出不是完整结果 | 部门、序列、职级、职等、角色、更新人/时间仅过滤当前页；total 仍是后端原总数；导出也只有当前页过滤结果 | 所有筛选、计数、分页、全量导出同一后端查询条件 |
| P0 | 详情获取存在人数上限 | 详情通过拉第一页 `size=500` 后查找 ID，后端上限实际是 200；旧员工可能“列表能找到、详情找不到” | 新增精确详情接口，人员下拉改为分页搜索和按 ID 回显，禁止大分页模拟全量 |
| P0 | 人事查看权限过宽 | 员工列表 VO 包含完整证件号码、地址等；薪资、银行账号与普通员工资料共享同一菜单 view 权限 | 列表瘦身；人员范围权限、字段权限、敏感查看/导出权限分离，服务端脱敏 |
| P0 | 人事编辑与账号高危权限混用 | 同一 employee-management:edit 可维护人事资料、冻结账号、重置密码；员工写接口还接受角色字段 | 独立账号管理与授权权限；人事编辑不能隐式获得密码重置或角色授予能力 |
| P1 | “新增员工”实质为开账号 | 要先填密码、角色；系统直接把当天当入职日；缺待入职、报到、试用、转正等环节 | 先建人事档案和雇佣关系，账号按需开通；正式入职由业务动作确认 |
| P1 | 入转调离只有记录 CRUD | 直接新增/改写/删除历史，无审批与执行状态；没有转正动作；离职记录不驱动账号停用或交接协作 | 使用人事业务单驱动审批、生效、联动和留痕，历史更正走专门流程 |
| P1 | 关联关系用名称代替 ID | 服务部门、公司、职位、导师、直属上级多数存字符串，部分取值随界面语言变化；上级等同部门负责人 | 保存稳定 ID + 历史名称快照；直属汇报关系与部门负责人分开维护 |
| P1 | 缺少雇佣期间 | 同一员工离职再入职、跨法人转移都混在同一串任职记录中，无法可靠计算司龄和合同归属 | 人员档案、雇佣关系、任职记录分层；重新入职新建雇佣期间，保留原人员身份 |
| P1 | 薪资定义超出实际能力 | 收入减扣除即展示“实发”；没有工资期间、考勤结果、个税累计、单位/个人缴费区分和发薪结果 | 更名为薪酬档案/约定薪酬；配置汇总不得标为实际发放工资；实际结果由薪酬系统返回 |
| P1 | 审计与并发薄弱 | 人事服务未见业务事务/版本冲突控制；工号和同日序号有 MAX+1 生成方式；历史改写仅保留最新值 | 事务、唯一约束、幂等请求、并发版本、追加审计统一落地 |
| P1 | 删除不能代表离职 | 员工可直接逻辑删除；不能保证合同留存、历史单据查询和员工退出闭环 | 正式员工以离职/归档为主，删除仅限无业务关联的误建草稿 |
| P1 | 页面权限和交互不一致 | 列表“详情”依赖 edit 权限；详情各 Tab 操作未按权限隐藏；大量编辑 Modal 与项目独立页面规范不符 | view/edit 模式分开，独立编辑/业务单页面；普通查看者不出现不可执行按钮 |
| P2 | “员工动态”命名误导 | 实际主要是登录、退出、在线时长和强制下线，不是人事异动记录 | 更名“账号登录日志”，归入账号安全；人事事件时间轴独立展示 |

补充证据：[列表筛选与导出](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/index.tsx#L302-L388)、[详情大分页查找](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/EmployeeDetail.tsx#L449-L475)、[分页上限](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/dto/PageResult.java#L13-L31)、[日期与序号口径](file:///Users/yangjingjing/Desktop/SRAS/src/pages/Permission/Employee/EmployeeDetail.tsx#L637-L669)、[同日序号实现](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/service/impl/PositionRecordServiceImpl.java#L117-L125)、[员工权限边界](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/controller/EmployeeController.java)。

已有数据范围服务主要处理商家集团编码，不等于 HR 的法人/部门/汇报线人员范围，不能直接视为 HR 隔离已完成。[现有数据范围定义](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/service/DataScopeService.java)。

## 四、市面成熟 Core HR 的做法及本项目取舍

调研以官方文档为依据；Oracle、北森已获取正文，SAP、飞书部分页面仅取得官方搜索索引/摘要。以下用于提炼产品模式，不代表完成产品实测、采购选型或商业版本能力核验。

| 对标对象 | 成熟做法 | 本项目采用方式 |
|---|---|---|
| Oracle Fusion HCM | Person/Work Relationship/Assignment 分层；一个雇佣关系至少有一条任职，存在主任职概念；按任职范围授权 | 人员身份与账号解耦；雇佣期间独立；一期保证唯一主雇佣/主任职，兼岗扩展不作为首期阻塞项 |
| Oracle 日期生效模型 | 同一对象包含历史、当前、未来时间片；按指定日期查看；区分 correction、update、end date，并支持同日多次变更 | 统一生效日查询；未来异动不提前覆盖当前；历史更正、正常异动、撤销分开处理 |
| SAP SuccessFactors Employee Central | Job Information 是日期生效对象，强调连续的当前任职数据；存在未来生效数据访问控制 | 在有效雇佣期间保证任职连续且无冲突；未来记录明确标识并单独授权，不把“最后录入”当“当前生效” |
| 北森人事云 | 组织与编制、人事全生命周期、入职协同、员工全景档案、试用/合同提醒、组织与流程联动 | 优先落入转调离、合同提醒和员工档案；复用 OA 做审批，复用 EAM 做资产交接，避免再造完整协作平台 |
| 飞书人事 | 花名册、入转调离、合同管理、员工关怀，强调人事流程与办公协作结合 | 后续增加员工自助、经理自助及待办；不把所有事务都放到管理员详情页逐个修改 |

可归纳为六条成熟原则：
1. 一个人一份稳定主档，但可有多段雇佣经历；一个人事档案不必等于一个系统账号。
2. 历史、当前、未来同时存在，并有统一查询日期，不靠前端自行猜当前状态。
3. 入转调离由业务事件驱动，审批状态与人事生效状态分开。
4. 法人、组织、职务、岗位、职级、工作地点、汇报关系各有清晰含义和稳定标识。
5. 权限包含操作、人员范围、字段敏感级别，界面隐藏不能代替服务端授权。
6. HR 管理、自助服务、协同任务、预警报表基于同一份人事主数据。

### 中国境内的必要约束

- 合同流程支持书面合同签订时限、试用期期限规则、固定/无固定期限、续签及解除终止材料，不把合同当普通可删除附件。
- 解除或终止劳动合同文本至少保存二年备查；这不是“所有员工资料统一保存二年”，也不是期满自动删除的唯一条件。
- 宗教信仰默认不采集；民族、政治面貌、婚姻等按明确业务必要性配置，不能因为同行有字段就全部必填。
- 证件、金融账户等采取严格保护、最小返回、按权查看、导出留痕；明确各字段处理目的、合法性基础、保存期限及权利请求渠道。
- 人力资源管理必要性不是无限收集授权；涉及同意、单独同意、告知及影响评估的具体适用，由法务结合实际用工制度确认。
- 离职协作任务未完成可预警、升级和追踪，但不能据此擅自拖延依法应出具的证明或其他法定义务。

官方来源：
- [Oracle：Assignments](https://docs.oracle.com/en/cloud/saas/human-resources/fawhr/assignments.html)
- [Oracle：Manage Date Effective Objects](https://docs.oracle.com/en/cloud/saas/human-resources/farws/Manage_Date_Effective_Objects.html)
- [SAP：Job Information](https://help.sap.com/docs/successfactors-employee-central/implementing-employee-central-core/job-information)
- [北森：人事云功能介绍](https://www.beisen.com/res/1284.html)
- [飞书：人事标准版管理员手册](https://www.feishu.cn/hc/zh-CN/articles/360049068032-飞书人事标准版管理员使用手册)
- [国家统计局转载：个人信息保护法](https://www.stats.gov.cn/gk/tjfg/xgfxfg/202503/t20250310_1958923.html)
- [国家信访局：劳动合同法](https://www.gjxfj.gov.cn/gjxfj/xxgk/fgwj/flfg/webinfo/2016/03/1460585589931971.htm)

## 五、结合当前菜单，哪些模块需要优化

### 5.1 员工列表 → 员工花名册

- 默认列调整为：工号、姓名、雇主法人、所属部门、职位、人员类别、在职状态、试用状态、入职日期、工作地点、直属上级。
- 职位英文名、序列/职级/职等保留为可配置列；角色授权、部门菜单授权、密码重置退出默认人事列表。
- 在职、待入职、已离职为工作视图；“待转正、合同临期、资料待补”是筛选视图，不另造彼此冲突的在职状态。
- 所有筛选在服务端执行，列表、总数、统计卡、导出使用同一人员范围和条件。
- 增加导入预校验、重复身份提示、错误行下载；导出区分当前页、选中项、全部筛选结果，并实施独立授权与审计。
- 大批量导入/导出使用任务化处理；不通过增加分页上限解决问题。

### 5.2 员工详情 → 员工全景档案

建议 Tab 顺序：**概览 → 基本资料 → 雇佣与任职 → 合同与材料 → 薪酬档案（按权） → 人事记录 → 账号关联（按权）**。

- 概览展示统一后端生成的当前状态、当前雇佣/任职、未来异动提示和资料完整度；待办仅显示数量或摘要，点击跳转「流程事项」，不在档案内嵌入独立审批列表。
- 基本资料先修好性别、手机、邮箱，区分个人邮箱/工作邮箱；证件补签发/有效期、必要的核验状态和附件，不在普通列表返回完整号码。
- 紧急联系人保留，增加优先联系人标记；教育经历、工作经历、专业资质作为后续结构化子表，不塞成大段备注。
- 任职模块保留时间轴，明确区分“当前”“未来”“历史”；展示变更前后差异、关联流程编号、审批结果摘要及生效时间。关联流程统一跳转「流程事项」详情，档案页不提供通过、驳回、撤销等流程操作。
- 合同与奖惩等 Tab 在后端未就绪前禁用写操作并显示未开放，避免让用户填写后才发现不可保存。
- 所有编辑、业务单、详情使用项目要求的独立页面；Modal 仅用于二次确认等短交互。流程专用表单由「流程中心」打开，流程查看和审核由「流程事项」承载；独立页面不等于独立侧边栏菜单。按全局 `.content-area`、模块卡片、`.form-footer` 规范落地。
- 分 Tab 延迟加载，分别区分加载中、无资料、无权限、加载失败；页面/员工切换时清理旧 state 并取消或忽略过期请求。

### 5.3 职务数据 → 雇佣任职 + 人事异动

- 入职、转正、调动、晋升、降职、离职、重新入职及历史更正全部登记为「流程中心」的人事类流程；业务模块只展示待生效安排与正式任职结果，不再以直接编辑历史记录代替审批。
- 新增真实入职日期、雇主法人、人员类别、试用起止、转正日期、合同关联、工作地点和雇佣结束日期。
- 新入职、转正、调动、晋升、降职、离职、重新入职采用稳定动作 code；中文仅为展示，禁止用字符串正则判定状态。
- 普通调动继承未变化字段，展示前后对比；跨法人变动不能当成普通改部门，需处理雇佣期间和合同衔接。
- 直属上级可从部门负责人建议带出，但允许按汇报关系独立选择；部门负责人、直属上级、导师三者分离，并校验自关联及循环关系。
- 认可工龄、集团司龄、本次雇佣时长分别定义；离职期间不能继续计入本次任职时长。

### 5.4 组织管理、职位管理 → 主数据治理

- 组织管理保留现有树，增加法人关联、组织类型、有效期、负责人 ID、历史版本、停用影响预检。
- 一期维持现有 M/T/P、职级、职等的实际业务规则并集中维护，不擅自重新定义等级体系；修复“新增跟随职位、异动可随意填”的冲突。
- 当前“职位”更接近职务字典；编制阶段再引入“具体组织岗位实例”，区分职务名称、岗位占用和个人职级。
- 任职公司改为真实雇主主数据。仓库已有购买公司字典，可通过映射复用公司身份，但购买公司、品牌、商家集团与雇主法人不得直接画等号。
- 内部办公地点/自营门店与平台商家门店分开建模，不能默认把对客门店当内部员工所属组织。

### 5.5 费用信息、账号管理、员工动态 → 边界调整

- 费用信息更名“薪酬档案”，保留约定薪资、薪酬项目、生效记录和工资发放资料；当前简单汇总标识为“配置金额汇总”，不显示为“实发工资”。
- 个税、社保公积金核算、工资单和发薪结果由独立薪酬能力提供；本期只定义交换接口，不自建完整工资引擎。
- 账号管理移至权限/账号安全域；员工档案只显示关联账号状态及受控跳转。
- 不再要求建档时填写登录密码，开通账号使用独立授权动作与安全激活流程；离职/冻结时复用已有下线能力并验证会话失效。
- 员工动态更名“账号登录日志”；另外新增人事操作审计，不能用登录日志或 localStorage 更新时间代替。

## 六、缺少哪些功能菜单

### 6.1 建议菜单结构

```text
集团人事（主数据、业务台账和结果查询）
├─ 人事工作台                         新增，指标/提醒链接到流程中心或流程事项
├─ 员工花名册                         改造现有员工管理，含本人/团队授权视图
├─ 组织管理                           增强现有
├─ 职务与岗位                         演进现有职位管理
├─ 合同与协议                         新增全局台账，补齐现有 Tab
├─ 人事报表                           新增
└─ 人事设置                           新增/整合，非流程配置副本

OA 中心（复用现有菜单）
├─ 流程中心                           统一发起入口
│  └─ 人事类流程卡片                  页面内分类，不是新增侧边栏菜单
│     ├─ 入职 / 重新入职
│     ├─ 转正
│     ├─ 调动 / 晋升 / 降职
│     ├─ 离职
│     ├─ 合同签订 / 续签 / 变更 / 解除
│     ├─ 资料变更 / 历史更正
│     └─ 证明申请                     后续接入
└─ 流程事项                           统一列表、详情和审核入口
   └─ 人事流程筛选                    复用我发起的、待我审批、我已审批等范围

权限与账号安全
├─ 账号管理                           从员工管理拆出
└─ 账号登录日志                       现有员工动态迁移
```

- 不新增「员工服务/OA」「人事事务」「入职审批」「离职审批」「我的证明申请」等独立流程菜单，也不在员工、合同模块复制流程列表。
- 集团人事负责“人员/组织/合同是什么、何时生效”；流程中心负责“发起什么申请”；流程事项负责“申请到哪一步、谁审核、结果是什么”。
- 员工花名册内按权限提供本人/团队资料视图；员工资料变更、经理发起异动、证明申请仍进入流程中心，个人申请记录和经理待审事项仍在流程事项查看。
- 业务台账可显示关联流程编号、状态摘要和跳转链接；需要发起申请时只提供跳转流程中心的导航链接，可携带员工/合同上下文预填，不直接在业务模块创建流程。
- 流程中心打开对应独立申请表单；流程事项使用统一详情外壳承载人事专用字段、附件、审批轨迹和操作按钮。表单组件按流程类型复用，不新增另一套菜单或审批引擎。
- 人事设置维护法人/地点/人员类别、资料规则、编号入口、预警规则、权限/审计/留存策略；审批节点、审批人和流程模板由现有统一流程配置维护。

### 6.2 缺口与必要性排序

| 优先级 | 缺失能力 | 核心内容 | 建设方式 |
|---|---|---|---|
| P1 必需 | 人事流程类型（不新增独立菜单） | 入职、转正、任职变更、离职、返聘；审批/撤销/生效结果 | 在流程中心新增人事类卡片；流程事项统一查看审核；HR 后端补业务校验与生效执行 |
| P1 必需 | 合同与协议 | 全局台账、期限类型、签约主体、附件、临期提醒 | 补齐后端台账；签订/续签/变更/解除申请从流程中心发起，在流程事项审核；详情引用同一份合同数据 |
| P1 必需 | 人事工作台 | 待入职、待转正、合同临期、待办异动、资料缺失、异常联动 | 展示真实指标与提醒；待办点击进入流程事项，申请提醒点击进入流程中心，不复制流程操作区 |
| P1 必需 | 法人/地点/人事字典 | 稳定主数据、启停、有效期、引用约束 | 在现有设置体系增加 HR 分区 |
| P1 必需 | 人事审计与权限 | 范围、敏感字段、导出、历史更正、变更前后值 | 服务端横向能力 + 设置入口，不只新增日志页面 |
| P2 提效 | 员工自助、经理自助 | 本人/团队资料查看、资料更正、经理异动申请及审核 | 资料查看为花名册授权视图；申请在流程中心、审核在流程事项，不增设员工服务流程菜单 |
| P2 提效 | 人事报表 | 人员结构、入离职、试用、合同覆盖、人员流动 | 按统一截止日、雇佣期间和范围统计，提供口径说明 |
| P2 按需 | 岗位编制 | 编制额度、占用/空缺、入职和调动校验 | 扩展职位/岗位域，不与职级字典混为一谈 |
| P2 按需 | 证明与扩展档案 | 在职/离职证明申请、教育经历、工作经历、资质、奖惩 | 资料归入员工档案；需审批事项登记为流程中心类型并进入流程事项，不为每类申请单开菜单 |

已有而不应重复建设的能力：
- OA 已有流程中心、流程事项，以及流程实例、审批节点、通过/驳回、撤销、草稿提交等 API；本次只扩展 HR 类型、统一详情中的业务表单、业务校验与批准后的生效执行，不新建 HR 流程列表或审核入口。
- EAM 已有资产交接 API 和页面；缺的是离职业务单关联、待交接任务与状态汇总，不是“没有资产交接”。
- 流程中心的请假早已不是禁用占位：`oa_leave`（請假申請）已注册并跑通端到端审批回调（`HrLeaveCallbackService` 累加额度，`AttendanceCallbackService` 抵扣考勤异常并重算日报），其菜单也已迁入考勤假勤系统。
- 补卡与加班**至今没有流程编码**（`biz_oa_process` 里没有 `oa_reissue` / `oa_overtime`），不是“禁用占位”而是“尚未建设”。考勤侧的 `AttendanceExceptionService.markHandledByFlow` 已就绪但**没有调用方**，属第十节列出的剩余待办。
- 已注册并通过回调接入 OA 的人事类流程：入职、转正、调动、离职、合同续签、证明开具、绩效考核确认、绩效申诉。核验方式是 SQL 种子与服务层回调类存在，**未做浏览器端保存回归**。

依据：[OA 请求 API](file:///Users/yangjingjing/Desktop/SRAS/src/api/oaRequest.ts)、[资产交接 API](file:///Users/yangjingjing/Desktop/SRAS/backend/src/main/java/com/mftb/admin/controller/EamHandoverController.java)、[流程中心 HR 占位](file:///Users/yangjingjing/Desktop/SRAS/src/pages/OACenter/ProcessCenter/index.tsx#L139-L162)。

## 七、技术落地规则

### 7.1 主数据与兼容迁移

- 增加独立员工主档和雇佣期间实体；主档承载稳定员工身份，雇佣期间承载雇主、起止、试用和合同关系。
- 扩展现有 `emp_position_record` 承载雇佣期间内的日期生效任职，不再另起一套重复任职历史库。补部门/职位/上级/导师/法人/地点 ID，保留历史名称快照。
- `sys_user` 保留认证职责及原有 ID/工号，对旧 OA/EAM 等引用做映射兼容；允许员工没有系统账号，系统服务账号不得自动计为员工。
- `sys_user` 中现存任职字段降为只读兼容投影。人事写入口集中到一个服务，在业务事务内更新当前投影；未来事件由定时生效任务刷新，启动补偿与定期对账保证可重建。
- 所有人事查询通过统一按日期解析的服务；不能只依赖定时任务是否准点执行来判断“当前状态”。
- 一期限制同一员工同一时点只有一个主雇佣和主任职；兼岗/多重雇佣的业务能力后续开放，数据模型保留主次标记。
- 历史数据迁移先生成差异清单，由 HR 确认冲突来源；不把账号创建日批量改认成真实入职日，也不盲目让当前用户快照覆盖所有历史。

### 7.2 状态、日期与业务动作

- 人员在职状态、试用状态、账号状态、业务审批状态、业务执行状态分开定义。
- 日期统一使用业务时区 `Asia/Shanghai`；普通日期生效事件从当日开始生效，排序使用 `effectiveDate DESC, effectiveSeq DESC`，序号仅在同日内有意义。
- 离职表单区分最后在职日和账号停用时点；缺省为最后在职日结束后转为离职并停用，特殊安全停用由有权限人员显式执行，不能混同法律上的雇佣终止日期。
- 一期流程默认：在流程中心填写/保存草稿/提交 → 在流程事项查看与 HR 审核；调动、晋升/降职增加相关经理确认，离职增加交接责任人任务。审核、驳回、撤销、草稿续办和审批轨迹统一由流程事项承载；具体审批人通过既有统一流程配置指定，不硬编码姓名。
- 同一申请只生成一个 OA 流程实例和流程编号；HR 业务实体关联该实例，保存业务内容与生效状态，不维护第二套审批状态机。流程事项同时展示审批状态与业务执行结果，避免“已批准”被误认为“已生效”。
- 批准后、到生效日前为“待生效”；到期才写入当前状态。驳回、撤销不更改正式任职；已生效单据通过更正/冲正处理，保留原记录与关联链。
- 历史更正可回溯日期，但必须预检对后续记录、合同和下游的影响并再次审批，不能继续使用“只能晚于最新记录”的统一表单限制。

### 7.3 权限与敏感数据

- 建立“操作权限 × 人员范围 × 字段权限”模型；范围支持本人、直属团队、指定部门及下级、指定法人、全公司。
- 普通花名册、证件、薪酬/银行资料、账号管理、角色授予、导出、历史更正独立授权；未显式授权默认拒绝。
- 旧菜单权限不能自动扩展为全部敏感权限；上线时单独配置 HR、经理、财务、IT 等角色。
- 列表返回最小字段；敏感详情和附件在服务端鉴权，号码默认脱敏，必要明文查看单独留痕，存储使用受控加密和密钥管理。
- 一般 OA `formData`、通知正文和通用日志只保存人事单号/引用与必要摘要，不能散落完整证件、银行账号或整份敏感档案。

### 7.4 一致性、审计与外部联动

- 创建员工、雇佣、初始任职及审计使用事务；并发编辑带 revision，过期提交返回冲突。
- 工号使用原子编号分配并加唯一约束；任职同日序号在员工锁内分配并加相应约束；提交业务单和审批回调使用幂等键。
- 状态改变与待执行联动任务在同一事务写入数据库；使用轻量 outbox/任务表处理通知和跨模块协作，不引入新的消息中间件作为首期前提。
- 账号停用、权限撤销、OA 待办转交、资产交接、钉钉等同步分别有执行状态、失败原因和重试入口；重试不得重复生成业务单。
- 离职联动只创建/关联资产交接任务，资产实际归还和持有人变化仍由 EAM 的合法业务动作完成。
- 服务端记录操作者 ID、发生时间、生效时间、原因、变更前后值及来源单号；敏感值在审计展示中同样受控。旧本地“更新时间”不迁移为可信审计。
- 保留历史日志的当时快照；展示当前姓名/部门时另行关联，后续不通过回写历史日志伪装成历史事实。

## 八、分阶段交付与验收

### P0：数据可信与权限止损

交付：
- 修复 3 个未持久化字段、3 个任职映射字段、地址联动及可选字段清空。
- 精确员工详情 API；后端完整筛选/分页；明确当前页导出与全量导出语义。
- 统一生效日/同日序号判定与工龄显示口径；将未核实历史日期标识出来。
- 取消 localStorage 对审计字段覆盖；合同、奖惩未开放功能禁用。
- 收紧普通列表敏感字段返回，先拆出薪酬查看和账号高危操作权限；补页面 view/edit 行为。

验收门槛：保存后刷新、换浏览器仍一致；超过 200 名员工仍可精确开详情；跨页查询不漏人；未来离职不提前生效；没有授权不能读取敏感字段或重置密码。

### P1：形成可用的 Core HR 闭环

按依赖顺序交付：
1. 法人/地点与人事字典、独立主档/雇佣期间、稳定 ID 关联、统一任职投影、完整范围权限及审计。
2. 员工花名册和档案改造；导入预校验；真实入职/试用字段与数据治理。
3. 在现有流程中心登记入职、转正、调动、离职、重新入职等人事流程类型；流程事项统一承载列表、业务详情、查看审核与执行结果，HR 服务负责预约生效。
4. 合同全局台账与附件；签订/续签/变更/解除接入相同流程入口；工作台显示提醒与流程事项链接，不建设独立人事待办列表。
5. 账号停用、OA 转交、EAM 交接的任务联动与失败补偿。

验收门槛：人事申请均从流程中心发起，在流程事项查看审核，无独立 HR 申请/审批菜单或重复流程实例；从待入职到离职再入职可完整追溯；每次批准有业务单、每次生效有记录；合同和任职按同一员工/雇佣关系关联；离职后主数据保留且账号按规则失效；失败联动可追踪重试。

### P2：自助、分析与按需扩展

交付花名册中的本人/团队授权视图、人事报表、岗位编制、扩展履历/资质/奖惩；资料变更与证明申请扩展为流程中心类型，员工/经理仍在流程事项查看或审核，不新增员工服务流程菜单。电子签只定义供应商适配与验证要求，首期可使用受控的签署文件登记，不假定上传文件即等于可靠电子签。

招聘、完整工资核算、培训不纳入本期菜单扩建。考勤排班已作为**独立门户系统**交付（不在集团人事菜单内，见第十节）；绩效已有真实表与流程（`201_hr_performance`、`202_hr_perf_report`、考核/确认/申诉三类流程），不属于“未纳入”之列。

### 必测场景

- 流程中心发起人事申请 → 流程事项查看审核 → 批准后按生效日期更新业务台账，全链路使用同一流程编号；待办提醒和业务记录链接定位同一事项。
- 员工、合同等业务菜单没有复制申请/审批列表；本人/团队权限在统一流程入口仍有效，拥有流程事项菜单权限不能扩大可见人事数据范围。
- 性别/手机/邮箱、职位/序列/职等保存、清空、刷新、重新登录后的往返一致性。
- 同日两次异动、跨日期不同序号、未来入职/调动/离职、历史更正、撤销、重新入职、业务时区跨日。
- 列表、详情、人员下拉、组织人数与下游读取的一致性；部门改名及同名员工不破坏关联。
- 200 人以上精确详情、跨页组合筛选、导出数量和 total 对账。
- 本人、经理、HR、财务、IT、普通查看者分别访问本人/他人/跨法人数据；直调 API 和附件 URL 均不能绕过授权。
- 未授权敏感数据不出现在响应体；导出有权限和审计；通用日志、通知、OA 摘要无完整敏感字段。
- 创建中途失败全部回滚；双击提交与重复审批回调只生效一次；同时编辑返回冲突；任务失败后重试不重复执行。
- 合同固定/无固定期限、续签、试用期限校验、临期提醒去重、解除归档及保留策略。
- 现有代码检索到员工权限测试，但主要是控制器 Mock 测试；部分 IDOR 用例未对越权结果建立拒绝断言，不能代替真实服务层范围测试。新增服务层、数据库集成及端到端业务回归。

实施阶段的工程门禁：前端 `npm run typecheck`、`npm run lint`、相关 Vitest；后端 `mvn compile -q`、`mvn test -B`。新迁移按现有 `catalog.json` 登记、模块初始化器、带后置校验的版本执行与关键结构契约规范接入；保留旧数据和兼容接口，灰度验证后切换，不使用破坏性建表或清表。

## 九、上线前业务核验清单

以下不阻塞方案形成，但应作为正式数据迁移和启用功能的门禁：
- 当前两个硬编码公司是否均为合法实际雇主，是否还有遗漏法人。
- 真实员工规模、系统/服务账号清单、历史补录记录数量、真实入职日期及返聘认定口径。
- M/T/P、职级、职等的正式业务定义及岗位映射，由 HR 确认后固化，不依据样例推定制度。
- HR/经理/财务/IT 的人员范围、敏感字段权限和实际审批责任人。
- 合同模板、试用与留存规则、电子签采购需求及个人信息处理合法性基础。
- 生产部署版本、数据库结构与本工作区是否一致；对历史任职与账号快照冲突先出差异报告，再按授权修复。

**推荐立项顺序：先完成 P0，再以“入转调离 + 合同 + 人员权限”作为 P1 的验收闭环；不要先扩建完整薪酬、招聘。**

实际执行已经偏离这条建议一次，并且结果是对的：**考勤假勤被提前到薪酬之前做**，因为它是薪酬核算的必需上游（出勤天数、加班工时、请假额度）——先做薪酬会在考勤上线后重算所有历史月份口径。剩余顺序建议不变：P0 数据可信 → 薪酬核算（消费考勤月报冻结批次）→ 招聘。

## 十、考勤假勤系统：交付现状与接续开发指南

本节面向继续开发考勤/薪酬/招聘的人。前三阶段（2A/2B/2C）已完成并接真实数据，`src/pages/Attendance/mockData.ts` 已删除。

### 10.1 为什么是独立系统而不是人事下的菜单

调研结论是三家成熟产品都把假勤做成与 Core HR 平级的独立应用/模块：北森 iTalentX 的假勤与人事分开订阅；飞书「假勤」是独立应用（打卡/排班/加班/假期/补卡，并区分租户/应用/考勤三种管理员角色）；Workday 的 Time Tracking 独立于 Core HCM。

两个具体设计决定由这个边界推导出来：

1. **请假整体迁入考勤系统**，而不是留在集团人事。考勤与请假属同一个计算口径：异常抵扣要读假单结论，拆在两个系统就变成跨系统对齐。
2. **不能依赖部门树推导考勤地**。本仓不存在 `sys_user_store` 人员-门店绑定表（全库 grep 无命中，只有 `biz_store_bd`），所以多门店场景下“某人当天算哪个考勤地”必须由考勤系统自己的「考勤组 + 成员范围」承担。

### 10.2 交付范围

| 阶段 | 内容 | 关键产物 |
|---|---|---|
| 2A 入口与权限 | 第 14 个门户系统、10 个顶级菜单、请假两条菜单跨系统迁入、角色/部门准入反推 | `SystemCode.ATTENDANCE`、`AttendanceMenuInitializer`、`attendance:menu:v1.0/v1.1` |
| 2B 数据与服务 | 9 张 `att_*` 表、9 个 Controller / 11 个 Service（主数据三套 + 排班 + 打卡 + 同步 + 异常 + 汇总 + 工作台 + 设置 + 审批回调）、判定引擎、请假审批回调 | `229_attendance_core_tables.sql`、`attendance:schema:v1.0/v1.1` |
| 2C 前端与 i18n | 14 个页面全部接真实 API、五语言文案、删除 mock | `src/api/attendance.ts`、`src/pages/Attendance/`、`attendance.*` 414 键 |

该系统在门户中的排序为 65，介于人力資源系統（60）与物資管理系統（70）之间。

### 10.3 代码地图

**后端**（`com.mftb.admin`）
- 常量：`constant/AttendanceConstants`（菜单 key + 动作集 + 口径参数 key 的唯一真值源）
- 迁移：`config/AttendanceMenuInitializer`、`config/AttendanceSchemaMigrationInitializer`、`config/AttendancePunchSyncJob`
- 9 个 `controller/Attendance*Controller`，路径前缀：`/api/attendance/{groups,shifts,holidays,schedules,punches,exceptions,summaries,workbench,settings}`
- 服务：`service/Attendance*Service` + `service/impl/Attendance*ServiceImpl`；判定引擎在 `AttendanceSummaryServiceImpl`
- 实体：`entity/Att*`；视图：`dto/Attendance*VO`
- 参考 SQL：`backend/sql/228_attendance_system.sql`（菜单）、`backend/sql/229_attendance_core_tables.sql`（建表，与 classpath 真值逐字一致，有用例钉）

**前端**
- `src/api/attendance.ts`：枚举常量 + 全部类型 + 请求函数；**故意不做 mock 降级**
- `src/pages/Attendance/`：14 个页面 + `meta.ts`（枚举→i18n key/Tag 颜色）、`settingMeta.ts`、`deptTree.ts`、`useAttendanceOptions.ts`、`punchImport.ts`（Excel 解析）
- 门户登记：`constants/portalSystems.ts`、`pages/Portal/SystemArtwork.tsx`、`components/Sidebar.tsx`、`components/MenuIcon.tsx`、`pages/Permission/types.ts`（菜单动作表）、`constants/menuDataSource.ts`

### 10.4 改代码前必须知道的九条口径

1. **判定引擎只允许存在一处**。`AttendanceSummaryServiceImpl` 内部的人日结论 `PersonalDay` 同时喂日报（日×组）与月报（月×人）。两边各写一套算法必然出现“日报对、月报错”，而月报是薪酬取数来源，错一天就是错发工资。
2. **打卡流水是只读账本**。没有任何修改/删除端点；修正只能走异常处理（补录或关联假单）后重算。来源码区分钉钉同步/手工导入/人工补录，补录可事后辨别。
3. **`work_date` 写入时定死**，由班次跨天规则决定，不允许查询时用 `punch_at` 的日期推算——否则跨天夜班永远算错一天。
4. **月度状态机严格单向**：`draft → frozen → synced`。只有 draft 可冻结、只有 frozen 可同步；冻结后禁止回溯修改，重算整体跳过已冻结月份并回报 `skippedFrozen`（界面必须把这个数字显示出来）。
5. **异常只有「待處理」可被推进**，重算不会把已处理行退回待处理。请假抵扣只适用于缺卡/旷工，**不能抵扣迟到/早退**（否则薪酬的迟到扣减会凭空消失）。
6. **成员带生效区间**（`att_group_member.valid_from/valid_to`）。用今天的归属重算历史月份是考勤最常见的错账。
7. **排班全局一人一天一条**，`shiftId=null` 的显式排休与“没有记录”是两件事：后者会产生「未排班」异常，前者不会。
8. **判定回写是双向的**：补卡后当天不再迟到时，上一轮写的「遲到」必须复位为正常，否则打卡页与日报永远对不上；外勤与无效卡是人工认定的业务事实，自动判定不得覆盖。
9. **时间字段形态**：实体的 `LocalDateTime` 序列化为**毫秒时间戳**，所以面向人的接口一律走 VO 字符串（`yyyy-MM-dd HH:mm:ss`）；`AttShift` 是全仓唯一直接暴露 `LocalTime` 的实体，形态由 `AttendanceJsonContractTest` 钉住（VO 收敛为 `HH:mm`）。

### 10.5 权限与门禁（已经踩过一次，别再踩）

- `sys_menu.actions` 是授权中心能勾出哪些动作的**唯一依据**。给已上线菜单新增写接口时若没登记该动作，后果是普通角色永久 403，而**超管走代码直通看不出问题**。菜单初始化器的 `ensureMenu` 对已存在菜单**不覆盖 actions**，所以不能只改声明，必须新开一个 versionKey 做一次性纠正（参考 `attendance:menu:v1.1` 给日报补 `edit`）。
- `AttendanceControllerMappingTest` 已经反射断言：每个 handler 带 `@RequirePermission`、菜单属于考勤域、**且 action 已在 `sys_menu.actions` 登记**（动作集直接读 `AttendanceMenuInitializer.MENUS` 真值，不再重复维护一份）。前端 `pages/Permission/types.ts` 的动作表必须与后端逐字对齐。
- **401 不能证明路由存在**：JWT 过滤器在 Spring MVC 之前统一返回 401，不存在的路径看起来一样。验证映射用 MockMvc（同测试类）。
- 纯 Mockito 单测里 `LambdaQueryWrapper.select(Entity::getX)` 会**立即**解析列名（`.eq()` 是延迟解析），没有 mapper 扫描时须先 `TableInfoHelper.initTableInfo` 预热 lambda 缓存，否则报 "can not find lambda cache"。

### 10.6 剩余待办（接续从这里开始）

| 优先级 | 待办 | 说明 |
|---|---|---|
| **P0 安全** | ~~考勤查询未做数据范围收敛~~ **已完成（2026-10-18）** | 11 个 `Attendance*ServiceImpl` 已全部消费 `OrgScopeService`：列表/统计卡同口径下推，`requireVisibleUser` 在按 id 的单条读写处二次校验归属。实施细节与新增的口径约束见 **10.10** |
| **P0** | 补卡/加班接入流程中心 | `biz_oa_process` 里没有 `oa_reissue`/`oa_overtime`；`AttendanceExceptionService.markHandledByFlow` 已就绪但没有调用方。需先新增 OA 流程编码与单据类型（属 OA 域迁移，不是考勤侧能单独完成的） |
| P1 | 薪酬侧消费月报冻结批次 | 月报已按工作日/休息日/法定节假日三类加班分列并输出 `batch_no`，但没任何下游读取；异常表保留 `late_minutes` 供扣减口径 |
| P1 | 日报/月报无自动重算调度 | 目前只有手动重算；`AttendancePunchSyncJob` 只同步打卡不算结论。长假（>31 天）的请假抵扣也只记异常不回算，依赖夜间任务 |
| P2 | 钉钉侧只做了拉取 | 补卡/请假审批结果回写钉钉未做 |
| P2 | 留存年限只是口径说明 | 假勤设置里的「3 年」不对应任何归档任务；本系统不提供删除入口 |
| P2 | 未验证项 | 生产库迁移未执行过；未做浏览器端保存回归；工作台「今日无钉钉同步」预警在全员休假日会误报 |

### 10.7 数据模型

9 张表分三层：主数据（`att_shift`/`att_holiday`/`att_group`/`att_group_member`）、事实（`att_punch_log`/`att_exception`）、结论（`att_day_summary`/`att_monthly_summary`）。

所有事实表与结论表都用 STORED 生成列把 `deleted` 折进唯一键（`attendance:schema:v1.0` 的校验钉住了十个关键唯一键）：打卡幂等键（人+时刻+来源）、排班一人一天一条、异常同人同日同类型一条、日报一天一组一条、月报一人一月一条——这五个键就是“同步重跑/重复导入/重算 UPSERT 不会长出重复事实”的全部依据，缺任一都会让薪酬按重复汇总取数。跨模块只引用 `sys_user`/`sys_department` 不建 FK（历史软删数据会让启动失败）。

请假表 `hr_leave_*` **不搬**：已跑通 OA 审批回调，搬表牵动流程锁点与历史单据，收益只有“名字好看”；考勤侧单向读取其结论。

### 10.8 验证命令

```bash
# 后端（必须带 clean：增量编译会复用 IDE 写坏的 class，出现假绿）
cd backend && mvn -o clean test -Dtest='Attendance*Test' -DfailIfNoTests=false

# 前端门禁
npm run typecheck && npm run test:run
npm run check:menu && npm run check:stat-order && npm run secret-scan

# 重启（改过 Java 源码必须 --rebuild；不确定时不带参数脚本会自行判定）
cd backend && bash restart-service.sh --rebuild
```

重启后不能只看脚本打印的“启动成功”：要核对脚本给出的 PID 与 `lsof -nP -iTCP:8080 -sTCP:LISTEN` 的实际进程一致，否则探针响应可能来自旧进程。

### 10.9 组织数据权限（数据范围）重构 —— 交接说明

> **状态（2026-10-18）：本节设计已实现，实现结果与新增约束见 10.10。以下内容保留作设计依据与市面对照，不要按「尚未做」理解。**

**决定（2026-10-12）**：本节交设计，本次不实现。考勤的 P0 缺口保持开放，由后续重构统一承接。

**为什么不能小修**：正确模型是「功能权限 × 数据范围」两个正交维度，属平台级能力，考勤只是第一个消费方。在考勤里糊一个 `scopedUserId()` 能堆住漏洞，但会把错模型坐实，下个模块还得重做。

#### 市面做法（已核实）

| 产品 | 功能权限 | 数据范围 |
|---|---|---|
| 若依 RuoYi | 菜单 + 按钮 | `sys_role.data_scope` 五档：全部 / 自定部门 / 本部门 / 本部门及以下 / 仅本人；配合 `sys_role_dept` 与 `@DataScope` 切面拼条件 |
| 钉钉考勤 | 主管理员 / 子管理员分权限点 | 部门主管、考勤组子负责人只能取“自己管理范围内”的员工考勤；普通员工只看自己 |
| 飞书假勤 | 租户管理员 / 应用管理员 / 考勤管理员三级 | 每组再限管理范围；考勤组、假期类型、加班规则负责人只有有限管理权 |
| Workday / SuccessFactors | domain permission | target population：supervision chain / org segment，与权限点正交 |

共同结论：**数据范围挂在角色上、来源于组织树，不硬编码在菜单上**。

#### 本仓现状（实测，不是推定）

| 维度 | 有无 | 载体 |
|---|---|---|
| 功能权限（菜单+动作） | ✅ | `sys_role_menu(role_id, menu_id, actions)` |
| 系统准入 | ✅ | `sys_role_system(role_id, system_code)` |
| **组织可见范围** | **❌ 完全没有** | 无 |

容易误判的两点：
- `sys_data_authorization`（`24_data_authorization.sql`）与 `DataScopeService` 管的是“某部门能看哪些**商家集团编码**”，是**业务资源**维度，不是“能看哪些**人**”，不能直接拿来用。
- 部门表 `sys_department` **只有 `parentId`**，无物化路径、无下级递归工具；`sys_role` 无 `data_scope` 列。用户侧是 `sys_user.role`（主角色）+ `functionRoles` + `sys_user_role` 多角色绑定，解析时必须**取最大范围**。

#### 建议设计

1. `sys_role.data_scope` TINYINT：`1 仅本人 / 2 本部门 / 3 本部门及以下 / 4 自定部门 / 5 全部`，**默认 1（严格模式，与 `DataScopeService` “无授权返回空集合”取向一致）**；自定部门配 `sys_role_dept(role_id, dept_id)`。
2. 新增 `OrgScopeService.resolve()` → `null`=全部 / `Set<Long>`=可见 user id / 空集=看不到；admin 直通；多角色取最大。
3. 部门下级递归：一次性载入 `sys_department` 全表做内存闭包（表小），**不要写递归 SQL，也不要用 path LIKE**。
4. 考勤接入：八个查询服务按范围过滤；**且按 id 的单条操作（详情、补录、假单抵扣、冻结/同步）必须二次校验归属** —— 只过滤列表的话，改 URL 里的 id 就绕过了；统计卡片与导出必须同口径，否则数字照样泄露。
5. 授权中心 UI：角色表单加“数据范围”下拉，选自定部门时展开部门树；列表页顶部显示当前范围（仅本人/本部门及以下/…），不然用户会以为数据丢了。
6. 阶段一**只让考勤消费该列**，其它模块行为不变；验证后再接 HR 花名册、绩效、薪酬（天然下家）。

#### 明确不要的做法

把数据范围焊死在某个菜单的 view 动作上（例如“有日报菜单 = 全公司”）。它把“授权”变成“猜意图”，而且每接一个模块就要重议一次谁算管理员。

#### 当前风险边界（定紧急度时别看错）

生产上**只有 `admin` 角色持有考勤菜单**（`AttendanceMenuInitializer.grantAdmin()` 只补 admin 授权，其余角色走 `INSERT IGNORE` 不自动扩权），所以缺口今天不泄露给任何普通员工。但一旦在授权中心给**任何**角色勾上 `attendance-*:view`，那个人立刻能看全公司打卡与异常，界面上不会有任何提示。

→ **硬约束：在给非 admin 角色授权考勤菜单之前，必须先完成本节。**

#### 验收要求

新增服务层范围测试，五档（仅本人/本部门/部门及以下/自定部门/全部）+ 无授权各至少一条**拒绝断言**；不要只做控制器 Mock 测试 —— 仓内现有员工权限测试存在“未对越权结果建立拒绝断言”的同类不足（见第八节必测场景最后一条）。

### 10.10 组织数据权限已实现（2026-10-18）——代码地图与新增口径

10.9 的设计已落地。下面只写**实现时新确定的口径**（与 10.9 有出入的地方以本节为准）和接手人必须知道的要点。

#### 代码地图

| 层 | 产物 |
|---|---|
| 数据库 | `backend/sql/245_org_data_scope.sql`（参考文档）；`config/OrgScopeSchemaInitializer`（`iam:org-scope:v1.0`，**@Order(2)**）；已登记 catalog.json + `ContractRegistry.orgScopeContracts()` |
| 常量 | `constant/OrgDataScope`（五档唯一真值，脏值回落 SELF） |
| 平台服务 | `service/OrgScopeService` + `service/impl/OrgScopeServiceImpl`；`util/ScopeFilters`（三态条件折叠） |
| 消费方 | punch / exception / summary(daily+monthly) / schedule / workbench / group / sync 七个服务；`RoleServiceImpl` 写 `sys_role_dept` 并记审计 |
| 接口 | `GET /api/org-scope/mine`（只需登录，不需菜单）；角色接口新增 `dataScope`/`deptIds` |
| 前端 | `constants/dataScope.ts`（档位真值）、`api/orgScope.ts`、`components/OrgScopeNotice.tsx`、角色表单（档位 + 自定部门 TreeSelect） |
| 测试 | `OrgScopeServiceTest`（19 例）、`AttendanceScopeGuardTest`（12 例）、`RoleDataScopeTest`（8 例） |

#### 与 10.9 设计的五处口径差异（都是有意偏离，不是遗漏）

1. **无 SecurityContext 返回“不限制”而不是空集**。定时任务/启动期/内部回调没有登录上下文，按空集处理会让 `AttendancePunchSyncJob` 一条都不写 —— 把越权收敛做成可用性事故。HTTP 请求走不到这条路：Jwt 过滤器 + `@RequirePermission` 已先把住（`AttendanceControllerMappingTest` 钉住每个 handler 带注解）。
2. **本人数据恒定可见**：解析结果总是并上自己的 user id。人员范围管的是“别人的数据”，不是把自己锁在外面；没部门的人走“本部门”档也不会看到全公司。
3. **自定部门连同下级展开**（10.9 未定）。勾“营运中心”的直觉是“中心下面的人都归我管”，只展开勾选节点会被读成数据丢了。
4. **日×组聚合按 deptId 收敛，行上没有 user_id**：`att_day_summary` 是群体聚合行，“仅本人”档拿到的是**空集**（聚合数拆不到个人，宁可不给）。个人维度看月报（一人一月一条，按 userId 收敛）与打卡/异常明细。**已知偏差**：`dept_id` 是「组内主部门」快照且可空，一个组只落一个部门，跨部门组对部分管理员会整行不显示、`dept_id IS NULL` 的行对所有受限角色都不显示 —— 它只会“少行”不会“多给”，且薪酬取数用的是月报（按人精确收敛），所以接受这个偏差；要彻底消除得把日报改成日×人×组粒度，那属于日报表结构重做。
5. **重算/生成月报不设范围门槛**：它们不改变事实、只从事实重新推导结论；而补卡/假单抵扣在审批回调里会连带重算整组，加门槛会让正常业务动作直接失败。真正需要拦的是“把人送进薪酬”的**冻结/同步**，以及按人的写入（排班/成员/导入/确认/补卡）——这些已全部按 id 二次校验。手动钉钉同步反而加了门槛（整组作业，按人收敛会做出“半天有卡、半天没卡”的隐性错账）。

#### 硬约束状态

10.9 末尾的“在给非 admin 角色授权考勤菜单之前，必须先完成本节”**已解除**。但请注意两个反直觉行为：

- 存量角色的 `data_scope` 统一为 **1（仅本人）**。给 HRBP/门店经理勾上 `attendance-*:view` 后，他默认**只能看自己**；要管人就去角色管理把该角色的资料范围改成“本部门及以下”或“自定部门”。
- 角色表单**不提交 dataScope 等于不改原值**（旧入口只改名称/描述时不会静默收窄权限）；非“自定部门”档保存时会**清空** `sys_role_dept` 残留行。

#### 下一个消费方

按 10.9 建议顺序：HR 花名册（`employee-management` 列表与详情）→ 绩效 → 薪酬。接入时照考勤的做法：查询走 `ScopeFilters.applyUsers/applyDepts`，按 id 读写走 `requireVisibleUser`，统计卡与导出共用同一个条件构造器；不要在菜单的 view 动作上焊死范围。
---

## 十一、整改进度核对（2026-10-18，按第八节推荐顺序执行）

本轮把 P0 的**权限与生效日**两条主线做完并在开发库落地验证；P0 之后的 P1 分层改造尚未开始，逐项列清「已做 / 未做 / 卡在哪」。

### 11.1 已交付

| 方案条目 | 交付内容 | 验证方式 |
|---|---|---|
| §3.2 P0「人事查看权限过宽」+ §7.3 字段权限 | `employee-management` 拆动作：`salaryView`/`salaryEdit`/`sensitiveView`/`accountEdit`/`authorize`/`export`；薪酬、明文、账号、授权四类端点不再被 `edit` 隐含 | `EmployeePermissionSplitTest` 15 例（每条既有 403 拒绝断言又有 200 放行断言）；开发库 `sys_menu.actions` 已登记全部 10 个动作 |
| §3.2 P0「人事编辑与账号高危权限混用」 | 冻结/重置密码 → `accountEdit`；改功能角色 → 新 `PUT /employees/{id}/roles` + `authorize`；`create/update` 带 `functionRoleIds` 时服务层再校验一次（不静默丢弃也不默默应用） | `EmployeeRoleAuthorizeTest` 6 例 |
| §10.9 组织数据权限 | 平台级 `OrgScopeService`（五档 + 部门闭包 + 多角色取最大 + 本人恒可见）；考勤 7 个服务全部消费；授权中心角色表单可配范围；`OrgScopeNotice` 顶部横幅 | `OrgScopeServiceTest` 19 例、`AttendanceScopeGuardTest` 12 例、`RoleDataScopeTest` 8 例 |
| §3.2 P0「生效日期口径分裂」 | 统一 as-of：`HrAssignmentQuery` 成为唯一口径，`EmployeeServiceImpl` 删掉自写算法，`latestPositionRecord` 改为「生效日 DESC + 同日序号 DESC」（原来跨日期只比序号会挑中旧记录） | `HrAssignmentQueryTest` 7 例（同日两笔、未来不提前、重入新开雇佣、无记录=在职、legacy 无 code 退回名称） |
| §5.3「禁止用字符串判定状态」 | `emp_position_record.operation_code` 落库（CHECK 约束 + 存量回填），`operation` 降级为名称快照；前端表单提交 code，Tag 颜色与「允许重新入职」判定全部按 code | 开发库 38 条记录全部回填（ONBOARD 30 / TRANSFER 3 / PROMOTION 2 / DIMISSION 2 / REGULAR 1），无 OTHER 无 NULL |
| §7.2「批准后到生效日前为待生效」 | `hr_effective_task` 轻量 outbox：批准后生效日在未来的单据**只登记任务、不改任职投影也不停账号**，`HrEffectiveTaskJob` 每小时到期执行；驳回/撤销作废任务；失败落 FAILED+attempts+原因；`POST /hr/lifecycle/{id}/retry-execute` 人工重试（未到生效日拒执行）；列表与详情同格显示「已批准 · 待生效 2026-10-28」 | `HrEffectiveSchedulingTest` 5 例（含「未来不动」的 never() 断言） |
| §3.2 P1「列表详情依赖 edit」 | 花名册「詳情」改为 `view` 可进；重置密码按钮改 `accountEdit`；详情各 Tab 写按钮按 `edit`/`salaryEdit` 隐藏 | `npm run verify` 全绿（lint/typecheck/menu/i18n/secret-scan/vitest） |

迁移登记：`iam:org-scope:v1.0`、`hr:employee-perm-split:v1.0`、`hr:effective-engine:v1.0`、`hr:employment-period:v1.0`，四者均已进 `catalog.json` + `ContractRegistry`，开发库执行结果 SUCCESS、`ready=200`、契约 52 项通过。

### 11.2 未做，以及各自卡在哪

| 优先级 | 缺口 | 未动原因 / 需要的输入 |
|---|---|---|
| ~~P1~~ | ~~§7.1 员工主档 + **雇佣期间**分层、任职记录改存稳定 ID~~ **已完成双轨第一阶段（2026-10-18）** | 采「先建表 + 先出差异清单、存量不自动物化」的走法，既不阻塞也不会造出假数据；代码地图与口径见 **11.4**。**剩下的唯一人工环节**：HR 逐条看完「僱傭數據核對」清单后，对「可派生但未登记」的行点「按任職事實登記」 |
| P1 | §5.1 花名册默认列（雇主法人/工作地点/直属上级/试用状态/入职日期）、导入预校验、全量导出端点 | 纯工程量，无外部依赖；`export` 动作已登记，端点待建 |
| P1 | §5.3 重新入职/资料变更/历史更正 三类单据 + §5.4 合同签订/变更/解除 | `REHIRE` code 已就位，加单据类型是机械扩展；但「历史更正」必须先定 §7.2 要求的**影响预检**（改历史会不会翻案后续结论），口径需确认 |
| P1 | §5.5 薪酬 Tab 改名「薪酬档案」、汇总改口径 | 「實發工資」文案仍在，改动含 i18n 五语言与既有页面说明；属界面口径修正，随时可做 |
| ~~P1~~ | ~~§7.4 离职联动 EAM 资产交接 / OA 待办转交~~ **已完成（2026-10-18）** | 以 `hr_offboarding_task` 轻量 outbox 接入（交接接收人需人工指定），详见 **11.6** |
| P2 | §10.6 考勤剩余待办：补卡/加班流程编码、日报月报自动重算调度、钉钉回写、留存归档 | 补卡/加班需要先在 `biz_oa_process` 加流程编码（OA 域迁移），`markHandledByFlow` 已就绪无调用方 |
| P2 | §6.2 人事工作台、人事报表、岗位编制、扩展档案（教育/资质/奖惩）、电子签 | 报表与工作台的取数依赖雇佣期间与审计表，建议排在 P1 之后 |

### 11.3 本轮新增的、后续必须遵守的口径

1. **无登录上下文 = 不收敛**：定时任务/内部回调没有 SecurityContext，`OrgScopeService` 返回「不限制」。新增消费方不得把「空集」当默认值处理，否则后台作业会被做成 0 结果。
2. **`att_day_summary` 按 dept_id 收敛且「仅本人」得空集**，日报有「组内主部门」快照导致的少行偏差（见 10.10 第 4 条）。薪酬只允许按月报（按人）取数。
3. **动作集三元组 (角色, 菜单, 动作)** 是权限锚点；新增敏感能力优先加动作而不是加菜单，且必须同步 `sys_menu.actions`（独立 versionKey）+ 前端 `MENU_ACTIONS_MAP` + 后端常量三处，`EmployeePermissionSplitTest` 会反射拦漏登记。
4. **生效日语义**：任何「批准后要改人事事实」的新单据类型，都必须走 `hr_effective_task` 登记 + 回调同一入口执行，不允许在审批回调里直接改投影；`REHIRE` 会开启新的雇佣起点，写历史更正类功能时别把它当普通调动。

### 11.4 雇佣期间分层已实现（2026-10-18）——代码地图与双轨口径

§7.1 的主档分层采**双轨第一阶段**交付：新表先旁路积累，不切主读路径，历史数据不自动物化。

#### 代码地图

| 层 | 产物 |
|---|---|
| 数据库 | `backend/sql/248_hr_employment_period.sql`（参考文档）；`config/HrEmploymentPeriodInitializer`（`hr:employment-period:v1.0`，**@Order(32)**）；已进 catalog.json + `ContractRegistry.hrEmploymentPeriodContracts()` |
| 实体 | `HrEmploymentPeriod`（`STATUS_ACTIVE/ENDED`、`SOURCE_POSITION_RECORD/MANUAL/UNVERIFIED` 是唯一真值）；`EmpPositionRecord` 新增 7 个稳定 ID 列 |
| 派生 | `service/impl/HrEmploymentPeriodCalculator`（**无状态纯函数**，只吃记录列表 + 查询日） |
| 服务 | `HrEmploymentPeriodService`（derive / syncFromRecords / listByUser(s) / currentPeriod）；`HrMasterDataResolver`（名称→稳定 ID，只认唯一命中）；`HrProfileDiffService`（差异报告） |
| 接口 | `GET /api/hr/employment/diff-report`（view）、`POST /api/hr/employment/periods/sync`（edit，逐人校 OrgScope）、`GET /api/employees/{id}/employment-periods`（view） |
| 前端 | `src/api/hrEmployment.ts`、`src/constants`无新增（类别码在 api 里）、`src/pages/Permission/Employee/EmploymentDiffModal.tsx` + 花名册工具条「僱傭數據核對」入口 |
| 类别码 | `constant/HrProfileDiff`（10 类 + 严重度 + 名称）；前端 `hrEmployment.diff.*` 与逐值对齐 |

#### 六条口径（接手前必读）

1. **迁移不物化雇佣期间**。启动只做：建表 + 加列 + 按名称回填稳定 ID。段只能由 `syncFromRecords` 产生，且只从 `ONBOARD/REHIRE` 取起点——**绝不拿 `sys_user.created_at` 补一个起点**（§7.1 的业务门禁）。无锚点时 `syncFromRecords` 返回 0，什么都不写。
2. **派生器是纯函数且只看 `effectiveDate <= asOf`**。未来生效的离职不会提前把本段关掉；新增字段要从这里加，不要在服务层再写一份循环。
3. **段内字段继承**：法人/地点/人员类别取段内最后一条**有值**的记录（调动只写变化字段，逐条覆盖会把空值当事实）。被后续入职截断但找不到离职记录的段，`ENDED + end_date IS NULL + end_reason=MISSING_DIMISSION_RECORD`，不编造结束日；CHECK `ck_period_active_no_end` 禁止 ACTIVE 段带结束日。
4. **登记不是覆盖登记**：`start_date_source=MANUAL` 的行，`sync` 不得改写其入职日。HR 人工确认过的值优先级高于派生值。
5. **所有写任职事实的入口必须走同一条收口**：`PositionRecordServiceImpl`（手工异动）、`HrLifecycleCallbackServiceImpl.writePositionRecord`（审批办理）、`EmployeeServiceImpl.insertInitialPositionRecord`（建档）三处都先 `applyStableIds` 再落库、落库后 `syncFromRecords`，**与主写入同事务且不吞异常**。新增加写入口同理；漏一处就是「人有异动但段没跟上」。
6. **差异报告只读、且按 OrgScope 收敛**；`registerableUsers` 与前端可勾选行用同一判据（仅 `PERIOD_NOT_REGISTERED`）。`RESIGNED_ACCOUNT_ACTIVE` 是唯一 ERROR 级：已离职但账号还能登录。

#### 开发库实测（本轮）

- `hr_employment_period` = **0 行**（证明双轨没自动物化）
- 稳定 ID 回填：部门 24/38、职位 7/38、法人 4/38、工作地点 0/38——**工作地点 0 是因为存量 `work_city` 全为空**，不是匹配失败
- 待 HR 判定：无入职锚点 2 人（`START_ANCHOR_MISSING`）、部门快照≠任职事实 2 人（`DEPT_MISMATCH`）
- 测试：后端全量 `mvn -o clean test` **1615 例 0 失败**（新增 23 例：`HrEmploymentPeriodTest` 9、`HrProfileDiffTest` 9、`HrEmploymentControllerMappingTest` 5）；前端 `npm run verify` lint/typecheck/menu/stat-order/confirm-modal/i18n/secret-scan 全过，新页 4 例通过（全量 vitest 在并行高压下 `AlgorithmAdd.traffic`/`WaterfallForm`/`TrafficAlgorithmConfig` 三个无关文件会超时，单独跑 4 文件 102 例全绿）

#### 下一步（尚未做）

- 员工详情开「雇佣与任职」展示段列表（排在 11.2 的 P1 花名册/档案改造一并做）
- `MANUAL` 录入入口：只能走 P5 的「资料变更/历史更正」单据，不能开自由编辑框
- 花名册/详情主读路径仍走 `sys_user` 投影；切读到雇佣期间需要 HR 确认完差异清单后再评估

### 11.5 人事操作审计已实现（2026-10-18）——代码地图与口径

补齐 §5.5「新增人事操作审计」与 §7.4 的审计字段清单（操作者 / 发生时间 / 生效时间 / 原因 / 变更前后值 / 来源单号）。

#### 代码地图

| 层 | 产物 |
|---|---|
| 数据库 | `backend/sql/249_hr_operation_audit.sql`；`config/HrAuditSchemaInitializer`（`hr:audit-schema:v1.0`，@Order(33)）；`config/EmployeeAuditActionMenuInitializer`（`hr:employee-audit-action:v1.0`，@Order(9)，**并集**写入 sys_menu.actions） |
| 常量 | `constant/HrAuditAction`（15 个动作码 + 敏感动作/敏感字段集，CHECK 与它同源） |
| 脱敏 | `util/SensitiveMask`（**唯一实现**；`EmployeeServiceImpl` 的私有 mask 已改为委派它） |
| 服务 | `HrAuditService` + `HrAuditServiceImpl`（写入时脱敏、一行一字段、无变更不落行）；`dto/HrAuditEntry`（链式 change/detail/reason/sourceReqNo/effectiveDate） |
| 写入口钩子 | `EmployeeServiceImpl`（EMPLOYEE_CREATE / EMPLOYEE_UPDATE / PROFILE_UPDATE / SENSITIVE_VIEW / PASSWORD_RESET / ACCOUNT_DISABLE・ENABLE / ROLE_BIND）、`PositionRecordServiceImpl`（三处 POSITION_WRITE）、`HrLifecycleCallbackServiceImpl.writePositionRecord`（带来源单号的 POSITION_WRITE）、`EmployeeContractServiceImpl`（三处 CONTRACT_WRITE）、`HrEmploymentController.syncPeriods`（PERIOD_REGISTER） |
| 接口 | `GET /api/hr/audit`、`GET /api/hr/audit/actions`（两者都挂 `employee-management:auditView`） |
| 前端 | `src/api/hrAudit.ts`、`pages/Permission/Employee/HrAuditTrail.tsx`（档案新增「人事操作記錄」Tab，仅持有 auditView 时挂载）、`hrAuditMeta.ts`、`types.ts` 的 SENSITIVE_ACTIONS + MENU_ACTIONS_MAP 已补 auditView |

#### 五条口径

1. **审计与业务写入同事务且不吞异常**：审计失败就让业务回滚（§7.4「可追溯性优先于可用性」）。
2. **敏感值在写入时就脱敏**，审计表不留明文副本；因此查询端不存在「显示原文」开关，前端也不许做。
3. **一行 = 一个字段**；「提交了但什么都没改」不落行（否则真实变更会被噪声淹没）。
4. **auditView 是独立动作**，不挂在 view 上；新增动作必须同时改 `EmployeeConstants.GRANTABLE_ACTIONS` + 前端 `SENSITIVE_ACTIONS`/`MENU_ACTIONS_MAP` + 一个**新 versionKey** 的并集登记初始化器（`applyOnce` 不重跑，改声明落不到存量库）。
5. **不迁旧数据**：登录日志与 localStorage 的「最后更新」不是审计事实，回溯入库等于伪造审计史。

#### 已知缺口（下一批接入）

- `SALARY_WRITE`（薪酬 8 个写入端点）与 `ROSTER_EXPORT`（花名册全量导出）的动作码已预留、**写入点尚未接入**；它们分别排在薪酬台账口径修正（§5.5）与花名册改造（§5.1）里一起做。
- 单据类动作的 `source_req_no` 目前只有异动写入接了；转正/调动/离职的「单据办理」本身（LIFECYCLE_EXECUTE）靠单据表 + 待生效任务表可追溯，未重复落审计。

#### 开发库实测

- `hr_operation_audit` 已建（含 `ck_hr_audit_action`）；`sys_menu.actions` 已含 `auditView`（11 个动作）；两个新 versionKey 已登记；契约 53 项通过、`ready=200`
- 踩到的新坑：**`sensitive` 是 MySQL 8 保留字**，不加反引号时 `CREATE TABLE` 直接语法错、启动失败（已在 DDL、契约与实体 `@TableField("`sensitive`")` 三处同步修正，与仓内 `rank_code` 同一处理法）
- 测试：后端全量 `mvn -o clean test` **1630 例 0 失败**（本轮新增 `HrAuditServiceTest` 7 + `EmployeeAuditHookTest` 5 + `HrAuditControllerMappingTest` 3）；前端 lint/typecheck/menu/stat-order/confirm-modal/i18n/secret-scan 全过，`HrAuditTrail` 4 例与 `EmploymentDiffModal` 4 例均绿

### 11.6 离职联动已实现（2026-10-18）——代码地图与口径

§7.4 最后一块（离职后的跨模块动作）以轻量 outbox 落地，顺手补上了 OA 一直没有的「待办改派」能力。

#### 代码地图

| 层 | 产物 |
|---|---|
| 数据库 | `backend/sql/251_hr_offboarding_task.sql`；`config/HrOffboardingSchemaInitializer`（`hr:offboarding-schema:v1.0`，@Order(34)）；已进 catalog.json + `ContractRegistry.hrOffboardingContracts()` |
| 实体 | `HrOffboardingTask`（TYPE_/STATUS_ 常量即 CHECK 同源）；`HrLifecycleRequest` 新增 `handoverToUserId/handoverToName` |
| 服务 | `HrOffboardingTaskService(+Impl)`：登记/执行/指定接收人/到期拾取；`HrOffboardingTaskJob`（cron `hr.offboarding-task.cron`，默认每小时第 25 分） |
| 登记点 | `HrLifecycleCallbackServiceImpl.applyDimission` 末尾与离职事实**同事务**登记两类任务 |
| 接口 | `GET /api/hr/offboarding/requests/{id}/tasks`、`GET /task-types`（view）、`POST /requests/{id}/receiver`、`POST /tasks/{id}/retry`（edit），菜单 `hr-dimission` + anyOf 其他人事菜单 |
| 前端 | `src/api/hrOffboarding.ts`、`pages/Permission/HrLifecycle/OffboardingModal.tsx`（离职单列表操作列「交接聯動」） |

#### 五条口径

1. **终态不重跑**：`execute` 对 DONE/SKIPPED 直接抛错，`uk_offboarding_request_type(request_id, task_type)` 是库层兜底——这两处共同保证「重试不会重复建交接单」。
2. **无事可做是 `SKIPPED` 而不是 `DONE`**：名下无在用资产 / 无待办节点与「已交接完」必须能在界面上区分。
3. **定时只拾 `PENDING`**：`FAILED` 必须人工重试（不自动刷同一份错账）；`last_error` 携带可读原因（包括「还没指定接收人」）。
4. **接收人不由代码猜**：未指定时任务停在等待态；`assignReceiver` 拒绝系统服务账号与离职人本人，姓名由服务端反查后落快照。
5. **OA 改派按整段签名匹配且等长替换**：`biz_oa_approval_task.approver` 是「姓名(工号)」逗号串，子串匹配会把 `李大仁(MF000110)` 的待办抢走；会签(all) 按 `approvedBy` 数量判断是否审完，删 token 会造成提前通过。
6. **只创建交接任务，不越过 EAM**：不改 `eam_asset.current_holder_id`，实际归还仍由资产台合法动作完成（§7.4 原边界）。

#### 开发库实测

- `hr_offboarding_task` 已建：16 列 + `uk_offboarding_request_type` 唯一键 + 2 个 CHECK；`hr_lifecycle_request.handover_to_*` 已就位；行数 0（尚未办理过新离职单）
- 契约 **55 项**通过、`ready=200`；新端点未登录 401
- 测试：后端全量 **1645 例 0 失败**（新增 `HrOffboardingTaskServiceTest` 11 + `HrOffboardingControllerMappingTest` 4）；前端 `npm run verify` 各门禁全过（stat-order 144 页 / confirm-modal 244 处 / i18n / secret-scan），新增 `OffboardingModal` 4 例绿。⚠ 全量 vitest 在并行高压下 `AlgorithmAdd.traffic` 与 `TrafficAlgorithmConfig` 依旧超时报错，单独跑 7 文件 109 例全绿（与人事无关的老 flaky）

#### 尚未做

- 未做浏览器端离职办理→交接单的端到端回归（需一个真实有人使用的资产 + 一张离职单）
- 钉钉待办/群通知联动未接入（可继续往 `hr_offboarding_task` 加 `task_type`，执行器与重试入口不需再改）

### 11.7 花名册人员范围与三档导出已实现（2026-10-18）

§5.1/§7.3 的花名册第一步。**本次不改表、不加菜单、不加动作**（`export` 动作 P2 已登记），因此没有新 versionKey。

#### 入口拆分（关键口径，接手人最容易改错的一处）

```text
GET /api/employees           → 不收敛：OA/EAM/会议/RDM/考勤 的「选个人」下拉数据源（前端 fetchEmployeeOptions）
GET /api/employees/roster    → 收敛：花名册页专用（employee-management:view）
GET /api/employees/roster/export → 收敛 + 单独 export 动作 + 落 ROSTER_EXPORT 审计
```

为什么不直接把收敛加在 `GET /employees` 上：那个接口被≈30 个页面调用，收敛后受限角色会在其它模块
突然选不到审批人/领用人。人员范围约束的是「按人划权限看名单」，不是「引用一个人」（§7.3）。
服务层 `EmployeeService.list(..., Set<Long> visibleUserIds)` 由**调用方**传集合：
`null` = 不收敛，**空集 = 不查库直接空**（写反一次就是把越权当不限制、或把后台作业做成 0 结果）。

#### 代码地图

| 层 | 产物 |
|---|---|
| 切面 | `annotation/EnsureEmployeeScope` + `aspect/EmployeeScopeAspect`：类级注解一次覆盖 `EmployeeController` 全部 `/{id}` 端点（手动改 30+ 个方法必漏）；只认名为 `id` 的 Long 参数，取不到就不猜 |
| 为何不在服务层 | 异动自动停号、离职办理也走 `EmployeeServiceImpl.requireUser`；在那里加人员范围会把正常办理拒掉，收敛只属于 HTTP 入口 |
| 导出 | `EmployeeService.ROSTER_EXPORT_MAX_ROWS = 5000`：多取一条判上限，超限**拒绝**而不是默默截断；取数与列表共用 `queryRoster`，避免两套口径 |
| 审计 | `ROSTER_EXPORT`（记录导出人数 + 筛选条件摘要，不记条件以外的敏感内容） |
| 前端 | `src/api/employee.ts` 新增 `fetchRosterEmployees` / `fetchRosterExport`；花名册页取数已切到 roster；导出按钮改成三档 Dropdown（當前頁 / 選中項 / 全部篩選結果，后者无 export 权时不渲染） |

#### 仍未做的花名册部分（下一批）

- ~~默认列改造~~ → **已完成，见 11.8**
- ~~详情「雇佣与任职」Tab 展示雇佣期间~~ → **已完成，见 11.8**
- 导入预校验（重复身份提示、错误行下载）——前提是导入功能本身还不存在，见 11.8 末尾说明
- 合同台账 `contract-ledger` 的全量清单尚未按人员范围收敛（它是台账不是花名册，需单独定口径）

#### 验证

- `EmployeeRosterScopeTest` 3 例：空集不查库、可见集下推成 `id IN`、不传范围时**不带**该条件（反例断言，防误伤下拉）
- `EmployeeScopeAspectTest` 3 例：带 `id` 就校验、无 `id` 不乱猜、越权时业务方法不被执行
- `EmployeePermissionSplitTest` 补 2 条断言：viewer 可以进 `/roster`，但 `/roster/export` 必须 403
- 后端全量 **1651 例 0 失败**；前端各门禁全过，新增/改动页单独跑 8 文件 43 例全绿（全量并行时仍是那两个老 flaky）；重启后日志无 ERROR、`ready=200`、新端点未登录 401（路由存在）
### 11.8 花名册默认列与雇佣期间展示已实现（2026-10-18，P6-2）

补齐 §5.1 默认列与 P4 欠的展示，仍然**不改表、不加动作**。

#### 代码地图

| 层 | 产物 |
|---|---|
| 服务 | `HrRosterQueryService(+Impl)`：先按人员范围取数，再用 as-of 任职 + 全部历史 + 已登记雇佣期间**各一次批查**富化默认列（不按人 N+1）；导出上限判定的唯一所在地 |
| VO | `EmployeeVO` 新增 7 个花名册列（`employerCompany` / `employeeCategory` / `workLocation` / `directSuperior` / `hireDate` / `hireDateSource` / `probationStatus`），**仅 roster 链路填充** |
| 接口 | `/employees/roster` 与 `/roster/export` 改为委派 `HrRosterQueryService`；控制器只留「筛选摘要 + 审计」 |
| 前端 | `Employee/index.tsx` 默认列按 §5.1 顺序重排（其余降为可配置列）；`EmployeeDetail` 的「職務記錄」Tab 顶部新增 [EmploymentPeriods](../../../../src/pages/Permission/Employee/EmploymentPeriods.tsx) 区块 |

#### 三条口径

1. **不敢说就不说**：缺入职锚点→`hireDate=null + UNVERIFIED`（**绝不回落到 `sys_user.created_at`**）；没有转正事实→`UNKNOWN` 而不是 `PROBATION`（老员工转正往往未补录，猜错会直接影响薪酬/福利筛选）。
2. **入职日与来源同格显示**，并且**导出也带来源列**：只给日期不给来源，等于把「任职登记日」包装成已核实的真实入职日。
3. **列表与导出共用同一个取数方法**（`roster` / `rosterForExport`）：两处口径一分叉，导出就成了绕过范围收敛的出口。

#### 验证

- `HrRosterQueryTest` 6 例：法人/类别/地点/上级来自 as-of 任职、已登记期间（含 MANUAL）优先于任职登记日、缺锚点=UNVERIFIED、无转正事实=UNKNOWN、超上限拒绝、空集不取富化数据
- 前端 `EmploymentPeriods.test.tsx` 4 例（含「失败不得伪装成空态」与来源标注）
- 后端全量 **1657 例 0 失败**；前端 verify 各门禁全过（仅 `TrafficAlgorithmConfig` 全量并行超时报错，单独跑 9 例全绿）；重启 `ready=200`，`/roster*` 未登录 401（路由存在）

#### 花名册仍剩下的部分

- **导入预校验 / 重复身份提示 / 错误行下载**：前提是「导入功能本身」，而花名册至今**没有导入入口**（只能逐人建档）。这是新建能力而非改造，需单独一批做（含 `import` 动作、模板、异步任务化）
- 合同台账 `contract-ledger` 的全量清单尚未按人员范围收敛（它是台账不是花名册，需单独定口径）
