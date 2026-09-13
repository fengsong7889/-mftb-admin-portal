package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdOrder;
import org.apache.ibatis.annotations.Mapper;

/** 推广广告订单主实体（共享核心层，对应「订单列表/详情」） Mapper */
@Mapper
public interface AdOrderMapper extends BaseMapper<AdOrder> {
}
