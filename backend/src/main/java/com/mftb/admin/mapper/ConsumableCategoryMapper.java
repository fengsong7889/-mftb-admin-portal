package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.ConsumableCategory;
import org.apache.ibatis.annotations.Mapper;

/**
 * 遗留代码：目标表 biz_consumable_category 已由 EamSchemaMigrationInitializer 迁移至 biz_eam_category(biz_type=CONSUMABLE) 后 DROP，本 Mapper 当前无任何调用方。
 * <p>
 * 映射实体 {@link ConsumableCategory}，表名 biz_consumable_category。
 */
@Mapper
public interface ConsumableCategoryMapper extends BaseMapper<ConsumableCategory> {
}
