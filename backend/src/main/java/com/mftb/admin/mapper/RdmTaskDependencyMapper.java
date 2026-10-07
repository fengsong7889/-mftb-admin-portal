package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmTaskDependency;
import org.apache.ibatis.annotations.Mapper;

/** 任务依赖 Mapper（边集：拓扑排序与环检测的输入） */
@Mapper
public interface RdmTaskDependencyMapper extends BaseMapper<RdmTaskDependency> {
}
