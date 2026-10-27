package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AiToolExecLog;
import org.apache.ibatis.annotations.Mapper;

/** AI 工具执行审计日志（V0 治理底座） —— 表 ai_tool_exec_log 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface AiToolExecLogMapper extends BaseMapper<AiToolExecLog> {}
