package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdPricingHotSkin;
import org.apache.ibatis.annotations.Mapper;

/** 人气商家皮肤计价明细实体（定价配置里自定义皮肤，每个皮肤一条: 名称+单价） Mapper */
@Mapper
public interface AdPricingHotSkinMapper extends BaseMapper<AdPricingHotSkin> {
}
