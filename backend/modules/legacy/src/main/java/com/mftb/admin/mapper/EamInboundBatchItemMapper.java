package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamInboundBatchItem;
import org.apache.ibatis.annotations.Mapper;

/** 验收入库批次明细实体 Mapper */
@Mapper
public interface EamInboundBatchItemMapper extends BaseMapper<EamInboundBatchItem> {
}
