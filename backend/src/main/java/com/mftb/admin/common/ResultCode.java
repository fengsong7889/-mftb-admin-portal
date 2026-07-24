package com.mftb.admin.common;

import lombok.Getter;

/**
 * 响应状态码枚举
 */
@Getter
public enum ResultCode {

    SUCCESS(200, "操作成功"),
    ERROR(500, "操作失败"),
    UNAUTHORIZED(401, "未认证或登录已过期"),
    FORBIDDEN(403, "没有访问权限"),
    NOT_FOUND(404, "资源不存在"),
    PARAM_ERROR(400, "请求参数错误"),
    LOGIN_ERROR(1001, "账号或密码错误"),
    ACCOUNT_DISABLED(1002, "账号已被禁用"),
    ACCOUNT_NOT_EXIST(1003, "账号不存在");

    private final Integer code;
    private final String message;

    ResultCode(Integer code, String message) {
        this.code = code;
        this.message = message;
    }
}
