package com.mftb.admin.service;

import com.mftb.admin.dto.FinBatchQuery;
import com.mftb.admin.dto.FinBatchVO;
import com.mftb.admin.dto.PageResult;

/**
 * 充值/转账/合并批次查询服务（批次查询菜单）
 */
public interface FinBatchService {

    /** 批次列表（分页） */
    PageResult<FinBatchVO> page(FinBatchQuery query);

    /**
     * 批次明细（含 extra 表单快照）
     *
     * @param batchNo 批次号
     * @param groupId 集团ID，转账/合并批次双方共享批次号时用于定位具体一方，可为空
     */
    FinBatchVO detail(String batchNo, String groupId);
}
