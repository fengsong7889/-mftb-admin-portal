package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 團隊負載视图（阶段 B-1：跨岗位统一只读负载聚合）。
 *
 * <p>与 {@link RdmScheduleVO.Workload} 的区别：后者只聚合「已排期的执行任务」（rdm_work_task），
 * 无任务的人不出现、产品需求与测试批次也不计入；本视图以「研发协作全员」为口径，
 * 聚合产品需求（rdm_requirement）、研发/设计/测试任务（rdm_work_task）、测试批次（rdm_test_batch），
 * 并把「有件数但无个人工时」的人如实标为数据待完善，而不是显示 0% 冒充空闲。
 *
 * <p>安全口径：无全量数据范围（{@code RdmAccessGuard.canSeeAll}）的人只返回本人，
 * 负载页不能变成互相打探绩效的入口。参考负载率是排期口径，不是绩效评分。
 */
public class RdmResourceVO {

    /** 负载状态：有调度余量 */
    public static final String LOAD_AVAILABLE = "available";
    /** 负载状态：正常 */
    public static final String LOAD_NORMAL = "normal";
    /** 负载状态：接近满载（85%–100%） */
    public static final String LOAD_NEAR_FULL = "near_full";
    /** 负载状态：超载（>100%） */
    public static final String LOAD_OVERLOADED = "overloaded";
    /** 负载状态：数据待完善（未估时/未排期/未成名册，不归入有余量） */
    public static final String LOAD_DATA_INCOMPLETE = "data_incomplete";

    /** 岗位角色（与前端 ResourceLoad.tsx 的 RoleCode 同源） */
    public static final String ROLE_PM = "pm";
    public static final String ROLE_PRODUCT = "product";
    public static final String ROLE_DEV = "dev";
    public static final String ROLE_DESIGNER = "designer";
    public static final String ROLE_QA = "qa";
    public static final String ROLE_OPS = "ops";
    public static final String ROLE_PMO = "pmo";

    /** 团队负载总览 */
    @Data
    public static class Workload {
        private String from;
        private String to;
        /** 是否被收敛为「只看自己」（无全量数据范围的人） */
        private Boolean selfOnly;
        private List<Person> people = new ArrayList<>();
        private Summary summary = new Summary();
    }

    /** 统计卡（跟随当前筛选口径，服务端聚合） */
    @Data
    public static class Summary {
        /** 纳入人员数 */
        private Integer total = 0;
        /** 有调度余量人数 */
        private Integer available = 0;
        /** 超载人数 */
        private Integer overloaded = 0;
        /** 数据待完善人数 */
        private Integer dataIncomplete = 0;
    }

    /** 一个人的跨岗位负载 */
    @Data
    public static class Person {
        private Long userId;
        private String userName;
        private String empNo;
        private String dept;
        /** 岗位角色集合（一人可兼多岗，仍只占一行） */
        private List<String> roles = new ArrayList<>();

        /* ── 各岗位在途件数（分列展示，不相加成跨岗位排名）── */
        /** 在途产品需求数（本人作为产品经理） */
        private Integer productReqs = 0;
        /** 未完成研发任务数（taskType=frontend/app/backend/data） */
        private Integer devTasks = 0;
        /** 未完成设计任务数（taskType=design） */
        private Integer designTasks = 0;
        /** 未完成测试任务数（taskType=qa） */
        private Integer testTasks = 0;
        /** 在途测试批次数（本人为测试负责人或执行人） */
        private Integer testBatches = 0;
        /** 协调事项数（B-1 暂无来源，恒 0；B-2 计划层补） */
        private Integer coordItems = 0;

        /* ── 工时口径 ── */
        /** 区间可用工时（默认周一至五 8h + 例外日历） */
        private BigDecimal totalCapacity = BigDecimal.ZERO;
        /** 区间已安排剩余工时（B-1 = 研发/设计/测试任务的计划工时） */
        private BigDecimal totalPlanned = BigDecimal.ZERO;
        /** 区间已填实际工时 */
        private BigDecimal totalActual = BigDecimal.ZERO;
        /** 参考负载率（已安排剩余工时 / 可用工时，百分数；无容量时 0） */
        private Integer loadRate = 0;
        /** 超负荷的工作日数 */
        private Integer overloadedDays = 0;

        /* ── 数据完整性与异常 ── */
        /** 负载状态：available/normal/near_full/overloaded/data_incomplete */
        private String loadStatus = LOAD_NORMAL;
        private Boolean hasOverdue = false;
        private Boolean hasBlocked = false;
        /** 数据待完善原因（loadStatus=data_incomplete 时非空） */
        private String dataIncompleteReason;

        private List<DayLoad> days = new ArrayList<>();
    }

    /** 单日负载 */
    @Data
    public static class DayLoad {
        private String day;
        private BigDecimal capacity = BigDecimal.ZERO;
        private BigDecimal planned = BigDecimal.ZERO;
        private BigDecimal actual = BigDecimal.ZERO;
        private Boolean leave = false;
        private Boolean weekend = false;
        private Boolean overloaded = false;
    }

    /**
     * 待分配工作项（阶段 B-3.1：真实待分派单据，供分派弹窗/待分配视图选择来源）。
     * <p>只读聚合：需求池（已准入、无产品经理）、未指派执行任务（无负责人且未完成）、
     * 待接收测试批次（pending）。B-3.1 仅提供来源，真正改负责人的写回在 B-3.2。
     */
    @Data
    public static class UnassignedItem {
        /** 来源类型：requirement/dev_task/design_task/test_batch（与前端 AssignSource 同源） */
        private String source;
        /** 单据主键（需求 id / 任务 id / 批次 id） */
        private Long itemId;
        /** 单据编号（可空：未发号阶段不冒充需求号） */
        private String code;
        /** 标题 */
        private String title;
        /** 所属需求标题（任务/批次回填；需求本身为空） */
        private String reqTitle;
        /** 计划工时（任务有值；需求/批次无个人工时字段则为空，前端标待估） */
        private BigDecimal planHours;
        /** 当前负责人姓名（多为空=未指派；批次为测试负责人） */
        private String currentOwner;
        /** 排期乐观锁版本（任务回带，供分派写回 expectedPlanVersion 回传；非任务来源为空） */
        private Integer planVersion;
    }

    /** 待分配工作聚合（按来源分组，便于前端直接分桶展示） */
    @Data
    public static class Unassigned {
        /** 是否有权查看全部待分配池（无 dispatch/view_all 权时为 false 且各列表为空） */
        private Boolean canDispatch = false;
        private List<UnassignedItem> requirements = new ArrayList<>();
        private List<UnassignedItem> devTasks = new ArrayList<>();
        private List<UnassignedItem> designTasks = new ArrayList<>();
        private List<UnassignedItem> testBatches = new ArrayList<>();
    }

    /**
     * 分派写回统一结果（阶段 B-3.2/B-3.3）。
     * <p>不同来源（任务/需求）委托的领域写接口返回各异，这里收敛为与来源无关的结果，
     * 前端只需成功/失败与提示，不依赖领域 VO。
     */
    @Data
    public static class AssignResult {
        /** 来源类型：requirement/dev_task/design_task */
        private String source;
        /** 被分派的单据主键 */
        private Long itemId;
        /** 是否成功（失败走异常，不返回 false） */
        private boolean success = true;
        /** 结果提示文案 */
        private String message;
    }
}
