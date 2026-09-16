package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 借用管理服务接口
 */
public interface EamBorrowService {

    /** 分页查询 */
    PageResult<EamBorrowVO> page(EamBorrowQuery query);

    /** 详情 */
    EamBorrowVO detail(long id);

    /** 登记借用 */
    long register(EamBorrowSaveDTO dto);

    /** 续借 */
    void renew(long id, EamBorrowRenewDTO dto);

    /** 取消借用 */
    void cancel(long id, String reason);
}
