package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiQuickPrompt;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiQuickPromptMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * 快捷提问：配置页维护 + 首页按系统/角色收敛展示。
 *
 * <p>收敛规则：停用的不展示；system_code 为空表示全系统可见；role_code 为空表示全角色可见。
 * 取不到登录人时按“全角色可见”处理，避免因为解析失败让首页一条快捷问题都没有。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiQuickPromptService {

    private static final int RUNTIME_LIMIT = 6;
    private static final int MAX_QUESTION = 200;

    private final AiQuickPromptMapper promptMapper;
    private final AiConfigAuditService auditService;
    private final OperatorResolver operatorResolver;

    public List<AiQuickPrompt> list(String systemCode, String keyword) {
        LambdaQueryWrapper<AiQuickPrompt> wrapper = new LambdaQueryWrapper<AiQuickPrompt>()
                .orderByAsc(AiQuickPrompt::getSort).orderByAsc(AiQuickPrompt::getId);
        if (StringUtils.hasText(systemCode)) wrapper.eq(AiQuickPrompt::getSystemCode, systemCode);
        if (StringUtils.hasText(keyword)) wrapper.like(AiQuickPrompt::getQuestion, keyword.trim());
        return promptMapper.selectList(wrapper);
    }

    /** 首页展示：最多 6 条，按系统与角色过滤。 */
    public List<AiQuickPrompt> visible(String systemCode) {
        List<String> roles = rolesOf(operatorResolver.currentUser());
        LambdaQueryWrapper<AiQuickPrompt> wrapper = new LambdaQueryWrapper<AiQuickPrompt>()
                .eq(AiQuickPrompt::getEnabled, 1);
        if (StringUtils.hasText(systemCode)) {
            wrapper.and(w -> w.isNull(AiQuickPrompt::getSystemCode)
                    .or().eq(AiQuickPrompt::getSystemCode, "")
                    .or().eq(AiQuickPrompt::getSystemCode, systemCode));
        } else {
            wrapper.and(w -> w.isNull(AiQuickPrompt::getSystemCode).or().eq(AiQuickPrompt::getSystemCode, ""));
        }
        wrapper.and(w -> {
            w.isNull(AiQuickPrompt::getRoleCode).or().eq(AiQuickPrompt::getRoleCode, "");
            if (!roles.isEmpty()) w.or().in(AiQuickPrompt::getRoleCode, roles);
        });
        wrapper.orderByAsc(AiQuickPrompt::getSort).orderByAsc(AiQuickPrompt::getId)
                .last("LIMIT " + RUNTIME_LIMIT);
        try {
            return promptMapper.selectList(wrapper);
        } catch (Exception e) {
            log.warn("[AiQuickPrompt] 读取快捷提问失败，首页回退内置问题: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    @Transactional
    public AiQuickPrompt save(AiQuickPrompt input) {
        String question = input.getQuestion() == null ? "" : input.getQuestion().trim();
        if (!StringUtils.hasText(question)) throw new BusinessException("問題不能為空");
        if (question.length() > MAX_QUESTION) question = question.substring(0, MAX_QUESTION);

        AiQuickPrompt row = input.getId() == null ? new AiQuickPrompt() : promptMapper.selectById(input.getId());
        if (row == null) throw new BusinessException("快捷提問不存在");
        AiQuickPrompt before = row.getId() == null ? null : copyOf(row);
        row.setQuestion(question);
        row.setDomain(StringUtils.hasText(input.getDomain()) ? input.getDomain() : "common");
        row.setSystemCode(normalize(input.getSystemCode()));
        row.setRoleCode(normalize(input.getRoleCode()));
        row.setSort(input.getSort() == null ? 0 : input.getSort());
        row.setEnabled(input.getEnabled() == null ? 1 : input.getEnabled());
        row.setUpdatedBy(operatorResolver.currentOperatorName());
        if (row.getId() == null) promptMapper.insert(row);
        else promptMapper.updateById(row);
        auditService.record("quick_prompt", "prompt:" + row.getId(),
                before == null ? "create" : "update", before, row);
        return row;
    }

    /** 删除前取行：控制器需要按该行作用域做共用写权限校验。 */
    public AiQuickPrompt get(Long id) {
        return id == null ? null : promptMapper.selectById(id);
    }

    @Transactional
    public void delete(Long id) {
        AiQuickPrompt row = promptMapper.selectById(id);
        if (row == null) return;
        promptMapper.deleteById(id);
        auditService.record("quick_prompt", "prompt:" + id, "delete", row, null);
    }

    private static String normalize(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static List<String> rolesOf(SysUser user) {
        List<String> roles = new ArrayList<>();
        if (user == null) return roles;
        if (StringUtils.hasText(user.getRole())) roles.add(user.getRole().trim());
        if (StringUtils.hasText(user.getFunctionRoles())) {
            for (String part : user.getFunctionRoles().split(",")) {
                if (StringUtils.hasText(part)) roles.add(part.trim());
            }
        }
        return roles;
    }

    private static AiQuickPrompt copyOf(AiQuickPrompt src) {
        AiQuickPrompt copy = new AiQuickPrompt();
        copy.setId(src.getId());
        copy.setDomain(src.getDomain());
        copy.setSystemCode(src.getSystemCode());
        copy.setRoleCode(src.getRoleCode());
        copy.setQuestion(src.getQuestion());
        copy.setSort(src.getSort());
        copy.setEnabled(src.getEnabled());
        copy.setUpdatedBy(src.getUpdatedBy());
        return copy;
    }
}
