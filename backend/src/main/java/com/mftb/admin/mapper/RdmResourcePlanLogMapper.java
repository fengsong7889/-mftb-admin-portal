package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmResourcePlanLog;
import org.apache.ibatis.annotations.Mapper;

/** 个人计划调整/改派审计 Mapper（阶段 B-2.5：只追加不可变审计） */
@Mapper
public interface RdmResourcePlanLogMapper extends BaseMapper<RdmResourcePlanLog> {
}
