package com.mftb.admin.config.migration;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 迁移登记表加载器：读取 classpath {@code db/migrations/catalog.json} 并校验清单一致性。
 * <p>
 * 校验项：版本键唯一、依赖存在且无环、SQL 资源在 classpath 中存在、JAVA 执行器已声明、
 * supersededBy 引用存在。校验失败仅在启动期以 ERROR 日志暴露（避免误阻塞本地开发），
 * 由 CI / 单元测试 ({@code MigrationCatalogTest}) 断言问题列表为空作为硬门禁。
 */
@Slf4j
@Component
public class MigrationCatalog {

    public static final String CATALOG_RESOURCE = "db/migrations/catalog.json";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private List<MigrationEntry> entries = List.of();

    @PostConstruct
    public void init() {
        try {
            entries = readAll();
            List<String> problems = validate(entries);
            if (problems.isEmpty()) {
                log.info("迁移登记表校验通过：共 {} 条，ACTIVE {} 条",
                        entries.size(), entries.stream().filter(e -> e.getStatus() == MigrationStatus.ACTIVE).count());
            } else {
                log.error("迁移登记表存在 {} 处不一致（CI 将阻断发布）：", problems.size());
                problems.forEach(p -> log.error("  - {}", p));
            }
        } catch (Exception e) {
            log.error("读取/校验迁移登记表 {} 失败: {}", CATALOG_RESOURCE, e.getMessage(), e);
        }
    }

    public List<MigrationEntry> getEntries() {
        return entries;
    }

    /** 从 classpath 读取全部登记条目（供测试与工具复用）。 */
    public static List<MigrationEntry> readAll() throws Exception {
        ClassPathResource resource = new ClassPathResource(CATALOG_RESOURCE);
        if (!resource.exists()) {
            throw new IllegalStateException("未找到迁移登记表: " + CATALOG_RESOURCE);
        }
        try (InputStream is = resource.getInputStream()) {
            Map<?, ?> root = MAPPER.readValue(is, Map.class);
            Object raw = root.get("migrations");
            return MAPPER.convertValue(raw,
                    MAPPER.getTypeFactory().constructCollectionType(List.class, MigrationEntry.class));
        }
    }

    /** 返回清单中的问题描述列表；空列表表示完全一致。 */
    public static List<String> validate(List<MigrationEntry> list) {
        List<String> problems = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        for (MigrationEntry e : list) {
            if (isBlank(e.getVersionKey())) {
                problems.add("存在空的 versionKey");
                continue;
            }
            if (!keys.add(e.getVersionKey())) {
                problems.add("versionKey 重复: " + e.getVersionKey());
            }
        }
        for (MigrationEntry e : list) {
            String vk = e.getVersionKey();
            if (e.getStatus() == null) {
                problems.add(vk + ": 缺少 status");
            }
            if (e.getPhase() == null) {
                problems.add(vk + ": 缺少 phase");
            }
            if (e.getExecutionType() == null) {
                problems.add(vk + ": 缺少 executionType");
            } else if (e.getExecutionType() == MigrationEntry.ExecutionType.SQL) {
                if (isBlank(e.getResource())) {
                    problems.add(vk + ": SQL 类型缺少 resource");
                } else if (!new ClassPathResource(e.getResource()).exists()) {
                    problems.add(vk + ": 引用的 SQL 资源不在 classpath: " + e.getResource());
                }
            } else if (isBlank(e.getExecutor())) {
                problems.add(vk + ": JAVA 类型缺少 executor");
            }
            if (e.getStatus() == MigrationStatus.SUPERSEDED) {
                if (isBlank(e.getSupersededBy())) {
                    problems.add(vk + ": SUPERSEDED 但未声明 supersededBy");
                } else if (!keys.contains(e.getSupersededBy())) {
                    problems.add(vk + ": supersededBy 指向不存在的键 " + e.getSupersededBy());
                }
            }
        }
        // 依赖存在性 + 环检测
        Map<String, MigrationEntry> byKey = new java.util.HashMap<>();
        for (MigrationEntry e : list) {
            if (!isBlank(e.getVersionKey())) byKey.put(e.getVersionKey(), e);
        }
        for (MigrationEntry e : list) {
            if (e.getDependencies() == null) continue;
            for (String dep : e.getDependencies()) {
                if (!byKey.containsKey(dep)) {
                    problems.add(e.getVersionKey() + ": 依赖未登记的键 " + dep);
                }
            }
        }
        detectCycles(byKey, problems);
        return problems;
    }

    private static void detectCycles(Map<String, MigrationEntry> byKey, List<String> problems) {
        Set<String> visited = new HashSet<>();
        Set<String> inStack = new HashSet<>();
        for (String key : byKey.keySet()) {
            if (hasCycle(key, byKey, visited, inStack, problems)) {
                // 每个环只在首次命中时报一次
                break;
            }
        }
    }

    private static boolean hasCycle(String key, Map<String, MigrationEntry> byKey,
                                    Set<String> visited, Set<String> inStack, List<String> problems) {
        Deque<String> stack = new ArrayDeque<>();
        return dfs(key, byKey, visited, inStack, stack, problems);
    }

    private static boolean dfs(String node, Map<String, MigrationEntry> byKey,
                               Set<String> visited, Set<String> inStack, Deque<String> stack, List<String> problems) {
        if (inStack.contains(node)) {
            problems.add("依赖存在环: " + String.join(" -> ", stack) + " -> " + node);
            return true;
        }
        if (visited.contains(node)) {
            return false;
        }
        visited.add(node);
        inStack.add(node);
        stack.push(node);
        MigrationEntry entry = byKey.get(node);
        if (entry != null && entry.getDependencies() != null) {
            for (String dep : entry.getDependencies()) {
                if (byKey.containsKey(dep) && dfs(dep, byKey, visited, inStack, stack, problems)) {
                    return true;
                }
            }
        }
        stack.pop();
        inStack.remove(node);
        return false;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
