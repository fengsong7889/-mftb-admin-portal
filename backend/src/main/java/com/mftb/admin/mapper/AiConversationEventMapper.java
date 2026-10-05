package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AiConversationEvent;
import org.apache.ibatis.annotations.Mapper;

/** AI 会话执行事件（服务端追加写；客户端不可覆写） —— 表 ai_conversation_event 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface AiConversationEventMapper extends BaseMapper<AiConversationEvent> {}
