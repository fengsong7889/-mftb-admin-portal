package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AiGrantLog;
import org.apache.ibatis.annotations.Mapper;

/** AI 使用申请审批发放幂等日志（flow_no 唯一，避免重放导致重复授权） —— 表 ai_grant_log 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface AiGrantLogMapper extends BaseMapper<AiGrantLog> {}
