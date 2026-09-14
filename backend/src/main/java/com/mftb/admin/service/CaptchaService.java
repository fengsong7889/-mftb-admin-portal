package com.mftb.admin.service;

/**
 * 滑块安全验证码 Token 服务
 * 前端滑块验证通过后调用签发接口获取一次性 Token，登录时随请求提交校验。
 */
public interface CaptchaService {

    /**
     * 签发一次性验证码 Token（5 分钟有效）
     *
     * @return Token 字符串，格式: expireAt.nonce.signature
     */
    String issueToken();

    /**
     * 校验并消费验证码 Token（一次性，校验通过即失效）
     *
     * @param token 前端提交的 captchaToken
     * @return 是否有效（签名正确 + 未过期 + 未消费）
     */
    boolean verifyAndConsume(String token);
}
