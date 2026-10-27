package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmNotifyLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * RDM 通知出站留痕 Mapper（Batch 4 事件级去重契约）。
 * <p>本轮仅提供 BaseMapper 契约；实际发送/重试仍由 RdmNotifyDispatcher 等裸 SQL 路径负责，
 * 去重发送逻辑留待任务 22 接线。
 */
@Mapper
public interface RdmNotifyLogMapper extends BaseMapper<RdmNotifyLog> {
}
