package com.mftb.admin.service.agent;

import com.mftb.admin.mapper.AiModelMapper;
import com.mftb.admin.mapper.AiProviderMapper;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.ProviderKeyCipher;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 通道白名单与通道可用性的身份口径。
 * <p>钉住两件事：
 * <ol>
 *   <li><b>白名单里存的是登录账号，匹配也必须用登录账号</b>。曾经把 {@code currentOperatorName()}
 *       （显示姓名「管理员」）传进来比对 {@code MF00001} 这类工号，结果是：只要管理员真的配了
 *       白名单，名单内的人照样全被拒——配置越"认真"，系统越不可用。</li>
 *   <li><b>没配 API Key 的通道不算可用</b>。以前空 Key 也回非 null，{@code /api/agent/status}
 *       报 ok=true，用户一路点到问答才看到「服務暫時不可用」，且诊断不出原因。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LlmChannelRouterTest {

    @Mock private AiProviderMapper providerMapper;
    @Mock private AiModelMapper modelMapper;
    @Mock private ProviderKeyCipher keyCipher;
    @Mock private SysConfigService sysConfigService;

    @InjectMocks private LlmChannelRouter router;

    @Test
    @DisplayName("白名单空 = 全员可用")
    void emptyWhitelistAllowsEveryone() {
        when(sysConfigService.getConfigValueCached("ai_model_qw_accounts")).thenReturn("[]");
        assertTrue(router.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
    }

    @Test
    @DisplayName("白名单按登录账号匹配：名单内放行，名单外拒绝")
    void whitelistMatchesLoginAccount() {
        when(sysConfigService.getConfigValueCached("ai_model_qw_accounts")).thenReturn("[\"MF00001\"]");
        assertTrue(router.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
        assertFalse(router.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, "MF00002"));
    }

    /** 回归锁：显示名不是身份，拿姓名比对工号名单会让白名单配置变成"全员拒绝"开关。 */
    @Test
    @DisplayName("显示名不能命中白名单（防止再传 currentOperatorName）")
    void displayNameDoesNotMatchWhitelist() {
        when(sysConfigService.getConfigValueCached("ai_model_qw_accounts")).thenReturn("[\"MF00001\"]");
        assertFalse(router.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, "管理员"));
    }

    @Test
    @DisplayName("离峰通道读 DS 白名单 key")
    void offPeakUsesOwnWhitelistKey() {
        when(sysConfigService.getConfigValueCached("ai_model_ds_accounts")).thenReturn("[\"MF00009\"]");
        assertTrue(router.isChannelAllowed(LlmChannelRouter.CHANNEL_OFF_PEAK, "MF00009"));
        assertFalse(router.isChannelAllowed(LlmChannelRouter.CHANNEL_OFF_PEAK, "MF00001"));
    }

    @Test
    @DisplayName("逗号分隔写法同样按登录账号解析")
    void commaSeparatedAccountsAreTrimmed() {
        when(sysConfigService.getConfigValueCached("ai_model_qw_accounts")).thenReturn(" MF00001 , MF00002 ");
        assertTrue(router.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, "MF00002"));
        assertFalse(router.isChannelAllowed(LlmChannelRouter.CHANNEL_PRIMARY, "MF00003"));
    }

    @Test
    @DisplayName("供应商无 Key：resolveChannel 返回 null，diagnose 给出 no_api_key")
    void missingApiKeyIsNotUsableChannel() {
        when(sysConfigService.getConfigValueCached(any())).thenReturn(null);
        when(providerMapper.selectList(any())).thenReturn(java.util.List.of(provider("")));

        assertNull(router.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
        assertEquals(LlmChannelRouter.REASON_NO_API_KEY, router.diagnose(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
    }

    @Test
    @DisplayName("密文解密失败（换过加密密钥）同样视为不可用，而不是带 null Key 打上游")
    void undecryptableKeyIsNotUsableChannel() {
        when(sysConfigService.getConfigValueCached(any())).thenReturn(null);
        when(providerMapper.selectList(any())).thenReturn(java.util.List.of(provider("enc:xxxx")));
        when(keyCipher.decrypt("enc:xxxx")).thenReturn(null);

        assertNull(router.resolveChannel(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
        assertEquals(LlmChannelRouter.REASON_NO_API_KEY, router.diagnose(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
    }

    @Test
    @DisplayName("无启用供应商：diagnose 给出 no_provider")
    void noProviderConfigured() {
        when(sysConfigService.getConfigValueCached(any())).thenReturn(null);
        when(providerMapper.selectList(any())).thenReturn(java.util.List.of());

        assertEquals(LlmChannelRouter.REASON_NO_PROVIDER, router.diagnose(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
    }

    @Test
    @DisplayName("账号被白名单挡住时，diagnose 优先给 account_restricted")
    void restrictedAccountReason() {
        when(sysConfigService.getConfigValueCached("ai_model_qw_accounts")).thenReturn("[\"someoneelse\"]");
        assertEquals(LlmChannelRouter.REASON_ACCOUNT_RESTRICTED, router.diagnose(LlmChannelRouter.CHANNEL_PRIMARY, "MF00001"));
    }

    private static com.mftb.admin.entity.AiProvider provider(String apiKey) {
        com.mftb.admin.entity.AiProvider p = new com.mftb.admin.entity.AiProvider();
        p.setId(1L);
        p.setProviderKey("dashscope");
        p.setApiUrlBase("https://dashscope.aliyuncs.com/compatible-mode/v1");
        p.setApiKey(apiKey);
        p.setStatus(1);
        p.setIsDefault(1);
        return p;
    }
}
