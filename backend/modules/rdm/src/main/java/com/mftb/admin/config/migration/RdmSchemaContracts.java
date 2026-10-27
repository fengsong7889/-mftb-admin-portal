package com.mftb.admin.config.migration;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * RDM 域的结构契约登记（方案 P3 第 3 步： migratory 契约随域模块一起搬）。
 *
 * 为什么不在 ContractRegistry 里直接写 RDM 契约：那会让 legacy（注册表所在模块）
 * 反向依赖 RDM 域模块，与域模块形成编译环。改为「legacy 定义接口 SchemaContractProvider，
 * RDM 实现它，Spring 装配时聚合」，注册表仍然只有一份、启动校验顺序不变。
 *
 * 本类只声明 RDM 关键写入路径的表结构（需求主表 req_no、日报推送配置/规则、通知投递队列），
 * 以及第三/四批 schema 契约；DDL 真值仍在迁移脚本与 RdmBatch34Schema 内，不在此重抄。
 */
@Component
public class RdmSchemaContracts implements SchemaContractProvider {

    @Override
    public List<ContractSpec> contracts() {
        List<ContractSpec> list = new ArrayList<>();
        list.addAll(RdmBatch34Schema.contracts());
        list.add(rdmRequirementContract());
        list.add(rdmDailyReportRuleContract());
        list.add(rdmDailyReportConfigContract());
        list.add(rdmNotifyLogCardContract());
        return list;
    }

    /**
     * RDM 需求主表关键列契约（{@code rdm:schema:v3.4}，需求提交/需求管理拆分 · 批次 1）。
     * <p>为什么要把 {@code req_no} 登记进契约：延迟发号后「准入前的需求没有编号」是新代码的基本假设，
     * 而 {@code rdm:schema:v1.0} 在已记版本的环境不会重跑。一旦某次人工运维把列改回 NOT NULL，
     * 存草稿会直接 SQLException；登记后每次启动都会实查并（在列缺失时）按**可空**版本补回。
     * <p>为什么 {@code createTableIfMissing} 故意留空：rdm_requirement 有 60+ 列，把建表 DDL
     * 复制一进来就成了第二份真值，而这份副本很容易带着旧的 {@code req_no NOT NULL} 反过来覆盖
     * 本迁移——那正是本次要消除的缺陷。表由 {@code rdm:schema:v1.0} 建立（早于本校验器），
     * 真缺表时宁可上报漂移卡住 readiness，也不要用一份可能陈旧的副本静默重建。
     * <p>补列 DDL 只可能把列**加成为可空**：契约校验器从不 MODIFY 已存在的列，
     * 所以启动自愈不可能把 req_no 变回 NOT NULL。唯一键 {@code uk_rdm_req_no} 由迁移后置校验把住。
     */
    static ContractSpec rdmRequirementContract() {
        return new ContractSpec(
                "rdm-requirement",
                "rdm_requirement",
                null,
                List.of(new ContractSpec.ColumnSpec("req_no",
                        "ALTER TABLE rdm_requirement ADD COLUMN req_no VARCHAR(32) NULL DEFAULT NULL "
                                + "COMMENT '需求编号 XQ+YYYYMMDD+4位；仅首次准入成功时生成，准入前为 NULL'")));
    }

    /**
     * RDM 日报推送规则关键列契约（{@code rdm:schema:v3.25}）。
     * <p>规则保存、定时作业与规则列表都会读写 project_ids；缺列会直接 500，
     * 登记后启动自愈可补回，避免“迁移记成功但生产缺列”。
     */
    static ContractSpec rdmDailyReportRuleContract() {
        return new ContractSpec(
                "rdm-daily-report-rule",
                "rdm_daily_report_rule",
                null,
                List.of(new ContractSpec.ColumnSpec("project_ids",
                        "ALTER TABLE rdm_daily_report_rule ADD COLUMN project_ids VARCHAR(1000) DEFAULT NULL "
                                + "COMMENT '多项目范围 JSON array；空=单项目/全部项目/仅迭代' AFTER project_id")));
    }

    /**
     * RDM 日报推送配置关键列契约（{@code rdm:schema:v3.22}，看板开放链接）。
     *
     * <p>为什么登记：日报作业每次 tick 都会读 {@code rdm_daily_report_config} 全行，
     * 缺任一新列都会让作业与公开看板同时 SQLException——这正是「迁移记成功但生产缺列」
     * 最典型的爆炸半径。登记后每次启动实查并在缺列时按可自愈 DDL 补回。
     *
     * <p>为什么 {@code createTableIfMissing} 留空：表由 {@code rdm:schema:v3.16} 建立，
     * 这里再抄一份建表 DDL 会成为第二份真值；真缺表时宁可上报漂移卡住 readiness。
     */
    static ContractSpec rdmDailyReportConfigContract() {
        return new ContractSpec(
                "rdm-daily-report-config",
                "rdm_daily_report_config",
                null,
                List.of(
                        new ContractSpec.ColumnSpec("board_link_valid_days",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN board_link_valid_days INT NOT NULL DEFAULT 30 "
                                        + "COMMENT '看板开放链接有效期（天）' AFTER personal_template_key"),
                        new ContractSpec.ColumnSpec("board_show_requirements",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN board_show_requirements TINYINT NOT NULL DEFAULT 1 "
                                        + "COMMENT '看板是否展示需求明细 0/1' AFTER board_link_valid_days"),
                        new ContractSpec.ColumnSpec("board_show_owners",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN board_show_owners TINYINT NOT NULL DEFAULT 1 "
                                        + "COMMENT '看板是否展示负责人姓名 0/1' AFTER board_show_requirements"),
                        new ContractSpec.ColumnSpec("board_show_unassigned",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN board_show_unassigned TINYINT NOT NULL DEFAULT 1 "
                                        + "COMMENT '看板是否展示未挂项目的迭代 0/1' AFTER board_show_owners"),
                        new ContractSpec.ColumnSpec("message_mode",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN message_mode VARCHAR(16) NOT NULL DEFAULT 'fixed' "
                                        + "COMMENT '钉钉消息模式: fixed=固定框架 / template=自定义模板' AFTER board_show_unassigned"),
                        new ContractSpec.ColumnSpec("message_field_options",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN message_field_options VARCHAR(1000) DEFAULT NULL "
                                        + "COMMENT '固定框架的字段开关（JSON，全局一套）' AFTER message_mode"),
                        // v3.26 收件人三列：缺列会让个人日报收件人退化成空集，等于「开了个人渠道却没人收到」
                        new ContractSpec.ColumnSpec("receiver_roles_json",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN receiver_roles_json VARCHAR(255) "
                                        + "NOT NULL DEFAULT '[\"pm\",\"product_owner\"]' "
                                        + "COMMENT '收件角色白名单(JSON数组)：pm/product_owner/tech_lead/qa_lead/ui_designer/ops_lead/project_member' "
                                        + "AFTER personal_enabled"),
                        new ContractSpec.ColumnSpec("extra_receiver_user_ids_json",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN extra_receiver_user_ids_json VARCHAR(2000) "
                                        + "DEFAULT NULL COMMENT '追加收件人 sys_user.id(JSON数组)，收到规则范围全部项目汇总' "
                                        + "AFTER receiver_roles_json"),
                        new ContractSpec.ColumnSpec("exclude_receiver_user_ids_json",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN exclude_receiver_user_ids_json VARCHAR(2000) "
                                        + "DEFAULT NULL COMMENT '排除收件人 sys_user.id(JSON数组)，优先级最高' "
                                        + "AFTER extra_receiver_user_ids_json"),
                        // v3.30 降噪策略：缺列会让保守取值整体失效（配置页存不进去、读回来恒为 null）
                        new ContractSpec.ColumnSpec("quiet_policy",
                                "ALTER TABLE rdm_daily_report_config ADD COLUMN quiet_policy VARCHAR(16) NOT NULL DEFAULT 'brief' "
                                        + "COMMENT '无异常日降噪策略: full=照常发摘要 / brief=只发一句结论 / skip=不发（仍落快照）' "
                                        + "AFTER message_field_options")));
    }

    /**
     * RDM 通知投递队列的卡片列契约（{@code rdm:schema:v3.28}）。
     *
     * <p><b>为何登记</b>：{@code rdm_notify_log} 是所有 RDM 通知（需求提醒、催办、会议、日报）的
     * 唯一出站表，而 dispatcher 的读取语句包含 {@code msg_type/btn_title/btn_url}。
     * 一旦生产缺列，SELECT 直接报错 → 不只是日报没样式，而是<b>全部 RDM 通知断流</b>，
     * 且失败发生在异步线程里、主流程毫无感知。登记后每次启动实查并在缺列时自愈。
     *
     * <p>为什么 {@code createTableIfMissing} 留空：表由 204 脚本建立，这里再抄一份建表 DDL
     * 会成为第二份真值；真缺表时宁可上报漂移卡住 readiness。
     */
    static ContractSpec rdmNotifyLogCardContract() {
        return new ContractSpec(
                "rdm-notify-log-card",
                "rdm_notify_log",
                null,
                List.of(
                        new ContractSpec.ColumnSpec("msg_type",
                                "ALTER TABLE rdm_notify_log ADD COLUMN msg_type VARCHAR(16) NOT NULL DEFAULT 'markdown' "
                                        + "COMMENT '投递消息类型: markdown/action_card（卡片带一个跳转按钮）' AFTER content"),
                        new ContractSpec.ColumnSpec("btn_title",
                                "ALTER TABLE rdm_notify_log ADD COLUMN btn_title VARCHAR(32) DEFAULT NULL "
                                        + "COMMENT '卡片按钮文案（msg_type=action_card 时必填）' AFTER msg_type"),
                        new ContractSpec.ColumnSpec("btn_url",
                                "ALTER TABLE rdm_notify_log ADD COLUMN btn_url VARCHAR(512) DEFAULT NULL "
                                        + "COMMENT '卡片按钮跳转地址（msg_type=action_card 时必填）' AFTER btn_title")));
    }
}
