package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VersionHistoryVO;

import java.time.LocalDate;

/**
 * 版本发布历史记录服务
 */
public interface VersionHistoryService {

    /**
     * 分页查询版本记录
     */
    PageResult<VersionHistoryVO> list(long page, long size, String keyword, String releaseType,
                                      LocalDate startDate, LocalDate endDate, Integer status,
                                      String createdBy, String updatedBy,
                                      LocalDate updatedStartDate, LocalDate updatedEndDate);

    /**
     * 按 ID 获取版本详情
     */
    VersionHistoryVO getById(Long id);

    /**
     * 新增版本记录
     */
    Long create(VersionHistoryVO vo, String operator);

    /**
     * 更新版本记录
     */
    void update(Long id, VersionHistoryVO vo, String operator);

    /**
     * 删除版本记录
     */
    void delete(Long id);

    /**
     * 从 Git 提交历史同步版本记录
     * @return 同步结果摘要
     */
    String syncFromGit(String operator);

    /**
     * 根据发布类型建议下一个版本号
     * @param releaseType major / minor / patch / frontend
     * @return 建议的版本号字符串
     */
    String suggestNextVersion(String releaseType);

    /**
     * 按创建时间倒序重新编排所有版本编号（起始 1.0.0）
     * @return 重新编号结果摘要
     */
    String renumberAll();
}
