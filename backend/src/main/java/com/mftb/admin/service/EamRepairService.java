package com.mftb.admin.service;

import com.mftb.admin.dto.EamRepairSaveDTO;
import com.mftb.admin.dto.EamRepairVO;

import java.util.List;

/** 资产维修记录服务 */
public interface EamRepairService {

    /** 维修记录列表（按资产 ID 过滤，可选状态过滤） */
    List<EamRepairVO> list(Long assetId, String status);

    /** 维修记录详情 */
    EamRepairVO detail(long id);

    /** 创建维修记录 */
    long create(EamRepairSaveDTO dto);

    /** 完成维修 */
    void finish(long id, String finishDate);

    /** 更新维修记录（仅允许维修中状态） */
    void update(long id, EamRepairSaveDTO dto);

    /** 删除维修记录（仅允许维修中状态，删除后恢复资产状态） */
    void delete(long id);
}
