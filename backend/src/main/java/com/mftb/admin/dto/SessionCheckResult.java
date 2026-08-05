package com.mftb.admin.dto;

import lombok.Data;

import java.util.Map;

/**
 * 会话校验结果（供 JwtAuthenticationFilter 和 AuthController.check 共用）
 */
@Data
public class SessionCheckResult {

    /** 是否通过校验 */
    private boolean passed;

    /** 未通过时的业务码 */
    private Integer code;

    /** 未通过时的提示消息 */
    private String message;

    /** 未通过时的附加数据（如 reason、loginIp 等） */
    private Map<String, Object> data;

    public static SessionCheckResult ok() {
        SessionCheckResult r = new SessionCheckResult();
        r.setPassed(true);
        return r;
    }

    public static SessionCheckResult fail(Integer code, String message, Map<String, Object> data) {
        SessionCheckResult r = new SessionCheckResult();
        r.setPassed(false);
        r.setCode(code);
        r.setMessage(message);
        r.setData(data);
        return r;
    }
}
