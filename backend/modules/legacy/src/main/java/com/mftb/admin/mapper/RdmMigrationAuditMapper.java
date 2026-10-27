package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmMigrationAudit;
import org.apache.ibatis.annotations.Mapper;

/** RDM 不可覆盖的迁移结果审计 Mapper */
@Mapper
public interface RdmMigrationAuditMapper extends BaseMapper<RdmMigrationAudit> {
}
