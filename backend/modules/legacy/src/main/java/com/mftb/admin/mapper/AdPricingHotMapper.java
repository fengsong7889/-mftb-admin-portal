package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingHot;
import org.apache.ibatis.annotations.Mapper;

/** 人气商家计价主实体（差异层，对应「销售定价」菜单） Mapper */
@Mapper
public interface AdPricingHotMapper extends BaseMapper<AdPricingHot> {
}
