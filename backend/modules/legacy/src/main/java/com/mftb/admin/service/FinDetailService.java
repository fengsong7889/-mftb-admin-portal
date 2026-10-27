package com.mftb.admin.service;

import com.mftb.admin.dto.FinDetailQuery;
import com.mftb.admin.dto.FinDetailVO;
import com.mftb.admin.dto.PageResult;

/**
 * 交易明细查询服务（明细查询菜单）
 */
public interface FinDetailService {

    /** 交易明细列表（分页） */
    PageResult<FinDetailVO> page(FinDetailQuery query);
}
