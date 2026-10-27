package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.OaProcess;
import org.apache.ibatis.annotations.Mapper;

/** OA流程定义实体（流程中心展示的流程类型） Mapper */
@Mapper
public interface OaProcessMapper extends BaseMapper<OaProcess> {
}
