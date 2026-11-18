/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmTemplate;
import com.mftb.admin.mapper.CpmTemplateMapper;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 岗位模板服务：词表治理（治理面，动作锚 cpm-template:edit）。
 * <p>内置模板不可删除——停用即可；删除内置模板会让历史条目的分类标签永久失去真源。
 * templateKey 限小写字母开头 slug：它会进 categories 白名单与 AI 提示词，
 * 留出空格/引号的口子等于给下一个管理员埋注入。
 */
@Service
@RequiredArgsConstructor
public class CpmTemplateService {

    private static final Pattern KEY_PATTERN = Pattern.compile("^[a-z][a-z0-9_]{1,31}$");

    private final CpmTemplateMapper templateMapper;
    private final OperatorResolver operatorResolver;

    public List<CpmTemplate> enabledTemplates() {
        return templateMapper.listEnabled();
    }

    public List<CpmDto.TemplateVO> list() {
        List<CpmDto.TemplateVO> out = new ArrayList<>();
        templateMapper.selectList(null).forEach(t -> out.add(toVO(t)));
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.TemplateVO save(Long id, CpmDto.TemplateForm form) {
        String key = form.getTemplateKey() == null ? "" : form.getTemplateKey().trim();
        if (!KEY_PATTERN.matcher(key).matches()) {
            throw new BusinessException("模板鍵需為小寫字母開頭、2-32 位的字母/數字/下劃線");
        }
        List<CpmDto.CategoryDef> cleaned = validateCategories(form.getCategories());
        CpmTemplate existing = id == null ? null : templateMapper.selectById(id);
        if (id != null && existing == null) {
            throw new BusinessException("模板不存在");
        }
        if (existing != null && Integer.valueOf(1).equals(existing.getIsBuiltin())
                && !existing.getTemplateKey().equals(key)) {
            // 内置模板只许改显示名/提示语/开关，不许换键：换键=历史条目的词表真源漂移
            throw new BusinessException("內置模板不可更換模板鍵");
        }
        if (existing == null && templateMapper.findByKey(key) != null) {
            throw new BusinessException("模板鍵已存在");
        }
        CpmTemplate row = existing != null ? existing : new CpmTemplate();
        row.setTemplateKey(key);
        row.setName(requireName(form.getName()));
        row.setRoleHint(trim(form.getRoleHint(), 64));
        row.setCategoriesJson(JsonUtils.toJson(cleaned));
        row.setWorkHoursEnabled(Boolean.TRUE.equals(form.getWorkHoursEnabled()) ? 1 : 0);
        row.setRemark(trim(form.getRemark(), 200));
        if (row.getEnabled() == null) {
            row.setEnabled(1);
        }
        if (row.getIsBuiltin() == null) {
            row.setIsBuiltin(0);
        }
        try {
            // 审计列显式落值（全局 MetaObjectHandler 只填时间）：留 NULL 会撞 created_by/updated_by NOT NULL
            String operator = operatorResolver.currentOperatorName();
            row.setUpdatedBy(operator);
            if (row.getCreatedBy() == null) {
                row.setCreatedBy(operator);
            }
            if (row.getId() == null) {
                templateMapper.insert(row);
            } else {
                templateMapper.updateById(row);
            }
        } catch (DuplicateKeyException e) {
            throw new BusinessException("模板鍵已存在");
        }
        return toVO(templateMapper.selectById(row.getId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.TemplateVO setStatus(long id, boolean enabled) {
        CpmTemplate row = templateMapper.selectById(id);
        if (row == null) {
            throw new BusinessException("模板不存在");
        }
        row.setEnabled(enabled ? 1 : 0);
        templateMapper.updateById(row);
        return toVO(row);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        CpmTemplate row = templateMapper.selectById(id);
        if (row == null) {
            throw new BusinessException("模板不存在");
        }
        if (Integer.valueOf(1).equals(row.getIsBuiltin())) {
            throw new BusinessException("內置模板不可刪除，可停用");
        }
        row.setDeleted(1);
        templateMapper.updateById(row);
    }

    /** 词表校验：至少一组、key 合法且去重、显示名必填。分类词表同时是 AI 输出白名单，脏键会把注入面带给模型。 */
    private List<CpmDto.CategoryDef> validateCategories(List<CpmDto.CategoryDef> categories) {
        List<CpmDto.CategoryDef> cleaned = new ArrayList<>();
        Set<String> keys = new HashSet<>();
        if (categories == null || categories.isEmpty()) {
            throw new BusinessException("請至少配置一組分類");
        }
        for (CpmDto.CategoryDef c : categories) {
            if (c == null) {
                continue;
            }
            String k = c.getKey() == null ? "" : c.getKey().trim();
            String label = c.getLabel() == null ? "" : c.getLabel().trim();
            if (!KEY_PATTERN.matcher(k).matches()) {
                throw new BusinessException("分類鍵需小寫字母開頭、2-32 位字母/數字/下劃線：" + k);
            }
            if (label.isEmpty() || label.length() > 16) {
                throw new BusinessException("分類顯示名必填且不超過 16 字");
            }
            if (!keys.add(k)) {
                throw new BusinessException("分類鍵重複：" + k);
            }
            CpmDto.CategoryDef def = new CpmDto.CategoryDef();
            def.setKey(k);
            def.setLabel(label);
            def.setHint(trim(c.getHint(), 64));
            cleaned.add(def);
        }
        if (cleaned.isEmpty()) {
            throw new BusinessException("請至少配置一組有效分類");
        }
        return cleaned;
    }

    private String requireName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty() || trimmed.length() > 32) {
            throw new BusinessException("模板名稱必填且不超過 32 字");
        }
        return trimmed;
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return "";
        }
        String t = value.trim();
        if (t.length() > max) {
            throw new BusinessException("內容超過長度上限 " + max);
        }
        return t;
    }

    private CpmDto.TemplateVO toVO(CpmTemplate t) {
        CpmDto.TemplateVO vo = new CpmDto.TemplateVO();
        vo.setId(t.getId());
        vo.setTemplateKey(t.getTemplateKey());
        vo.setName(t.getName());
        vo.setRoleHint(t.getRoleHint());
        List<CpmDto.CategoryDef> cats = JsonUtils.parseList(t.getCategoriesJson(), CpmDto.CategoryDef.class);
        vo.setCategories(cats == null ? new ArrayList<>() : cats);
        vo.setWorkHoursEnabled(Integer.valueOf(1).equals(t.getWorkHoursEnabled()));
        vo.setBuiltin(Integer.valueOf(1).equals(t.getIsBuiltin()));
        vo.setEnabled(!Integer.valueOf(0).equals(t.getEnabled()));
        vo.setRemark(t.getRemark());
        vo.setUpdatedBy(t.getUpdatedBy());
        vo.setUpdatedAt(t.getUpdatedAt() == null ? null : t.getUpdatedAt().toString());
        return vo;
    }
}
