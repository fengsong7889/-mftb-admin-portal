# 线下交付包清单与操作规程

> 建立日期：2026-10-31 · 负责人：作者本人（`fengsong7889`）· 状态：**待执行**
> 与公开文件 [`LICENSE`](../LICENSE) 第五条、[`SECURITY.md`](../SECURITY.md) 第一节配套使用。
>
> ⚠️ **本仓库是公开的**，因此本文件只写**流程与要求**，不写「哪条凭据现在仍然有效」
> 「哪些防护当前缺失」这类实况——那等于给攻击者一张带优先级的攻击路线图。
> 实况台账存于本地未入库文件 `.qoder/security-followups-2026-10.md`（被 `.gitignore` 忽略）。

---

## 一、这份清单解决什么问题

公开仓库只有源码，**没有运行能力**：凭据、可用数据库、部署实例都在仓库之外。
这正是 [`LICENSE`](../LICENSE) 第五条与 `README.md`「代码 ≠ 可运行系统」依赖的前提。

因此交付的定义很窄：**交付包 = 把"运行能力"按最小必要范围、有期限、可追溯地移交给特定对象**。
任何一次交付都必须走本清单，否则会出现两种事故：

1. 交付过头 —— 把开发库账号/真实业务数据一起给出去，等于交出生产资产；
2. 交付无记录 —— 事后无法证明对方拿到的是什么版本、在什么授权范围内。

---

## 二、先分级：别默认给对方"能跑"

| 级别 | 适用对象 | 交付内容 | 对方的运行方式 | 主要风险与补偿 |
|:---:|---------|---------|--------------|--------------|
| **L1 只读演示** | 潜在买家、能力评估、面试/尽调展示 | 生产地址 + 独立最小权限演示账号 | 连我的线上实例，不落地代码运行 | 风险：把生产暴露给外部人。补偿：专用账号（非现有账号）、限定系统准入（`sys_menu.system_code`）、只读权限、**设定到期撤销日期**、包内不含任何凭据文件 |
| **L2 本地可运行** | 明确协作/外包/联合开发 | 交付包 A（第四节） | 对方自备 MySQL，连**新建的演示库** | 风险：口令外泄。补偿：独立账号与新库（**绝不共用 SQLPub 开发库账号**）、口令走一次性渠道、到期轮换 |
| **L3 私有化部署** | 签约客户 | 交付包 A + 交付包 B + 书面许可协议 | 对方自己的生产环境 | 风险：源码被占为己有。补偿：书面许可协议 + **后端 License 激活门**（实现状态见内部台账）+ 逐客户签发密钥 |

**默认停在 L1。** 升级到 L2/L3 需要：已签 NDA 或许可协议、第七节要求的内部台账关闭项已全部完成、台账已登记。

---

## 三、环境变量矩阵（交付包的配置底座）

以下清单由 `backend/bootstrap/src/main/resources/application.yml` 实测导出（2026-10-31），
是交付包 A 中 `backend/.env.local` 的填写依据。**只写变量名与用途，不写任何值。**

### 3.1 必需项（无默认值，缺失即启动失败）

| 变量 | 用途 | 注意事项 |
|------|------|---------|
| `DB_URL` | MySQL 连接串 | ⚠️ **必须已带 `?` 查询段**：yml 是 `${DB_URL}&socketTimeout=...` 字面拼接，缺 `?` 会拼出非法串 |
| `DB_USERNAME` | 数据库账号 | 给**新建演示库**的专用账号，最小权限（建表/读写，不要 `DROP`/`GRANT`/全局权限） |
| `DB_PASSWORD` | 数据库密码 | 一次性渠道传递，不落文本文件、不进聊天记录长期留存 |
| `JWT_SECRET` | HMAC 签名密钥 | ≥ 32 字节，**每个环境独立生成**，禁止复用示例值或历史值 |

### 3.2 生产/对外部署必须显式设置

| 变量 | 默认行为 | 为什么要显式设 |
|------|---------|--------------|
| `CORS_ALLOWED_ORIGINS` | 回退内置开发白名单并打警告 | 默认值面向本机开发端口；对外必须换成对方真实域名 |
| `SCHEMA_STRICT` | `false` | 建议 `true`：存在无法自愈的结构漂移时中止启动，配合 `maxUnavailable: 0` 保旧实例 |
| `APP_BUILD_TAG` | `unknown` | 填本次交付的 git SHA，让迁移审计可追溯到版本 |
| `LOG_LEVEL` | `info` | 保持 `info`；`debug` 逐请求打印会推高 CPU 并增加日志泄露面 |

### 3.3 可选集成（默认关闭或留空，**按对方实际需要单独开通**）

| 能力 | 相关变量 | 留空/关闭时的表现 |
|------|---------|-----------------|
| 邮件通知 | `SMTP_HOST` / `SMTP_PORT`（默认 465）/ `SMTP_USERNAME` / `SMTP_PASSWORD` | 留空即不发送邮件 |
| 腾讯文档同步 | `TENCENT_DOCS_CLIENT_ID` / `ACCESS_TOKEN` / `OPEN_ID` / `ROOT_FOLDER_ID` / `SYNC_ENABLED`（默认 `false`）/ `SYNC_SPACE_ID` / `SYNC_CRON` | 默认关闭；`access_token` 有效期 30 天，过期需在开放平台重置后更换 |
| Office 在线预览 | `DOC_OFFICE_CONVERTER_URL` / `DOC_OFFICE_CONVERTER_TIMEOUT_MS` | 留空时 Word/Excel/PPT **只能下载**，不会伪造在线预览。若给出，指向内网 Gotenberg，**禁止公网暴露** |
| 文档本地存储 | `DOC_STORAGE_LOCAL_ROOT` / `DOC_STORAGE_MAX_BYTES` / `DOC_STORAGE_SPACE_QUOTA_BYTES` | 默认单文件 50MB / 空间 2GB，按对方容量需求调整 |
| AI 运行 Worker | `AI_RUN_WORKER_ENABLED`（默认 `false`）/ `AI_RUN_WORKER_DELAY_MS` / `AI_RUN_WORKER_INITIAL_DELAY_MS` | 默认关闭 |
| LLM 超时 | `AI_LLM_CONNECT_TIMEOUT_MS` / `AI_LLM_READ_TIMEOUT_MS` | 默认 10s / 120s |
| RDM 日报 | `RDM_DAILY_REPORT_ENABLED`（默认 `false`）/ `RDM_DAILY_REPORT_TICK_CRON` | 默认关闭 |
| 会议 AI 纪要上限开关 | 见 `ENVIRONMENT-REFERENCE.md` §2.4（`MEETING_MINUTES_AI_ENABLED`） | ⚠️ 本次在 `application.yml` 中**未检索到该键**，交付前需确认其实际绑定方式，不要照文档写了就当它生效 |
| 会话与运维 | `SESSION_IDLE_TIMEOUT`（默认 60 分钟）/ `SCHEMA_CHECK_ONLY` / `SPRING_LAZY_INIT` / `MYBATIS_LOG_IMPL` | 按需 |
| 翻译服务标识 | `MYMEMORY_EMAIL` | ⚠️ 默认值是一个**个人邮箱**（见第七节第 4 项），交付前必须改 |

---

## 四、交付包 A：本地可运行包（对应 L2）

| # | 交付物 | 形态 / 生成方式 | 含凭据 | 备注 |
|:-:|-------|----------------|:-----:|------|
| 1 | `backend/.env.local` | 由 `backend/.env.local.example` 复制后填写 3.1 四项 | 🔴 是 | 口令与 `JWT_SECRET` **单独一次性渠道**传递（电话/即时通讯阅后即焚），不写进压缩包内文件 |
| 2 | 演示库账号与新建库 | 为对方单独创建的 MySQL 账号 + 空库 | 🔴 是 | 🚫 **绝不给 SQLPub 开发库账号**；不给生产 RDS 任何形式访问 |
| 3 | 空结构 schema dump | 见第五节命令 | 否 | 结构 + 白名单种子表，**禁止含业务数据** |
| 4 | 启动脚本 | `run-local.sh` 未入库，需线下提供 | 否 | ⚠️ 该脚本含本机 JDK/Maven 绝对路径，交付前**必须改造为无路径依赖版本**（用 `java_home -v 17` / `mvn` 探测），否则对方一定起不来 |
| 5 | 工具链要求说明 | 一页纸：Node 20、**JDK 17（21+/25+ 会因 Lombok 不兼容报错）**、Maven 3.9.x、MySQL 8.0+ | 否 | 直接引用 `ENVIRONMENT-REFERENCE.md` §五 |
| 6 | 初始管理员账号 | 用户名 `admin`；密码为 `DataInitializer` 引导密码，首登强制改密 | 🔴 是 | 交付后要求对方**立即改密**；改密前不算交付完成 |
| 7 | 文档 | `ENVIRONMENT-REFERENCE.md`、`backend/README.md`、`backend/SERVICE-RESTART-GUIDE.md`、`AGENTS.md` + `.qoder/rules/` | 否 | 已入库，可直接指仓库；包内附快照以便版本追溯 |
| 8 | `RECIPIENT.txt` | 接收方名称、日期、许可范围、包版本号、唯一编号 | 否 | 🔵 **溯源用的关键件**：日后主张违约时的指向性证据 |
| 9 | 许可文书 | NDA / 软件许可协议（书面，另行签署） | 否 | 协议优先于 `LICENSE`（`LICENSE` 第五条已写明） |
| 10 | 包哈希与台账 | `shasum -a 256 packet.zip`，写入第八节台账 | 否 | 用于证明"给过什么版本" |

### 交付包 B（L3 追加）

- 容器镜像或构建产物（**注意 `backend/Dockerfile` 会 `COPY .git .git`**：镜像内含完整提交历史，
  交付镜像等于交付历史，务必确认历史已无可用凭据后再给）
- License 激活文件（若已实现激活门；私钥线下持有，永不入库、永不进镜像）
- 部署拓扑与运维手册、备份/恢复流程、应急联系与到期撤销流程

---

## 五、schema dump 的生成与脱敏（第 3 项的具体做法）

> 推荐"结构 + 白名单种子"两段式。**不要**直接 `mysqldump` 整库带数据交付。

```bash
# 1) 全结构（不含任何数据）
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p \
  --no-create-db --add-drop-table --routines --triggers \
  --no-data "$DB_NAME" > packet-03-schema.sql

# 2) 仅白名单种子表的数据（菜单/角色/字典/参数类，按实际表名调整）
#    候选：sys_menu, sys_role, sys_company_brand, sys_position 等基础配置表
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p \
  --no-create-db --no-create-info "$DB_NAME" \
  sys_menu sys_role sys_company_brand sys_position > packet-03-seed.sql

# 3) 交付前自检：这两份文件里绝不能出现下列内容
grep -nE "sys_user|biz_store|biz_merchant_group|biz_gift_record|biz_fin_|1[3-9][0-9]{9}" \
  packet-03-seed.sql
```

**必须排除的表**（含个人信息或经营数据，逐项核对，不要凭印象）：

| 类别 | 表（示例，以 `docs`/`backend/sql` 现有清单为准） | 为什么不能给 |
|------|--------------------------------------------|------------|
| 账号与人员 | `sys_user`、员工/考勤/薪酬相关表 | 姓名、工号、手机号、部门、职级 —— 完整人员名册 |
| 会话与审计 | `sys_login_log`、`sys_schema_migration_log` | 登录 IP、在线时长、内部结构与版本节奏 |
| 商户与门店 | `biz_merchant_group`、`biz_store` | 真实客户与经营点位 |
| 交易与财务 | `biz_gift_record`、`biz_gift_consume`、`biz_fin_*`、`biz_ad_order*` | 金额、订单、客户结构，商业敏感 |
| AI 与文档 | `ai_*`、会议/纪要相关表 | 对话内容与文档，可能含第三方个人信息 |

> ✅ 另一种更省心的做法：**给对方一个空库，让后端启动期迁移与 `SchemaContractValidator` 自愈建表**，
> 菜单由启动期幂等 upsert 校正（`AiMenuLayout` 一类初始化器）。但这条路径**尚未在干净空库上完整验证过**
> （262 条迁移能否从零重建全部表结构未实测）。**先用本机 docker 起一个空 MySQL 实测一次
> `GET /api/health/ready` 返 200，验证通过后才可以把它作为默认交付方式**；验证前一律用 dump。

---

## 六、交付前检查清单（逐项打勾，缺一不交付）

- [ ] 已签 NDA 或许可协议，且协议里写明许可范围、期限、禁止再分发、审计权
- [ ] 本地台账中的「交付前必须关闭项」已全部关闭（**未关闭前不得进入 L2/L3**）
- [ ] 数据库账号是**为对方新建的独立账号**，非我的开发库账号，权限最小化
- [ ] 包内所有文件不含：明文凭据、开发库连接串、生产凭据、内网地址、我的个人邮箱
- [ ] `packet-03-seed.sql` 已通过第五节的 grep 自检，且不含人员/交易/审计表数据
- [ ] `run-local.sh` 已去除本机绝对路径，或已改为指向 `mvn -pl bootstrap -am spring-boot:run`
- [ ] 若交付镜像：已确认 git 历史内无可用凭据（`COPY .git .git` 会把历史一起带走）
- [ ] 口令与 `JWT_SECRET` 走一次性渠道，未落进压缩包
- [ ] `RECIPIENT.txt` 已填写唯一编号与许可到期日
- [ ] 台账（第八节）已登记；到期撤销流程已写明负责人
- [ ] 已提醒对方：**首登必须改密**，且改密前不算交付完成

---

## 七、交付门槛（门槛项清单不入库）

本仓库是 **public**，因此**不在本文列出当前未关闭的安全缺口**：
把「哪条密钥尚未作废」「哪些控制缺失」写进公开仓库，本身就是一种额外的暴露：
它会变成一份可被直接传播、按优先级排序的目标清单，而不需要对方自己去看代码发现。

**流程要求（这部分可以公开）**：

1. 进入 L2/L3 交付前，必须先逐项关闭本地台账 `.qoder/security-followups-2026-10.md`
   中的「凭据处置」与「代码/配置层泄露面」两组待办。
2. 该台账至少覆盖四类：历史泄露凭据的作废进度、入库文件中的内部地址与个人标识、
   已缺失的控制（限流、安全响应头等）、以及授权/License 门的实现状态。
3. 台账不入库、不进任何对外包；但**必须仓库外备份**（加密存储），否则换电脑即丢失。
4. 任何一项决定例外放行，按 `AGENTS.md` §10 与 `SECURITY.md` 第六节登记：
   原因 / 风险 / 补偿措施 / 负责人 / 到期时间。未登记的例外视同缺陷。
5. 对外只保留一个口径：「交付前必须完成内部安全台账的关闭项」，不列具体缺口。

---

## 八、交付台账模板

每次交付追加一行，存放于仓库外（受版本控制的文件里不记凭据与接收方敏感信息）：

| 编号 | 日期 | 接收方 | 级别 | 包版本 / git SHA | 包 SHA-256 | 许可范围 | 到期日 | 撤销方式 | 状态 |
|------|------|--------|:---:|-----------------|-----------|---------|-------|---------|:----:|
| D-2026-001 | | | L1/L2/L3 | | | | | 账号停用 / 密钥吊销 | 计划中 |

到期处理：到期日当天撤销账号或吊销 License，并在台账标注完成时间。
未按时撤销本身就是一个待整改项，需按第七节口径登记例外。

---

Copyright (c) 2026 fengsong7889. All Rights Reserved.
本文档属作者个人所有的内部规程，不在 `LICENSE` 第四条授予的查阅权范围内，禁止对外分发。
