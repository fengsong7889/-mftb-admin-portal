package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.FinBatch;
import org.apache.ibatis.annotations.Mapper;

/** 推广金批次实体（仅充值/转账/合并生成批次，扣款不生成） Mapper */
@Mapper
public interface FinBatchMapper extends BaseMapper<FinBatch> {
}
