package com.mftb.admin.service;

import com.mftb.admin.dto.EamAssetTransferQuery;
import com.mftb.admin.dto.EamAssetTransferSaveDTO;
import com.mftb.admin.dto.EamAssetTransferVO;
import com.mftb.admin.dto.PageResult;

/**
 * 资产调拨服务
 * <p>
 * 调拨 = 物资部将单件在用资产转移至新使用人/新归属部门（in_use → in_use）。
 * 与交接（批量人A→人B）互补，是台账归属部门变更的合法通道之一。
 */
public interface EamAssetTransferService {

    /** 分页查询调拨记录 */
    PageResult<EamAssetTransferVO> page(EamAssetTransferQuery query);

    /** 调拨详情 */
    EamAssetTransferVO detail(long id);

    /**
     * 登记调拨
     * <p>
     * 锁定资产 → 校验 in_use → 解析新使用人 → 生成调拨单 → 更新资产归属
     *
     * @return 调拨单 ID
     */
    long register(EamAssetTransferSaveDTO dto);

    /** 取消调拨（回滚资产） */
    void cancel(long id, String reason);
}
