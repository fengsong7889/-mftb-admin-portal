package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.entity.AiCapability;
import com.mftb.admin.entity.AiGlossary;
import com.mftb.admin.entity.AiPromptProfile;
import com.mftb.admin.mapper.AiCapabilityMapper;
import com.mftb.admin.mapper.AiGlossaryMapper;
import com.mftb.admin.mapper.AiPromptProfileMapper;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 助手配置中心：把能力清单、回答骨架、术语口径从代码搬到菜单。
 *
 * <p>边界：
 * <ul>
 *   <li>只影响“怎么说/怎么选工具/术语怎么解释”，不影响权限、数据范围与工具启停；</li>
 *   <li>安全不变量仍在 {@link AgentOrchestrationService} 的代码里，配置无法覆盖；</li>
 *   <li>配置为空/表缺失时返回 null，编排层回退到代码内置 Prompt；</li>
 *   <li>本地缓存 30 秒，保存/发布/回滚时主动 evict；多实例最终一致。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiPromptConfigService {

    private static final long CACHE_TTL_MS = 30_000L;
    private static final int MAX_CONFIG_CHARS = 8_000;
    private static final int MAX_GLOSSARY = 60;

    private final AiPromptProfileMapper profileMapper;
    private final AiCapabilityMapper capabilityMapper;
    private final AiGlossaryMapper glossaryMapper;
    private final AiConfigAuditService auditService;
    private final AiUserMemoryService userMemoryService;
    private final OperatorResolver operatorResolver;

    private volatile Snapshot cache;
    private volatile CapabilityCache capabilityCache;

    private record Snapshot(long loadedAt, Set<String> toolKeys, String systemCode, String composed) {
        boolean fresh() {
            return System.currentTimeMillis() - loadedAt < CACHE_TTL_MS;
        }
    }

    private record CapabilityCache(long loadedAt, Map<String, AiCapability> capabilities) {
        boolean fresh() {
            return System.currentTimeMillis() - loadedAt < CACHE_TTL_MS;
        }
    }

    /* ────────────────── 运行时 ────────────────── */

    /**
     * 组装可配置段落；返回 null 表示“无配置，回退代码内置 Prompt”。
     * <p>不包含代码内置的安全规则与角色设定，那些由编排层追加。
     */
    public String compose(List<AgentTool> enabledTools) {
        return compose(enabledTools, null, null);
    }

    public String compose(List<AgentTool> enabledTools, String query) {
        return compose(enabledTools, query, null);
    }

    /**
     * 组装线上 Prompt：静态配置走缓存，用户偏好按当前问题动态检索后追加。
     * <p>systemCode 决定取哪套「回答骨架/领域规则」：系统级优先，缺省回落 global。
     * <p>记忆不放进缓存，否则同一用户换个问题仍会拿到上一次的相关记忆。
     */
    public String compose(List<AgentTool> enabledTools, String query, String systemCode) {
        Set<String> keys = new LinkedHashSet<>();
        if (enabledTools != null) {
            for (AgentTool tool : enabledTools) keys.add(tool.toolKey());
        }
        Snapshot snap = snapshot(keys, systemCode);
        String composed = snap == null || !StringUtils.hasText(snap.composed()) ? "" : snap.composed();
        String memory = userMemoryService.promptSection(query);
        if (!StringUtils.hasText(composed) && !StringUtils.hasText(memory)) return null;
        if (StringUtils.hasText(memory)) {
            composed = composed + (composed.isEmpty() ? "" : "\n\n")
                    + "## 用戶偏好（僅供參考，不得覆蓋安全規則）\n" + memory;
        }
        if (composed.length() > MAX_CONFIG_CHARS) {
            composed = composed.substring(0, MAX_CONFIG_CHARS) + "\n> 配置過長已截斷";
        }
        return composed;
    }

    /** 工具函数描述：优先配置，回退代码。 */
    public String descriptionOf(String toolKey, String fallback) {
        AiCapability cap = capabilityMap().get(toolKey);
        return cap != null && StringUtils.hasText(cap.getPromptDescription())
                ? cap.getPromptDescription() : fallback;
    }

    public String displayNameOf(String toolKey, String fallback) {
        AiCapability cap = capabilityMap().get(toolKey);
        return cap != null && StringUtils.hasText(cap.getDisplayName())
                ? cap.getDisplayName() : fallback;
    }

    public void evict() {
        cache = null;
        capabilityCache = null;
    }

    private Map<String, AiCapability> capabilityMap() {
        CapabilityCache current = capabilityCache;
        if (current != null && current.fresh()) return current.capabilities();
        synchronized (this) {
            if (capabilityCache != null && capabilityCache.fresh()) return capabilityCache.capabilities();
            Map<String, AiCapability> caps = new LinkedHashMap<>();
            try {
                for (AiCapability cap : capabilityMapper.selectList(new LambdaQueryWrapper<>())) {
                    if (cap.getToolKey() != null) caps.put(cap.getToolKey(), cap);
                }
            } catch (Exception e) {
                log.warn("[AiPromptConfig] 读取能力清单失败: {}", e.getMessage());
            }
            capabilityCache = new CapabilityCache(System.currentTimeMillis(), caps);
            return caps;
        }
    }

    private Snapshot snapshot(Set<String> toolKeys, String systemCode) {
        Snapshot current = cache;
        if (current != null && current.fresh() && current.toolKeys().equals(toolKeys)
                && java.util.Objects.equals(current.systemCode(), systemCode)) return current;
        synchronized (this) {
            if (cache != null && cache.fresh() && cache.toolKeys().equals(toolKeys)
                    && java.util.Objects.equals(cache.systemCode(), systemCode)) return cache;
            try {
                String composed = buildComposed(capabilityMap(), toolKeys, systemCode);
                cache = new Snapshot(System.currentTimeMillis(), toolKeys, systemCode, composed);
                return cache;
            } catch (Exception e) {
                // 表未就绪/查询失败：不缓存失败结果，避免长期让助手失去配置能力
                log.warn("[AiPromptConfig] 读取配置失败，回退代码内置 Prompt: {}", e.getMessage());
                return null;
            }
        }
    }

    private String buildComposed(Map<String, AiCapability> caps, Set<String> toolKeys) {
        return buildComposed(caps, toolKeys, null);
    }

    private String buildComposed(Map<String, AiCapability> caps, Set<String> toolKeys, String systemCode) {
        List<AiCapability> visible = caps.values().stream()
                .filter(c -> c.getToolKey() != null && toolKeys.contains(c.getToolKey()))
                // 能力段按系统裁剪：未接入 AI 工具的系统（如物资）只保留通用工具，避免模型去调无权工具
                .filter(c -> inScope(c.getDomain(), systemCode))
                .toList();
        List<AiPromptProfile> profiles = profileMapper.selectList(new LambdaQueryWrapper<AiPromptProfile>()
                .eq(AiPromptProfile::getStatus, "active"));
        // 有系统上下文时只取「共用 + 本系统」的骨架/规则，避免把所有系统的规则都压给模型
        if (StringUtils.hasText(systemCode)) {
            profiles = profiles.stream()
                    .filter(p -> matchesScope(p, systemCode) || matchesScope(p, "global"))
                    .toList();
        }
        if (profiles.isEmpty() && visible.isEmpty()) return null;

        Set<String> domains = new LinkedHashSet<>();
        domains.add("common");
        if (StringUtils.hasText(systemCode)) domains.add(systemCode);
        for (AiCapability cap : visible) {
            if (StringUtils.hasText(cap.getDomain())) domains.add(cap.getDomain());
            if (cap.getToolKey() != null && cap.getToolKey().startsWith("rdm_")) domains.add("rdm");
            if (cap.getToolKey() != null && cap.getToolKey().startsWith("query_")) domains.add("finance");
        }
        for (AiPromptProfile p : profiles) {
            if (StringUtils.hasText(p.getDomain())) domains.add(p.getDomain());
        }

        AiPromptProfile global = profiles.stream()
                .filter(p -> "global".equalsIgnoreCase(p.getProfileKey()) || "global".equalsIgnoreCase(p.getDomain()))
                .findFirst().orElse(null);
        List<AiPromptProfile> domainProfiles = profiles.stream()
                .filter(p -> !"global".equalsIgnoreCase(p.getProfileKey()) && !"global".equalsIgnoreCase(p.getDomain()))
                .filter(p -> !StringUtils.hasText(systemCode)
                        || matchesScope(p, systemCode))
                .filter(p -> domains.contains(p.getProfileKey()) || domains.contains(p.getDomain()))
                .toList();

        StringBuilder sb = new StringBuilder();

        if (!visible.isEmpty()) {
            sb.append("## 能力清單\n");
            int i = 1;
            for (AiCapability cap : visible) {
                sb.append(i++).append(". ").append(nullToDash(cap.getDisplayName())).append("：")
                        .append(nullToDash(cap.getPromptDescription()));
                if (StringUtils.hasText(cap.getUseWhen())) {
                    sb.append("（何時用：").append(cap.getUseWhen()).append("）");
                }
                if (StringUtils.hasText(cap.getAvoidWhen())) {
                    sb.append("（不要用：").append(cap.getAvoidWhen()).append("）");
                }
                sb.append('\n');
            }
            sb.append('\n');
        }

        List<AiGlossary> glossary = glossaryMapper.selectList(new LambdaQueryWrapper<AiGlossary>()
                .eq(AiGlossary::getStatus, "active")
                .eq(AiGlossary::getPromptVisible, 1)
                .in(AiGlossary::getDomain, domains)
                .orderByAsc(AiGlossary::getSort)
                .last("LIMIT " + MAX_GLOSSARY));
        if (!glossary.isEmpty()) {
            sb.append("## 術語與口徑\n");
            for (AiGlossary g : glossary) {
                sb.append("- ").append(g.getTerm()).append("：").append(nullToDash(g.getDefinition()));
                if (StringUtils.hasText(g.getFormula())) {
                    sb.append("；口徑：").append(g.getFormula());
                }
                sb.append('\n');
            }
            sb.append('\n');
        }

        String skeleton = global == null ? null : global.getResponseSkeleton();
        if (!StringUtils.hasText(skeleton) && !domainProfiles.isEmpty()) {
            skeleton = domainProfiles.get(0).getResponseSkeleton();
        }
        if (StringUtils.hasText(skeleton)) {
            sb.append("## 回答骨架\n").append(skeleton.trim()).append("\n\n");
        }

        List<String> extraRules = new ArrayList<>();
        if (global != null && StringUtils.hasText(global.getExtraRules())) extraRules.add(global.getExtraRules());
        for (AiPromptProfile p : domainProfiles) {
            if (StringUtils.hasText(p.getExtraRules())) extraRules.add(p.getExtraRules());
        }
        if (!extraRules.isEmpty()) {
            sb.append("## 領域規則\n");
            for (String rule : extraRules) {
                sb.append(rule.trim()).append('\n');
            }
            sb.append('\n');
        }

        // 长期记忆不在静态缓存里：由 compose(tools, query) 按当前问题动态追 加

        String composed = sb.toString().trim();
        if (!StringUtils.hasText(composed)) return null;
        if (composed.length() > MAX_CONFIG_CHARS) {
            log.warn("[AiPromptConfig] 配置段落超长 {} 字，已截断到 {} 字", composed.length(), MAX_CONFIG_CHARS);
            composed = composed.substring(0, MAX_CONFIG_CHARS) + "\n> 配置過長已截斷";
        }
        return composed;
    }

    /** 骨架/规则的作用域匹配：profileKey 或 domain 命中即算。 */
    private static boolean matchesScope(AiPromptProfile p, String scope) {
        return scope.equalsIgnoreCase(p.getProfileKey()) || scope.equalsIgnoreCase(p.getDomain());
    }

    /**
     * 工具/能力归属作用域：能力表 domain 优先，缺失时按 toolKey 前缀推断（rdm_ / query_ / common）。
     * <p>供编排层按当前系统裁剪工具集，避免物资等未接入系统看到 RDM/财务工具。
     */
    public String domainOfTool(String toolKey) {
        if (!StringUtils.hasText(toolKey)) return "common";
        AiCapability cap = capabilityMap().get(toolKey);
        if (cap != null && StringUtils.hasText(cap.getDomain())) return cap.getDomain();
        if (toolKey.startsWith("rdm_")) return "rdm";
        if (toolKey.startsWith("query_")) return "finance";
        return "common";
    }

    /** 作用域过滤：无系统上下文时放行；common/空 总是放行。 */
    static boolean inScope(String domain, String systemCode) {
        if (!StringUtils.hasText(systemCode)) return true;
        return !StringUtils.hasText(domain)
                || "common".equalsIgnoreCase(domain)
                || systemCode.equalsIgnoreCase(domain);
    }

    /* ────────────────── 提示词预览 / 试跑 ────────────────── */

    /**
     * 用当前草稿（无草稿则 active）组装一份“可读的最终配置段落”，供配置中心预览与试跑。
     * <p>不写缓存、不影响线上 Prompt；调用方再拼上代码内置的角色与安全规则。
     */
    public String previewPrompt(String profileKey) {
        return previewPrompt(profileKey, null);
    }

    public String previewPrompt(String profileKey, String query) {
        String key = StringUtils.hasText(profileKey) ? profileKey : "global";
        AiPromptProfile profile = profileMapper.selectOne(new LambdaQueryWrapper<AiPromptProfile>()
                .eq(AiPromptProfile::getProfileKey, key)
                .in(AiPromptProfile::getStatus, List.of("draft", "active"))
                .orderByDesc(AiPromptProfile::getStatus)
                .last("LIMIT 1"));
        if (profile == null) {
            profile = profileMapper.selectOne(new LambdaQueryWrapper<AiPromptProfile>()
                    .eq(AiPromptProfile::getProfileKey, "global")
                    .eq(AiPromptProfile::getStatus, "active")
                    .last("LIMIT 1"));
        }

        StringBuilder sb = new StringBuilder();
        List<AiCapability> caps = new ArrayList<>(capabilityMap().values());
        caps.sort(Comparator.comparing(AiCapability::getDomain, Comparator.nullsLast(String::compareTo))
                .thenComparing(AiCapability::getSort, Comparator.nullsLast(Integer::compareTo)));
        if (!caps.isEmpty()) {
            sb.append("## 能力清單\n");
            int i = 1;
            for (AiCapability cap : caps) {
                sb.append(i++).append(". ").append(nullToDash(cap.getDisplayName())).append("：")
                        .append(nullToDash(cap.getPromptDescription()));
                if (StringUtils.hasText(cap.getUseWhen())) sb.append("（何時用：").append(cap.getUseWhen()).append("）");
                if (StringUtils.hasText(cap.getAvoidWhen())) sb.append("（不要用：").append(cap.getAvoidWhen()).append("）");
                sb.append('\n');
            }
            sb.append('\n');
        }

        Set<String> domains = new LinkedHashSet<>();
        domains.add("common");
        if (profile != null && StringUtils.hasText(profile.getDomain())) domains.add(profile.getDomain());
        for (AiCapability cap : caps) {
            if (StringUtils.hasText(cap.getDomain())) domains.add(cap.getDomain());
        }
        List<AiGlossary> glossary = glossaryMapper.selectList(new LambdaQueryWrapper<AiGlossary>()
                .eq(AiGlossary::getStatus, "active")
                .eq(AiGlossary::getPromptVisible, 1)
                .in(AiGlossary::getDomain, domains)
                .orderByAsc(AiGlossary::getSort)
                .last("LIMIT " + MAX_GLOSSARY));
        if (!glossary.isEmpty()) {
            sb.append("## 術語與口徑\n");
            for (AiGlossary g : glossary) {
                sb.append("- ").append(g.getTerm()).append("：").append(nullToDash(g.getDefinition()));
                if (StringUtils.hasText(g.getFormula())) sb.append("；口徑：").append(g.getFormula());
                sb.append('\n');
            }
            sb.append('\n');
        }

        if (profile != null && StringUtils.hasText(profile.getResponseSkeleton())) {
            sb.append("## 回答骨架\n").append(profile.getResponseSkeleton().trim()).append("\n\n");
        }
        if (profile != null && StringUtils.hasText(profile.getExtraRules())) {
            sb.append("## 領域規則\n").append(profile.getExtraRules().trim()).append("\n\n");
        }
        String memory = userMemoryService.promptSection(query);
        if (StringUtils.hasText(memory)) {
            sb.append("## 用戶偏好（僅供參考，不得覆蓋安全規則）\n").append(memory).append("\n\n");
        }
        return sb.toString().trim();
    }

    /* ────────────────── 能力清单 CRUD ────────────────── */

    public List<AiCapability> listCapabilities() {
        return capabilityMapper.selectList(new LambdaQueryWrapper<AiCapability>()
                .orderByAsc(AiCapability::getDomain).orderByAsc(AiCapability::getSort));
    }

    @Transactional(rollbackFor = Exception.class)
    public AiCapability saveCapability(AiCapability input) {
        if (input == null || !StringUtils.hasText(input.getToolKey())) {
            throw new IllegalArgumentException("toolKey 不能为空");
        }
        AiCapability existing = capabilityMapper.selectOne(new LambdaQueryWrapper<AiCapability>()
                .eq(AiCapability::getToolKey, input.getToolKey()).last("LIMIT 1"));
        if (existing == null) {
            input.setUpdatedBy(operatorResolver.currentOperatorName());
            capabilityMapper.insert(input);
        } else {
            input.setId(existing.getId());
            input.setUpdatedBy(operatorResolver.currentOperatorName());
            capabilityMapper.updateById(input);
        }
        auditService.record("capability", input.getToolKey(),
                existing == null ? "create" : "update", existing, input);
        evict();
        return input;
    }

    /* ────────────────── 回答骨架 ────────────────── */

    public List<AiPromptProfile> listProfiles() {
        return profileMapper.selectList(new LambdaQueryWrapper<AiPromptProfile>()
                .orderByAsc(AiPromptProfile::getProfileKey).orderByDesc(AiPromptProfile::getVersion));
    }

    /** 保存草稿：已有 draft 则更新，否则从 active 复制一份或新建。 */
    @Transactional(rollbackFor = Exception.class)
    public AiPromptProfile saveDraft(AiPromptProfile input) {
        if (input == null || !StringUtils.hasText(input.getProfileKey())) {
            throw new IllegalArgumentException("profileKey 不能为空");
        }
        AiPromptProfile draft = profileMapper.selectOne(new LambdaQueryWrapper<AiPromptProfile>()
                .eq(AiPromptProfile::getProfileKey, input.getProfileKey())
                .eq(AiPromptProfile::getStatus, "draft")
                .orderByDesc(AiPromptProfile::getVersion).last("LIMIT 1"));
        if (draft == null) {
            AiPromptProfile latest = profileMapper.selectOne(new LambdaQueryWrapper<AiPromptProfile>()
                    .eq(AiPromptProfile::getProfileKey, input.getProfileKey())
                    .orderByDesc(AiPromptProfile::getVersion).last("LIMIT 1"));
            draft = new AiPromptProfile();
            draft.setProfileKey(input.getProfileKey());
            draft.setName(StringUtils.hasText(input.getName()) ? input.getName()
                    : (latest == null ? input.getProfileKey() : latest.getName()));
            draft.setDomain(StringUtils.hasText(input.getDomain()) ? input.getDomain()
                    : (latest == null ? "global" : latest.getDomain()));
            draft.setVersion(latest == null ? 1 : latest.getVersion() + 1);
            draft.setStatus("draft");
            draft.setResponseSkeleton(StringUtils.hasText(input.getResponseSkeleton())
                    ? input.getResponseSkeleton() : (latest == null ? "" : latest.getResponseSkeleton()));
            draft.setExtraRules(StringUtils.hasText(input.getExtraRules()) ? input.getExtraRules()
                    : (latest == null ? null : latest.getExtraRules()));
            draft.setUpdatedBy(operatorResolver.currentOperatorName());
            profileMapper.insert(draft);
        } else {
            draft.setName(input.getName());
            draft.setDomain(input.getDomain());
            draft.setResponseSkeleton(input.getResponseSkeleton());
            draft.setExtraRules(input.getExtraRules());
            draft.setUpdatedBy(operatorResolver.currentOperatorName());
            profileMapper.updateById(draft);
        }
        auditService.record("prompt", input.getProfileKey(), "update", null, input);
        evict();
        return draft;
    }

    @Transactional(rollbackFor = Exception.class)
    public AiPromptProfile publish(String profileKey) {
        AiPromptProfile draft = profileMapper.selectOne(new LambdaQueryWrapper<AiPromptProfile>()
                .eq(AiPromptProfile::getProfileKey, profileKey)
                .eq(AiPromptProfile::getStatus, "draft")
                .orderByDesc(AiPromptProfile::getVersion).last("LIMIT 1"));
        if (draft == null) {
            throw new IllegalStateException("没有待发布的草稿");
        }
        archiveActive(profileKey);
        draft.setStatus("active");
        draft.setActiveFlag(1);
        draft.setPublishedAt(LocalDateTime.now());
        draft.setPublishedBy(operatorResolver.currentOperatorName());
        profileMapper.updateById(draft);
        auditService.record("prompt", profileKey, "publish", null, draft);
        evict();
        return draft;
    }

    @Transactional(rollbackFor = Exception.class)
    public AiPromptProfile rollback(String profileKey, int version) {
        AiPromptProfile target = profileMapper.selectOne(new LambdaQueryWrapper<AiPromptProfile>()
                .eq(AiPromptProfile::getProfileKey, profileKey)
                .eq(AiPromptProfile::getVersion, version)
                .last("LIMIT 1"));
        if (target == null) throw new IllegalStateException("目标版本不存在");
        archiveActive(profileKey);
        target.setStatus("active");
        target.setActiveFlag(1);
        target.setPublishedAt(LocalDateTime.now());
        target.setPublishedBy(operatorResolver.currentOperatorName());
        profileMapper.updateById(target);
        auditService.record("prompt", profileKey, "rollback", null, target);
        evict();
        return target;
    }

    private void archiveActive(String profileKey) {
        profileMapper.update(null, new LambdaUpdateWrapper<AiPromptProfile>()
                .eq(AiPromptProfile::getProfileKey, profileKey)
                .eq(AiPromptProfile::getStatus, "active")
                .set(AiPromptProfile::getStatus, "archived")
                .set(AiPromptProfile::getActiveFlag, null));
    }

    /* ────────────────── 术语口径 ────────────────── */

    public List<AiGlossary> listGlossary(String domain, String keyword) {
        LambdaQueryWrapper<AiGlossary> wrapper = new LambdaQueryWrapper<AiGlossary>()
                .orderByAsc(AiGlossary::getDomain).orderByAsc(AiGlossary::getSort);
        if (StringUtils.hasText(domain)) wrapper.eq(AiGlossary::getDomain, domain);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(AiGlossary::getTerm, keyword).or().like(AiGlossary::getDefinition, keyword));
        }
        return glossaryMapper.selectList(wrapper);
    }

    /**
     * 术语按需检索：供 lookup_glossary 工具使用。
     * <p>与 {@link #listGlossary} 的区别：只返回 active，匹配 term/aliases/definition/formula，
     * 不要求 prompt_visible=1——未注入全量 Prompt 的术语也应当能被按需查到。
     */
    public List<AiGlossary> searchGlossary(String keyword, String domain, int limit) {
        if (!StringUtils.hasText(keyword)) return List.of();
        String kw = keyword.trim();
        int cap = Math.min(Math.max(limit, 1), 10);
        LambdaQueryWrapper<AiGlossary> wrapper = new LambdaQueryWrapper<AiGlossary>()
                .eq(AiGlossary::getStatus, "active")
                .and(w -> w.like(AiGlossary::getTerm, kw)
                        .or().like(AiGlossary::getAliases, kw)
                        .or().like(AiGlossary::getDefinition, kw)
                        .or().like(AiGlossary::getFormula, kw))
                .orderByAsc(AiGlossary::getSort)
                .last("LIMIT " + cap);
        if (StringUtils.hasText(domain)) wrapper.eq(AiGlossary::getDomain, domain.trim());
        return glossaryMapper.selectList(wrapper);
    }

    @Transactional(rollbackFor = Exception.class)
    public AiGlossary saveGlossary(AiGlossary input) {
        if (input == null || !StringUtils.hasText(input.getDomain()) || !StringUtils.hasText(input.getTerm())) {
            throw new IllegalArgumentException("domain 与 term 不能为空");
        }
        if (!StringUtils.hasText(input.getDefinition())) {
            throw new IllegalArgumentException("定义不能为空");
        }
        AiGlossary existing = glossaryMapper.selectOne(new LambdaQueryWrapper<AiGlossary>()
                .eq(AiGlossary::getDomain, input.getDomain())
                .eq(AiGlossary::getTerm, input.getTerm()).last("LIMIT 1"));
        if (existing == null) {
            if (input.getPromptVisible() == null) input.setPromptVisible(1);
            if (input.getStatus() == null) input.setStatus("active");
            if (input.getSource() == null) input.setSource("manual");
            input.setUpdatedBy(operatorResolver.currentOperatorName());
            glossaryMapper.insert(input);
        } else {
            input.setId(existing.getId());
            input.setUpdatedBy(operatorResolver.currentOperatorName());
            glossaryMapper.updateById(input);
        }
        auditService.record("glossary", input.getDomain() + ":" + input.getTerm(),
                existing == null ? "create" : "update", existing, input);
        evict();
        return input;
    }

    /** 删除前取行：控制器需要按该行作用域做共用写权限校验。 */
    public AiGlossary getGlossary(Long id) {
        return id == null ? null : glossaryMapper.selectById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteGlossary(Long id) {
        AiGlossary existing = glossaryMapper.selectById(id);
        if (existing == null) return;
        glossaryMapper.deleteById(id);
        auditService.record("glossary", existing.getDomain() + ":" + existing.getTerm(), "delete", existing, null);
        evict();
    }

    /* ────────────────── 审计 ────────────────── */

    private static String nullToDash(String s) {
        return StringUtils.hasText(s) ? s : "--";
    }
}
