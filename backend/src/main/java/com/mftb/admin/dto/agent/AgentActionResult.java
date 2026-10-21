package com.mftb.admin.dto.agent;

import lombok.Data;

/** 确认/取消待办动作后的返回，供前端替换确认卡内容。 */
@Data
public class AgentActionResult {

    /** sent / failed / cancelled / expired / processing */
    private String status;

    /** 给用户看的结果文案 */
    private String text;

    /** 失败原因（可空） */
    private String message;
}
