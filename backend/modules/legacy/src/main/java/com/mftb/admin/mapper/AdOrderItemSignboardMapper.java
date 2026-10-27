package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdOrderItemSignboard;
import org.apache.ibatis.annotations.Mapper;

/** 金字招牌订单明细实体（一行 = 一个「标签 x 日期」格子） Mapper */
@Mapper
public interface AdOrderItemSignboardMapper extends BaseMapper<AdOrderItemSignboard> {
}
