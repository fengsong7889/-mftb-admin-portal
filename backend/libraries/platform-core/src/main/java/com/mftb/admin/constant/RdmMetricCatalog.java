package com.mftb.admin.constant;

import java.util.List;

/**
 * RDM 指标字典（阶段 6：口径统一定义）。
 *
 * <p>为什么要把口径写成代码里的一份清单而不是文档：看板上同一个"按时率"在
 * 快照、看板、绩效三处各算一次，只要有一份定义不写在这里，它就一定会漂移。
 * 每条定义都指向唯一的事实来源，并说明能不能回算与已知限制——
 * 数字能不能拿去做绩效，取决于它是否可复算，而不是它好不好看。
 */
public final class RdmMetricCatalog {

    /** 单条指标定义 */
    public record Definition(
            String code,
            String name,
            /** 口径：用什么字段、怎么算 */
            String formula,
            /** 事实来源（表/字段） */
            String source,
            /** 是否可按历史时间回算（false 时看历史趋势就是自欺） */
            boolean recomputeable,
            /** 已知限制或易误读处 */
            String caveat,
            /** 归属分组（展示用） */
            String group) {
    }

    private static final List<Definition> DEFINITIONS = List.of(
            new Definition("submitted", "提請需求數",
                    "DATE(submit_time) = 統計日，按提出人所在部門歸屬",
                    "rdm_requirement.submit_time", true,
                    "含被驳回后重提的需求：重提会再算一次提交，衡量的是工作量不是需求条数", "吞吐量"),
            new Definition("accepted", "受理数",
                    "DATE(accept_time) = 統計日",
                    "rdm_requirement.accept_time", true, "以产品经理受理时点为准，不含准入审批通过", "吞吐量"),
            new Definition("released", "上線數",
                    "actual_release_date = 統計日",
                    "rdm_requirement.actual_release_date", true,
                    "上线事实由发布放行通过后的人工流转写入，不代表业务已验收", "交付"),
            new Definition("avg_response_hours", "響應时长(小時)",
                    "AVG(TIMESTAMPDIFF(HOUR, submit_time, accept_time))，僅統計當日提交且已受理的需求",
                    "rdm_requirement.submit_time/accept_time", true,
                    "只覆盖当日提交且已受理的部分，长周期需求不进这个均值", "效率"),
            new Definition("avg_delivery_days", "交付周期(天)",
                    "AVG(DATEDIFF(actual_release_date, DATE(accept_time)))，當日上线的需求",
                    "rdm_requirement.accept_time/actual_release_date", true,
                    "从受理起算，不含准入前的等待；否则会把别人的等待算进交付人的账", "效率"),
            new Definition("on_time_rate", "按時上線率",
                    "當日上线需求中 actual_release_date <= plan_release_date 的占比；无计划日的需求不计入分母",
                    "rdm_requirement.plan_release_date/actual_release_date", true,
                    "计划日可以被改期，因此它只回答「相对当时承诺」；节点基线的偏差另算", "交付"),
            new Definition("milestone_slip_days", "節點偏差(工作日)",
                    "milestone.actual_date - baseline_date；未完成的用 forecast_date 与基线比较",
                    "rdm_milestone.baseline_date/forecast_date/actual_date", true,
                    "基线一旦冻结不再被改期覆盖，所以它比 on_time_rate 更能反映真实延期", "交付"),
            new Definition("reject_rate", "驳回率",
                    "當日提交的需求中 reject_count > 0 的占比",
                    "rdm_requirement.reject_count", true,
                    "reject_count 由准入/评审/测试/验收的拒绝动作各计一次，一次动作只加一；不含退回返工的重复计数", "质量"),
            new Definition("first_pass_rate", "驗收一次通过率",
                    "當日验收的需求中，历史上没有任何 result='fail' 验收记录的占比",
                    "rdm_acceptance.result", true,
                    "上线前预验收与上线后业务验收都算事实；阶段 4 之后正式满意度只看 post_release", "质量"),
            new Definition("rework_count", "返工次数",
                    "當日受理过的需求上 COALESCE(rework_count,0) 之和",
                    "rdm_requirement.rework_count", true, "由 uat_fail 动作累加，与驳回率是两件事", "质量"),
            new Definition("change_count", "需求變更數",
                    "DATE(rdm_change_request.created_at) = 統計日",
                    "rdm_change_request.created_at", true, "变更走审批，pending 状态的单也计入提出量", "协作"),
            new Definition("overdue_stock", "逾期存量",
                    "截至統計日：plan_release_date < 統計日 且（未上线或上线日晚於統計日）的需求数",
                    "rdm_requirement.plan_release_date/actual_release_date", true,
                    "不再使用 overdue_flag：该标记在每次状态流转时被清零，用它算历史某天必然失真", "风险"),
            new Definition("output_score", "產出積分",
                    "按生效规则对已交付需求逐角色出分：基础分 × 类型/优先级/按时/质量/角色系数，超角色上限按系数取前 N",
                    "rdm_score_record.score", true,
                    "流水带 rule_version：规则升级后旧流水按当时版本解释，重算不会篡改历史分数", "绩效"),
            new Definition("budget_usage", "預算占用",
                    "同周期同部门（或全员）的积分合计 / 预算上限",
                    "rdm_score_record.score ÷ rdm_score_budget.score_budget", false,
                    "预算只用于超限预警，不参与折算：自动折算会让个人分数随他人产出波动", "绩效"),
            new Definition("notify_reach", "提醒可達率",
                    "send_status='sent' 的事件数 / 已登记事件数",
                    "rdm_notify_log.send_status", true,
                    "abandoned 表示重试用尽：它是提醒失效的证据，不会被静默吞掉", "协同"),
            new Definition("estimate_deviation", "估時偏差",
                    "(SUM(rdm_work_log.hours) - SUM(plan_hours)) / SUM(plan_hours)",
                    "rdm_work_log.hours 與 rdm_work_task.plan_hours", true,
                    "实际工时只能由任务负责人本人按工作日填报，缺报记为未填报而不是 0", "效率"));

    private RdmMetricCatalog() {
    }

    /** 全部指标定义（按分组顺序展示） */
    public static List<Definition> all() {
        return DEFINITIONS;
    }
}
