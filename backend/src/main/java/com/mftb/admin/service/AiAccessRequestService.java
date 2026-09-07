package com.mftb.admin.service;

import com.mftb.admin.dto.AiAccessRequestDTO;

import java.util.List;

public interface AiAccessRequestService {

    /** 提交申請（當前登錄用戶） */
    Long submitRequest(AiAccessRequestDTO.SubmitRequest request, String operator);

    /** 查詢申請列表（支持按狀態/類型/申请人筛选） */
    List<AiAccessRequestDTO.RequestVO> listRequests(AiAccessRequestDTO.QueryRequest query);

    /** 查詢我的申請列表 */
    List<AiAccessRequestDTO.RequestVO> listMyRequests(AiAccessRequestDTO.QueryRequest query);

    /** 查詢申請詳情 */
    AiAccessRequestDTO.RequestVO getRequestById(Long id);

    /**
     * 審批通過（審批即授權）
     * 單一事務內：① 寫審批結果 ② 下發模型權限（ai_employee_auth）③ 下發個人額度（ai_quota_override）
     */
    void approveRequest(Long id, AiAccessRequestDTO.ApproveRequest request, String operator);

    /** 審批駁回 */
    void rejectRequest(Long id, String remark, String operator);

    /** 撤銷申請（僅申請人本人且狀態為 pending） */
    void cancelRequest(Long id, String operator);
}
