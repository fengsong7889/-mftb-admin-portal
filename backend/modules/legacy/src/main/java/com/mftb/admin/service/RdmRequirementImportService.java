package com.mftb.admin.service;

import com.mftb.admin.dto.RdmRequirementImportDTO;
import com.mftb.admin.dto.RdmRequirementImportVO;

/**
 * 存量需求导入服务（云效迁移）。
 *
 * <p>导入的是<b>已准入的历史需求</b>：不走准入审批、不生成待办、不发通知、不触发评分；
 * 只补齐需求主表、参与角色、状态流水与一份已确认的 PRD，让存量记录可查、可继续建任务。
 */
public interface RdmRequirementImportService {

    /**
     * 执行导入。
     *
     * <p>先全量校验再写入：任何一行存在阻断性问题时整批不落库，
     * 结果里逐行说明原因，避免半批成功导致对账困难。
     *
     * @param dto 导入行
     * @return 逐行结果（imported / skipped / failed）
     */
    RdmRequirementImportVO importRequirements(RdmRequirementImportDTO dto);
}
