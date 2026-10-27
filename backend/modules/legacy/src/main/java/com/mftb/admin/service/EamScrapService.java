package com.mftb.admin.service;

import com.mftb.admin.dto.EamScrapQuery;
import com.mftb.admin.dto.EamScrapSaveDTO;
import com.mftb.admin.dto.EamScrapVO;
import com.mftb.admin.dto.PageResult;

/** 资产报废记录服务 */
public interface EamScrapService {

    /** 报废记录分页查询（支持搜索区全字段过滤） */
    PageResult<EamScrapVO> page(EamScrapQuery query);

    /** 报废记录详情 */
    EamScrapVO detail(long id);

    /** 创建报废记录（快照资产信息，流程暂未启用，直接生效并将资产置为已报废） */
    long create(EamScrapSaveDTO dto);

    /** 删除报废记录（同时恢复关联资产为闲置状态） */
    void delete(long id);
}
