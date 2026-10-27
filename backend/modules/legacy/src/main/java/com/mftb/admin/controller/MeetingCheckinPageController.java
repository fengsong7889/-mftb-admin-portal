package com.mftb.admin.controller;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.MeetingCheckinDto;
import com.mftb.admin.service.MeetingCheckinService;
import com.mftb.admin.util.ApiRateLimiter;
import com.mftb.admin.util.NetworkUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.DigestUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * 免登签到页接口（扫码直达，安全白名单内）。
 *
 * <p>这个控制器里的每一条都是"没有登录态"的入口，因此防护只依赖三件事：
 * <ol>
 *   <li><b>HMAC 令牌</b>：绑人 + 绑会议 + 绑过期（会议结束后 2 小时），签名不匹配一律按无效处理；</li>
 *   <li><b>数据库名单复核</b>：令牌有效不等于此人是参会人，每次都查参会人表；</li>
 *   <li><b>按 IP + 令牌指纹限流</b>：见 {@link ApiRateLimiter#tryAcquireByKey}。
 *       不用既有的 {@code tryAcquire}：它在未认证时直接放行，用在这里等于写了个不生效的限流。</li>
 * </ol>
 *
 * <p>响应不区分"签名错/过期/不在名单/会议不存在"，统一给同一句提示：区分它们等于
 * 允许用错误码枚举有效令牌。
 */
@Slf4j
@RestController
@RequestMapping("/api/meeting/checkin-page")
@RequiredArgsConstructor
public class MeetingCheckinPageController {

    /** 同一 IP + 同一令牌在窗口内的最大请求数：够一个人签到，不够枚举试探 */
    private static final int MAX_PER_WINDOW = 12;
    private static final long WINDOW_MS = Duration.ofMinutes(1).toMillis();
    private static final String TOO_FREQUENT = "操作過於頻繁，請稍後再試";

    private final MeetingCheckinService checkinService;
    private final ApiRateLimiter rateLimiter;

    /** 免登页读取（不返回手机号等敏感字段，只回令牌绑定者自己的那一行） */
    @GetMapping("/detail")
    public Result<MeetingCheckinDto.PublicView> detail(@RequestParam(name = "token", required = false) String token,
                                                      HttpServletRequest request) {
        throttle(token, request);
        return Result.success(checkinService.view(token));
    }

    /** 免登签到 */
    @PostMapping("/sign")
    public Result<MeetingCheckinDto.PublicView> sign(@RequestBody @Valid MeetingCheckinDto.TokenForm form,
                                                    HttpServletRequest request) {
        throttle(form.getToken(), request);
        MeetingCheckinDto.PublicView view = checkinService.sign(form.getToken());
        // 信封文案必须与事实一致：业务性拒绝（未到签到时间、已被释放）不能一律回“簽到已完成”，
        // 否则调用方与监控看到的都是成功文案，只有展开 data 才知道根本没签上
        if (Boolean.TRUE.equals(view.getCheckedIn())) {
            return Result.success("簽到已完成", view);
        }
        return Result.success(StringUtils.hasText(view.getMessage()) ? view.getMessage() : "簽到未完成，請重新掃碼", view);
    }

    /**
     * 限流键 = 客户端 IP + 令牌摘要前 8 位。
     *
     * <p>不放令牌原文：桶键会进日志与内存，等于把免登凭据复制进两处。
     * 也不只按 IP：会议室同网段多人同时扫码会互相顶掉配额；不只按令牌：
     * 单个令牌被脚本反复试探时没人拦。两者组合才对应真实威胁。
     */
    private void throttle(String token, HttpServletRequest request) {
        if (!StringUtils.hasText(token)) {
            // 空令牌直接进服务层按无效处理；这里不占限流桶，避免无意义请求把真实用户的配额吃光
            return;
        }
        String fingerprint = DigestUtils.md5DigestAsHex(token.getBytes(StandardCharsets.UTF_8)).substring(0, 8);
        String key = "meeting:checkin:" + NetworkUtils.getClientIp(request) + ":" + fingerprint;
        if (!rateLimiter.tryAcquireByKey(key, MAX_PER_WINDOW, WINDOW_MS)) {
            log.warn("會議免登簽到觸發限流: ip={}, fingerprint={}", NetworkUtils.getClientIp(request), fingerprint);
            throw new BusinessException(TOO_FREQUENT);
        }
    }
}
