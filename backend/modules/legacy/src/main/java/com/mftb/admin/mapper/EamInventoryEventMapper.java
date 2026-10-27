package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamInventoryEvent;
import org.apache.ibatis.annotations.Mapper;

/** 资产盘点操作日志 Mapper */
@Mapper
public interface EamInventoryEventMapper extends BaseMapper<EamInventoryEvent> {
}
