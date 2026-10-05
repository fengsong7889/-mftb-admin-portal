package com.mftb.admin.service;

import com.mftb.admin.dto.RdmConfigVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * RDM 配置服务：状态定义、流转规则、SLA、分发矩阵。
 * <p>配置表读写走 JdbcTemplate（低频、结构稳定），业务单据仍由各实体 Mapper 负责。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmConfigService {

    private final JdbcTemplate jdbcTemplate;

    /** 状态定义（启用项，按 sort_order 升序） */
    public List<RdmConfigVO.StatusDef> statusDefs() {
        return jdbcTemplate.queryForList(
                        "SELECT code, label, stage, sort_order, final_flag, status FROM rdm_status_def "
                                + "WHERE deleted = 0 ORDER BY sort_order")
                .stream().map(row -> {
                    RdmConfigVO.StatusDef def = new RdmConfigVO.StatusDef();
                    def.setCode((String) row.get("code"));
                    def.setLabel((String) row.get("label"));
                    def.setStage((String) row.get("stage"));
                    def.setSortNo(toInt(row.get("sort_order")));
                    def.setFinalFlag(toInt(row.get("final_flag")) == 1);
                    def.setEnabled(toInt(row.get("status")) == 1);
                    return def;
                }).toList();
    }

    /** 状态 → 阶段映射（列表/详情 VO 的 stage 字段来源） */
    public Map<String, String> stageMap() {
        Map<String, String> map = new LinkedHashMap<>();
        for (RdmConfigVO.StatusDef def : statusDefs()) {
            map.put(def.getCode(), def.getStage());
        }
        return map;
    }

    /** 状态 → 名称映射 */
    public Map<String, String> statusLabelMap() {
        Map<String, String> map = new LinkedHashMap<>();
        for (RdmConfigVO.StatusDef def : statusDefs()) {
            map.put(def.getCode(), def.getLabel());
        }
        return map;
    }

    /** 全部流转规则 */
    public List<RdmConfigVO.Transition> transitions() {
        return jdbcTemplate.queryForList(
                        "SELECT id, from_status, to_status, action_code, action_name, allowed_roles, "
                                + "required_fields, status FROM rdm_transition WHERE deleted = 0 ORDER BY sort_order, id")
                .stream().map(this::toTransition).toList();
    }

    /** 指定状态下启用的流转规则 */
    public List<RdmConfigVO.Transition> transitionsFrom(String status) {
        if (!StringUtils.hasText(status)) {
            return List.of();
        }
        return jdbcTemplate.queryForList(
                        "SELECT id, from_status, to_status, action_code, action_name, allowed_roles, "
                                + "required_fields, status FROM rdm_transition "
                                + "WHERE deleted = 0 AND status = 1 AND from_status = ? ORDER BY sort_order, id", status)
                .stream().map(this::toTransition).toList();
    }

    /** 精确匹配一条流转规则（同动作码可能挂在不同起始状态上，必须带 fromStatus） */
    public RdmConfigVO.Transition findTransition(String fromStatus, String actionCode) {
        if (!StringUtils.hasText(fromStatus) || !StringUtils.hasText(actionCode)) {
            return null;
        }
        return jdbcTemplate.queryForList(
                        "SELECT id, from_status, to_status, action_code, action_name, allowed_roles, "
                                + "required_fields, status FROM rdm_transition "
                                + "WHERE deleted = 0 AND status = 1 AND from_status = ? AND action_code = ? "
                                + "ORDER BY sort_order, id LIMIT 1", fromStatus, actionCode)
                .stream().findFirst().map(this::toTransition).orElse(null);
    }

    /** SLA 配置 */
    public List<RdmConfigVO.Sla> slaConfigs() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT s.id, s.status_code, s.priority, s.sla_hours, s.warn_hours, s.escalate_role, s.status, "
                        + "d.label AS status_label "
                        + "FROM rdm_sla_config s LEFT JOIN rdm_status_def d ON d.code = s.status_code AND d.deleted = 0 "
                        + "WHERE s.deleted = 0 ORDER BY d.sort_order, s.priority");
        return rows.stream().map(row -> {
            RdmConfigVO.Sla sla = new RdmConfigVO.Sla();
            sla.setId(toLong(row.get("id")));
            sla.setStatusCode((String) row.get("status_code"));
            sla.setStatusLabel((String) row.get("status_label"));
            sla.setPriority((String) row.get("priority"));
            sla.setSlaHours(toInt(row.get("sla_hours")));
            sla.setWarnHours(toInt(row.get("warn_hours")));
            sla.setEscalateRole((String) row.get("escalate_role"));
            sla.setEnabled(toInt(row.get("status")) == 1);
            return sla;
        }).toList();
    }

    /**
     * 查某状态某优先级适用的 SLA 小时数。
     * <p>先精确匹配优先级，未命中再取「适用全部优先级」（priority 为空）的配置；都没有则返回 null。
     */
    public Integer slaHours(String statusCode, String priority) {
        Integer exact = querySlaHours(statusCode, StringUtils.hasText(priority) ? priority : "");
        if (exact != null) {
            return exact;
        }
        return querySlaHours(statusCode, "");
    }

    /** 查预警阈值（缺省为 SLA 的 80%） */
    public Integer warnHours(String statusCode, String priority) {
        List<RdmConfigVO.Sla> list = slaConfigs();
        for (RdmConfigVO.Sla sla : list) {
            if (!sla.getStatusCode().equals(statusCode) || !Boolean.TRUE.equals(sla.getEnabled())) {
                continue;
            }
            boolean priorityHit = !StringUtils.hasText(sla.getPriority())
                    || sla.getPriority().equals(priority);
            if (priorityHit) {
                if (sla.getWarnHours() != null && sla.getWarnHours() > 0) {
                    return sla.getWarnHours();
                }
                Integer slaHours = sla.getSlaHours();
                return slaHours != null ? (int) Math.floor(slaHours * 0.8) : null;
            }
        }
        return null;
    }

    /** 查逾期升级通知角色 */
    public String escalateRole(String statusCode, String priority) {
        return slaConfigs().stream()
                .filter(s -> s.getStatusCode().equals(statusCode))
                .filter(s -> !StringUtils.hasText(s.getPriority()) || s.getPriority().equals(priority))
                .map(RdmConfigVO.Sla::getEscalateRole)
                .findFirst().orElse(null);
    }

    private Integer querySlaHours(String statusCode, String priority) {
        List<Integer> rows = jdbcTemplate.queryForList(
                "SELECT sla_hours FROM rdm_sla_config WHERE deleted = 0 AND status = 1 "
                        + "AND status_code = ? AND priority = ? LIMIT 1",
                Integer.class, statusCode, priority);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** 分发矩阵 */
    public List<RdmConfigVO.Routing> routingRules() {
        List<RdmConfigVO.Routing> list = new ArrayList<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(
                "SELECT id, scope_type, scope_value, scope_name, pm_user_id, pm_name, backup_pm_user_id, "
                        + "backup_pm_name, load_capacity, priority, status FROM rdm_routing_rule "
                        + "WHERE deleted = 0 ORDER BY priority, id")) {
            RdmConfigVO.Routing r = new RdmConfigVO.Routing();
            r.setId(toLong(row.get("id")));
            r.setScopeType((String) row.get("scope_type"));
            r.setScopeValue((String) row.get("scope_value"));
            r.setScopeName((String) row.get("scope_name"));
            r.setPmUserId(toLong(row.get("pm_user_id")));
            r.setPmName((String) row.get("pm_name"));
            r.setBackupPmUserId(toLong(row.get("backup_pm_user_id")));
            r.setBackupPmName((String) row.get("backup_pm_name"));
            r.setLoadCapacity(toInt(row.get("load_capacity")));
            r.setPriority(toInt(row.get("priority")));
            r.setEnabled(toInt(row.get("status")) == 1);
            r.setActiveCount(countActiveByPm(r.getPmUserId()));
            list.add(r);
        }
        return list;
    }

    /** 保存分发矩阵（id 为空视为新增）；operator 为登录人签名 */
    public void saveRouting(RdmConfigVO.Routing r, String operator) {
        if (!StringUtils.hasText(r.getScopeType()) || !StringUtils.hasText(r.getScopeValue())
                || r.getPmUserId() == null) {
            throw new IllegalArgumentException("匹配范围、匹配对象与产品经理为必填");
        }
        if (r.getId() == null) {
            jdbcTemplate.update(
                    "INSERT INTO rdm_routing_rule (scope_type, scope_value, scope_name, pm_user_id, pm_name, "
                            + "backup_pm_user_id, backup_pm_name, load_capacity, priority, status, created_by, updated_by) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
                    r.getScopeType(), r.getScopeValue(), r.getScopeName(), r.getPmUserId(), r.getPmName(),
                    r.getBackupPmUserId(), r.getBackupPmName(),
                    r.getLoadCapacity() == null ? 8 : r.getLoadCapacity(),
                    r.getPriority() == null ? 100 : r.getPriority(), operator, operator);
            return;
        }
        jdbcTemplate.update(
                "UPDATE rdm_routing_rule SET scope_type = ?, scope_value = ?, scope_name = ?, pm_user_id = ?, "
                        + "pm_name = ?, backup_pm_user_id = ?, backup_pm_name = ?, load_capacity = ?, "
                        + "priority = ?, status = ?, updated_by = ? WHERE id = ? AND deleted = 0",
                r.getScopeType(), r.getScopeValue(), r.getScopeName(), r.getPmUserId(), r.getPmName(),
                r.getBackupPmUserId(), r.getBackupPmName(),
                r.getLoadCapacity() == null ? 8 : r.getLoadCapacity(),
                r.getPriority() == null ? 100 : r.getPriority(),
                Boolean.TRUE.equals(r.getEnabled()) ? 1 : 0, operator, r.getId());
    }

    /**
     * 保存 SLA 行（按 status_code + priority 唯一定位）。
     * <p>预警阈值必须小于标准时效，否则“预警”会在逾期之后才发，等于没有预警。
     */
    public void saveSla(RdmConfigVO.Sla sla) {
        if (!StringUtils.hasText(sla.getStatusCode())) {
            throw new IllegalArgumentException("狀态編碼不能為空");
        }
        if (sla.getSlaHours() == null || sla.getSlaHours() <= 0) {
            throw new IllegalArgumentException("標準時效必須大於 0 小時");
        }
        if (sla.getWarnHours() == null || sla.getWarnHours() <= 0 || sla.getWarnHours() >= sla.getSlaHours()) {
            throw new IllegalArgumentException("預警閾值必須大於 0 且小於標準時效");
        }
        if (!StringUtils.hasText(sla.getEscalateRole())) {
            throw new IllegalArgumentException("請選擇逾期升級通知對象");
        }
        String priority = sla.getPriority() == null ? "" : sla.getPriority();
        int updated = jdbcTemplate.update(
                "UPDATE rdm_sla_config SET sla_hours = ?, warn_hours = ?, escalate_role = ?, status = ?, updated_by = ? "
                        + "WHERE deleted = 0 AND status_code = ? AND priority = ?",
                sla.getSlaHours(), sla.getWarnHours(), sla.getEscalateRole(),
                Boolean.FALSE.equals(sla.getEnabled()) ? 0 : 1, sla.getOperator(),
                sla.getStatusCode(), priority);
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO rdm_sla_config (status_code, priority, sla_hours, warn_hours, escalate_role, status, created_by, updated_by) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    sla.getStatusCode(), priority, sla.getSlaHours(), sla.getWarnHours(), sla.getEscalateRole(),
                    Boolean.FALSE.equals(sla.getEnabled()) ? 0 : 1, sla.getOperator(), sla.getOperator());
        }
    }

    /** 启用/停用一条流转规则（停用后详情页按钮立即消失，无需发版） */
    public void setTransitionEnabled(Long id, boolean enabled, String operator) {
        if (id == null) {
            throw new IllegalArgumentException("流轉規則 id 不能為空");
        }
        int changed = jdbcTemplate.update(
                "UPDATE rdm_transition SET status = ?, updated_by = ? WHERE id = ? AND deleted = 0",
                enabled ? 1 : 0, operator, id);
        if (changed == 0) {
            throw new IllegalArgumentException("流轉規則不存在或已刪除: id=" + id);
        }
    }

    /**
     * 启用/停用状态定义。
     * <p>停用前必须确认没有需求还停在该状态，否则会造成“需求卡在已停用状态、无人能推”的死状态。
     */
    public void setStatusEnabled(String code, boolean enabled, String operator) {
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("狀態編碼不能為空");
        }
        if (!enabled) {
            Integer occupying = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND status = ?", Integer.class, code);
            if (occupying != null && occupying > 0) {
                throw new IllegalArgumentException("尚有 " + occupying + " 個需求處於該狀態，不能停用；請先推進或歸檔");
            }
        }
        int changed = jdbcTemplate.update(
                "UPDATE rdm_status_def SET status = ?, updated_at = NOW() WHERE code = ? AND deleted = 0",
                enabled ? 1 : 0, code);
        if (changed == 0) {
            throw new IllegalArgumentException("狀態定義不存在: " + code);
        }
    }

    /** 删除分发矩阵行（逻辑删除） */
    public void deleteRouting(Long id) {
        jdbcTemplate.update("UPDATE rdm_routing_rule SET deleted = 1 WHERE id = ?", id);
    }

    /**
     * 按分发矩阵匹配默认产品经理。
     * <p>命中优先级：菜单 &gt; 系统 &gt; 部门 &gt; 需求类型，同级按 priority 小者。
     */
    public RdmConfigVO.Routing matchRouting(String menuKey, String systemCode, Long deptId, String reqType) {
        for (RdmConfigVO.Routing r : routingRules()) {
            if (!Boolean.TRUE.equals(r.getEnabled())) {
                continue;
            }
            boolean hit = switch (r.getScopeType()) {
                case "MENU" -> StringUtils.hasText(menuKey) && menuKey.equals(r.getScopeValue());
                case "SYSTEM" -> StringUtils.hasText(systemCode) && systemCode.equals(r.getScopeValue());
                case "DEPT" -> deptId != null && String.valueOf(deptId).equals(r.getScopeValue());
                case "TYPE" -> StringUtils.hasText(reqType) && reqType.equals(r.getScopeValue());
                default -> false;
            };
            if (hit) {
                return r;
            }
        }
        return null;
    }

    /** 统计某产品经理在途需求量（未交付且未关闭） */
    public int countActiveByPm(Long pmUserId) {
        if (pmUserId == null) {
            return 0;
        }
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND assignee_pm_user_id = ? "
                        + "AND status NOT IN ('released','verified','closed','rejected')",
                Integer.class, pmUserId);
        return count == null ? 0 : count;
    }

    private RdmConfigVO.Transition toTransition(Map<String, Object> row) {
        RdmConfigVO.Transition t = new RdmConfigVO.Transition();
        t.setId(toLong(row.get("id")));
        t.setFromStatus((String) row.get("from_status"));
        t.setToStatus((String) row.get("to_status"));
        t.setActionCode((String) row.get("action_code"));
        t.setActionName((String) row.get("action_name"));
        t.setAllowedRoles(splitCsv((String) row.get("allowed_roles")));
        t.setRequiredFields(splitCsv((String) row.get("required_fields")));
        t.setEnabled(toInt(row.get("status")) == 1);
        return t;
    }

    private static List<String> splitCsv(String value) {
        if (!StringUtils.hasText(value)) {
            return List.of();
        }
        return Arrays.stream(value.split(",")).map(String::trim).filter(StringUtils::hasText).toList();
    }

    private static Integer toInt(Object value) {
        return value == null ? null : ((Number) value).intValue();
    }

    private static Long toLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }
}
