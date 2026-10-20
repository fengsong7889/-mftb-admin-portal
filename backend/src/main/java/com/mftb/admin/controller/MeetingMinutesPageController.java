package com.mftb.admin.controller;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MeetingMinutesDto;
import com.mftb.admin.service.MeetingMinutesService;
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
 * 会议纪要免登查看页接口（钉钉卡片直达，安全白名单内）。
 *
 * <p>与免登签到页同构，防护同样只依赖三件事：
 * <ol>
 *   <li><b>HMAC 令牌</b>：绑纪要 + 绑批次 + 绑令牌版本 + 绑过期，签名不匹配一律按无效处理；</li>
 *   <li><b>数据库复核</b>：令牌有效不等于这份纪要还在、这个批次还属它、版本还没被作废；</li>
 *   <li><b>按 IP + 令牌指纹限流</b>：用 {@link ApiRateLimiter#tryAcquireByKey}，
 *       它在未认证时也会拦（既有的 tryAcquire 未认证直接放行，用在这里等于没写）。</li>
 * </ol>
 *
 * <p>响应不区分"签名错 / 过期 / 已作废 / 纪要不存在"，统一一句提示：区分它们等于
 * 允许用错误码枚举有效令牌。返回的正文是<b>该批次发送瞬间的快照</b>，不是纪要当前版本。
 */
@Slf4j
@RestController
@RequestMapping({"/api/meeting/minutes-page", "/api/public/meeting-minutes"})
@RequiredArgsConstructor
public class MeetingMinutesPageController {

    /** 同一 IP + 同一令牌在窗口内的最大请求数：够看几次纪要，不够枚举试探 */
    private static final int MAX_PER_WINDOW = 30;
    private static final long WINDOW_MS = Duration.ofMinutes(1).toMillis();
    private static final String TOO_FREQUENT = "操作過於頻繁，請稍後再試";

    private final MeetingMinutesService minutesService;
    private final ApiRateLimiter rateLimiter;

    /**
     * 方案文档里的免登契约路径：`GET /api/public/meeting-minutes?token=`。
     * <p>与 `/api/meeting/minutes-page/detail` 同一处理器、同一限流：两条路径都存在是为了
     * 不让已经发出去的链接（旧版用 /detail）与按方案接入的调用方互相不兼容。
     */
    @GetMapping({"", "/"})
    public Result<MeetingMinutesDto.PublicView> detailCompat(
            @RequestParam(name = "token", required = false) String token, HttpServletRequest request) {
        return detail(token, request);
    }

    @GetMapping("/detail")
    public Result<MeetingMinutesDto.PublicView> detail(@RequestParam(name = "token", required = false) String token,
                                                       HttpServletRequest request) {
        throttle(token, request);
        MeetingMinutesDto.PublicView view = minutesService.publicView(token);
        // 信封文案必须与事实一致：令牌无效时回"已加载"会让前端与监控都以为读到了内容
        if (view.isValid()) {
            return Result.success("紀要已載入", view);
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
            // 空令牌交给服务层按无效处理，不占限流桶：否则无意义请求会把真实收件人的配额吃光
            return;
        }
        String fingerprint = DigestUtils.md5DigestAsHex(token.getBytes(StandardCharsets.UTF_8)).substring(0, 8);
        String key = "meeting:minutes:" + NetworkUtils.getClientIp(request) + ":" + fingerprint;
        if (!rateLimiter.tryAcquireByKey(key, MAX_PER_WINDOW, WINDOW_MS)) {
            log.warn("會議紀要免登頁觸發限流: ip={}, fingerprint={}", NetworkUtils.getClientIp(request), fingerprint);
            throw new BusinessException(TOO_FREQUENT);
        }
    }
}
