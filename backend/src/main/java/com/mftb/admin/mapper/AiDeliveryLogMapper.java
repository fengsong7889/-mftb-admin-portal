package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AiDeliveryLog;
import org.apache.ibatis.annotations.Mapper;

/** AI 通知外部投递日志（V0 §八 V0-6） —— 表 ai_delivery_log 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface AiDeliveryLogMapper extends BaseMapper<AiDeliveryLog> {}
