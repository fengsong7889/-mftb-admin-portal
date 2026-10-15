package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmMigrationItem;
import org.apache.ibatis.annotations.Mapper;

/** RDM 逐项迁移明细 Mapper */
@Mapper
public interface RdmMigrationItemMapper extends BaseMapper<RdmMigrationItem> {
}
