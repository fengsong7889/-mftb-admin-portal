package com.mftb.admin.config;

import com.mftb.admin.constant.SystemCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 人工智能系统菜单归位：把三个初始化器各自种下的 AI 菜单收敛成
 * {@link AiMenuLayout} 描述的「业务分组 → 对象/任务」结构。
 *
 * <p>为什么放在最后统一执行：主种子（{@code DataInitializer}）、AI 助手
 * （{@code AiAssistantConfigMenuInitializer}）、企业 Agent
 * （{@code AgentPlatformMenuInitializer}）各自负责菜单的自愈与授权，
 * 它们仍会按历史父子关系写入；本初始化器 {@code @Order(60)} 晚于三者，
 * 每次启动幂等校正 parent/sort/显示名，因此**不需要改动存量库**也不会被覆盖回去。
 *
 * <p>安全边界：
 * <ul>
 *   <li>只改 parent_id / sort_order / name / name_en / icon / system_code / deleted，
 *       不动 menu_key、path、actions 与 status —— 存量授权与「停用」语义都不受影响；
 *       icon 仅在布局登记了图标时覆写（用于收敛 AI 系统内的重复图标）；</li>
 *   <li>改名只在库里仍是历史名时生效，管理员在菜单配置里的自定义名不会被覆盖；</li>
 *   <li>历史分组只软删目录行，不删任何授权记录，也不删任何功能菜单；</li>
 *   <li>启动末尾断言最终父级，结构回退直接失败，避免「菜单看起来对、权限却挂在旧树上」。</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(60)
public class AiMenuLayoutInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        Map<String, Long> ids = ensureGroups();
        int subGroups = placeAll(AiMenuLayout.SUB_GROUPS, ids, true);
        int leaves = placeAll(AiMenuLayout.LEAVES, ids, false);
        int retired = retireLegacyGroups();
        assertPlaced(ids);
        log.info("人工智能菜单已归位：{} 个分组，二级目录 {} 个，功能入口 {} 个，退役旧分组 {} 个",
                AiMenuLayout.GROUPS.size(), subGroups, leaves, retired);
    }

    /** 一级分组：每启动幂等 upsert，误删可自愈；目录行不参与权限过滤。 */
    private Map<String, Long> ensureGroups() {
        Map<String, Long> ids = new HashMap<>();
        for (AiMenuLayout.Group group : AiMenuLayout.GROUPS) {
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, name_en, path, component, icon, type, "
                            + "sort_order, actions, status, system_code, updated_by, deleted) "
                            + "VALUES (NULL, ?, ?, ?, NULL, NULL, ?, 1, ?, NULL, 1, ?, 'system', 0) "
                            + "ON DUPLICATE KEY UPDATE name = VALUES(name), name_en = VALUES(name_en), "
                            + "parent_id = NULL, path = NULL, component = NULL, icon = VALUES(icon), type = 1, "
                            + "sort_order = VALUES(sort_order), actions = NULL, status = 1, "
                            + "system_code = VALUES(system_code), deleted = 0, updated_by = 'system'",
                    group.key(), group.name(), group.nameEn(), group.icon(), group.sort(),
                    SystemCode.AI.code());
            ids.put(group.key(), requireMenuId(group.key()));
        }
        return ids;
    }

    /**
     * 归位一组节点。{@code forceRename} 为真时用于二级目录（名字由结构决定）；
     * 为假时叶子只在仍是历史名时改名，保留后台自定义。
     */
    private int placeAll(List<AiMenuLayout.Placement> placements, Map<String, Long> ids, boolean forceRename) {
        int placed = 0;
        Set<String> missing = new LinkedHashSet<>();
        for (AiMenuLayout.Placement placement : placements) {
            Long parentId = ids.get(placement.parentKey());
            if (parentId == null) {
                throw new IllegalStateException("AI 菜单父级未就绪：" + placement.parentKey()
                        + "（子菜单 " + placement.key() + "）");
            }
            Long id = queryMenuId(placement.key());
            if (id == null) {
                // 菜单齐备性由各自种子负责；隔离库/裁剪环境可能没有某些功能入口，这里只提示不阻断
                missing.add(placement.key());
                continue;
            }
            jdbcTemplate.update(
                    "UPDATE sys_menu SET parent_id = ?, sort_order = ?, system_code = ?, deleted = 0, "
                            + "icon = COALESCE(?, icon), updated_by = 'system' WHERE id = ?",
                    parentId, placement.sort(), SystemCode.AI.code(), placement.icon(), id);
            if (forceRename) {
                jdbcTemplate.update("UPDATE sys_menu SET name = ?, name_en = ? WHERE id = ?",
                        placement.name(), placement.nameEn(), id);
            } else {
                renameIfLegacy(placement, id);
            }
            ids.put(placement.key(), id);
            placed++;
        }
        if (!missing.isEmpty()) {
            log.warn("以下 AI 菜单在本次环境中不存在，已跳过归位（由对应种子负责）：{}", missing);
        }
        return placed;
    }

    /** 只在当前名称仍是历史名时改名；name_en 随之更新，避免中英文名称分叉。 */
    private void renameIfLegacy(AiMenuLayout.Placement placement, Long id) {
        List<String> legacyNames = placement.legacyNames();
        if (legacyNames.isEmpty()) {
            return;
        }
        List<String> placeholders = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        args.add(placement.name());
        args.add(placement.nameEn());
        args.add(id);
        for (String legacy : legacyNames) {
            placeholders.add("?");
            args.add(legacy);
        }
        jdbcTemplate.update(
                "UPDATE sys_menu SET name = ?, name_en = ? WHERE id = ? AND name IN ("
                        + String.join(", ", placeholders) + ")",
                args.toArray());
    }

    /** 历史混合分组只软删目录行：其子菜单已归位，授权记录按 menu_key 原样保留。 */
    private int retireLegacyGroups() {
        int retired = 0;
        for (String key : AiMenuLayout.RETIRED_GROUP_KEYS) {
            retired += jdbcTemplate.update(
                    "UPDATE sys_menu SET deleted = 1, status = 0, updated_by = 'system' "
                            + "WHERE menu_key = ? AND deleted = 0",
                    key);
        }
        return retired;
    }

    /**
     * 每次启动都校验（不能只在首次执行时校验）：最终父级不符合布局即失败，
     * 保证侧栏层级与授权理解一致；缺失的菜单不在此断言（由各域种子负责）。
     */
    private void assertPlaced(Map<String, Long> ids) {
        for (AiMenuLayout.Group group : AiMenuLayout.GROUPS) {
            Long id = ids.get(group.key());
            Long parent = jdbcTemplate.queryForObject(
                    "SELECT parent_id FROM sys_menu WHERE id = ?", Long.class, id);
            if (parent != null) {
                throw new IllegalStateException("AI 一级分组必须是顶级菜单：" + group.key());
            }
        }
        List<AiMenuLayout.Placement> all = new ArrayList<>(AiMenuLayout.SUB_GROUPS);
        all.addAll(AiMenuLayout.LEAVES);
        for (AiMenuLayout.Placement placement : all) {
            Long expected = ids.get(placement.parentKey());
            Integer mismatched = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_menu WHERE menu_key = ? AND deleted = 0 "
                            + "AND (parent_id IS NULL OR parent_id <> ?)",
                    Integer.class, placement.key(), expected);
            if (mismatched != null && mismatched > 0) {
                throw new IllegalStateException("AI 菜单未按目标结构归位：" + placement.key()
                        + " 应挂在 " + placement.parentKey() + " 下");
            }
        }
    }

    private Long requireMenuId(String menuKey) {
        Long id = queryMenuId(menuKey);
        if (id == null) {
            throw new IllegalStateException("AI 菜单分组未就绪：" + menuKey);
        }
        return id;
    }

    private Long queryMenuId(String menuKey) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? LIMIT 1", Long.class, menuKey);
        return ids.isEmpty() ? null : ids.get(0);
    }
}
