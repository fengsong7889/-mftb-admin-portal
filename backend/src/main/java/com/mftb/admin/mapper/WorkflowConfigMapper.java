package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.WorkflowConfig;
import org.apache.ibatis.annotations.Mapper;

/** 流程配置实体（控制各业务流程是否需要审批） Mapper */
@Mapper
public interface WorkflowConfigMapper extends BaseMapper<WorkflowConfig> {
}
