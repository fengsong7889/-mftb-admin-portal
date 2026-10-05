package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableAdjust;
import org.apache.ibatis.annotations.Mapper;

/** 耗材库存调整单实体（盘盈/盘亏） —— 表 biz_eam_consumable_adjust 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface EamConsumableAdjustMapper extends BaseMapper<EamConsumableAdjust> {
}
