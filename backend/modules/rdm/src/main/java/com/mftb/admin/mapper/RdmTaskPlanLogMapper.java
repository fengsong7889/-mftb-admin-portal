package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmTaskPlanLog;
import org.apache.ibatis.annotations.Mapper;

/** 任务排期变更审计 Mapper（只追加） */
@Mapper
public interface RdmTaskPlanLogMapper extends BaseMapper<RdmTaskPlanLog> {
}
