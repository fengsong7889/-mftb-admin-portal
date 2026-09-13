package com.mftb.admin.service;

import com.mftb.admin.dto.AiEmpPermissionDTO;

import java.util.List;

/**
 * 员工AI权额管理服务
 *
 * 管理员视角：查看任意员工的模型授权与额度配置，支持编辑能力开关、调整额度值、查询调整日志。
 */
public interface AiEmpPermissionService {

    /**
     * 列表聚合：查询全部启用员工的权额概要
     *
     * @param queryName        姓名/工号模糊搜索（可空）
     * @param queryDept        部门名称模糊搜索（可空）
     * @param queryUpdatedBy   最后更新人模糊搜索（可空）
     * @param queryUpdateTimeStart 最后更新时间起（可空，格式 yyyy-MM-dd）
     * @param queryUpdateTimeEnd   最后更新时间止（可空，格式 yyyy-MM-dd）
     */
    List<AiEmpPermissionDTO.SummaryVO> listSummaries(
            String queryName, String queryDept, String queryUpdatedBy,
            String queryUpdateTimeStart, String queryUpdateTimeEnd);

    /**
     * 详情：某员工的模型权限明细 + 额度明细
     */
    AiEmpPermissionDTO.DetailVO getDetail(Long employeeId);

    /**
     * 保存编辑：能力开关变更 + 额度值调整 + 写入调整日志
     */
    void save(Long employeeId, AiEmpPermissionDTO.SaveReq req);

    /**
     * 查询调整日志（按时间倒序）
     */
    List<AiEmpPermissionDTO.AdjustLogVO> getAdjustLogs(Long employeeId);
}
