package com.mftb.admin.contracts.eam;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 采购审批回调契约：OA 采购申请审批通过后，由 EAM 域登记采购申请并自动生成采购订单。
 *
 * 为什么要有这个接口：OA 审批服务（legacy）原先直接 new EamPurchaseRequest 实体、
 * 注入 EamPurchaseRequestMapper 与 EamPurchaseService，导致 legacy 反向依赖 EAM 实现。
 * 契约为单向：legacy -> contracts/eam <- modules/eam。
 *
 * 为什么要传 command 而不是让调用方建实体：一旦允许 legacy 构造 EAM 实体，
 * 表结构与字段校验就泄漏到域外，后续任何列变更都会同时改两个模块。
 */
public interface EamPurchaseOrderPort {

    /**
     * 登记采购申请并自动生成采购订单。
     *
     * @param command 审批通过后的采购要素
     * @return 生成的采购订单 ID
     */
    long createFromApprovedPurchase(ApprovedPurchaseCommand command);

    /**
     * 采购申请审批回调要素。
     *
     * @param items 审批表单里的明细（原样透传：EAM 的订单生成按该形状复制明细，
     *              在此重新定型会引入两套解析口径，风险高于收益）
     */
    record ApprovedPurchaseCommand(
            String flowNo,
            String reqNo,
            String title,
            String department,
            Long departmentId,
            String applicant,
            String applicantEmpId,
            String reason,
            Integer brand,
            BigDecimal budget,
            List<Map<String, Object>> items) {
    }
}
