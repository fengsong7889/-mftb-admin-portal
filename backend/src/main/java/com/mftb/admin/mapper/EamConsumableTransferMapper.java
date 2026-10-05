package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableTransfer;
import org.apache.ibatis.annotations.Mapper;

/** 耗材库存调拨单实体（同档案同公司跨仓） —— 表 biz_eam_consumable_transfer 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface EamConsumableTransferMapper extends BaseMapper<EamConsumableTransfer> {
}
