package com.mftb.admin.service;

import com.mftb.admin.contracts.eam.EamPurchaseOrderPort;
import com.mftb.admin.entity.EamPurchaseRequest;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 采购审批回调契约的 EAM 侧实现：OA 审批通过后登记采购申请并生成采购订单。
 *
 * 行为与拆分前逐字一致（字段、状态 approved、预算、明细透传），
 * 差别只在「谁来 new 实体」：现在由 EAM 自己构造，OA 不再需要 import EAM 的实体与 Mapper。
 */
@Service
@RequiredArgsConstructor
public class EamPurchaseOrderAdapter implements EamPurchaseOrderPort {

    private final EamPurchaseRequestMapper purchaseRequestMapper;
    private final EamPurchaseService purchaseService;

    @Override
    public long createFromApprovedPurchase(ApprovedPurchaseCommand command) {
        EamPurchaseRequest pr = new EamPurchaseRequest();
        pr.setFlowNo(command.flowNo());
        pr.setReqNo(command.reqNo());
        pr.setTitle(command.title());
        pr.setDepartment(command.department());
        pr.setDepartmentId(command.departmentId());
        pr.setApplicant(command.applicant());
        pr.setApplicantEmpId(command.applicantEmpId());
        pr.setReason(command.reason());
        pr.setBrand(command.brand());
        pr.setStatus("approved");
        pr.setBudget(command.budget());
        purchaseRequestMapper.insert(pr);
        return purchaseService.createOrderFromRequest(pr.getId(), command.items());
    }
}
