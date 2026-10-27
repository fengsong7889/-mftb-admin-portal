package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrOperationAudit;
import org.apache.ibatis.annotations.Mapper;

/**
 * 人事操作审计 Mapper（只增不改：不提供 update/delete 的业务入口）
 */
@Mapper
public interface HrOperationAuditMapper extends BaseMapper<HrOperationAudit> {
}
