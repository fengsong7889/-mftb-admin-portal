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

    /** 交付中状态集合（研发视角） */
    private static final List<String> DELIVERY_STATUS = List.of(
            RdmConstants.STATUS_SCHEDULED, RdmConstants.STATUS_DESIGNING, RdmConstants.STATUS_DEVELOPING,
            RdmConstants.STATUS_INTEGRATION, RdmConstants.STATUS_TESTING, RdmConstants.STATUS_TEST_PASSED);

    /**
     * 构造查询条件。
     * <p>数据范围硬约束：传入 {@code currentUserId}（非管理视角）时，不论 scope 为何，
     * 都只能看到「与自己相关」的需求（提出人 / 產品經理 / 研發負責人 / 驗收人）。
     * 菜单授权可以铺得宽（全公司都要能提需求），跨部门可见性只能靠这条防线，
     * 不能靠前端不渲染按钮来保障。
     *
     * @param currentUserId 当前登录人ID（null 表示不受限：超管 / PMO / 技术负责人）
     */
    public LambdaQueryWrapper<RdmRequirement> toWrapper(Long currentUserId) {
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
        if (Boolean.TRUE.equals(overdueOnly)) {
            wrapper.eq(RdmRequirement::getOverdueFlag, 1);
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(RdmRequirement::getTitle, kw)
                    .or().like(RdmRequirement::getReqNo, kw)
                    .or().like(RdmRequirement::getSubmitterName, kw));
        }
        applyScope(wrapper, currentUserId);
        if (currentUserId != null) {
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
                wrapper.in(RdmRequirement::getStatus, List.of(
                        RdmConstants.STATUS_POOL, RdmConstants.STATUS_ASSIGNED,
                        RdmConstants.STATUS_INTAKE_PENDING, RdmConstants.STATUS_UAT_PENDING));
            }
            case RdmConstants.SCOPE_ALL -> {
                // 全部需求：仅 PMO/超管可用，服务层已按菜单权限门控，此处不再收敛
            }
            default -> {
                if (currentUserId != null) {
                    wrapper.eq(RdmRequirement::getSubmitterUserId, currentUserId);
                }
            }
        }
    }
}
