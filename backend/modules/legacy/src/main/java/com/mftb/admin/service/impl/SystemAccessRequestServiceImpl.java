package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.constant.SystemAccessConstants;
import com.mftb.admin.dto.OaRequestCreateDTO;
import com.mftb.admin.dto.OaRequestVO;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.dto.SystemAccessGrantOptionVO;
import com.mftb.admin.dto.SystemAccessRequestCreateDTO;
import com.mftb.admin.dto.SystemAccessRequestVO;
import com.mftb.admin.dto.SystemAccessRoleOptionVO;
import com.mftb.admin.entity.SysSystem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.SystemAccessRequest;
import com.mftb.admin.mapper.SysSystemMapper;
import com.mftb.admin.mapper.SystemAccessRequestMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SystemAccessRequestService;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 系統權限申請服务实现（申请侧），契约见 {@link SystemAccessRequestService}。
 * <p>
 * 一次提交在同一事务里做两件事：调用 OA 引擎发起 {@code system_access} 流程（拿到 XTSQ 编号）
 * + 落 {@code biz_system_access_request} 申请单。两者要么都在、要么都不在，
 * 不允许出现「有流程号但查不到申请内容」或反之。
 * <p>
 * 安全口径（前端校验只是体验，这里才是边界）：
 * <ul>
 *   <li>申请人身份只取登录态，DTO 里根本没有身份字段可传；</li>
 *   <li>系统必须存在、启用、且不是 portal 哨兵；申请人<b>当前无</b>该系统准入才允许申请；</li>
 *   <li>使用场景逐个比白名单，期限比白名单并复核日期区间，不信任前端传值；</li>
 *   <li>参考角色必须回查 {@code sys_role}：启用 + 非内置 admin + 已开放自助申请 + 已持该系统准入，
 *       名称取 DB 快照；它只落申请单供审批人参考，<b>不参与任何授权写入</b>；</li>
 *   <li>凭证按 Data URL 实际体积复核数量/单件/总量上限与 MIME 白名单，不信任前端传的 size；</li>
 *   <li>同人同系统存在审批中的单据时拒绝重复提交；</li>
 *   <li>详情/授权候选按「本人 / 当前节点审批人 / 超管 / 持 oa-requests 查看权」收敛，其余 403。</li>
 * </ul>
 * <p>
 * 2026-10 改口径：<b>不再采集勾选菜单</b>（详见 {@code SystemAccessConstants} 类注释第 2 条）。
 * {@code requested_menus} 列保留为历史列，旧单仍可回看，新单一律留 NULL。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SystemAccessRequestServiceImpl implements SystemAccessRequestService {

    /** 个人工作台哨兵系统：不能作为业务系统被申请 */
    private static final String PORTAL_SENTINEL = "portal";
    /** 我的申请列表返回上限（单人历史申请量有限，不做分页也不返回全表） */
    private static final int MY_REQUESTS_LIMIT = 100;
    /** Data URL 前缀标记：只接受 base64 编码，不接受 URL 引用（避免把外站资源当凭证存进来） */
    private static final String DATA_URL_PREFIX = "data:";
    private static final String BASE64_MARKER = ";base64,";

    private final SystemAccessRequestMapper requestMapper;
    private final SysSystemMapper sysSystemMapper;
    private final OaRequestService oaRequestService;
    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final JdbcTemplate jdbcTemplate;

    /* ==================== 提交申请 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submit(SystemAccessRequestCreateDTO dto) {
        SysUser current = requireCurrentUser();
        if (dto == null) {
            throw new BusinessException("申請內容不能為空");
        }

        String systemCode = normalizeCode(dto.getSystemCode());
        SysSystem system = requireRequestableSystem(systemCode);
        if (permissionService.hasSystemAccess(current, systemCode)) {
            throw new BusinessException("您已擁有「" + system.getName() + "」的使用權限，無需申請；"
                    + "若仍看不到入口，請重新登錄或聯繫管理員");
        }

        List<String> scenarios = normalizeScenarios(dto.getScenarios());
        String durationType = normalizeDurationType(dto.getDurationType());
        LocalDate durationUntil = normalizeDurationUntil(durationType, dto.getDurationUntil());
        String reason = normalizeReason(dto.getReason());
        String attachmentsJson = normalizeAttachments(dto.getAttachments());
        // 参考角色是建议值，但不在白名单目录里就直接拒，绝不「静默丢弃」：
        // 丢了会让申请人以为自己提了、审批人却根本看不到这条建议
        String preferredRoleName = resolvePreferredRole(dto.getPreferredRoleId(), systemCode, system.getName());
        requireNoPendingRequest(current.getId(), systemCode, system.getName());

        LocalDateTime now = LocalDateTime.now();
        String applicantSignature = operatorResolver.operatorSignature(current);

        // 1) 发起 OA 流程：编号规则由 BizSeqService.ruleKeyForProcess 映射到 XTSQ，
        //    审批节点由「流程配置」决定（未配置时引擎降级为单节点主管审批）
        Map<String, Object> formData = new LinkedHashMap<>();
        formData.put(SystemAccessConstants.FORM_KEY_SYSTEM_CODE, systemCode);
        formData.put(SystemAccessConstants.FORM_KEY_SYSTEM_NAME, system.getName());
        formData.put(SystemAccessConstants.FORM_KEY_SCENARIOS, scenarios);
        formData.put(SystemAccessConstants.FORM_KEY_DURATION_TYPE, durationType);
        // 日期一律存 ISO 字串：form_data 是给审批页直接读的快照，存成时间数组会让前端再算一次时区
        formData.put(SystemAccessConstants.FORM_KEY_DURATION_UNTIL,
                durationUntil == null ? null : durationUntil.toString());
        formData.put(SystemAccessConstants.FORM_KEY_PREFERRED_ROLE_ID, dto.getPreferredRoleId());
        formData.put(SystemAccessConstants.FORM_KEY_PREFERRED_ROLE_NAME, preferredRoleName);
        formData.put(SystemAccessConstants.FORM_KEY_REASON, reason);
        // 凭证只落业务表 MEDIUMTEXT 列：biz_oa_request.form_data 是 TEXT(64KB)，塞 base64 会截断
        formData.put(SystemAccessConstants.FORM_KEY_ATTACHMENT_COUNT,
                dto.getAttachments() == null ? 0 : dto.getAttachments().size());

        OaRequestCreateDTO oaRequest = new OaRequestCreateDTO();
        oaRequest.setProcessCode(SystemAccessConstants.PROCESS_CODE);
        oaRequest.setTitle(buildTitle(system.getName(), applicantSignature));
        oaRequest.setFormData(JsonUtils.toJson(formData));
        String flowNo = oaRequestService.submit(oaRequest);

        // 2) 落申请单（与流程同事务；flow_no 唯一键是两边一致性的最后一道保险）
        SystemAccessRequest entity = new SystemAccessRequest();
        entity.setFlowNo(flowNo);
        entity.setSystemCode(systemCode);
        entity.setSystemName(system.getName());
        entity.setUserId(current.getId());
        entity.setApplicantName(StringUtils.hasText(current.getName()) ? current.getName() : current.getUsername());
        entity.setApplicantEmpId(current.getEmpId());
        entity.setDeptName(current.getDepartment());
        entity.setScenarios(String.join(",", scenarios));
        entity.setDurationType(durationType);
        entity.setDurationUntil(durationUntil);
        entity.setPreferredRoleId(dto.getPreferredRoleId());
        entity.setPreferredRoleName(preferredRoleName);
        // requestedMenus 刻意不写：新口径不采集菜单（列保留给历史单据回看）
        entity.setReason(reason);
        entity.setAttachments(attachmentsJson);
        entity.setStatus(SystemAccessConstants.STATUS_PENDING);
        entity.setGrantStatus(SystemAccessConstants.GRANT_NONE);
        entity.setApplyTime(now);
        entity.setCreatedBy(applicantSignature);
        entity.setUpdatedBy(applicantSignature);
        requestMapper.insert(entity);

        log.info("系統權限申請已提交: flowNo={}, system={}, applicant={}, scenarios={}, durationType={}, "
                        + "durationUntil={}, preferredRoleId={}, attachments={}",
                flowNo, systemCode, applicantSignature, scenarios, durationType, durationUntil,
                dto.getPreferredRoleId(), dto.getAttachments() == null ? 0 : dto.getAttachments().size());
        return flowNo;
    }

    /** 流程标题：类型 + 系统 + 申请人，流程事项列表与钉钉通知都直接展示它 */
    private String buildTitle(String systemName, String applicantSignature) {
        String title = SystemAccessConstants.PROCESS_NAME + " · " + systemName
                + (StringUtils.hasText(applicantSignature) ? " · " + applicantSignature : "");
        return title.length() > 200 ? title.substring(0, 200) : title;
    }

    /* ==================== 查询 ==================== */

    @Override
    public List<SystemAccessRequestVO> myRequests(String systemCode, boolean withAttachments) {
        SysUser current = requireCurrentUser();
        LambdaQueryWrapper<SystemAccessRequest> wrapper = new LambdaQueryWrapper<SystemAccessRequest>()
                .eq(SystemAccessRequest::getUserId, current.getId())
                .orderByDesc(SystemAccessRequest::getApplyTime)
                .last("LIMIT " + MY_REQUESTS_LIMIT);
        if (StringUtils.hasText(systemCode)) {
            wrapper.eq(SystemAccessRequest::getSystemCode, normalizeCode(systemCode));
        }
        return requestMapper.selectList(wrapper).stream()
                .map(entity -> SystemAccessRequestVO.from(entity, withAttachments))
                .toList();
    }

    @Override
    public SystemAccessRequestVO detailByFlowNo(String flowNo) {
        SysUser current = requireCurrentUser();
        SystemAccessRequest entity = requireByFlowNo(flowNo);
        OaRequestVO oaRequest = loadOaDetailQuietly(flowNo);
        requireReadAccess(current, entity, oaRequest);

        SystemAccessRequestVO vo = SystemAccessRequestVO.from(entity, true);
        if (oaRequest != null) {
            vo.setCurrentNodeName(oaRequest.getCurrentNodeName());
            vo.setCurrentApprover(oaRequest.getCurrentApprover());
            // OA 侧是审批流转的真值：它已审结而本表还停在 pending（回调曾失败）时以 OA 为准展示
            if (StringUtils.hasText(oaRequest.getFlowStatus())
                    && !SystemAccessConstants.STATUS_PENDING.equals(oaRequest.getFlowStatus())
                    && SystemAccessConstants.STATUS_PENDING.equals(entity.getStatus())) {
                vo.setStatus(oaRequest.getFlowStatus());
            }
        }
        return vo;
    }

    @Override
    public List<SystemAccessGrantOptionVO> grantOptions(String flowNo) {
        SysUser current = requireCurrentUser();
        SystemAccessRequest entity = requireByFlowNo(flowNo);
        OaRequestVO oaRequest = loadOaDetailQuietly(flowNo);
        // 授权候选只给「能审这张单的人」看：角色清单本身是治理信息，不对全员开放
        if (!operatorResolver.isAdmin(current) && !isCurrentApprover(current, oaRequest)) {
            throw new BusinessException(ResultCode.FORBIDDEN.getCode(), "您不是當前節點的審批人，無法配置授權角色");
        }

        Set<Long> boundRoleIds = queryBoundRoleIds(entity.getUserId());
        Long preferredRoleId = entity.getPreferredRoleId();

        List<Map<String, Object>> roles = jdbcTemplate.queryForList(
                "SELECT r.id, r.code, r.name, r.description FROM sys_role r "
                        + "JOIN sys_role_system rs ON rs.role_id = r.id AND rs.system_code = ? "
                        + "WHERE r.deleted = 0 AND r.status = 1 AND r.code <> ? ORDER BY r.name",
                entity.getSystemCode(), SystemAccessConstants.SUPER_ADMIN_ROLE_CODE);

        List<SystemAccessGrantOptionVO> options = new ArrayList<>(roles.size());
        for (Map<String, Object> row : roles) {
            Long roleId = ((Number) row.get("id")).longValue();
            SystemAccessGrantOptionVO option = new SystemAccessGrantOptionVO();
            option.setTargetType(SystemAccessConstants.TARGET_TYPE_ROLE);
            option.setTargetId(roleId);
            option.setTargetName(str(row.get("name")));
            option.setTargetCode(str(row.get("code")));
            option.setDescription(str(row.get("description")));
            // 只给数量不给清单：审批人需要知道「这个角色在本系统能做多宽」，
            // 但不需要把菜单名列表倒给前端（那正是申请人侧刚刚拿掉的信息）
            option.setGrantedMenuCount(queryRoleMenuKeys(roleId, entity.getSystemCode()).size());
            option.setPreferred(preferredRoleId != null && preferredRoleId.equals(roleId));
            option.setAlreadyBound(boundRoleIds.contains(roleId));
            options.add(option);
        }
        // 申请人建议的角色排最前（审批面板默认选中它），其余按已授权功能数降序、再按名称
        options.sort(Comparator
                .comparing((SystemAccessGrantOptionVO option) -> option.isPreferred() ? 0 : 1)
                .thenComparing((SystemAccessGrantOptionVO option) -> -option.getGrantedMenuCount())
                .thenComparing(SystemAccessGrantOptionVO::getTargetName,
                        Comparator.nullsLast(Comparator.naturalOrder())));
        return options;
    }

    /* ==================== 参考角色目录（申请人可见） ==================== */

    @Override
    public List<SystemAccessRoleOptionVO> selfServiceRoles(String systemCode) {
        // 只要求登录态（本接口的使用者正是对目标系统零权限的员工）；不拉用户权限做过滤，
        // 因为目录里本来就不含任何权限明细：只有角色名与管理员写的业务说明
        requireCurrentUser();
        String code = normalizeCode(systemCode);
        SysSystem system = requireRequestableSystem(code);

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT r.id, r.name, r.description FROM sys_role r "
                        + "JOIN sys_role_system rs ON rs.role_id = r.id AND rs.system_code = ? "
                        + "WHERE r.deleted = 0 AND r.status = 1 AND r.self_service_requestable = 1 "
                        + "AND r.code <> ? ORDER BY r.name",
                system.getCode(), SystemAccessConstants.SUPER_ADMIN_ROLE_CODE);

        List<SystemAccessRoleOptionVO> result = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            SystemAccessRoleOptionVO vo = new SystemAccessRoleOptionVO();
            vo.setRoleId(((Number) row.get("id")).longValue());
            vo.setRoleName(str(row.get("name")));
            // 没有业务说明的角色不给员工看：只看名字猜用途会选错，审批人也得多一轮沟通
            vo.setDescription(str(row.get("description")));
            result.add(vo);
        }
        return result;
    }

    /* ==================== 可申请系统目录 ==================== */

    @Override
    public List<PortalSystemVO> requestableSystems() {
        SysUser current = requireCurrentUser();
        List<SysSystem> systems = sysSystemMapper.selectList(
                new LambdaQueryWrapper<SysSystem>()
                        .eq(SysSystem::getStatus, 1)
                        .orderByAsc(SysSystem::getSort)
                        .orderByAsc(SysSystem::getCode));
        List<PortalSystemVO> result = new ArrayList<>();
        for (SysSystem system : systems) {
            if (PORTAL_SENTINEL.equalsIgnoreCase(system.getCode())) {
                continue;
            }
            // 已能进入的系统不需要申请；提交时还会再拦一次，不依赖这里的过滤
            if (permissionService.hasSystemAccess(current, system.getCode())) {
                continue;
            }
            result.add(PortalSystemVO.from(system));
        }
        return result;
    }

    /* ==================== 校验与归一化 ==================== */

    private SysSystem requireRequestableSystem(String systemCode) {
        if (!StringUtils.hasText(systemCode)) {
            throw new BusinessException("請選擇要申請的系統");
        }
        if (PORTAL_SENTINEL.equalsIgnoreCase(systemCode)) {
            throw new BusinessException("個人工作台不需要申請權限");
        }
        SysSystem system = sysSystemMapper.selectById(systemCode);
        if (system == null || system.getStatus() == null || system.getStatus() != 1) {
            throw new BusinessException("系統不存在或已停用: " + systemCode);
        }
        return system;
    }

    /**
     * 使用场景白名单校验：逐个比对、去重、保持申请人勾选顺序。
     * <p>未知 code 一律拒绝而不是静默丢弃：静默丢会让申请单上少一条申请人明确表达过的诉求，
     * 审批人据此判断授权范围就偏了（与旧口径「跳系统 menuKey 点名拒绝」同一原则）。
     */
    private List<String> normalizeScenarios(List<String> input) {
        if (input == null || input.isEmpty()) {
            throw new BusinessException("請選擇使用場景");
        }
        Set<String> codes = new LinkedHashSet<>();
        for (String raw : input) {
            if (!StringUtils.hasText(raw)) {
                continue;
            }
            String code = raw.trim();
            if (!SystemAccessConstants.ALLOWED_SCENARIOS.contains(code)) {
                throw new BusinessException("使用場景不合法: " + code);
            }
            codes.add(code);
        }
        if (codes.isEmpty()) {
            throw new BusinessException("請選擇使用場景");
        }
        return List.copyOf(codes);
    }

    /** 期限类型白名单：只认 permanent / until，其余值（含空字串、大小写变形）一律拒 */
    private String normalizeDurationType(String raw) {
        String type = raw == null ? "" : raw.trim();
        if (!SystemAccessConstants.ALLOWED_DURATION_TYPES.contains(type)) {
            throw new BusinessException("使用期限不合法，請選擇「長期」或「至指定日期」");
        }
        return type;
    }

    /**
     * 期限日期校验：{@code permanent} 一律置空（不接受前端塞日期，避免「长期」单据上挂个
     * 到期日的矛盾事实）；{@code until} 必须给日期、晚于今天、不超过
     * {@link SystemAccessConstants#MAX_DURATION_YEARS} 年。
     * <p>注意：<b>本期不做到期自动回收</b>，日期只是审批人的判断依据（前端已如实告知），
     * 故不做「到期就失效」之类的业务校验，也不能把它当成权限有效期承诺。
     */
    private LocalDate normalizeDurationUntil(String durationType, LocalDate until) {
        if (SystemAccessConstants.DURATION_PERMANENT.equals(durationType)) {
            return null;
        }
        if (until == null) {
            throw new BusinessException("請選擇使用期限的截止日期");
        }
        LocalDate today = LocalDate.now();
        if (!until.isAfter(today)) {
            throw new BusinessException("截止日期必須晚於今天");
        }
        if (until.isAfter(today.plusYears(SystemAccessConstants.MAX_DURATION_YEARS))) {
            throw new BusinessException("截止日期不得超過 " + SystemAccessConstants.MAX_DURATION_YEARS + " 年");
        }
        return until;
    }

    /**
     * 参考角色校验：启用 + 非内置 admin + <b>已开放自助申请</b> + 已持该系统准入，名称取 DB 快照。
     * <p>四道条件全部回查数据库，不信前端传的 roleName：否则申请人可以造一个
     * 「看似合理」的角色名写进申请单，把审批人往错的方向引。
     * <p>即便校验全部通过，它也<b>只是建议</b>：真正的授权由审批人在流程上指定，
     * 兑现前 {@code SystemAccessGrantServiceImpl.requireGrantableRole} 会再查一次。
     *
     * @return 角色名称快照；未指定参考角色时返回 {@code null}
     */
    private String resolvePreferredRole(Long roleId, String systemCode, String systemName) {
        if (roleId == null) {
            return null;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, code, name, self_service_requestable FROM sys_role "
                        + "WHERE id = ? AND deleted = 0 AND status = 1",
                roleId);
        if (rows.isEmpty()) {
            throw new BusinessException("參考角色不存在或已停用，請重新選擇");
        }
        Map<String, Object> row = rows.get(0);
        String name = str(row.get("name"));
        if (SystemAccessConstants.SUPER_ADMIN_ROLE_CODE.equalsIgnoreCase(str(row.get("code")))) {
            throw new BusinessException("內置 admin 角色不得作為參考角色");
        }
        Object flag = row.get("self_service_requestable");
        if (!isFlagOn(flag)) {
            throw new BusinessException("角色「" + name + "」未開放自助申請，不能作為參考角色；"
                    + "可留空，由審批人決定授權範圍");
        }
        Integer accessCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_role_system WHERE role_id = ? AND system_code = ?",
                Integer.class, roleId, systemCode);
        if (accessCount == null || accessCount == 0) {
            throw new BusinessException("角色「" + name + "」尚未取得「" + systemName + "」的准入，"
                    + "選它也不會被授權；請重新選擇或留空");
        }
        return name;
    }

    /**
     * 布尔语义列的容错读取。
     * <p>MySQL Connector/J 默认 {@code tinyInt1isBit=true}，会把 {@code TINYINT(1)} 映射成
     * {@link Boolean} 而不是 {@link Number}（{@code self_service_requestable} 正是 TINYINT(1)）；
     * 而其它环境的 JDBC URL 可能把它关掉、同一列又变回 Integer。只判 {@code instanceof Number}
     * 会把「已开放」误读成「未开放」，申请人指名目录里的角色反而被拒
     * （2026-10 端到端取证实测踩到：目录接口能看到角色，提交却报未开放）。
     * 三种形态都接住：Number / Boolean / 字符串 "1"。
     */
    private static boolean isFlagOn(Object value) {
        if (value instanceof Number number) {
            return number.intValue() == 1;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        return value != null && "1".equals(String.valueOf(value).trim());
    }

    private String normalizeReason(String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException("請填寫使用訴求");
        }
        String trimmed = reason.trim();
        if (trimmed.length() > SystemAccessConstants.REASON_MAX_LENGTH) {
            throw new BusinessException("使用訴求不得超過 " + SystemAccessConstants.REASON_MAX_LENGTH + " 字");
        }
        return trimmed;
    }

    /**
     * 凭证归一化 + 服务端复核（与其它流程一致的 base64 Data URL 直存口径）。
     * <p>体积按 Data URL 里 base64 段的实际长度换算，不用前端传的 size：
     * 前端报小值就能绕过限制的话，上限等于没有。MIME 也从 Data URL 头解析，
     * 与白名单比对，杜绝「声明 image/png 实则塞别的东西」。
     *
     * @return 归一化后的 JSON；无凭证时返回 {@code null}
     */
    private String normalizeAttachments(List<SystemAccessRequestCreateDTO.Attachment> input) {
        if (input == null || input.isEmpty()) {
            return null;
        }
        if (input.size() > SystemAccessConstants.MAX_ATTACHMENTS) {
            throw new BusinessException("憑證最多上傳 " + SystemAccessConstants.MAX_ATTACHMENTS + " 個文件");
        }
        long total = 0;
        List<Map<String, Object>> normalized = new ArrayList<>(input.size());
        for (SystemAccessRequestCreateDTO.Attachment item : input) {
            if (item == null || !StringUtils.hasText(item.getDataUrl())) {
                throw new BusinessException("憑證內容不能為空");
            }
            String dataUrl = item.getDataUrl().trim();
            if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
                throw new BusinessException("憑證格式錯誤：僅支持文件上傳（Data URL）");
            }
            int markerIndex = dataUrl.indexOf(BASE64_MARKER);
            if (markerIndex <= DATA_URL_PREFIX.length()) {
                throw new BusinessException("憑證格式錯誤：僅支持 base64 編碼");
            }
            String contentType = dataUrl.substring(DATA_URL_PREFIX.length(), markerIndex).trim().toLowerCase();
            if (!SystemAccessConstants.ALLOWED_ATTACHMENT_TYPES.contains(contentType)) {
                throw new BusinessException("不支持的憑證類型: " + contentType + "（僅支持 JPG/PNG/GIF/WEBP/PDF）");
            }
            String payload = dataUrl.substring(markerIndex + BASE64_MARKER.length());
            long bytes = decodedSize(payload);
            if (bytes > SystemAccessConstants.MAX_ATTACHMENT_BYTES) {
                throw new BusinessException("單個憑證不得超過 "
                        + (SystemAccessConstants.MAX_ATTACHMENT_BYTES / 1024 / 1024) + "MB");
            }
            total += bytes;
            if (total > SystemAccessConstants.MAX_TOTAL_ATTACHMENT_BYTES) {
                throw new BusinessException("憑證總大小不得超過 "
                        + (SystemAccessConstants.MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024) + "MB");
            }
            // 内容必须真的是 base64：解码失败说明数据被截断或伪造，存进去也只是打不开的附件
            try {
                Base64.getDecoder().decode(payload);
            } catch (IllegalArgumentException e) {
                throw new BusinessException("憑證內容無法解析，請重新上傳");
            }

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name", sanitizeFileName(item.getName(), contentType));
            row.put("type", contentType.equals("application/pdf") ? "pdf" : "image");
            row.put("contentType", contentType);
            row.put("size", bytes);
            row.put("dataUrl", dataUrl);
            normalized.add(row);
        }
        return JsonUtils.toJson(normalized);
    }

    /** base64 段 → 解码后字节数（去掉 padding 的近似精确值） */
    private static long decodedSize(String payload) {
        String compact = payload.replaceAll("\\s", "");
        int padding = 0;
        if (compact.endsWith("==")) {
            padding = 2;
        } else if (compact.endsWith("=")) {
            padding = 1;
        }
        long raw = (long) compact.length() * 3 / 4;
        return Math.max(0, raw - padding);
    }

    /** 文件名只用于展示：去掉路径分隔与控制字符，截断到 200，缺省时按类型给默认名 */
    private static String sanitizeFileName(String rawName, String contentType) {
        String extension = contentType.equals("application/pdf") ? ".pdf" : ".img";
        if (!StringUtils.hasText(rawName)) {
            return "attachment" + extension;
        }
        String cleaned = rawName.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (cleaned.isEmpty()) {
            return "attachment" + extension;
        }
        return cleaned.length() > 200 ? cleaned.substring(0, 200) : cleaned;
    }

    /** 同人同系统只允许一笔在途申请：重复提交会让审批人面对两张内容相同的单，也可能被重复授权 */
    private void requireNoPendingRequest(Long userId, String systemCode, String systemName) {
        SystemAccessRequest pending = requestMapper.selectOne(
                new LambdaQueryWrapper<SystemAccessRequest>()
                        .eq(SystemAccessRequest::getUserId, userId)
                        .eq(SystemAccessRequest::getSystemCode, systemCode)
                        .eq(SystemAccessRequest::getStatus, SystemAccessConstants.STATUS_PENDING)
                        .orderByDesc(SystemAccessRequest::getId)
                        .last("LIMIT 1"));
        if (pending != null) {
            throw new BusinessException("您已有一筆「" + systemName + "」的權限申請正在審批中（流程編號 "
                    + pending.getFlowNo() + "），請等待審批結果或先撤銷");
        }
    }

    /* ==================== 访问控制 ==================== */

    /** 详情读取：本人 / 超管 / 当前节点审批人 / 持 oa-requests 查看权（与流程事项列表同口径） */
    private void requireReadAccess(SysUser current, SystemAccessRequest entity, OaRequestVO oaRequest) {
        if (current.getId() != null && current.getId().equals(entity.getUserId())) {
            return;
        }
        if (operatorResolver.isAdmin(current)) {
            return;
        }
        if (isCurrentApprover(current, oaRequest)) {
            return;
        }
        if (permissionService.hasPermission(current, "oa-requests", "view")) {
            return;
        }
        throw new BusinessException(ResultCode.FORBIDDEN.getCode(), "無權查看該權限申請單");
    }

    /** 当前用户是否该流程当前待审节点的审批人（与 OA 引擎 requireNodeApprover 同判定口径） */
    private boolean isCurrentApprover(SysUser current, OaRequestVO oaRequest) {
        if (oaRequest == null || oaRequest.getApprovalTasks() == null || current == null) {
            return false;
        }
        String signature = operatorResolver.operatorSignature(current);
        return oaRequest.getApprovalTasks().stream()
                .filter(task -> SystemAccessConstants.STATUS_PENDING.equals(task.getTaskStatus()))
                .map(OaRequestVO.OaApprovalTaskVO::getApprover)
                .filter(StringUtils::hasText)
                .flatMap(approvers -> java.util.Arrays.stream(approvers.split(",")))
                .map(String::trim)
                .anyMatch(entry -> isSamePerson(entry, current, signature));
    }

    /** 节点审批人与登录人是否同一人：兼容历史上只存姓名或只存工号的配置（精确比对，不用 contains） */
    private static boolean isSamePerson(String entry, SysUser user, String signature) {
        if (!StringUtils.hasText(entry)) {
            return false;
        }
        if (entry.equals(signature)) {
            return true;
        }
        if (StringUtils.hasText(user.getName()) && entry.equals(user.getName())) {
            return true;
        }
        return StringUtils.hasText(user.getEmpId()) && entry.equals(user.getEmpId());
    }

    /* ==================== 内部工具 ==================== */

    private SysUser requireCurrentUser() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || current.getId() == null) {
            throw new BusinessException(ResultCode.UNAUTHORIZED.getCode(), "登錄狀態失效，請重新登錄後再提交申請");
        }
        return current;
    }

    /** 申请人已绑定的角色 ID（用于在候选里标出「已持有」，绑定它是空操作） */
    private Set<Long> queryBoundRoleIds(Long userId) {
        List<String> rows = jdbcTemplate.queryForList(
                "SELECT function_roles FROM sys_user WHERE id = ? AND deleted = 0", String.class, userId);
        return rows.isEmpty() ? Set.of() : new HashSet<>(JsonUtils.parseLongList(rows.get(0)));
    }

    private Set<String> queryRoleMenuKeys(Long roleId, String systemCode) {
        return new HashSet<>(jdbcTemplate.queryForList(
                "SELECT m.menu_key FROM sys_role_menu rm "
                        + "JOIN sys_menu m ON m.id = rm.menu_id AND m.deleted = 0 "
                        + "WHERE rm.role_id = ? AND m.system_code = ?",
                String.class, roleId, systemCode));
    }

    /** OA 详情不可用时不阻断申请内容展示：审批进度缺失好过整页打不开 */
    private OaRequestVO loadOaDetailQuietly(String flowNo) {
        try {
            return oaRequestService.detail(flowNo);
        } catch (RuntimeException e) {
            log.warn("讀取 OA 流程詳情失敗，僅展示申請內容: flowNo={}, error={}", flowNo, e.getMessage());
            return null;
        }
    }

    private SystemAccessRequest requireByFlowNo(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            throw new BusinessException("流程編號不能為空");
        }
        SystemAccessRequest entity = requestMapper.selectOne(
                new LambdaQueryWrapper<SystemAccessRequest>().eq(SystemAccessRequest::getFlowNo, flowNo.trim()));
        if (entity == null) {
            throw new BusinessException("系統權限申請單不存在: " + flowNo);
        }
        return entity;
    }

    private static String normalizeCode(String code) {
        return code == null ? null : code.trim();
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
