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

    /** 本人借用分页（服务层强制按当前登录人过滤，登录即可） */
    PageResult<EamBorrowVO> myPage(EamBorrowQuery query);

    /** 本人借用详情（校验记录归属） */
    EamBorrowVO myDetail(long id);

    /** 本人借用统计（仅本人记录） */
    EamBorrowStatsVO myStats();

    /** 登记借用 */
    long register(EamBorrowSaveDTO dto);

    /** 续借 */
    void renew(long id, EamBorrowRenewDTO dto);

    /** 取消借用 */
    void cancel(long id, String reason);
}
