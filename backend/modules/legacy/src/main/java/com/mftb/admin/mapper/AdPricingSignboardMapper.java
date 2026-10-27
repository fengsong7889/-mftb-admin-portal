package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingSignboard;
import org.apache.ibatis.annotations.Mapper;

/** 金字招牌计价主实体（对应「销售定价」菜单 → 金字招牌） Mapper */
@Mapper
public interface AdPricingSignboardMapper extends BaseMapper<AdPricingSignboard> {
}
