package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableInbound;
import org.apache.ibatis.annotations.Mapper;

/** 耗材入库单实体（采购/期初/手工入库统一入口） —— 表 biz_eam_consumable_inbound 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface EamConsumableInboundMapper extends BaseMapper<EamConsumableInbound> {
}
