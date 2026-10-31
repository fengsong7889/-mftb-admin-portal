# MFTB 企业一体化管理平台软件

> ⚠️ **请先阅读 [LICENSE](./LICENSE)** — 本仓库源代码公开仅供**查阅、评审与能力展示**，
> 未授予任何使用、复制、修改、再分发或商业化的权利。**保留所有权利。**
>
> 发现安全问题请阅读 [SECURITY.md](./SECURITY.md)：它定义了**可测试边界**（未得书面授权
> 不得对生产实例与数据库做任何测试）与私密报告渠道。

基于 React 18 + Vite 6 + Ant Design 5 的多系统管理后台，配套 Spring Boot 3 后端与 MySQL 8 数据库。

## 版权与许可

| 项 | 内容 |
|------|------|
| 著作权人 | **fengsong7889**（自然人个人作品，无公司/法人主体；署名为笔名，与 GitHub 账号同名） |
| 权属来源 | 作者以个人名义独立创作，不属职务作品或委托作品（见 `LICENSE` 第十条） |
| 许可类型 | 专有软件许可，保留所有权利（见 [LICENSE](./LICENSE)） |
| 已授予权利 | 仅「查阅权」（LICENSE 第四条） |
| 明确禁止 | 商业使用、再分发、去除版权标识、衍生作品、规避授权校验、从历史/镜像中提取凭据 |
| 商业授权 | 需另行签订书面许可协议 |

本仓库**新增**源文件必须在文件头携带版权声明注释（只写笔名，不写真实姓名）；
存量文件按模块分批补齐。模板与硬性要求见 [LICENSE-HEADER.txt](./LICENSE-HEADER.txt)，
约定记录在 [AGENTS.md](./AGENTS.md) 的「关键约束」第 6 条。

## 代码 ≠ 可运行系统

本仓库**有意不包含**让系统跑起来所需的资产，它们不属于本许可覆盖范围，仅由著作权人线下书面交付：

- 数据库连接串与凭据（`backend/.env.local`，已 gitignore，未入库）
- JWT 签名密钥 `JWT_SECRET`
- 生产数据库结构、业务数据与种子库
- 后端部署实例与云环境运维配置

因此：**clone 到本仓库不等于获得一套可部署的软件**。关于外部人员如何合法获取可运行副本，
一律以线下交付协议为准，不接受「仓库里有代码所以可以自用」的解释。

## 技术栈速览

| 层 | 技术 |
|------|------|
| 前端 | React 18、Vite 6、TypeScript 5.6（strict）、Ant Design 5、Vitest |
| 后端 | Spring Boot 3、MyBatis-Plus、Spring Security + JWT、Maven 多模块 |
| 数据库 | MySQL 8 |
| 部署 | 前端 GitHub Pages；后端镜像构建后推送至 ghcr.io（私有包）并运行于 Sealos |

## 仓库结构

```
├── src/                 # 前端主应用入口与页面（src/pages/** 为业务模块）
├── frontend/
│   ├── apps/            # 分系统前端应用：legacy / eam / hr / rdm
│   └── packages/        # 共享包：platform-client / ui / contracts / i18n
├── backend/             # Spring Boot 多模块后端（bootstrap / libraries / contracts / modules / sql）
├── scripts/             # 工程门禁与构建脚本（边界、i18n、密钥扫描、影响域验证等）
├── docs/                # 设计与方案文档、QA 资产
├── engineering/         # 工程注册表与门禁配置
└── .qoder/rules/        # 强制开发规范（随仓库共享，AGENTS.md 直接引用）
```

## 开发入口

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | **必读**。项目约束、常用命令、按需规则文件索引、核心强制规范 |
| [ENVIRONMENT-REFERENCE.md](./ENVIRONMENT-REFERENCE.md) | 本地环境唯一参考手册：工具链版本、换电脑清单、凭据存放位置、常见问题 |
| [backend/README.md](./backend/README.md) | 后端服务启动与接口说明 |
| [SECURITY.md](./SECURITY.md) | 安全政策：授权测试边界、漏洞报告渠道、响应预期、已实施控制清单 |

已具备开发环境的协作者，最短路径：

```bash
npm ci --legacy-peer-deps   # 必须带 --legacy-peer-deps
npm run dev                 # 前端 http://localhost:3000
```

> 前端本地开发通过 Vite proxy 把 `/api` 转发到 `http://localhost:8080`；
> **登录必须经过后端数据库验证，仓库内不存在 Mock 登录降级**，因此后端与数据库未就绪时无法进入系统。
> 后端启动需要自备 MySQL 并配置 `backend/.env.local`，详见 [ENVIRONMENT-REFERENCE.md](./ENVIRONMENT-REFERENCE.md) 第五节。

## 质量门禁

提交前本地至少执行：

```bash
npm run typecheck
npm run lint
npm run secret-scan          # 硬编码凭据扫描
npm run test:affected        # 影响域验证（日常主档位）
```

push 到 `main` 触发 GitHub Actions（`.github/workflows/deploy.yml`），门禁依次为：
`lint` → `typecheck` → `check:menu` → `check:boundary` → `check:registry` → `check:regression` →
`check:routes` → `check:stat-order` → `check:confirm-modal` → `check:i18n` → `check:i18n-fallback` →
`secret-scan` → `test:run` → 构建部署。任一失败中止部署。
