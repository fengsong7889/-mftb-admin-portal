package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdOrderItemRevive;
import org.apache.ibatis.annotations.Mapper;

/** 盘活复苏订单明细实体（差异层，按天库存） Mapper */
@Mapper
public interface AdOrderItemReviveMapper extends BaseMapper<AdOrderItemRevive> {
}
