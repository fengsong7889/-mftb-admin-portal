package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamInboundBatch;
import org.apache.ibatis.annotations.Mapper;

/** 验收入库批次实体 Mapper */
@Mapper
public interface EamInboundBatchMapper extends BaseMapper<EamInboundBatch> {
}
