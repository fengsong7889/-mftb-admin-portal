package com.mftb.admin.controller;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.RdmDailyReportVO.PublicView;
import com.mftb.admin.service.RdmDailyReportService;
import com.mftb.admin.util.ApiRateLimiter;
import com.mftb.admin.util.NetworkUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
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
 * 进度日报看板开放页接口（钉钉通知直达，安全白名单内）。
 *
 * <p>与会议纪要免登页同构，防护只依赖三件事：
 * <ol>
 *   <li><b>HMAC 令牌</b>：绑日期 + 档位 + 项目/迭代范围 + 签发与到期，签名不匹配一律无效；</li>
 *   <li><b>数据库复核</b>：令牌有效不等于快照还在，服务层每次都查快照表；</li>
 *   <li><b>按 IP + 令牌指纹限流</b>：用 {@link ApiRateLimiter#tryAcquireByKey}，
 *       它在未认证时也会拦（既有的 {@code tryAcquire} 未认证直接放行，用在这里等于没写）。</li>
 * </ol>
 *
 * <p>响应不区分「签名错 / 过期 / 快照不存在」，统一由服务层给一句提示：区分它们等于
 * 允许用错误响应枚举有效令牌。本接口只读，不提供任何写操作。
 */
@Slf4j
@RestController
@RequestMapping("/api/public/rdm-daily-view")
@RequiredArgsConstructor
@Tag(name = "产研交付 - 进度日报看板（开放页）", description = "凭签名令牌免登查看，只读")
public class RdmDailyReportPublicController {

    /** 单 IP + 单令牌每分钟最多 60 次：群里几十人同时点开不至于互相顶掉，脚本枚举很快会被拦 */
    private static final int MAX_PER_WINDOW = 60;
    private static final long WINDOW_MS = Duration.ofMinutes(1).toMillis();
    private static final String TOO_FREQUENT = "操作過於頻繁，請稍後再試";

    private final RdmDailyReportService dailyReportService;
    private final ApiRateLimiter rateLimiter;

    @GetMapping
    @Operation(summary = "看板开放页快照（凭签名令牌，只读）")
    public Result<PublicView> view(@RequestParam(name = "token", required = false) String token,
                                   HttpServletRequest request) {
        throttle(token, request);
        PublicView view = dailyReportService.publicView(token);
        // 信封文案必须与事实一致：令牌无效时回「已加载」会让前端与监控都以为读到了内容
        if (view.isValid()) {
            return Result.success("日報已載入", view);
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
        String key = "rdm:daily-view:" + NetworkUtils.getClientIp(request) + ":" + fingerprint;
        if (!rateLimiter.tryAcquireByKey(key, MAX_PER_WINDOW, WINDOW_MS)) {
            log.warn("日报看板开放页触发限流: ip={}, fingerprint={}",
                    NetworkUtils.getClientIp(request), fingerprint);
            throw new BusinessException(TOO_FREQUENT);
        }
    }
}
