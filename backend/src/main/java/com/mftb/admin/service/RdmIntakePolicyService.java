package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmIntakeVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 需求准入策略：一条需求提交后「要不要先审批、走哪条审批链、由谁分派」的<b>服务端唯一裁决入口</b>。
 *
 * <p>为什么必须由服务端裁决：在阶段 2A 之前，免审与否取自请求体 {@code needApproval}，
 * 等于「提单人自己决定要不要被审批」，准入治理不成立。现在客户端不再拥有这个字段，
 * 结论一律来自此处，并把命中策略与版本写进需求，供事后审计「为什么这单免了审」。
 *
 * <p>四条硬口径（与界面 §准入策略 一致）：
 * <ol>
 *   <li>强制审批约束优先于任何免审规则；</li>
 *   <li>其余按优先级最小者命中；同优先级且条件重叠的策略禁止保存；</li>
 *   <li>一条都没命中时默认<b>需要审批</b>，不允许 fail-open；</li>
 *   <li>需审批但没解析出审批节点时标记为异常轮次，进人工待办，不自动放行。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmIntakePolicyService {

    public static final String MODE_FORCE_APPROVE = "FORCE_APPROVE";
    public static final String MODE_APPROVE = "APPROVE";
    public static final String MODE_EXEMPT = "EXEMPT";

    /** 部门链向上回溯的深度上限：防止脏数据成环时把启动/提交线程挂住 */
    private static final int MAX_DEPT_DEPTH = 20;

    private final JdbcTemplate jdbcTemplate;
    private final OperatorResolver operatorResolver;
    private final SysUserMapper userMapper;
    private final PermissionService permissionService;

    /* ==================== 策略配置 ==================== */

    /** 全部策略（含停用），按优先级排序；配置页展示用 */
    public List<RdmIntakeVO.Policy> policies() {
        return jdbcTemplate.queryForList(
                        "SELECT id, name, mode, scope_dept_names, include_sub_dept, scope_roles, scope_systems, "
                                + "scope_req_types, approval_nodes, dispatcher_user_id, dispatcher_name, priority, "
                                + "DATE_FORMAT(effective_from, '%Y-%m-%d') AS effective_from, "
                                + "DATE_FORMAT(effective_to, '%Y-%m-%d') AS effective_to, "
                                + "version, status, remark "
                                + "FROM rdm_intake_policy WHERE deleted = 0 ORDER BY priority, id")
                .stream().map(RdmIntakePolicyService::toPolicy).toList();
    }

    /**
     * 保存策略（新增或修改）。
     * <p>两处前置拦截：需审批必须配节点（否则该轮只能卡死），同优先级条件重叠必须改优先级
     * （重叠后命中谁取决于排序，管理员无法从界面看出真实效果）。冲突在配置端拦，
     * 运行时才不需要实现一套「多规则仲裁」的隐式逻辑。
     */
    public void savePolicy(RdmIntakeVO.Policy policy, String operator) {
        if (policy == null || !StringUtils.hasText(policy.getName())) {
            throw new BusinessException("請填寫策略名稱");
        }
        String mode = normalizeMode(policy.getMode());
        if (!MODE_EXEMPT.equals(mode) && (policy.getApprovalNodes() == null || policy.getApprovalNodes().isEmpty())) {
            throw new BusinessException("需審批策略必須配置至少一個審批節點，否則該輪審批會無人可辦");
        }
        if (!StringUtils.hasText(policy.getEffectiveFrom())) {
            throw new BusinessException("請填寫生效開始日期");
        }
        if (StringUtils.hasText(policy.getEffectiveTo()) && policy.getEffectiveTo().compareTo(policy.getEffectiveFrom()) < 0) {
            throw new BusinessException("生效結束日期不能早於開始日期");
        }
        int priority = policy.getPriority() == null ? 10 : policy.getPriority();
        policy.setPriority(priority);
        List<RdmIntakeVO.Policy> conflicts = policies().stream()
                .filter(p -> !Objects.equals(p.getId(), policy.getId()))
                .filter(p -> Boolean.TRUE.equals(p.getEnabled()))
                .filter(p -> Objects.equals(p.getPriority(), priority))
                .filter(p -> scopesOverlap(p, policy))
                .toList();
        if (!conflicts.isEmpty()) {
            throw new BusinessException("優先級 " + priority + " 已與「"
                    + conflicts.stream().map(RdmIntakeVO.Policy::getName).collect(Collectors.joining("、"))
                    + "」條件重疊，請調整優先級後再保存");
        }

        if (policy.getId() == null) {
            jdbcTemplate.update(
                    "INSERT INTO rdm_intake_policy (name, mode, scope_dept_names, include_sub_dept, scope_roles, "
                            + "scope_systems, scope_req_types, approval_nodes, dispatcher_user_id, dispatcher_name, "
                            + "priority, effective_from, effective_to, version, status, remark, created_by, updated_by, deleted) "
                            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
                    policy.getName().trim(), mode, joinList(policy.getScopeDepts()),
                    Boolean.TRUE.equals(policy.getIncludeSubDept()) ? 1 : 0,
                    joinList(policy.getScopeRoles()), joinList(policy.getScopeSystems()),
                    joinList(policy.getScopeReqTypes()), joinList(policy.getApprovalNodes()),
                    policy.getDispatcherUserId(), policy.getDispatcherName(), priority,
                    policy.getEffectiveFrom(), emptyToNull(policy.getEffectiveTo()),
                    defaultString(policy.getVersion(), "v1"),
                    Boolean.TRUE.equals(policy.getEnabled()) ? 1 : 0, policy.getRemark(), operator, operator);
            log.info("准入策略已新增: name={}, mode={}, priority={}, operator={}",
                    policy.getName(), mode, priority, operator);
            return;
        }
        // 内容变更后版本递增由配置端决定（界面提交 version），在途需求仍绑定发起时的版本
        jdbcTemplate.update(
                "UPDATE rdm_intake_policy SET name = ?, mode = ?, scope_dept_names = ?, include_sub_dept = ?, "
                        + "scope_roles = ?, scope_systems = ?, scope_req_types = ?, approval_nodes = ?, "
                        + "dispatcher_user_id = ?, dispatcher_name = ?, priority = ?, effective_from = ?, "
                        + "effective_to = ?, version = ?, status = ?, remark = ?, updated_by = ? "
                        + "WHERE id = ? AND deleted = 0",
                policy.getName().trim(), mode, joinList(policy.getScopeDepts()),
                Boolean.TRUE.equals(policy.getIncludeSubDept()) ? 1 : 0,
                joinList(policy.getScopeRoles()), joinList(policy.getScopeSystems()),
                joinList(policy.getScopeReqTypes()), joinList(policy.getApprovalNodes()),
                policy.getDispatcherUserId(), policy.getDispatcherName(), priority,
                policy.getEffectiveFrom(), emptyToNull(policy.getEffectiveTo()),
                defaultString(policy.getVersion(), "v1"),
                Boolean.TRUE.equals(policy.getEnabled()) ? 1 : 0, policy.getRemark(), operator, policy.getId());
        log.info("准入策略已更新: id={}, name={}, enabled={}, operator={}",
                policy.getId(), policy.getName(), policy.getEnabled(), operator);
    }

    /** 删除策略（逻辑删）：历史轮次已绑定 policy_id 快照，不会因此失去审计 */
    public void deletePolicy(Long id) {
        if (id == null) {
            throw new BusinessException("請選擇要刪除的准入策略");
        }
        jdbcTemplate.update("UPDATE rdm_intake_policy SET deleted = 1 WHERE id = ?", id);
    }

    /* ==================== 裁决 ==================== */

    /** 对当前登录人裁决 */
    public RdmIntakeVO.Decision decide(String reqType, String systemCode) {
        return decide(operatorResolver.currentUser(), reqType, systemCode);
    }

    /**
     * 按提交人的部门/角色与需求属性裁决。
     * <p>提交人为空（登录态异常）时按默认需审批处理：宁可多审一道，不能因为取不到人就免审。
     */
    public RdmIntakeVO.Decision decide(SysUser submitter, String reqType, String systemCode) {
        List<String> explain = new ArrayList<>();
        String deptName = submitter == null ? null : submitter.getDepartment();
        Set<String> deptChain = deptChainOf(submitter);
        Set<String> roleTokens = roleTokens(submitter);
        List<String> reqTypes = StringUtils.hasText(reqType) ? List.of(reqType) : List.of();
        List<String> systems = StringUtils.hasText(systemCode) ? List.of(systemCode) : List.of();

        List<RdmIntakeVO.Policy> hit = activePolicies().stream()
                .filter(p -> deptHit(p, deptName, deptChain))
                .filter(p -> anyOrEmpty(p.getScopeRoles(), roleTokens))
                .filter(p -> anyOrEmptyList(p.getScopeSystems(), systems))
                .filter(p -> anyOrEmptyList(p.getScopeReqTypes(), reqTypes))
                .sorted(java.util.Comparator.comparingInt(p -> p.getPriority() == null ? 999 : p.getPriority()))
                .toList();

        if (hit.isEmpty()) {
            RdmIntakeVO.Decision d = defaultDecision();
            explain.add("提交部門「" + defaultString(deptName, "未取到") + "」、角色「"
                    + (roleTokens.isEmpty() ? "未取到" : String.join("/", roleTokens)) + "」未命中任何啟用策略");
            explain.add("按默認口徑處理：需要審批（默認放行等於沒有准入控制）");
            d.setExplain(explain);
            return d;
        }

        RdmIntakeVO.Policy forced = hit.stream().filter(p -> MODE_FORCE_APPROVE.equals(p.getMode())).findFirst().orElse(null);
        RdmIntakeVO.Policy chosen = forced != null ? forced : hit.get(0);
        if (forced != null && !Objects.equals(forced.getId(), hit.get(0).getId())) {
            explain.add("「" + hit.get(0).getName() + "」允許免審，但強制審批約束優先，本單仍需審批");
        }
        explain.add("命中策略「" + chosen.getName() + "」（優先級 " + chosen.getPriority() + "，版本 "
                + defaultString(chosen.getVersion(), "v1") + "）");
        explain.add("條件：" + describeScope(chosen, deptName, roleTokens, reqType, systemCode));

        RdmIntakeVO.Decision d = new RdmIntakeVO.Decision();
        d.setPolicyId(chosen.getId());
        d.setPolicyName(chosen.getName());
        d.setPolicyVersion(defaultString(chosen.getVersion(), "v1"));
        d.setMode(chosen.getMode());
        d.setNeedApproval(!MODE_EXEMPT.equals(chosen.getMode()));
        d.setApprovalNodes(chosen.getApprovalNodes() == null ? List.of() : new ArrayList<>(chosen.getApprovalNodes()));
        d.setDispatcherUserId(chosen.getDispatcherUserId());
        d.setDispatcherName(chosen.getDispatcherName());
        if (!d.isNeedApproval()) {
            explain.add("免審僅影響「要不要審批」，未指定產品經理時仍進需求池等分配");
        } else if (d.getApprovalNodes().isEmpty()) {
            d.setAbnormal(true);
            explain.add("策略未配置審批節點：本輪進入審批異常待辦，由技術負責人處理，不自動放行");
        } else {
            explain.add("審批鏈路：" + String.join(" → ", d.getApprovalNodes()));
        }
        explain.add("分派責任人：" + defaultString(chosen.getDispatcherName(), "技術負責人"));
        d.setExplain(explain);
        return d;
    }

    /**
     * 规则模拟（不写库）：回答「这个人提这样一条需求会走哪条路」。
     * <p>不传 empNo 时永远按当前登录人裁决；要代别人模拟必须持有分配侧查看权，
     * 否则一个普通员工能靠该接口逐个探测别人所属的部门与角色。
     */
    public RdmIntakeVO.Decision simulate(RdmIntakeVO.SimulateRequest request) {
        SysUser current = operatorResolver.currentUser();
        String reqType = request == null ? null : request.getReqType();
        String systemCode = request == null ? null : request.getSystemCode();
        String empNo = request == null ? null : request.getEmpNo();
        if (!StringUtils.hasText(empNo) || (current != null && empNo.equals(current.getEmpId()))) {
            return decide(current, reqType, systemCode);
        }
        if (!permissionService.hasPermission(current, RdmConstants.MENU_INTAKE, "view")) {
            throw new BusinessException("僅技術負責人/項目經理可模擬他人部門的准入結果");
        }
        SysUser target = userMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getEmpId, empNo).last("LIMIT 1"));
        if (target == null) {
            throw new BusinessException("找不到該工號對應的員工: " + empNo);
        }
        return decide(target, reqType, systemCode);
    }

    /** 生效期内的启用策略（裁决与配置页共用同一份读取口径） */
    private List<RdmIntakeVO.Policy> activePolicies() {
        String today = LocalDate.now().toString();
        return policies().stream()
                .filter(p -> Boolean.TRUE.equals(p.getEnabled()))
                .filter(p -> StringUtils.hasText(p.getEffectiveFrom()) ? today.compareTo(p.getEffectiveFrom()) >= 0 : true)
                .filter(p -> StringUtils.hasText(p.getEffectiveTo()) ? today.compareTo(p.getEffectiveTo()) <= 0 : true)
                .toList();
    }

    /** 内置默认裁决：需审批、走主管单节点、由技术负责人分派 */
    private RdmIntakeVO.Decision defaultDecision() {
        RdmIntakeVO.Decision d = new RdmIntakeVO.Decision();
        d.setNeedApproval(true);
        d.setMode(MODE_APPROVE);
        d.setApprovalNodes(List.of("上級主管"));
        d.setDispatcherName("技術負責人");
        d.setFallback(true);
        d.setAbnormal(false);
        return d;
    }

    /* ==================== 命中判定细节 ==================== */

    /** 部门维度：空集合=不限；含下级时按提交人所在部门向上链比对 */
    private boolean deptHit(RdmIntakeVO.Policy p, String deptName, Set<String> deptChain) {
        List<String> scope = p.getScopeDepts();
        if (scope == null || scope.isEmpty()) {
            return true;
        }
        Set<String> candidates = Boolean.TRUE.equals(p.getIncludeSubDept()) ? deptChain
                : (StringUtils.hasText(deptName) ? Set.of(deptName) : Set.of());
        return scope.stream().anyMatch(candidates::contains);
    }

    /** 提交人所在部门及其所有上级名称（策略写「财务部」也能命中「财务部/结算组」的人） */
    private Set<String> deptChainOf(SysUser submitter) {
        Set<String> names = new LinkedHashSet<>();
        if (submitter == null) {
            return names;
        }
        if (StringUtils.hasText(submitter.getDepartment())) {
            names.add(submitter.getDepartment());
        }
        Long parentId = submitter.getDepartmentId();
        Set<Long> visited = new LinkedHashSet<>();
        for (int depth = 0; depth < MAX_DEPT_DEPTH && parentId != null && visited.add(parentId); depth++) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT name, parent_id FROM sys_department WHERE id = ? AND deleted = 0", parentId);
            if (rows.isEmpty()) {
                break;
            }
            Map<String, Object> row = rows.get(0);
            Object name = row.get("name");
            if (name != null && StringUtils.hasText(name.toString())) {
                names.add(name.toString());
            }
            Object parent = row.get("parent_id");
            parentId = parent == null ? null : ((Number) parent).longValue();
        }
        return names;
    }

    /** 角色维度：编码与名称都参与匹配（配置端历史上线条可能是名称） */
    private Set<String> roleTokens(SysUser submitter) {
        Set<String> tokens = new LinkedHashSet<>();
        if (submitter == null) {
            return tokens;
        }
        try {
            tokens.addAll(operatorResolver.functionRoleCodes(submitter));
        } catch (RuntimeException e) {
            log.warn("取員工角色編碼失敗，按空角色繼續裁决: empId={}, error={}", submitter.getEmpId(), e.getMessage());
        }
        List<Long> roleIds = JsonUtils.parseLongList(submitter.getFunctionRoles());
        if (!roleIds.isEmpty()) {
            String inClause = roleIds.stream().map(String::valueOf).collect(Collectors.joining(","));
            jdbcTemplate.queryForList(
                            "SELECT name FROM sys_role WHERE id IN (" + inClause + ") AND deleted = 0", String.class)
                    .stream().filter(StringUtils::hasText).forEach(tokens::add);
        }
        tokens.removeIf(t -> !StringUtils.hasText(t));
        return tokens;
    }

    /** 空=不限；否则任一取值与令牌集合相交即命中 */
    private static boolean anyOrEmpty(List<String> scope, Set<String> tokens) {
        if (scope == null || scope.isEmpty()) {
            return true;
        }
        return scope.stream().anyMatch(tokens::contains);
    }

    /** 需求类型/系统维度（取值为空时视为不限） */
    private static boolean anyOrEmptyList(List<String> scope, List<String> values) {
        if (scope == null || scope.isEmpty()) {
            return true;
        }
        if (values == null || values.isEmpty()) {
            return false;
        }
        return values.stream().anyMatch(scope::contains);
    }

    private static String describeScope(RdmIntakeVO.Policy p, String deptName, Set<String> roles,
                                        String reqType, String systemCode) {
        List<String> parts = new ArrayList<>();
        parts.add("部門 " + ((p.getScopeDepts() == null || p.getScopeDepts().isEmpty()) ? "不限"
                : p.getScopeDepts().stream().filter(d -> d.equals(deptName) || Boolean.TRUE.equals(p.getIncludeSubDept()))
                        .collect(Collectors.joining("/")) + (Boolean.TRUE.equals(p.getIncludeSubDept()) ? "(含下級)" : "")));
        parts.add("角色 " + ((p.getScopeRoles() == null || p.getScopeRoles().isEmpty()) ? "不限"
                : p.getScopeRoles().stream().filter(roles::contains).collect(Collectors.joining("/"))));
        parts.add("系統 " + (StringUtils.hasText(systemCode) ? systemCode : "不限"));
        parts.add("類型 " + (StringUtils.hasText(reqType) ? reqType : "不限"));
        return String.join("，", parts);
    }

    /** 两条策略的条件是否可能同时命中：任一维度有具体值且不相交即判为不重叠 */
    private static boolean scopesOverlap(RdmIntakeVO.Policy a, RdmIntakeVO.Policy b) {
        return dimOverlap(a.getScopeDepts(), b.getScopeDepts())
                && dimOverlap(a.getScopeRoles(), b.getScopeRoles())
                && dimOverlap(a.getScopeSystems(), b.getScopeSystems())
                && dimOverlap(a.getScopeReqTypes(), b.getScopeReqTypes());
    }

    private static boolean dimOverlap(List<String> x, List<String> y) {
        if (x == null || x.isEmpty() || y == null || y.isEmpty()) {
            return true;
        }
        return x.stream().anyMatch(y::contains);
    }

    /* ==================== 读写细节 ==================== */

    private static RdmIntakeVO.Policy toPolicy(Map<String, Object> row) {
        RdmIntakeVO.Policy p = new RdmIntakeVO.Policy();
        p.setId(asLong(row.get("id")));
        p.setName((String) row.get("name"));
        p.setMode(defaultString((String) row.get("mode"), MODE_APPROVE));
        p.setScopeDepts(splitList((String) row.get("scope_dept_names")));
        p.setIncludeSubDept(asInt(row.get("include_sub_dept")) == 1);
        p.setScopeRoles(splitList((String) row.get("scope_roles")));
        p.setScopeSystems(splitList((String) row.get("scope_systems")));
        p.setScopeReqTypes(splitList((String) row.get("scope_req_types")));
        p.setApprovalNodes(splitList((String) row.get("approval_nodes")));
        p.setDispatcherUserId(asLong(row.get("dispatcher_user_id")));
        p.setDispatcherName((String) row.get("dispatcher_name"));
        p.setPriority(asInt(row.get("priority")));
        p.setEffectiveFrom((String) row.get("effective_from"));
        p.setEffectiveTo((String) row.get("effective_to"));
        p.setVersion(defaultString((String) row.get("version"), "v1"));
        p.setEnabled(asInt(row.get("status")) == 1);
        p.setRemark((String) row.get("remark"));
        return p;
    }

    private static String normalizeMode(String mode) {
        if (!StringUtils.hasText(mode)) {
            return MODE_APPROVE;
        }
        String upper = mode.trim().toUpperCase();
        if (!List.of(MODE_FORCE_APPROVE, MODE_APPROVE, MODE_EXEMPT).contains(upper)) {
            throw new BusinessException("不支持的准入動作: " + mode);
        }
        return upper;
    }

    private static String joinList(List<String> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        return list.stream().filter(StringUtils::hasText).map(String::trim)
                .collect(Collectors.joining(","));
    }

    private static List<String> splitList(String value) {
        if (!StringUtils.hasText(value)) {
            return new ArrayList<>();
        }
        return Arrays.stream(value.split(",")).map(String::trim).filter(StringUtils::hasText)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private static String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String defaultString(String value, String fallback) {
        return StringUtils.hasText(value) ? value : fallback;
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static int asInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }
}
