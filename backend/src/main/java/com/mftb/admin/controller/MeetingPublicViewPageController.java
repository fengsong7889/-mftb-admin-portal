package com.mftb.admin.controller;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MeetingBookingDto;
import com.mftb.admin.service.MeetingPublicViewService;
import com.mftb.admin.util.ApiRateLimiter;
import com.mftb.admin.util.NetworkUtils;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.DigestUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 会议详情免登查看页接口（钉钉邀约卡片直达，安全白名单内）。
 *
 * <p>与免登签到页/纪要页同构，防护只依赖三件事：
 * <ol>
 *   <li><b>HMAC 令牌</b>：绑会议 + 绑过期，签名不匹配一律按无效处理；</li>
 *   <li><b>数据库复核</b>：令牌有效不等于这场会还在（已删除的单查不到）；</li>
 *   <li><b>按 IP + 令牌指纹限流</b>：用 {@link ApiRateLimiter#tryAcquireByKey}，
 *       它在未认证时也会拦（既有 tryAcquire 未认证直接放行，用在这里等于没写）。</li>
 * </ol>
 *
 * <p>响应不区分"签名错 / 过期 / 会议不存在"，统一一句提示：区分它们等于
 * 允许用错误码枚举有效令牌。返回字段刻意窄（不含参会人名单、手机号、投递明细），
 * 因为免登链接可被转发。
 */
@Slf4j
@RestController
@RequestMapping("/api/public/meeting-view")
@RequiredArgsConstructor
public class MeetingPublicViewPageController {

    /** 同一 IP + 同一令牌在窗口内的最大请求数：够看几次详情，不够枚举试探 */
    private static final int MAX_PER_WINDOW = 30;
    private static final long WINDOW_MS = Duration.ofMinutes(1).toMillis();
    private static final String TOO_FREQUENT = "操作過於頻繁，請稍後再試";

    private final MeetingPublicViewService viewService;
    private final ApiRateLimiter rateLimiter;

    @GetMapping({"", "/"})
    public Result<MeetingBookingDto.PublicView> detailCompat(
            @RequestParam(name = "token", required = false) String token, HttpServletRequest request) {
        return detail(token, request);
    }

    @GetMapping("/detail")
    public Result<MeetingBookingDto.PublicView> detail(@RequestParam(name = "token", required = false) String token,
                                                      HttpServletRequest request) {
        throttle(token, request);
        MeetingBookingDto.PublicView view = viewService.view(token);
        if (Boolean.TRUE.equals(view.getValid())) {
            return Result.success("會議詳情已載入", view);
        }
        return Result.success(StringUtils.hasText(view.getMessage()) ? view.getMessage() : "連結不可用", view);
    }

    /**
     * 限流键 = 客户端 IP + 令牌摘要前 8 位。
     *
     * <p>不放令牌原文：桶键会进日志与内存，等于把免登凭据复制进两处；
     * 不只按 IP：同一个群几十个人同时点开会互相顶掉配额；不只按令牌：
     * 单个令牌被脚本反复试探时没人拦。两者组合才对应真实威胁。
     */
    private void throttle(String token, HttpServletRequest request) {
        if (!StringUtils.hasText(token)) {
            // 空令牌交给服务层按无效处理，不占限流桶
            return;
        }
        String fingerprint = DigestUtils.md5DigestAsHex(token.getBytes(StandardCharsets.UTF_8)).substring(0, 8);
        String key = "meeting:view:" + NetworkUtils.getClientIp(request) + ":" + fingerprint;
        if (!rateLimiter.tryAcquireByKey(key, MAX_PER_WINDOW, WINDOW_MS)) {
            log.warn("會議詳情免登頁觸發限流: ip={}, fingerprint={}", NetworkUtils.getClientIp(request), fingerprint);
            throw new BusinessException(TOO_FREQUENT);
        }
    }
}
