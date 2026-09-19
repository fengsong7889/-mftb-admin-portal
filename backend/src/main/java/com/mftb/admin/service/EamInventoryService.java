package com.mftb.admin.service;

import com.mftb.admin.dto.*;

/** 资产盘点服务 */
public interface EamInventoryService {

    /** 盘点任务分页列表 */
    PageResult<EamInventoryTaskVO> page(EamInventoryQuery query);

    /** 盘点任务详情（含明细列表） */
    EamInventoryTaskVO detail(long id);

    /** 创建盘点任务（快照当前所有未报废资产作为应盘清单） */
    String create(EamInventoryCreateDTO dto);

    /** 提交盘点结果（逐资产标记状态并计算差异） */
    void submit(EamInventorySubmitDTO dto);

    /** 取消盘点任务 */
    void cancel(long id);
}
