package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.SysNotificationChannelSaveDTO;
import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.mapper.SysNotificationChannelMapper;
import com.mftb.admin.service.NotificationChannelService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 通知渠道配置服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationChannelServiceImpl implements NotificationChannelService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SysNotificationChannelMapper mapper;
    private final OperatorResolver operatorResolver;
    private final RestTemplate restTemplate;
    @Override
    public List<Map<String, Object>> listByChannel(String platform) {
        LambdaQueryWrapper<SysNotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysNotificationChannel::getChannel, platform)
               .orderByDesc(SysNotificationChannel::getIsDefault)
               .orderByDesc(SysNotificationChannel::getUpdatedAt);
        return mapper.selectList(wrapper).stream().map(this::toMap).collect(Collectors.toList());
    }

    @Override
    public List<Map<String, Object>> listAll() {
        LambdaQueryWrapper<SysNotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.orderByAsc(SysNotificationChannel::getChannel)
               .orderByDesc(SysNotificationChannel::getIsDefault)
               .orderByDesc(SysNotificationChannel::getUpdatedAt);
        return mapper.selectList(wrapper).stream().map(this::toMap).collect(Collectors.toList());
    }

    @Override
    public List<Map<String, Object>> listFiltered(String channel, String name, Integer enabled,
                                                   String updatedBy, String updatedAfter, String updatedBefore) {
        LambdaQueryWrapper<SysNotificationChannel> wrapper = new LambdaQueryWrapper<>();
        if (channel != null && !channel.isBlank()) {
            wrapper.eq(SysNotificationChannel::getChannel, channel);
        }
        if (name != null && !name.isBlank()) {
            wrapper.like(SysNotificationChannel::getName, name);
        }
        if (enabled != null) {
            wrapper.eq(SysNotificationChannel::getEnabled, enabled);
        }
        if (updatedBy != null && !updatedBy.isBlank()) {
            wrapper.like(SysNotificationChannel::getUpdatedBy, updatedBy);
        }
        if (updatedAfter != null && !updatedAfter.isBlank()) {
            wrapper.ge(SysNotificationChannel::getUpdatedAt, updatedAfter);
        }
        if (updatedBefore != null && !updatedBefore.isBlank()) {
            wrapper.le(SysNotificationChannel::getUpdatedAt, updatedBefore);
        }
        wrapper.orderByAsc(SysNotificationChannel::getChannel)
               .orderByDesc(SysNotificationChannel::getIsDefault)
               .orderByDesc(SysNotificationChannel::getUpdatedAt);
        return mapper.selectList(wrapper).stream().map(this::toMap).collect(Collectors.toList());
    }

    @Override
    public Map<String, Object> getDetail(Long id) {
        SysNotificationChannel entity = mapper.selectById(id);
        if (entity == null) throw new BusinessException("通知渠道不存在");
        return toMap(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long create(SysNotificationChannelSaveDTO dto) {
        validateDto(dto, true);
        String operator = operatorResolver.currentOperatorName();

        SysNotificationChannel entity = new SysNotificationChannel();
        applyDto(entity, dto, true);
        entity.setCreatedBy(operator);
        entity.setUpdatedBy(operator);
        entity.setDeleted(0);

        // 如果设为默认，先取消同平台其他默认
        if (entity.getIsDefault() != null && entity.getIsDefault() == 1) {
            clearDefaultForPlatform(entity.getChannel(), null);
        }

        mapper.insert(entity);
        return entity.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void update(Long id, SysNotificationChannelSaveDTO dto) {
        SysNotificationChannel entity = mapper.selectById(id);
        if (entity == null) throw new BusinessException("通知渠道不存在");
        validateDto(dto, false);

        applyDto(entity, dto, false);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());

        // 如果设为默认，先取消同平台其他默认
        if (entity.getIsDefault() != null && entity.getIsDefault() == 1) {
            clearDefaultForPlatform(entity.getChannel(), id);
        }

        mapper.updateById(entity);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        SysNotificationChannel entity = mapper.selectById(id);
        if (entity == null) throw new BusinessException("通知渠道不存在");
        if (entity.getIsDefault() != null && entity.getIsDefault() == 1) {
            throw new BusinessException("默認渠道不可刪除，請先設置其他渠道為默認");
        }
        mapper.deleteById(id);
    }

    @Override
    public void toggleEnabled(Long id, boolean enabled) {
        SysNotificationChannel entity = mapper.selectById(id);
        if (entity == null) throw new BusinessException("通知渠道不存在");
        entity.setEnabled(enabled ? 1 : 0);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        mapper.updateById(entity);
    }

    @Override
    public SysNotificationChannel findByScenario(String scenario) {
        if (!StringUtils.hasText(scenario)) return null;
        // 查找绑定了该场景且已启用的渠道
        LambdaQueryWrapper<SysNotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysNotificationChannel::getEnabled, 1);
        // 使用 FIND_IN_SET 或 LIKE 匹配逗号分隔的 scenarios 字段
        wrapper.and(w -> w
                .apply("FIND_IN_SET({0}, scenarios)", scenario)
        );
        wrapper.orderByDesc(SysNotificationChannel::getUpdatedAt);
        wrapper.last("LIMIT 1");
        return mapper.selectOne(wrapper);
    }

    @Override
    public SysNotificationChannel findDefault(String platform) {
        LambdaQueryWrapper<SysNotificationChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysNotificationChannel::getChannel, platform)
               .eq(SysNotificationChannel::getIsDefault, 1)
               .eq(SysNotificationChannel::getEnabled, 1);
        wrapper.last("LIMIT 1");
        return mapper.selectOne(wrapper);
    }

    @Override
    public String sendTest(Long id) {
        SysNotificationChannel entity = mapper.selectById(id);
        if (entity == null) throw new BusinessException("通知渠道不存在");

        if (!"dingtalk".equals(entity.getChannel())) {
            return "渠道 " + entity.getChannel() + " 暫不支持測試";
        }

        if (!StringUtils.hasText(entity.getWebhookUrl())) {
            return "Webhook 地址未配置";
        }

        // 历史脏数据（典型：浏览器把登录凭据自动填充进「加签密钥」）先本地拦掉，
        // 否则钉钉只回一句很长的「签名不匹配」，看不出真正原因。
        if (StringUtils.hasText(entity.getSecret()) && !entity.getSecret().startsWith("SEC")) {
            return "發送失敗: 加簽密鑰格式不正確（釘釘機器人密鑰以 SEC 開頭），請重新填寫後保存";
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("msgtype", "text");
        Map<String, String> text = new HashMap<>();
        text.put("content", "MFTB 管理後台釘釘通知測試消息 — 如果您收到此消息，說明釘釘機器人配置成功！");
        body.put("text", text);

        try {
            String url = buildSignedUrl(entity.getWebhookUrl(), entity.getSecret());
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(url, body, Map.class);
            if (response != null && Integer.valueOf(0).equals(response.get("errcode"))) {
                return "測試消息發送成功，請查看釘釘群";
            } else {
                String errMsg = response != null ? String.valueOf(response.get("errmsg")) : null;
                return "發送失敗: " + mapDingTalkError(errMsg);
            }
        } catch (Exception e) {
            // 异常文本里带着完整 webhook（含 access_token 与 sign），只记类型，禁止入日志与响应
            log.error("钉钉测试消息发送失败: {}", e.getClass().getSimpleName());
            return "發送失敗: " + e.getClass().getSimpleName();
        }
    }

    /* ==================== 内部方法 ==================== */

    /** 保存校验：create 必须带 Webhook；update 时 Webhook/密钥的空值表示沿用原配置 */
    private void validateDto(SysNotificationChannelSaveDTO dto, boolean creating) {
        if (!StringUtils.hasText(dto.getName())) {
            throw new BusinessException("渠道名稱不能為空");
        }
        if (!StringUtils.hasText(dto.getChannel())) {
            throw new BusinessException("平台類型不能為空");
        }
        String webhook = dto.getWebhookUrl() == null ? null : dto.getWebhookUrl().trim();
        if (creating && !StringUtils.hasText(webhook)) {
            throw new BusinessException("Webhook 地址不能為空");
        }
        if (StringUtils.hasText(webhook)) {
            validateWebhook(dto.getChannel(), webhook);
        }
        String secret = dto.getSecret() == null ? null : dto.getSecret().trim();
        if (StringUtils.hasText(secret)) {
            validateSecret(dto.getChannel(), secret);
        }
    }

    /** Webhook 必须是 http(s) 地址；钉钉渠道还必须是机器人 send 地址，挡住工号等误填值 */
    private void validateWebhook(String channel, String webhook) {
        if (webhook.length() > 500) {
            throw new BusinessException("Webhook 地址過長（最多 500 字符）");
        }
        if (!webhook.startsWith("https://") && !webhook.startsWith("http://")) {
            throw new BusinessException("Webhook 地址格式不正確：必須以 http:// 或 https:// 開頭");
        }
        if ("dingtalk".equals(channel) && !webhook.contains("access_token=")) {
            throw new BusinessException("釘釘 Webhook 地址不正確：應為 https://oapi.dingtalk.com/robot/send?access_token=...");
        }
    }

    /** 钉钉加签密钥固定以 SEC 开头：拦掉浏览器自动填充的登录密码等脏值 */
    private void validateSecret(String channel, String secret) {
        if (secret.length() > 200) {
            throw new BusinessException("加簽密鑰過長（最多 200 字符）");
        }
        if ("dingtalk".equals(channel) && !secret.startsWith("SEC")) {
            throw new BusinessException("加簽密鑰格式不正確：釘釘機器人加簽密鑰以 SEC 開頭，請勿填寫登錄密碼或其他字符");
        }
    }

    /**
     * 写库赋值：Webhook 与密钥均支持「不修改」语义。
     * <ul>
     *   <li>Webhook：空值表示沿用原值</li>
     *   <li>加签密钥：null 表示沿用原值；空串表示显式清空（改用关键词模式）</li>
     * </ul>
     */
    private void applyDto(SysNotificationChannel entity, SysNotificationChannelSaveDTO dto, boolean creating) {
        entity.setName(dto.getName().trim());
        entity.setChannel(dto.getChannel());
        if (StringUtils.hasText(dto.getWebhookUrl())) {
            entity.setWebhookUrl(dto.getWebhookUrl().trim());
        } else if (creating) {
            entity.setWebhookUrl("");
        }
        if (dto.getSecret() != null) {
            entity.setSecret(dto.getSecret().trim());
        } else if (creating) {
            entity.setSecret("");
        }
        entity.setAtMobiles(dto.getAtMobiles() != null ? dto.getAtMobiles() : "");
        entity.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : 1);
        entity.setIsDefault(dto.getIsDefault() != null ? dto.getIsDefault() : 0);
        entity.setScenarios(dto.getScenarios() != null ? dto.getScenarios() : "");
        entity.setRemark(dto.getRemark() != null ? dto.getRemark() : "");
    }

    /** 把钉钉的长文案错误映射成可操作提示（原文含解决方案、参考链接，不适合直接弹给用户） */
    private String mapDingTalkError(String errMsg) {
        if (errMsg == null || errMsg.isBlank()) return "未知錯誤";
        String lower = errMsg.toLowerCase();
        boolean signMismatch = (lower.contains("sign") && (lower.contains("not match") || lower.contains("mismatch")))
                || errMsg.contains("签名不匹配") || errMsg.contains("簽名不匹配");
        if (signMismatch) {
            return "加簽密鑰不正確：請填寫釘釘機器人安全設置中 SEC 開頭的加簽密鑰（不要填登錄密碼或其他字符）";
        }
        if (lower.contains("keyword") || errMsg.contains("关键词") || errMsg.contains("關鍵詞")) {
            return "機器人使用關鍵詞模式，消息內容未包含已配置的關鍵詞";
        }
        if (lower.contains("token")) {
            return "Webhook access_token 無效，請重新複製機器人 Webhook 地址";
        }
        return errMsg;
    }

    /** 取消同平台下其他渠道的默认标记 */
    private void clearDefaultForPlatform(String platform, Long excludeId) {
        LambdaUpdateWrapper<SysNotificationChannel> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(SysNotificationChannel::getChannel, platform)
               .eq(SysNotificationChannel::getIsDefault, 1);
        if (excludeId != null) {
            wrapper.ne(SysNotificationChannel::getId, excludeId);
        }
        wrapper.set(SysNotificationChannel::getIsDefault, 0);
        mapper.update(null, wrapper);
    }

    private Map<String, Object> toMap(SysNotificationChannel entity) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", entity.getId());
        map.put("name", entity.getName());
        map.put("channel", entity.getChannel());
        // webhook 脱敏：显示前 30 字符 + ****
        String webhook = entity.getWebhookUrl();
        if (webhook != null && webhook.length() > 30) {
            map.put("webhookUrl", webhook.substring(0, 30) + "****");
        } else {
            map.put("webhookUrl", webhook != null ? webhook : "");
        }
        // 加签密钥属凭据：只回「是否已配置」，不回任何前后缀
        boolean secretConfigured = StringUtils.hasText(entity.getSecret());
        map.put("secret", secretConfigured ? "********" : "");
        map.put("secretConfigured", secretConfigured);
        map.put("atMobiles", entity.getAtMobiles() != null ? entity.getAtMobiles() : "");
        map.put("enabled", entity.getEnabled());
        map.put("isDefault", entity.getIsDefault());
        map.put("scenarios", entity.getScenarios() != null ? entity.getScenarios() : "");
        map.put("remark", entity.getRemark() != null ? entity.getRemark() : "");
        map.put("createdBy", entity.getCreatedBy());
        map.put("updatedBy", entity.getUpdatedBy());
        map.put("createdAt", entity.getCreatedAt() != null ? entity.getCreatedAt().format(DT_FMT) : "");
        map.put("updatedAt", entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DT_FMT) : "");
        return map;
    }

    /** 构建带签名的 Webhook URL */
    private String buildSignedUrl(String webhook, String secret) {
        if (!StringUtils.hasText(secret)) {
            return webhook;
        }
        try {
            long timestamp = System.currentTimeMillis();
            String stringToSign = timestamp + "\n" + secret;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signData = mac.doFinal(stringToSign.getBytes(StandardCharsets.UTF_8));
            String sign = URLEncoder.encode(Base64.getEncoder().encodeToString(signData), StandardCharsets.UTF_8);
            return webhook + "&timestamp=" + timestamp + "&sign=" + sign;
        } catch (Exception e) {
            log.error("钉钉签名计算失败，使用无签名 URL: {}", e.getMessage());
            return webhook;
        }
    }
}
