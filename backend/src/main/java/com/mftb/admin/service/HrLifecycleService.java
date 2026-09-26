package com.mftb.admin.service;

import com.mftb.admin.dto.HrEmployeeBriefVO;
import com.mftb.admin.dto.HrLifecycleRequestSaveDTO;
import com.mftb.admin.dto.HrLifecycleVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;
import java.util.Map;

/**
 * HR 入转调离生命周期单据服务（入职/转正/调动/离职）
 */
public interface HrLifecycleService {

    /** 分页查询（按类型 + 状态 + 关键字） */
    PageResult<HrLifecycleVO> page(long page, long size, String type, String status, String keyword);

    /** 各状态单据数量（列表页 Tab 徽标），key=status，含 all */
    Map<String, Long> stats(String type);

    /** 单据详情 */
    HrLifecycleVO detail(Long id);

    /** 保存草稿（id 为空新建，否则更新，仅 draft/rejected/cancelled 可编辑） */
    HrLifecycleVO saveDraft(HrLifecycleRequestSaveDTO dto);

    /** 编辑草稿内容（不改变状态） */
    HrLifecycleVO update(Long id, HrLifecycleRequestSaveDTO dto);

    /** 提交审批（draft/rejected/cancelled → pending，创建关联 OA 流程） */
    HrLifecycleVO submit(Long id);

    /** 撤销审批（pending → draft，联动撤销在途 OA 流程） */
    void cancel(Long id);

    /** 删除单据（仅 draft/rejected/cancelled 可删） */
    void delete(Long id);

    /** 按员工ID查询发起单据时的员工概要回填 */
    HrEmployeeBriefVO employeeBrief(Long userId);

    /** 员工搜索下拉（按单据类型菜单授权校验，供转正/调动/离职选人） */
    List<HrEmployeeBriefVO> searchEmployees(String type, String keyword);
}
