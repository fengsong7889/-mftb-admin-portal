package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingStar;
import org.apache.ibatis.annotations.Mapper;

/** 无敌星星计价主实体（差异层，对应「销售定价」菜单） Mapper */
@Mapper
public interface AdPricingStarMapper extends BaseMapper<AdPricingStar> {
}
