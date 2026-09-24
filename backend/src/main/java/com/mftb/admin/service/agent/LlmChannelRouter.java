package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.AiModel;
import com.mftb.admin.entity.AiProvider;
import com.mftb.admin.mapper.AiModelMapper;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.ProviderKeyCipher;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

/**
 * V0 §B.1：从 ai_provider / ai_model 表读取通道，取代 Vite dev 中间件里的 VITE_LLM_* 环境变量。
 * <p>沿用 sys_config 白名单 ai_model_qw_accounts / ai_model_ds_accounts；未列入的账号
 * 视为该通道受限；resolveChannel 返回 null 让上游报错，不静默降级。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class LlmChannelRouter {

    public static final String CHANNEL_PRIMARY = "primary";
    public static final String CHANNEL_OFF_PEAK = "off-peak";

    private static final String CONFIG_KEY_QW_ACCOUNTS = "ai_model_qw_accounts";
    private static final String CONFIG_KEY_DS_ACCOUNTS = "ai_model_ds_accounts";

    private final AiProviderMapper providerMapper;
    private final AiModelMapper modelMapper;
    private final ProviderKeyCipher keyCipher;
    private final SysConfigService sysConfigService;

    @Data
    public static class Channel {
        private String label;
        private String baseUrl;
        private String apiKey;
        private String defaultModelKey;
        private BigDecimal inputPrice;
        private BigDecimal outputPrice;
        private BigDecimal cachedInputPrice;
        private String currency;
    }

    public boolean isChannelAllowed(String channel, String username) {
        List<String> accounts = loadAccounts(channel);
        if (accounts.isEmpty()) return true;
        return username != null && accounts.contains(username);
    }

    public Channel resolveChannel(String channelLabel, String username) {
        if (!isChannelAllowed(channelLabel, username)) return null;
        AiProvider provider = findProviderByChannel(channelLabel);
        if (provider == null) return null;
        AiModel model = findModelByProvider(provider.getId());
        Channel ch = new Channel();
        ch.setLabel(channelLabel);
        ch.setBaseUrl(provider.getApiUrlBase());
        ch.setApiKey(StringUtils.hasText(provider.getApiKey()) ? keyCipher.decrypt(provider.getApiKey()) : null);
        if (model != null) {
            ch.setDefaultModelKey(model.getModelKey());
            ch.setInputPrice(model.getInputPrice());
            ch.setOutputPrice(model.getOutputPrice());
            ch.setCachedInputPrice(model.getCachedInputPrice());
            ch.setCurrency(model.getCurrency());
        }
        return ch;
    }

    /** 主通道：默认 is_default=1 的 provider；off-peak 通道优先 provider_key 含 deepseek 的实例。 */
    private AiProvider findProviderByChannel(String label) {
        LambdaQueryWrapper<AiProvider> wrapper = new LambdaQueryWrapper<AiProvider>()
                .eq(AiProvider::getStatus, 1)
                .orderByDesc(AiProvider::getIsDefault)
                .orderByAsc(AiProvider::getSortOrder);
        if (CHANNEL_OFF_PEAK.equals(label)) {
            wrapper.like(AiProvider::getProviderKey, "deepseek");
        }
        List<AiProvider> rows = providerMapper.selectList(wrapper.last("LIMIT 1"));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private AiModel findModelByProvider(Long providerId) {
        List<AiModel> rows = modelMapper.selectList(new LambdaQueryWrapper<AiModel>()
                .eq(AiModel::getProviderId, providerId)
                .eq(AiModel::getStatus, 1)
                .orderByAsc(AiModel::getSortOrder)
                .last("LIMIT 1"));
        return rows.isEmpty() ? null : rows.get(0);
    }

    private List<String> loadAccounts(String channel) {
        String key = CHANNEL_PRIMARY.equals(channel) ? CONFIG_KEY_QW_ACCOUNTS : CONFIG_KEY_DS_ACCOUNTS;
        String raw = sysConfigService.getConfigValueCached(key);
        if (!StringUtils.hasText(raw)) return List.of();
        try {
            if (raw.trim().startsWith("[")) return JsonUtils.parseStringList(raw);
            return Arrays.stream(raw.split(",")).map(String::trim).filter(StringUtils::hasText).toList();
        } catch (Exception e) {
            log.warn("解析通道白名单 {} 失败: {}", key, e.getMessage());
            return List.of();
        }
    }
}
