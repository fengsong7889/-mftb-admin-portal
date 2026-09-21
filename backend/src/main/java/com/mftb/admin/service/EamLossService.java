package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 遗失找回服务接口
 */
public interface EamLossService {

    /** 分页查询 */
    PageResult<EamLossVO> page(EamLossQuery query);

    /** 详情（含事件日志） */
    EamLossVO detail(long id);

    /** 主动报失（新建遗失单） */
    long create(EamLossSaveDTO dto);

    /** 编辑遗失单资料（仅 searching 状态可编辑） */
    void update(long id, EamLossSaveDTO dto);

    /** 登记找回 */
    void recover(long id, EamLossRecoverDTO dto);

    /** 验收处置 */
    void inspect(long id, EamLossInspectDTO dto);

    /** 遗失核销 */
    void writeOff(long id, EamLossWriteOffDTO dto);

    /** 追加跟进事件 */
    long addEvent(long id, EamLossEventDTO dto);

    /**
     * 从归还验收流程自动创建遗失单（内部调用，归还服务使用）。
     * 归还验收选择遗失时由归还服务调用，不需要操作人拥有遗失登记权限。
     *
     * @param returnId 归还记录 ID
     * @return 遗失单 ID
     */
    long createFromReturn(long returnId);
}
