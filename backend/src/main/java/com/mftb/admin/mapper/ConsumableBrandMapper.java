package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.ConsumableBrand;
import org.apache.ibatis.annotations.Mapper;

/**
 * 遗留代码：目标表 biz_consumable_brand 已由 EamSchemaMigrationInitializer 迁移至 biz_eam_brand(biz_type=CONSUMABLE/BOTH) 后 DROP，本 Mapper 当前无任何调用方。
 * <p>
 * 映射实体 {@link ConsumableBrand}，表名 biz_consumable_brand。
 */
@Mapper
public interface ConsumableBrandMapper extends BaseMapper<ConsumableBrand> {
}
