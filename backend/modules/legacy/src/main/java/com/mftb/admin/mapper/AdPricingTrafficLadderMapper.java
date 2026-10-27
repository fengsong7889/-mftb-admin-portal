package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingTrafficLadder;
import org.apache.ibatis.annotations.Mapper;

/** 投流广告阶梯单价实体（对应「销售定价 - 投流广告」菜单中的自定义购买） Mapper */
@Mapper
public interface AdPricingTrafficLadderMapper extends BaseMapper<AdPricingTrafficLadder> {
}
