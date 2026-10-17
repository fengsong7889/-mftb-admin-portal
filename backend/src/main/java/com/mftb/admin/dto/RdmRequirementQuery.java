package com.mftb.admin.dto;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import lombok.Data;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 需求列表查询条件
 */
@Data
public class RdmRequirementQuery {

    /** 页码（从 1 开始） */
    private Integer page = 1;

    /** 每页条数 */
    private Integer size = 10;

    /** 视角: mine/todo/pool/product/delivery/acceptance/all */
    private String scope;

    /** 关键字（标题/编号/提出人） */
    private String keyword;

    /** 需求类型 */
    private String reqType;

    /** 优先级 */
    private String priority;

    /** 状态 */
    private String status;

    /** 提出部门ID */
    private Long deptId;

    /** 产品经理ID */
    private Long pmUserId;

    /** 仅看逾期 */
    private Boolean overdueOnly;

    /** 提出人用户ID（精确匹配） */
    private Long submitterUserId;

    /**
     * 流程版本（1/2/3）过滤。
     * <p>为什么需要它：提测批次、发布批次等 V3 专属入口的服务端准入会直接拒绝
     * {@code flow_version != 3} 的需求，但 {@code scope=delivery} 的候选列表并不按版本收敛，
     * 于是用户在下拉里选得到、提交时被拒（且报错是 500），两侧口径必须同源。
     * <p>不把它写死进 SCOPE_DELIVERY：研发工作台/交付看板同样用该视角，
     * 强加版本条件会让存量 V2 需求从这些页面消失。
     */
    private Integer flowVersion;

    /**
     * 所属项目 ID / 需求种类（aggregate / execution）过滤。
     * <p>两个参数前端一直在传（RequirementSubmit 的聚合需求下拉、RequirementDetail 的执行需求列表），
     * 但本 DTO 从未声明，于是被 Spring 静默丢弃，只能靠前端再过滤一次兜底。
     * 补齐后两侧口径一致：服务端收敛结果集，前端兜底过滤变成幂等的多余保险。
     */
    private Long projectId;

    /** 需求种类：aggregate（聚合需求）/ execution（执行需求） */
    private String requirementKind;

    /** 交付中状态集合（研发视角） */
    private static final List<String> DELIVERY_STATUS = List.of(
            RdmConstants.STATUS_SCHEDULED, RdmConstants.STATUS_DESIGNING, RdmConstants.STATUS_DEVELOPING,
            RdmConstants.STATUS_INTEGRATION, RdmConstants.STATUS_TESTING, RdmConstants.STATUS_TEST_PASSED);

    /**
     * 验收记录状态集合：验收人已经或正在出结论的环节。
     * <p>含 released 是因为「上线后正式验收」通过时不改状态（只写结论与分数），
     * 要等「確認交付」才推到 verified；漏掉它会让刚签完单的人在自己的记录页里找不到那条。
     */
    private static final List<String> ACCEPTANCE_HISTORY_STATUS = List.of(
            RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED, RdmConstants.STATUS_UAT_REJECTED);

    /**
     * 构造查询条件（默认按相关人收敛）。
     *
     * @param currentUserId 当前登录人ID（null 表示不受限：超管 / PMO / 技术负责人）
     */
    public LambdaQueryWrapper<RdmRequirement> toWrapper(Long currentUserId) {
        return toWrapper(currentUserId, true);
    }

    /**
     * 构造查询条件。
     * <p>数据范围硬约束：传入 {@code currentUserId}（非管理视角）且 {@code relatedOnly} 时，
     * 不论 scope 为何，都只能看到「与自己相关」的需求（提出人 / 產品經理 / 研發負責人 / 驗收人）。
     * 菜单授权可以铺得宽（全公司都要能提需求），跨部门可见性只能靠这条防线，
     * 不能靠前端不渲染按钮来保障。
     *
     * @param currentUserId 当前登录人ID（null 表示不受限）
     * @param relatedOnly   是否收敛到与自己相关。「待我審批」必须传 false：
     *                      审批人的关联关系只存在于 OA 审批任务表，不在需求表的人员字段上，
     *                      收敛后会永远只能命中自己提的单；调用方必须用审批待办 id 集合接住范围。
     */
    public LambdaQueryWrapper<RdmRequirement> toWrapper(Long currentUserId, boolean relatedOnly) {
        LambdaQueryWrapper<RdmRequirement> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(reqType)) {
            wrapper.eq(RdmRequirement::getReqType, reqType);
        }
        if (StringUtils.hasText(priority)) {
            wrapper.eq(RdmRequirement::getPriority, priority);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(RdmRequirement::getStatus, status);
        }
        if (deptId != null) {
            wrapper.eq(RdmRequirement::getSubmitDeptId, deptId);
        }
        if (pmUserId != null) {
            wrapper.eq(RdmRequirement::getAssigneePmUserId, pmUserId);
        }
        if (submitterUserId != null) {
            wrapper.eq(RdmRequirement::getSubmitterUserId, submitterUserId);
        }
        if (flowVersion != null) {
            wrapper.eq(RdmRequirement::getFlowVersion, flowVersion);
        }
        if (projectId != null) {
            wrapper.eq(RdmRequirement::getProjectId, projectId);
        }
        if (StringUtils.hasText(requirementKind)) {
            wrapper.eq(RdmRequirement::getRequirementKind, requirementKind);
        }
        if (Boolean.TRUE.equals(overdueOnly)) {
            wrapper.eq(RdmRequirement::getOverdueFlag, 1);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(RdmRequirement::getTitle, kw)
                    .or().like(RdmRequirement::getReqNo, kw));
        }
        applyScope(wrapper, currentUserId);
        if (currentUserId != null && relatedOnly) {
            applyRelatedOnly(wrapper, currentUserId);
        }
        wrapper.orderByDesc(RdmRequirement::getUpdatedAt).orderByDesc(RdmRequirement::getId);
        return wrapper;
    }

    /** 非管理视角：只允许命中与自己相关的单据 */
    private void applyRelatedOnly(LambdaQueryWrapper<RdmRequirement> wrapper, Long currentUserId) {
        wrapper.and(w -> w.eq(RdmRequirement::getSubmitterUserId, currentUserId)
                .or().eq(RdmRequirement::getAssigneePmUserId, currentUserId)
                .or().eq(RdmRequirement::getDevOwnerUserId, currentUserId)
                .or().eq(RdmRequirement::getAcceptorUserId, currentUserId));
    }

    /** 按视角收敛查询范围 */
    private void applyScope(LambdaQueryWrapper<RdmRequirement> wrapper, Long currentUserId) {
        String scopeCode = StringUtils.hasText(scope) ? scope : RdmConstants.SCOPE_MINE;
        switch (scopeCode) {
            case RdmConstants.SCOPE_POOL -> wrapper.eq(RdmRequirement::getStatus, RdmConstants.STATUS_POOL);
            case RdmConstants.SCOPE_ACCEPTANCE -> wrapper.eq(RdmRequirement::getStatus, RdmConstants.STATUS_UAT_PENDING);
            /*
             * 上线后待評分 / 我的验收记录：都按「验收人字段」收敛，不靠 relatedOnly。
             * <p>relatedOnly 命中提出人/PM/研发负责人/验收人四个字段，用它当唯一防线的话，
             * 提单人会在「待我验收」里看到一堆自己签不了的单，反而以为流程坏了。
             * <p>currentUserId 为 null 表示管理视角（超管/PMO/技术负责人），此时不加人员条件，
             * 与 SCOPE_PRODUCT 同一口径。
             */
            case RdmConstants.SCOPE_ACCEPTANCE_POST -> {
                if (currentUserId != null) {
                    wrapper.eq(RdmRequirement::getAcceptorUserId, currentUserId);
                }
                wrapper.eq(RdmRequirement::getStatus, RdmConstants.STATUS_RELEASED);
            }
            case RdmConstants.SCOPE_ACCEPTANCE_HISTORY -> {
                if (currentUserId != null) {
                    wrapper.eq(RdmRequirement::getAcceptorUserId, currentUserId);
                }
                wrapper.in(RdmRequirement::getStatus, ACCEPTANCE_HISTORY_STATUS);
            }
            case RdmConstants.SCOPE_DELIVERY -> wrapper.in(RdmRequirement::getStatus, DELIVERY_STATUS);
            case RdmConstants.SCOPE_PRODUCT -> {
                if (currentUserId != null) {
                    wrapper.eq(RdmRequirement::getAssigneePmUserId, currentUserId);
                }
            }
            case RdmConstants.SCOPE_TODO -> {
                if (currentUserId != null) {
                    wrapper.and(w -> w.eq(RdmRequirement::getAssigneePmUserId, currentUserId)
                            .or().eq(RdmRequirement::getAcceptorUserId, currentUserId)
                            .or().eq(RdmRequirement::getDevOwnerUserId, currentUserId));
                }
                /*
                 * 「处理中」不含 intake_pending（需求提交/需求管理拆分 · 批次1）。
                 * <p>待审批是提交侧的审批待办，处理人是审批人，不在 PM/验收人/研发负责人
                 * 三个执行字段上；上面那组人员条件已经把它自然排除了，再列进状态集合只会
                 * 让「处理中」计数与需求管理的准入口径对不上。
                 */
                wrapper.in(RdmRequirement::getStatus, List.of(
                        RdmConstants.STATUS_POOL, RdmConstants.STATUS_ASSIGNED,
                        RdmConstants.STATUS_UAT_PENDING));
            }
            case RdmConstants.SCOPE_ALL -> {
                /*
                 * 治理侧「全部」只看已准入需求（需求提交/需求管理拆分 · 批次1）。
                 * <p>这里不收口，审批中/被驳回/草稿就会以「全部」名义泄露到需求管理、看板、
                 * 计数与导出；而前端隐藏不是安全边界（改 URL / 直接调 API 就能绕过）。
                 * 准入前需求归「提交需求」侧的 mine/approving 查看，不复制记录、不删提交历史。
                 * <p>延迟发号后未准入行没有正式需求编号，本口径同时保证治理侧每一行都有号。
                 * <p>用逐个 {@code ne} 而不是 {@code notIn(column, Set)}：后者在本项目的
                 * MyBatis-Plus 版本上会渲染成 {@code status NOT IN ()}（零个占位符），MySQL 直接
                 * 语法报错 —— 那是治理侧列表/统计整体 500，不是少一个条件。
                 * <p>状态用 {@code RdmConstants.STATUS_*} 直接写：它们是编译期字符串常量，javac 会
                 * 内联成字面量，不产生运行时静态字段读取（实测经容器/热加载后读取
                 * {@code REQ_NOT_ADMITTED_STATUSES} 这个 Set 会拿到 null，取决于类初始化时序）。
                 * 三者与 
                 * {@link RdmConstants#REQ_NOT_ADMITTED_STATUSES} 必须一致，由
                 * {@code RdmRequirementQueryScopeTest} 的常量一致性断言钉住。
                 */
                wrapper.and(w -> w.ne(RdmRequirement::getStatus, RdmConstants.STATUS_DRAFT)
                        .ne(RdmRequirement::getStatus, RdmConstants.STATUS_INTAKE_PENDING)
                        .ne(RdmRequirement::getStatus, RdmConstants.STATUS_INTAKE_REJECTED));
            }
            case RdmConstants.SCOPE_APPROVING -> {
                // 待我审批：范围由服务层拿 OA 待办 id 后以 in(...) 收敛，这里不加人员字段条件；
                // 一旦落到 default 分支，审批人就只会看到自己提的单，造成计数与列表不一致
            }
            default -> {
                if (currentUserId != null) {
                    wrapper.eq(RdmRequirement::getSubmitterUserId, currentUserId);
                }
            }
        }
    }
}
