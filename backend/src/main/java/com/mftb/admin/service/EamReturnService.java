package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/**
 * 归还管理服务接口
 */
public interface EamReturnService {

    /** 分页查询 */
    PageResult<EamReturnVO> page(EamReturnQuery query);

    /** 详情 */
    EamReturnVO detail(long id);

    /** 登记归还（从领用或借用） */
    long register(EamReturnDTO dto);

    /** 处置登记 */
    void dispose(EamReturnDispositionDTO dto);

    /** 遗失找回 */
    void recover(EamReturnRecoverDTO dto);
}
