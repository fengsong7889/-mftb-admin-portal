package com.mftb.admin.service;

import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestQuery;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PageResult;

/**
 * OA流程事项服务（流程实例全生命周期管理）
 */
public interface OaRequestService {

    /**
     * 分页查询流程事项
     */
    PageResult<OaRequestVO> page(OaRequestQuery query);

    /**
     * 流程详情（含审批节点列表）
     */
    OaRequestVO detail(String flowNo);

    /**
     * 发起流程，返回流程编号
     */
    String submit(OaRequestCreateDTO request);

    /**
     * 通过当前待审节点
     */
    ApproveResultVO approve(String flowNo, String comment, String formData);

    /**
     * 驳回当前待审节点，返回被驳回的节点名称
     */
    String reject(String flowNo, String reason);

    /**
     * 撤销申请（仅 pending 状态可撤销）
     */
    void cancel(String flowNo);
}
