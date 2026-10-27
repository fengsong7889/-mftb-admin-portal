package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.SystemAccessGrantOptionVO;
import com.mftb.admin.dto.SystemAccessRequestCreateDTO;
import com.mftb.admin.dto.SystemAccessRequestVO;
import com.mftb.admin.dto.SystemAccessRoleOptionVO;
import com.mftb.admin.entity.SysSystem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.SystemAccessRequest;
import com.mftb.admin.mapper.SysSystemMapper;
import com.mftb.admin.mapper.SystemAccessRequestMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 系統權限申請提交与查询的安全边界测试（2026-10 改口径：陈述诉求 + 可选参考角色，不再勾选菜单）。
 * <p>钉死八条：
 * <ol>
 *   <li>申请人身份只取登录态：提交载荷里没有身份字段，落库的 userId/姓名/工号来自 currentUser；</li>
 *   <li>已有该系统准入的人不能再申请（否则审批通过也无事发生，白发一张单）；</li>
 *   <li>使用场景逐个比白名单，未知 code 一律拒绝并点名；</li>
 *   <li>使用期限比白名单，until 必须给「晚于今天且不超过 10 年」的日期；permanent 一律不落日期；</li>
 *   <li>参考角色必须回查数据库：启用 + 非内置 admin + 已开放自助申请 + 已持该系统准入，
 *       名称取 DB 快照；它是建议值，绝不写进授权字段；</li>
 *   <li>同人同系统只允许一笔在途申请；</li>
 *   <li>凭证按 Data URL 实际体积与 MIME 白名单复核，且只落业务表、不进 OA form_data；</li>
 *   <li>详情读取按「本人 / 当前审批人 / 超管 / 持 oa-requests 查看权」收敛，其余 403。</li>
 * </ol>
 * <p>另外两条与「不外泄系统结构」直接相关：新单的 form_data 与申请单里都<b>不再出现菜单</b>；
 * 参考角色目录只返回角色名与业务说明，SQL 里必须带 self_service_requestable=1 与排除 admin 的条件。
 */
class SystemAccessRequestServiceImplTest {

    private static final String SYSTEM_CODE = "eam";
    private static final String SYSTEM_NAME = "物資管理系統";
    private static final String FLOW_NO = "XTSQ2026101801";
    private static final long USER_ID = 21L;
    /** 目录里的参考角色（开放自助申请、已持该系统准入） */
    private static final long OPEN_ROLE_ID = 12L;
    private static final String OPEN_ROLE_NAME = "考勤管理員";

    private SystemAccessRequestMapper requestMapper;
    private SysSystemMapper sysSystemMapper;
    private OaRequestService oaRequestService;
    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private JdbcTemplate jdbcTemplate;
    private SystemAccessRequestServiceImpl service;

    /** 参考角色回查结果（resolvePreferredRole 用），用例可改写以模拟各种不合法角色 */
    private List<Map<String, Object>> preferredRoleRows;
    /** 角色目录/授权候选查询结果（selfServiceRoles / grantOptions 用） */
    private List<Map<String, Object>> catalogRows;
    /** 角色是否持有该系统准入（sys_role_system 计数） */
    private int roleSystemAccessCount = 1;
    /** 各角色在本系统已授权的菜单数（roleId → 数量），验证「只给数量不给清单」的口径与排序 */
    private Map<Long, Integer> roleMenuCounts = Map.of(11L, 3, 12L, 9);

    @BeforeAll
    static void initTableMetadata() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), SystemAccessRequest.class);
    }

    @BeforeEach
    void setUp() {
        requestMapper = mock(SystemAccessRequestMapper.class);
        sysSystemMapper = mock(SysSystemMapper.class);
        oaRequestService = mock(OaRequestService.class);
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new SystemAccessRequestServiceImpl(requestMapper, sysSystemMapper, oaRequestService,
                operatorResolver, permissionService, jdbcTemplate);

        SysUser current = user(USER_ID);
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.operatorSignature(current)).thenReturn("張三(MF00021)");
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(sysSystemMapper.selectById(SYSTEM_CODE)).thenReturn(system(SYSTEM_CODE, SYSTEM_NAME, 1));
        when(permissionService.hasSystemAccess(current, SYSTEM_CODE)).thenReturn(false);
        when(oaRequestService.submit(any())).thenReturn(FLOW_NO);
        when(requestMapper.selectOne(any())).thenReturn(null);

        preferredRoleRows = List.of(roleRow(OPEN_ROLE_ID, "ATTENDANCE_ADMIN", OPEN_ROLE_NAME, 1));
        catalogRows = List.of();

        // queryForList(sql, args...)：按 SQL 内容分派——参考角色回查 / 角色目录 / 授权候选
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("self_service_requestable FROM sys_role")) {
                return preferredRoleRows;
            }
            if (sql.contains("FROM sys_role r")) {
                return catalogRows;
            }
            return List.of();
        });
        // queryForList(sql, elementType, args...)：角色已授权菜单 key / 申请人已绑定角色
        when(jdbcTemplate.queryForList(anyString(), eq(String.class), any(Object[].class)))
                .thenAnswer(invocation -> {
                    String sql = invocation.getArgument(0);
                    if (sql.contains("FROM sys_role_menu")) {
                        Long roleId = firstVarArg(invocation.getArgument(2));
                        int count = roleMenuCounts.getOrDefault(roleId, 0);
                        List<String> keys = new ArrayList<>();
                        for (int i = 0; i < count; i++) {
                            keys.add("menu-" + roleId + "-" + i);
                        }
                        return keys;
                    }
                    if (sql.contains("FROM sys_user")) {
                        return List.of("[11]");
                    }
                    return List.of();
                });
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class)))
                .thenAnswer(invocation -> roleSystemAccessCount);
    }

    /* ==================== 提交成功 ==================== */

    @Test
    @DisplayName("提交成功：发起 system_access 流程 + 落申请单，申请人身份取自登录态，且不再写任何菜单")
    void submitCreatesFlowAndRequestRow() {
        String flowNo = service.submit(payload("需要核对门店活动物资"));

        assertEquals(FLOW_NO, flowNo);

        ArgumentCaptor<OaRequestCreateDTO> oaCaptor = ArgumentCaptor.forClass(OaRequestCreateDTO.class);
        verify(oaRequestService).submit(oaCaptor.capture());
        OaRequestCreateDTO oaRequest = oaCaptor.getValue();
        assertEquals("system_access", oaRequest.getProcessCode());
        assertTrue(oaRequest.getTitle().contains(SYSTEM_NAME), oaRequest.getTitle());
        assertTrue(oaRequest.getTitle().contains("張三(MF00021)"), oaRequest.getTitle());
        assertTrue(oaRequest.getFormData().contains("\"systemCode\":\"eam\""), oaRequest.getFormData());
        assertTrue(oaRequest.getFormData().contains("需要核对门店活动物资"), oaRequest.getFormData());
        // 诉求是新口径的申请事实：场景 code 与期限类型都要进 form_data，审批页才读得到
        assertTrue(oaRequest.getFormData().contains("\"scenarios\":[\"daily_view\"]"), oaRequest.getFormData());
        assertTrue(oaRequest.getFormData().contains("\"durationType\":\"permanent\""), oaRequest.getFormData());
        // 新口径不再采集菜单：form_data 里出现 requestedMenus 就说明改口径没改干净（架构泄露复发）
        assertFalse(oaRequest.getFormData().contains("requestedMenus"), oaRequest.getFormData());
        // form_data 是 TEXT(64KB)：凭证绝不能进这里，只留数量
        assertFalse(oaRequest.getFormData().contains("dataUrl"), "凭证不得写入 OA form_data");
        assertTrue(oaRequest.getFormData().contains("\"attachmentCount\":0"), oaRequest.getFormData());

        ArgumentCaptor<SystemAccessRequest> entityCaptor = ArgumentCaptor.forClass(SystemAccessRequest.class);
        verify(requestMapper).insert(entityCaptor.capture());
        SystemAccessRequest saved = entityCaptor.getValue();
        assertEquals(FLOW_NO, saved.getFlowNo());
        assertEquals(SYSTEM_CODE, saved.getSystemCode());
        assertEquals(SYSTEM_NAME, saved.getSystemName());
        assertEquals(USER_ID, saved.getUserId());
        assertEquals("張三", saved.getApplicantName());
        assertEquals("MF00021", saved.getApplicantEmpId());
        assertEquals("pending", saved.getStatus());
        assertEquals("none", saved.getGrantStatus());
        assertNull(saved.getGrantTargetId(), "申请人不能替审批人决定授权角色");
        assertEquals("daily_view", saved.getScenarios());
        assertEquals("permanent", saved.getDurationType());
        assertNull(saved.getDurationUntil(), "长期申请不落截止日");
        assertNull(saved.getPreferredRoleId(), "未指定参考角色时不得凭空落一个");
        assertNull(saved.getRequestedMenus(), "requested_menus 是历史列，新单必须留 NULL");
    }

    @Test
    @DisplayName("多场景去重保序，至指定日期时截止日按原值落库")
    void submitStoresScenariosAndDuration() {
        SystemAccessRequestCreateDTO dto = payload("需要核对门店考勤并导出月度报表");
        dto.setScenarios(new ArrayList<>(List.of("report_export", "daily_view", "report_export", " data_check ")));
        dto.setDurationType("until");
        dto.setDurationUntil(LocalDate.now().plusMonths(3));

        service.submit(dto);

        ArgumentCaptor<SystemAccessRequest> captor = ArgumentCaptor.forClass(SystemAccessRequest.class);
        verify(requestMapper).insert(captor.capture());
        SystemAccessRequest saved = captor.getValue();
        // 去重但保持申请人勾选顺序：审批人读到的顺序就是申请人表达的顺序
        assertEquals("report_export,daily_view,data_check", saved.getScenarios());
        assertEquals("until", saved.getDurationType());
        assertEquals(LocalDate.now().plusMonths(3), saved.getDurationUntil());
    }

    @Test
    @DisplayName("期限选「长期」时前端塞进来的截止日一律丢弃（不留矛盾事实）")
    void submitIgnoresDateWhenPermanent() {
        SystemAccessRequestCreateDTO dto = payload("需要长期查看");
        dto.setDurationUntil(LocalDate.now().plusDays(30));

        service.submit(dto);

        ArgumentCaptor<SystemAccessRequest> captor = ArgumentCaptor.forClass(SystemAccessRequest.class);
        verify(requestMapper).insert(captor.capture());
        assertNull(captor.getValue().getDurationUntil(), "长期申请不得挂截止日");
    }

    @Test
    @DisplayName("参考角色合法时只落 ID 与名称快照，且不写进任何授权字段")
    void submitStoresPreferredRoleSnapshot() {
        SystemAccessRequestCreateDTO dto = payload("需要维护考勤组");
        dto.setPreferredRoleId(OPEN_ROLE_ID);

        service.submit(dto);

        ArgumentCaptor<SystemAccessRequest> captor = ArgumentCaptor.forClass(SystemAccessRequest.class);
        verify(requestMapper).insert(captor.capture());
        SystemAccessRequest saved = captor.getValue();
        assertEquals(OPEN_ROLE_ID, saved.getPreferredRoleId());
        // 名称取数据库快照：申请单上展示的角色名不能是前端编的
        assertEquals(OPEN_ROLE_NAME, saved.getPreferredRoleName());
        assertNull(saved.getGrantTargetId(), "参考角色是建议值，绝不能当成已授权角色落库");
        assertNull(saved.getGrantTargetType());
        assertEquals("none", saved.getGrantStatus());
    }

    @Test
    @DisplayName("凭证落在申请单的 MEDIUMTEXT 列，并按 Data URL 复核体积与类型")
    void submitStoresAttachmentsOutsideFormData() {
        SystemAccessRequestCreateDTO.Attachment attachment = new SystemAccessRequestCreateDTO.Attachment();
        attachment.setName("../../etc/passwd.png");
        attachment.setType("image");
        attachment.setSize(1L);
        attachment.setDataUrl("data:image/png;base64,AAAAAAAAAAAAAA==");

        service.submit(payload("需要核对物资", List.of(attachment)));

        ArgumentCaptor<SystemAccessRequest> captor = ArgumentCaptor.forClass(SystemAccessRequest.class);
        verify(requestMapper).insert(captor.capture());
        String attachments = captor.getValue().getAttachments();
        assertTrue(attachments.contains("data:image/png;base64,"), attachments);
        // 文件名去路径分隔符，避免把 ../ 之类的值原样存进展示层
        assertFalse(attachments.contains("../../"), attachments);
        assertTrue(attachments.contains("\"size\":10"), "体积必须按 base64 实际长度换算，不信任前端传值: " + attachments);
    }

    /* ==================== fail-closed 校验 ==================== */

    @Test
    @DisplayName("未登录不得提交")
    void submitRequiresLogin() {
        when(operatorResolver.currentUser()).thenReturn(null);

        BusinessException error = assertThrows(BusinessException.class, () -> service.submit(payload("说明")));
        assertTrue(error.getMessage().contains("登錄狀態失效"), error.getMessage());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("已拥有该系统权限的人不能再申请")
    void submitRejectedWhenAccessAlreadyGranted() {
        when(permissionService.hasSystemAccess(any(), eq(SYSTEM_CODE))).thenReturn(true);

        BusinessException error = assertThrows(BusinessException.class, () -> service.submit(payload("说明")));
        assertTrue(error.getMessage().contains("已擁有"), error.getMessage());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("portal 哨兵与不存在/停用的系统都不能申请")
    void submitRejectsPortalAndUnknownSystem() {
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(
                payloadWithSystem("portal", "说明"))).getMessage().contains("個人工作台"));

        when(sysSystemMapper.selectById("ghost")).thenReturn(null);
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(
                payloadWithSystem("ghost", "说明"))).getMessage().contains("系統不存在或已停用"));

        when(sysSystemMapper.selectById("off")).thenReturn(system("off", "停用系統", 0));
        assertThrows(BusinessException.class, () -> service.submit(payloadWithSystem("off", "说明")));
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("场景为空 / 含白名单外的 code 一律拒绝，并点名是哪个")
    void submitRejectsUnknownScenario() {
        SystemAccessRequestCreateDTO empty = payload("说明");
        empty.setScenarios(new ArrayList<>());
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(empty)).getMessage()
                .contains("請選擇使用場景"));

        SystemAccessRequestCreateDTO unknown = payload("说明");
        // 静默丢弃会让申请单少一条申请人明确表达过的诉求，审批人据此判断范围就偏了
        unknown.setScenarios(new ArrayList<>(List.of("daily_view", "grant_all_menus")));
        BusinessException error = assertThrows(BusinessException.class, () -> service.submit(unknown));
        assertTrue(error.getMessage().contains("grant_all_menus"), error.getMessage());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("期限类型非法 / until 缺日期 / 日期不晚于今天 / 超过 10 年 都拒绝提交")
    void submitValidatesDuration() {
        SystemAccessRequestCreateDTO badType = payload("说明");
        badType.setDurationType("forever");
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(badType)).getMessage()
                .contains("使用期限不合法"));

        SystemAccessRequestCreateDTO missingDate = payload("说明");
        missingDate.setDurationType("until");
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(missingDate)).getMessage()
                .contains("截止日期"));

        SystemAccessRequestCreateDTO past = payload("说明");
        past.setDurationType("until");
        past.setDurationUntil(LocalDate.now());
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(past)).getMessage()
                .contains("晚於今天"));

        SystemAccessRequestCreateDTO tooFar = payload("说明");
        tooFar.setDurationType("until");
        tooFar.setDurationUntil(LocalDate.now().plusYears(11));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(tooFar)).getMessage()
                .contains("10"));

        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("参考角色不存在 / 未开放自助申请 / 无该系统准入 / 是内置 admin 都拒绝，不静默丢弃")
    void submitRejectsPreferredRoleOutsideCatalog() {
        // 不存在或已停用
        preferredRoleRows = List.of();
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(withRole(999L))).getMessage()
                .contains("參考角色不存在或已停用"));

        // 存在但没开放自助申请：申请人从别处看到角色名也不能指名申请
        preferredRoleRows = List.of(roleRow(11L, "ATTENDANCE_VIEWER", "考勤查看員", 0));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(withRole(11L))).getMessage()
                .contains("未開放自助申請"));

        // 内置 admin：进目录等于把「申请整个平台」做成自助入口
        preferredRoleRows = List.of(roleRow(1L, "admin", "超级管理员", 1));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(withRole(1L))).getMessage()
                .contains("admin"));

        // 开放了但没拿到该系统准入：选它也不会被授权，当场说清比审批通过后打不开系统好
        preferredRoleRows = List.of(roleRow(OPEN_ROLE_ID, "ATTENDANCE_ADMIN", OPEN_ROLE_NAME, 1));
        roleSystemAccessCount = 0;
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(withRole(OPEN_ROLE_ID))).getMessage()
                .contains("尚未取得"));

        verify(oaRequestService, never()).submit(any());
        verify(requestMapper, never()).insert(any(SystemAccessRequest.class));
    }

    @Test
    @DisplayName("参考角色：TINYINT(1) 被驱动读成 Boolean 时仍认得出「已开放」（回归）")
    void submitAcceptsBooleanSelfServiceFlag() {
        // MySQL Connector/J 默认 tinyInt1isBit=true，TINYINT(1) 回来的是 Boolean；
        // 只判 instanceof Number 会把已开放误读成未开放，申请人指名目录里的角色反而被拒
        preferredRoleRows = List.of(roleRowWithFlag(Boolean.TRUE));

        service.submit(withRole(OPEN_ROLE_ID));

        ArgumentCaptor<SystemAccessRequest> captor = ArgumentCaptor.forClass(SystemAccessRequest.class);
        verify(requestMapper).insert(captor.capture());
        assertEquals(OPEN_ROLE_NAME, captor.getValue().getPreferredRoleName());

        // 反向也要对：Boolean.FALSE 与字符串 "0" 同样算未开放，别只修一半
        preferredRoleRows = List.of(roleRowWithFlag(Boolean.FALSE));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(withRole(OPEN_ROLE_ID)))
                .getMessage().contains("未開放自助申請"));
        preferredRoleRows = List.of(roleRowWithFlag("0"));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(withRole(OPEN_ROLE_ID)))
                .getMessage().contains("未開放自助申請"));
        // 字符串 "1"（关掉 tinyInt1isBit 后又可能出现的形态）仍算已开放
        preferredRoleRows = List.of(roleRowWithFlag("1"));
        service.submit(withRole(OPEN_ROLE_ID));
    }

    @Test
    @DisplayName("诉求为空 / 超长 都拒绝提交")
    void submitValidatesReason() {
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(payload("  "))).getMessage()
                .contains("使用訴求"));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(payload("长".repeat(1001))))
                .getMessage().contains("1000"));
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("同人同系统已有在途申请：拒绝重复提交并给出既有流程编号")
    void submitRejectsDuplicatePendingRequest() {
        SystemAccessRequest pending = new SystemAccessRequest();
        pending.setFlowNo("XTSQ2026101701");
        pending.setStatus("pending");
        when(requestMapper.selectOne(any())).thenReturn(pending);

        BusinessException error = assertThrows(BusinessException.class, () -> service.submit(payload("说明")));

        assertTrue(error.getMessage().contains("XTSQ2026101701"), error.getMessage());
        verify(oaRequestService, never()).submit(any());
    }

    @Test
    @DisplayName("凭证超限：数量、单件体积、MIME 白名单、非 Data URL 一律拒绝")
    void submitValidatesAttachments() {
        // 数量超过 5 个
        SystemAccessRequestCreateDTO.Attachment ok = attachment("data:image/png;base64,AAAAAAAAAAAAAA==");
        assertThrows(BusinessException.class, () -> service.submit(
                payload("说明", List.of(ok, ok, ok, ok, ok, ok))));

        // 非白名单 MIME（可执行文件伪装成凭证）
        SystemAccessRequestCreateDTO.Attachment exe = attachment("data:application/x-msdownload;base64,AAAAAAAAAAAAAA==");
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(
                payload("说明", List.of(exe)))).getMessage().contains("不支持的憑證類型"));

        // 不是 Data URL（外链图片）
        SystemAccessRequestCreateDTO.Attachment remote = attachment("https://evil.example.com/a.png");
        assertThrows(BusinessException.class, () -> service.submit(payload("说明", List.of(remote))));

        // 非 base64 编码标记
        SystemAccessRequestCreateDTO.Attachment plain = attachment("data:image/png;charset=utf-8,AAAA");
        assertThrows(BusinessException.class, () -> service.submit(payload("说明", List.of(plain))));

        // 单件超过 2MB（base64 段 300 万字符 ≈ 2.25MB）
        SystemAccessRequestCreateDTO.Attachment huge = attachment("data:image/png;base64," + "A".repeat(3_000_000));
        assertTrue(assertThrows(BusinessException.class, () -> service.submit(
                payload("说明", List.of(huge)))).getMessage().contains("2MB"));

        verify(oaRequestService, never()).submit(any());
        // insert 有 (T) 与 (Collection<T>) 两个重载，必须写清类型否则编译歧义
        verify(requestMapper, never()).insert(any(SystemAccessRequest.class));
    }

    /* ==================== 授权候选（审批人视角） ==================== */

    @Test
    @DisplayName("授权候选：申请人建议项标 preferred 并排首位，只给已授权功能数不给菜单清单")
    void grantOptionsMarksPreferredAndHidesMenuDetail() {
        SystemAccessRequest entity = request(USER_ID);
        entity.setPreferredRoleId(OPEN_ROLE_ID);
        when(requestMapper.selectOne(any())).thenReturn(entity);
        when(oaRequestService.detail(FLOW_NO)).thenReturn(oaRequestWithApprover("張三(MF00021)"));
        catalogRows = List.of(
                roleRow(11L, "ATTENDANCE_VIEWER", "考勤查看員", 1),
                roleRow(12L, "ATTENDANCE_ADMIN", OPEN_ROLE_NAME, 1));

        List<SystemAccessGrantOptionVO> options = service.grantOptions(FLOW_NO);

        assertEquals(2, options.size());
        SystemAccessGrantOptionVO first = options.get(0);
        assertEquals(OPEN_ROLE_ID, first.getTargetId(), "申请人建议的角色必须排首位（审批面板默认选中它）");
        assertTrue(first.isPreferred());
        assertEquals(9, first.getGrantedMenuCount());
        assertFalse(first.isAlreadyBound());
        SystemAccessGrantOptionVO second = options.get(1);
        assertEquals(11L, second.getTargetId());
        assertFalse(second.isPreferred());
        assertEquals(3, second.getGrantedMenuCount());
        assertTrue(second.isAlreadyBound(), "申请人已持有该角色要标出来，授权它是空操作");
    }

    @Test
    @DisplayName("授权候选：非当前节点审批人且非超管 → 403，不泄露角色清单")
    void grantOptionsDeniesNonApprover() {
        when(requestMapper.selectOne(any())).thenReturn(request(USER_ID));
        when(oaRequestService.detail(FLOW_NO)).thenReturn(oaRequestWithApprover("李四(MF00002)"));

        BusinessException error = assertThrows(BusinessException.class, () -> service.grantOptions(FLOW_NO));
        assertEquals(Integer.valueOf(403), error.getCode());
    }

    /* ==================== 参考角色目录（申请人视角） ==================== */

    @Test
    @DisplayName("参考角色目录：只返回角色名与业务说明，SQL 必须带自助开关与排除 admin 的条件")
    void selfServiceRolesReturnsCatalogWithoutStructure() {
        when(sysSystemMapper.selectById(SYSTEM_CODE)).thenReturn(system(SYSTEM_CODE, SYSTEM_NAME, 1));
        catalogRows = List.of(roleRow(OPEN_ROLE_ID, "ATTENDANCE_ADMIN", OPEN_ROLE_NAME, 1));

        List<SystemAccessRoleOptionVO> roles = service.selfServiceRoles(SYSTEM_CODE);

        assertEquals(1, roles.size());
        assertEquals(OPEN_ROLE_ID, roles.get(0).getRoleId());
        assertEquals(OPEN_ROLE_NAME, roles.get(0).getRoleName());
        // 目录口径写在 SQL 里：开关、系统准入、排除内置 admin 三者缺一都会放大暴露面
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(sqlCaptor.capture(), any(Object[].class));
        String sql = sqlCaptor.getValue();
        assertTrue(sql.contains("self_service_requestable = 1"), sql);
        assertTrue(sql.contains("JOIN sys_role_system"), sql);
        assertTrue(sql.contains("r.code <> ?"), sql);
        assertTrue(sql.contains("r.status = 1"), sql);
        // 只查 name/description：不得把菜单数或权限明细一起查出来给零权限的申请人
        assertFalse(sql.contains("sys_role_menu"), sql);
    }

    @Test
    @DisplayName("参考角色目录：未登录不得读取；系统不存在/停用直接拒")
    void selfServiceRolesRequiresLoginAndValidSystem() {
        when(operatorResolver.currentUser()).thenReturn(null);
        assertThrows(BusinessException.class, () -> service.selfServiceRoles(SYSTEM_CODE));

        when(operatorResolver.currentUser()).thenReturn(user(USER_ID));
        when(sysSystemMapper.selectById("ghost")).thenReturn(null);
        assertThrows(BusinessException.class, () -> service.selfServiceRoles("ghost"));
    }

    /* ==================== 查询与访问控制 ==================== */

    @Test
    @DisplayName("详情：申请人本人可读，带上场景/期限/参考角色与 OA 侧当前节点")
    void detailAllowsApplicant() {
        when(requestMapper.selectOne(any())).thenReturn(request(USER_ID));
        OaRequestVO oaRequest = new OaRequestVO();
        oaRequest.setFlowNo(FLOW_NO);
        oaRequest.setCurrentNodeName("主管審批");
        oaRequest.setCurrentApprover("李四(MF00002)");
        oaRequest.setFlowStatus("pending");
        when(oaRequestService.detail(FLOW_NO)).thenReturn(oaRequest);

        SystemAccessRequestVO vo = service.detailByFlowNo(FLOW_NO);

        assertEquals(FLOW_NO, vo.getFlowNo());
        assertEquals("主管審批", vo.getCurrentNodeName());
        assertEquals("李四(MF00002)", vo.getCurrentApprover());
        assertEquals(List.of("daily_view", "report_export"), vo.getScenarios());
        assertEquals("until", vo.getDurationType());
        assertEquals("2026-12-31", vo.getDurationUntil());
        assertEquals(OPEN_ROLE_NAME, vo.getPreferredRoleName());
        // 历史单据的勾选菜单仍要能回看（那是当时真实的申请事实）
        assertEquals(1, vo.getRequestedMenus().size());
        assertEquals("asset-list", vo.getRequestedMenus().get(0).getMenuKey());
    }

    @Test
    @DisplayName("详情：非本人、非审批人、无 oa-requests 查看权 → 403")
    void detailDeniesUnrelatedUser() {
        when(requestMapper.selectOne(any())).thenReturn(request(USER_ID));
        when(operatorResolver.currentUser()).thenReturn(user(999L));
        when(permissionService.hasPermission(any(), eq("oa-requests"), eq("view"))).thenReturn(false);
        when(oaRequestService.detail(FLOW_NO)).thenReturn(new OaRequestVO());

        BusinessException error = assertThrows(BusinessException.class, () -> service.detailByFlowNo(FLOW_NO));
        assertEquals(Integer.valueOf(403), error.getCode());
    }

    @Test
    @DisplayName("详情：持 oa-requests 查看权的人（流程事项列表同口径）可读")
    void detailAllowsWorkflowViewer() {
        when(requestMapper.selectOne(any())).thenReturn(request(USER_ID));
        when(operatorResolver.currentUser()).thenReturn(user(999L));
        when(permissionService.hasPermission(any(), eq("oa-requests"), eq("view"))).thenReturn(true);
        when(oaRequestService.detail(FLOW_NO)).thenReturn(new OaRequestVO());

        assertEquals(FLOW_NO, service.detailByFlowNo(FLOW_NO).getFlowNo());
    }

    @Test
    @DisplayName("详情：OA 侧已审结而本表还停在 pending 时以 OA 为准展示")
    void detailFollowsOaStatusWhenCallbackMissed() {
        SystemAccessRequest stale = request(USER_ID);
        stale.setStatus("pending");
        when(requestMapper.selectOne(any())).thenReturn(stale);
        OaRequestVO oaRequest = new OaRequestVO();
        oaRequest.setFlowStatus("rejected");
        when(oaRequestService.detail(FLOW_NO)).thenReturn(oaRequest);

        assertEquals("rejected", service.detailByFlowNo(FLOW_NO).getStatus());
    }

    @Test
    @DisplayName("可申请系统目录：排除 portal 哨兵与已授权系统")
    void requestableSystemsExcludesPortalAndAuthorized() {
        when(sysSystemMapper.selectList(any())).thenReturn(List.of(
                system("portal", "個人工作台", 1),
                system(SYSTEM_CODE, SYSTEM_NAME, 1),
                system("finance", "財務結算系統", 1)));
        when(permissionService.hasSystemAccess(any(), eq("finance"))).thenReturn(true);

        List<String> codes = service.requestableSystems().stream()
                .map(com.mftb.admin.dto.PortalSystemVO::getCode)
                .toList();

        assertEquals(List.of(SYSTEM_CODE), codes);
    }

    /* ==================== 夹具 ==================== */

    private static SysUser user(long id) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername("zhangsan");
        user.setName("張三");
        user.setEmpId("MF00021");
        user.setDepartment("研發部");
        return user;
    }

    private static SysSystem system(String code, String name, int status) {
        SysSystem system = new SysSystem();
        system.setCode(code);
        system.setName(name);
        system.setStatus(status);
        return system;
    }

    /**
     * 取 varargs 的第一个实参。
     * <p>不同 Mockito 版本对 {@code queryForList(String, Class, Object...)} 的参数展开方式不一样
     * （有时给展开后的元素，有时给整个 Object[]），两种都接住，不让测试卡在框架细节上。
     */
    private static Long firstVarArg(Object argument) {
        if (argument instanceof Object[] array) {
            return (Long) array[0];
        }
        return (Long) argument;
    }

    /** 角色行（目录/候选查询返回的形状：id + code + name + 自助开关） */
    private static Map<String, Object> roleRow(long id, String code, String name, int selfService) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("code", code);
        row.put("name", name);
        row.put("description", name + "的業務說明");
        row.put("self_service_requestable", selfService);
        return row;
    }

    /** 角色行，但自助开关用指定形态的值（验证驱动映射差异下的容错读取） */
    private static Map<String, Object> roleRowWithFlag(Object flag) {
        Map<String, Object> row = new LinkedHashMap<>(roleRow(OPEN_ROLE_ID, "ATTENDANCE_ADMIN", OPEN_ROLE_NAME, 0));
        row.put("self_service_requestable", flag);
        return row;
    }

    /** 一张申请单夹具：新口径字段齐全，同时保留一份历史 requested_menus 以验证旧单仍可回看 */
    private static SystemAccessRequest request(long userId) {
        SystemAccessRequest entity = new SystemAccessRequest();
        entity.setId(11L);
        entity.setFlowNo(FLOW_NO);
        entity.setSystemCode(SYSTEM_CODE);
        entity.setSystemName(SYSTEM_NAME);
        entity.setUserId(userId);
        entity.setApplicantName("張三");
        entity.setStatus("pending");
        entity.setGrantStatus("none");
        entity.setScenarios("daily_view,report_export");
        entity.setDurationType("until");
        entity.setDurationUntil(LocalDate.of(2026, 12, 31));
        entity.setPreferredRoleId(OPEN_ROLE_ID);
        entity.setPreferredRoleName(OPEN_ROLE_NAME);
        entity.setRequestedMenus("[{\"menuKey\":\"asset-list\",\"name\":\"資產台账\"}]");
        entity.setReason("需要核对门店活动物资");
        entity.setAttachments("[{\"name\":\"a.png\",\"type\":\"image\",\"size\":10,"
                + "\"dataUrl\":\"data:image/png;base64,AAAAAAAAAAAAAA==\"}]");
        return entity;
    }

    /** 当前待审节点审批人是指定签名的 OA 详情（grantOptions 的访问控制靠它判定） */
    private static OaRequestVO oaRequestWithApprover(String approver) {
        OaRequestVO vo = new OaRequestVO();
        vo.setFlowNo(FLOW_NO);
        vo.setFlowStatus("pending");
        OaRequestVO.OaApprovalTaskVO task = new OaRequestVO.OaApprovalTaskVO();
        task.setNodeName("主管審批");
        task.setTaskStatus("pending");
        task.setApprover(approver);
        vo.setApprovalTasks(List.of(task));
        return vo;
    }

    private static SystemAccessRequestCreateDTO.Attachment attachment(String dataUrl) {
        SystemAccessRequestCreateDTO.Attachment item = new SystemAccessRequestCreateDTO.Attachment();
        item.setName("a.png");
        item.setType("image");
        item.setDataUrl(dataUrl);
        return item;
    }

    /** 最小合法载荷：场景=daily_view、期限=长期、无凭证 */
    private static SystemAccessRequestCreateDTO payload(String reason) {
        return payload(reason, null);
    }

    private static SystemAccessRequestCreateDTO payload(String reason,
                                                        List<SystemAccessRequestCreateDTO.Attachment> attachments) {
        return payloadWithSystem(SYSTEM_CODE, reason, attachments);
    }

    private static SystemAccessRequestCreateDTO withRole(long roleId) {
        SystemAccessRequestCreateDTO dto = payload("说明");
        dto.setPreferredRoleId(roleId);
        return dto;
    }

    private static SystemAccessRequestCreateDTO payloadWithSystem(String systemCode, String reason) {
        return payloadWithSystem(systemCode, reason, null);
    }

    private static SystemAccessRequestCreateDTO payloadWithSystem(
            String systemCode,
            String reason,
            List<SystemAccessRequestCreateDTO.Attachment> attachments) {
        SystemAccessRequestCreateDTO dto = new SystemAccessRequestCreateDTO();
        dto.setSystemCode(systemCode);
        dto.setScenarios(new ArrayList<>(List.of("daily_view")));
        dto.setDurationType("permanent");
        dto.setReason(reason);
        dto.setAttachments(attachments);
        return dto;
    }
}
