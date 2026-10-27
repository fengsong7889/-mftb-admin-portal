package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 交接管理服务接口
 */
public interface EamHandoverService {

    /** 分页查询 */
    PageResult<EamHandoverVO> page(EamHandoverQuery query);

    /** 详情（含明细） */
    EamHandoverVO detail(long id);

    /** 登记交接 */
    long register(EamHandoverSaveDTO dto);

    /** 取消交接 */
    void cancel(long id, String reason);
}
