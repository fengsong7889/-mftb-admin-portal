package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdOrderItemTraffic;
import org.apache.ibatis.annotations.Mapper;

/** 投流广告订单明细实体（一个订单一条明细 = 一个流量包） Mapper */
@Mapper
public interface AdOrderItemTrafficMapper extends BaseMapper<AdOrderItemTraffic> {
}
