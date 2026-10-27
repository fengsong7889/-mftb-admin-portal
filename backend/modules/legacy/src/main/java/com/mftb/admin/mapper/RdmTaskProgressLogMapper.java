package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmTaskProgressLog;
import org.apache.ibatis.annotations.Mapper;

/** RDM 任务进度变更审计 Mapper（只追加） */
@Mapper
public interface RdmTaskProgressLogMapper extends BaseMapper<RdmTaskProgressLog> {
}
