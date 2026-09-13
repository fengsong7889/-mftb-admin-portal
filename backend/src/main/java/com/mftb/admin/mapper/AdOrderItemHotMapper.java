package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdOrderItemHot;
import org.apache.ibatis.annotations.Mapper;

/** 人气商家订单明细实体（一行 = 一个「皮肤 x 日期」格子） Mapper */
@Mapper
public interface AdOrderItemHotMapper extends BaseMapper<AdOrderItemHot> {
}
