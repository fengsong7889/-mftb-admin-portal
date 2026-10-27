package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmMigrationBatch;
import org.apache.ibatis.annotations.Mapper;

/** RDM 人工确认的小批迁移计划 Mapper */
@Mapper
public interface RdmMigrationBatchMapper extends BaseMapper<RdmMigrationBatch> {
}
