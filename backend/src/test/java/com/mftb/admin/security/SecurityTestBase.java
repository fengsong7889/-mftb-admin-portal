package com.mftb.admin.security;

import com.mftb.admin.aspect.PermissionAspect;
import com.mftb.admin.config.JwtAuthenticationFilter;
import com.mftb.admin.config.SecurityConfig;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import com.mftb.admin.dto.SessionCheckResult;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.*;
import com.mftb.admin.util.ApiRateLimiter;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JwtUtil;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

/**
 * 安全测试基类: 提供 JWT 认证 + 权限校验的完整 Web 层测试环境
 * <p>
 * 使用 @WebMvcTest 仅加载 Web 层（Controller + Security Filter + PermissionAspect），
 * 不启动完整应用上下文，不需要数据库连接。
 * <p>
 * 所有 Controller 可能依赖的 Service 均声明为 @MockBean, 确保任意子类
 * 指定 @WebMvcTest(XxxController.class) 时依赖均能满足。
 * <p>
 * 子类须添加 @WebMvcTest(XxxController.class) 注解。
 */
@EnableAspectJAutoProxy
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, PermissionAspect.class, JwtUtil.class})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "jwt.secret=test-security-secret-key-must-be-at-least-32-bytes-long",
        "jwt.expiration=86400000",
        "jwt.header=Authorization",
        "jwt.prefix=Bearer ",
        "cors.allowed-origins=http://localhost:3000",
        "session.idle-timeout=3600000",
        "spring.aop.enabled=true",
        
})
public abstract class SecurityTestBase {

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JwtUtil jwtUtil;

    // ── 安全基础设施 Mock ──

    @MockBean
    protected SysUserMapper sysUserMapper;

    @MockBean
    protected AuthService authService;

    @MockBean
    protected CaptchaService captchaService;

    @MockBean
    protected PermissionService permissionService;

    // ── 所有 Controller 可能依赖的 Service Mock（@WebMvcTest 要求所有构造器参数均有 Bean） ──

    @MockBean(name = "loginLogService")
    protected LoginLogService loginLogService;
    @MockBean(name = "employeeService")
    protected EmployeeService employeeService;
    @MockBean(name = "employeeSalaryService")
    protected EmployeeSalaryService employeeSalaryService;
    @MockBean(name = "emergencyContactService")
    protected EmergencyContactService emergencyContactService;
    @MockBean(name = "positionRecordService")
    protected PositionRecordService positionRecordService;
    @MockBean(name = "roleService")
    protected RoleService roleService;
    @MockBean(name = "menuService")
    protected MenuService menuService;
    @MockBean(name = "mcpExecService")
    protected McpExecService mcpExecService;
    @MockBean(name = "llmUsageService")
    protected LlmUsageService llmUsageService;
    @MockBean(name = "notificationService")
    protected NotificationService notificationService;
    @MockBean(name = "cardOrderService")
    protected CardOrderService cardOrderService;
    @MockBean(name = "finApprovalService")
    protected FinApprovalService finApprovalService;
    @MockBean(name = "finRiskService")
    protected FinRiskService finRiskService;
    @MockBean(name = "aiEmpAuthService")
    protected AiEmpAuthService aiEmpAuthService;
    @MockBean(name = "aiEmpQuotaService")
    protected AiEmpQuotaService aiEmpQuotaService;
    @MockBean(name = "oaRequestService")
    protected OaRequestService oaRequestService;
    @MockBean(name = "oaProcessService")
    protected OaProcessService oaProcessService;
    @MockBean(name = "departmentService")
    protected DepartmentService departmentService;
    @MockBean(name = "storeService")
    protected StoreService storeService;
    @MockBean(name = "merchantGroupService")
    protected MerchantGroupService merchantGroupService;
    @MockBean(name = "dataAuthorizationService")
    protected DataAuthorizationService dataAuthorizationService;
    @MockBean(name = "sysConfigService")
    protected SysConfigService sysConfigService;
    @MockBean(name = "versionHistoryService")
    protected VersionHistoryService versionHistoryService;
    @MockBean(name = "wordLibraryService")
    protected WordLibraryService wordLibraryService;
    @MockBean(name = "translationService")
    protected TranslationService translationService;
    @MockBean(name = "organicScoreService")
    protected OrganicScoreService organicScoreService;
    @MockBean(name = "workflowConfigService")
    protected WorkflowConfigService workflowConfigService;
    @MockBean(name = "adOrderService")
    protected AdOrderService adOrderService;
    @MockBean(name = "adAlgorithmService")
    protected AdAlgorithmService adAlgorithmService;
    @MockBean(name = "adWaterfallService")
    protected AdWaterfallService adWaterfallService;
    @MockBean(name = "flashSaleService")
    protected FlashSaleService flashSaleService;
    @MockBean(name = "giftService")
    protected GiftService giftService;
    @MockBean(name = "positionService")
    protected PositionService positionService;
    @MockBean(name = "activityService")
    protected ActivityService activityService;
    @MockBean(name = "finAccountService")
    protected FinAccountService finAccountService;
    @MockBean(name = "finBatchService")
    protected FinBatchService finBatchService;
    @MockBean(name = "finDebtService")
    protected FinDebtService finDebtService;
    @MockBean(name = "finDetailService")
    protected FinDetailService finDetailService;
    @MockBean(name = "finReconcileService")
    protected FinReconcileService finReconcileService;
    @MockBean(name = "aiConversationService")
    protected AiConversationService aiConversationService;
    @MockBean(name = "aiDeptAuthGroupService")
    protected AiDeptAuthGroupService aiDeptAuthGroupService;
    @MockBean(name = "aiDeptQuotaService")
    protected AiDeptQuotaService aiDeptQuotaService;
    @MockBean(name = "aiEmpPermissionService")
    protected AiEmpPermissionService aiEmpPermissionService;
    @MockBean(name = "aiModelService")
    protected AiModelService aiModelService;
    @MockBean(name = "aiMyCenterService")
    protected AiMyCenterService aiMyCenterService;
    @MockBean(name = "aiProviderService")
    protected AiProviderService aiProviderService;
    @MockBean(name = "aiQuotaService")
    protected AiQuotaService aiQuotaService;
    @MockBean(name = "mcpToolService")
    protected McpToolService mcpToolService;
    @MockBean(name = "eamBasicDataService")
    protected EamBasicDataService eamBasicDataService;
    @MockBean(name = "eamInboundService")
    protected EamInboundService eamInboundService;
    @MockBean(name = "eamPurchaseService")
    protected EamPurchaseService eamPurchaseService;
    @MockBean(name = "dingTalkService")
    protected DingTalkService dingTalkService;
    @MockBean(name = "storeDataConfigService")
    protected StoreDataConfigService storeDataConfigService;
    @MockBean(name = "segmentationService")
    protected SegmentationService segmentationService;
    @MockBean(name = "bizSeqService")
    protected BizSeqService bizSeqServiceUtil;
    @MockBean(name = "apiRateLimiter")
    protected ApiRateLimiter apiRateLimiter;
    @MockBean(name = "operatorResolver")
    protected OperatorResolver operatorResolver;

    // ── 预置测试用户 ──

    protected static SysUser adminUser;
    protected static SysUser guestUser;
    protected static SysUser viewerUser;

    static {
        adminUser = new SysUser();
        adminUser.setId(1L);
        adminUser.setUsername("test_admin");
        adminUser.setName("测试管理员");
        adminUser.setRole("admin");
        adminUser.setStatus(1);

        guestUser = new SysUser();
        guestUser.setId(2L);
        guestUser.setUsername("test_guest");
        guestUser.setName("测试访客");
        guestUser.setRole("guest");
        guestUser.setStatus(1);

        viewerUser = new SysUser();
        viewerUser.setId(3L);
        viewerUser.setUsername("test_viewer");
        viewerUser.setName("测试查看者");
        viewerUser.setRole("guest");
        viewerUser.setStatus(1);
        // 初始化 MyBatis-Plus Lambda 缓存（@WebMvcTest 不加载 MyBatis，LambdaQueryWrapper 需要）
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysUser.class);
    }

    /** 用户名 → SysUser 映射，供 Mapper Mock 按 Token 返回正确用户 */
    private static final Map<String, SysUser> TEST_USER_MAP = new ConcurrentHashMap<>();

    @BeforeEach
    void baseSetUp() {
        TEST_USER_MAP.put(adminUser.getUsername(), adminUser);
        TEST_USER_MAP.put(guestUser.getUsername(), guestUser);
        TEST_USER_MAP.put(viewerUser.getUsername(), viewerUser);

        // 根据请求的 JWT Token 返回对应 SysUser（确保 SecurityContext.details 是正确的用户）
        lenient().when(sysUserMapper.selectOne(any())).thenAnswer(inv -> {
            var attrs = org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();
            if (attrs == null) return adminUser;
            HttpServletRequest req = ((org.springframework.web.context.request.ServletRequestAttributes) attrs).getRequest();
            String header = req.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                String token = header.substring(7);
                if (!token.isEmpty() && jwtUtil.validateToken(token)) {
                    String username = jwtUtil.getUsername(token);
                    SysUser u = TEST_USER_MAP.get(username);
                    if (u != null) return u;
                }
            }
            return adminUser;
        });
        lenient().when(authService.checkSession(any(), any(), any())).thenReturn(SessionCheckResult.ok());
    }

    // ── 辅助方法 ──

    protected String tokenFor(SysUser user) {
        return jwtUtil.generateToken(user.getId(), user.getUsername());
    }

    protected MockHttpServletRequestBuilder authGet(String url, SysUser user) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get(url).header("Authorization", "Bearer " + tokenFor(user));
    }

    protected MockHttpServletRequestBuilder authPost(String url, SysUser user) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post(url).header("Authorization", "Bearer " + tokenFor(user));
    }

    protected MockHttpServletRequestBuilder authPut(String url, SysUser user) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put(url).header("Authorization", "Bearer " + tokenFor(user));
    }

    protected MockHttpServletRequestBuilder authDelete(String url, SysUser user) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete(url).header("Authorization", "Bearer " + tokenFor(user));
    }

    protected void grantPermission(SysUser user, String menu, String action) {
        lenient().when(permissionService.hasPermission(
                org.mockito.ArgumentMatchers.eq(user),
                org.mockito.ArgumentMatchers.eq(menu),
                org.mockito.ArgumentMatchers.eq(action)))
                .thenReturn(true);
    }

    protected void grantAllPermissions(SysUser user, String menu) {
        for (String action : new String[]{"view", "create", "edit", "delete", "import", "export"}) {
            grantPermission(user, menu, action);
        }
    }

    protected void grantAllPermissions(SysUser user) {
        lenient().when(permissionService.hasPermission(
                org.mockito.ArgumentMatchers.eq(user), any(), any()))
                .thenReturn(true);
    }

    protected void denyAllPermissions(SysUser user) {
        lenient().when(permissionService.hasPermission(
                org.mockito.ArgumentMatchers.eq(user), any(), any()))
                .thenReturn(false);
    }
}
