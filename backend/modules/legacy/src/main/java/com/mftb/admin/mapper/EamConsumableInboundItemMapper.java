package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableInboundItem;
import org.apache.ibatis.annotations.Mapper;

/** 耗材入库单明细 —— 表 biz_eam_consumable_inbound_item 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface EamConsumableInboundItemMapper extends BaseMapper<EamConsumableInboundItem> {
}
