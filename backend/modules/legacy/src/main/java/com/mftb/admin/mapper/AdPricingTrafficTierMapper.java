package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingTrafficTier;
import org.apache.ibatis.annotations.Mapper;

/** 投流广告档位明细实体（对应「销售定价 - 投流广告」菜单中的预设档位） Mapper */
@Mapper
public interface AdPricingTrafficTierMapper extends BaseMapper<AdPricingTrafficTier> {
}
