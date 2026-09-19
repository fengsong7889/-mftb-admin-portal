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
        validateDto(dto);
        String operator = operatorResolver.currentOperatorName();

        SysNotificationChannel entity = new SysNotificationChannel();
        applyDto(entity, dto);
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
        validateDto(dto);

        applyDto(entity, dto);
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
                String errMsg = response != null ? String.valueOf(response.get("errmsg")) : "未知錯誤";
                return "發送失敗: " + errMsg;
            }
        } catch (Exception e) {
            log.error("钉钉测试消息发送失败", e);
            return "發送失敗: " + e.getMessage();
        }
    }

    /* ==================== 内部方法 ==================== */

    private void validateDto(SysNotificationChannelSaveDTO dto) {
        if (!StringUtils.hasText(dto.getName())) {
            throw new BusinessException("渠道名稱不能為空");
        }
        if (!StringUtils.hasText(dto.getChannel())) {
            throw new BusinessException("平台類型不能為空");
        }
        if (!StringUtils.hasText(dto.getWebhookUrl())) {
            throw new BusinessException("Webhook 地址不能為空");
        }
    }

    private void applyDto(SysNotificationChannel entity, SysNotificationChannelSaveDTO dto) {
        entity.setName(dto.getName());
        entity.setChannel(dto.getChannel());
        entity.setWebhookUrl(dto.getWebhookUrl());
        entity.setSecret(dto.getSecret() != null ? dto.getSecret() : "");
        entity.setAtMobiles(dto.getAtMobiles() != null ? dto.getAtMobiles() : "");
        entity.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : 1);
        entity.setIsDefault(dto.getIsDefault() != null ? dto.getIsDefault() : 0);
        entity.setScenarios(dto.getScenarios() != null ? dto.getScenarios() : "");
        entity.setRemark(dto.getRemark() != null ? dto.getRemark() : "");
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
        // secret 脱敏：显示前 6 字符 + ****
        String secret = entity.getSecret();
        if (secret != null && secret.length() > 6) {
            map.put("secret", secret.substring(0, 6) + "****");
        } else {
            map.put("secret", secret != null ? secret : "");
        }
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
