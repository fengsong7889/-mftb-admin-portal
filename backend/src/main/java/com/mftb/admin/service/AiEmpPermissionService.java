package com.mftb.admin.service;

import com.mftb.admin.dto.AiEmpPermissionDTO;

import java.util.List;

/**
 * 員工AI權額管理服務
 *
 * 管理員視角：查看任意員工的模型授權與額度配置，支持編輯能力開關、調整額度值、查詢調整日誌。
 */
public interface AiEmpPermissionService {

    /**
     * 列表聚合：查詢全部啟用員工的權額概要
     *
     * @param queryName        姓名/工號模糊搜索（可空）
     * @param queryDept        部門名稱模糊搜索（可空）
     * @param queryUpdatedBy   最後更新人模糊搜索（可空）
     * @param queryUpdateTimeStart 最後更新時間起（可空，格式 yyyy-MM-dd）
     * @param queryUpdateTimeEnd   最後更新時間止（可空，格式 yyyy-MM-dd）
     */
    List<AiEmpPermissionDTO.SummaryVO> listSummaries(
            String queryName, String queryDept, String queryUpdatedBy,
            String queryUpdateTimeStart, String queryUpdateTimeEnd);

    /**
     * 詳情：某員工的模型權限明細 + 額度明細
     */
    AiEmpPermissionDTO.DetailVO getDetail(Long employeeId);

    /**
     * 保存編輯：能力開關變更 + 額度值調整 + 寫入調整日誌
     */
    void save(Long employeeId, AiEmpPermissionDTO.SaveReq req);

    /**
     * 查詢調整日誌（按時間倒序）
     */
    List<AiEmpPermissionDTO.AdjustLogVO> getAdjustLogs(Long employeeId);
}
