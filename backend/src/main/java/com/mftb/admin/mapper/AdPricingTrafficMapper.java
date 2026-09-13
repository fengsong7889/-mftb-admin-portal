package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingTraffic;
import org.apache.ibatis.annotations.Mapper;

/** 投流广告计价主实体（差异层，对应「销售定价-投流广告」菜单） Mapper */
@Mapper
public interface AdPricingTrafficMapper extends BaseMapper<AdPricingTraffic> {
}
