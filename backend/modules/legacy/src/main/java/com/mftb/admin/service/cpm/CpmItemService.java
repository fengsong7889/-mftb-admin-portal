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
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.entity.CpmTemplate;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 条目服务：快捷录入/编辑/删除/进度流水/日视图/延续建议。
 *
 * <p>三条硬口径：
 * 1) user_id 一律取登录人，表单没有身份字段位置；
 * 2) 分类白名单校验用「启用模板词表的并集」——并集而不是当前模板：
 *    用户中途换模板不能让历史条目的分类变成非法值而改不动其它字段；
 * 3) done 强制 progress=100 在服务端做，前端滑杆只是 UX。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmItemService {

    private static final Set<String> STATUSES = Set.of("todo", "doing", "done", "blocked");
    private static final Set<String> SOURCE_TYPES = Set.of("manual", "ai", "rdm_requirement", "meeting_action");
    /**
     * 工时上限（小时）：列是 DECIMAL(4,1)，物理上限 999.9；这里取一个远高于真实投入的整数，
     * 目的只是把「手滑多打一个 0」挡在写库之前——工时仅供分布统计，不参与任何评价。
     */
    private static final java.math.BigDecimal MAX_WORK_HOURS_PER_ITEM = new java.math.BigDecimal("200.0");

    private final CpmItemMapper itemMapper;
    private final CpmItemUpdateMapper updateMapper;
    private final CpmRecognitionMapper recognitionMapper;
    private final CpmTemplateService templateService;
    private final CpmPeriods periods;
    private final CpmAccessGuard guard;

    /* ==================== 日视图 ==================== */

    /** 条目详情（编辑页刷新/直链进入用）；仍限本人，IDOR 与更新同一条守卫。 */
    public CpmDto.ItemVO detail(long id) {
        SysUser current = guard.currentUser();
        CpmItem item = guard.requireOwnedItem(id, current);
        return toItemVO(item, categoryLabels());
    }

    public CpmDto.DayVO dayView(String dateStr) {
        SysUser current = guard.currentUser();
        LocalDate date = parseDateOrToday(dateStr);
        CpmDto.DayVO vo = new CpmDto.DayVO();
        vo.setDate(date.toString());
        Map<String, String> labels = categoryLabels();
        Set<Long> recognized = recognizedItemIds(current.getId());
        itemMapper.listActiveOn(current.getId(), date).forEach(item -> {
            CpmDto.ItemVO iv = toItemVO(item, labels);
            iv.setRecognized(recognized.contains(item.getId()));
            vo.getItems().add(iv);
        });
        itemMapper.listCarryCandidates(current.getId(), date)
                .forEach(item -> vo.getCarryCandidates().add(toItemVO(item, labels)));
        return vo;
    }

    /* ==================== 写路径 ==================== */

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.ItemVO create(CpmDto.ItemForm form) {
        SysUser current = guard.currentUser();
        LocalDate workDate = parseDateOrToday(form.getWorkDate());
        validateCategoryAndStatus(form.getCategory(), form.getStatus());
        CpmItem item = new CpmItem();
        item.setUserId(current.getId());
        item.setWorkDate(workDate);
        item.setTitle(requireTitle(form.getTitle()));
        item.setDetail(trimOrNull(form.getDetail(), CpmConstants.DETAIL_MAX));
        item.setCategory(StringUtils.hasText(form.getCategory()) ? form.getCategory().trim() : "general");
        item.setStatus(StringUtils.hasText(form.getStatus()) ? form.getStatus() : "doing");
        int progress = normalizeProgress(item.getStatus(), form.getProgress());
        item.setProgress(progress);
        item.setWorkHours(requireWorkHours(form.getWorkHours()));
        String sourceType = StringUtils.hasText(form.getSourceType()) ? form.getSourceType() : "manual";
        if (!SOURCE_TYPES.contains(sourceType)) {
            throw new BusinessException("不支援的來源類型");
        }
        item.setSourceType(sourceType);
        item.setSourceRef(trimOrNull(form.getSourceRef(), 64));
        item.setSourceLabel(trimOrNull(form.getSourceLabel(), 200));
        item.setTemplateKey(StringUtils.hasText(form.getTemplateKey()) ? form.getTemplateKey().trim() : null);
        item.setVersion(0);
        item.setDeleted(0);
        // 审计列必须显式落值：全局 MetaObjectHandler 只填时间（MeetingEvent 同款注释），
        // createdBy/updatedBy 带 @TableField(fill) 却没人填 = INSERT 携带 NULL 撞 NOT NULL 约束
        item.setCreatedBy(current.getName());
        item.setUpdatedBy(current.getName());
        try {
            itemMapper.insert(item);
        } catch (DuplicateKeyException e) {
            // 同一外部对象重复导入：唯一键是唯一裁判，这里只负责把 1062 翻译成人话
            throw new BusinessException("該來源對象已導入過，不可重複建立");
        }
        // 首条流水与条目同事务：日视图「活跃」口径只认流水与 work_date，缺首流水的条目会从天上消失
        writeProgress(item.getId(), workDate, item.getProgress(), item.getStatus(), null, current);
        return toItemVO(item, categoryLabels());
    }

    @Transactional(rollbackFor = Exception.class)
    public CpmDto.ItemVO update(long id, CpmDto.ItemForm form) {
        SysUser current = guard.currentUser();
        CpmItem existing = guard.requireOwnedItem(id, current);
        validateCategoryAndStatus(form.getCategory(), form.getStatus());
        int version = form.getVersion() == null ? existing.getVersion() : form.getVersion();
        String status = StringUtils.hasText(form.getStatus()) ? form.getStatus() : existing.getStatus();
        Integer progress = form.getProgress() == null && !StringUtils.hasText(form.getStatus())
                ? null : normalizeProgress(status, form.getProgress());
        LocalDate workDate = StringUtils.hasText(form.getWorkDate()) ? LocalDate.parse(form.getWorkDate()) : null;
        int affected = itemMapper.updateOwnedVersioned(id, current.getId(), version,
                requireTitle(form.getTitle()), trimOrNull(form.getDetail(), CpmConstants.DETAIL_MAX),
                form.getCategory(), status, progress, requireWorkHours(form.getWorkHours()), workDate, current.getName());
        if (affected == 0) {
            throw new BusinessException("該記錄已被他人更新，請刷新後重試");
        }
        return toItemVO(itemMapper.selectAliveById(id), categoryLabels());
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        SysUser current = guard.currentUser();
        guard.requireOwnedItem(id, current);
        if (itemMapper.softDeleteOwned(id, current.getId(), current.getName()) == 0) {
            throw new BusinessException("記錄已被更新，請刷新後重試");
        }
    }

    /** 进度更新：流水只追加 + 主表缓存回写同事务；done 强制 100。 */
    @Transactional(rollbackFor = Exception.class)
    public void addProgress(long id, CpmDto.ProgressForm form) {
        SysUser current = guard.currentUser();
        CpmItem item = guard.requireOwnedItem(id, current);
        if (!STATUSES.contains(form.getStatus())) {
            throw new BusinessException("不支援的狀態");
        }
        LocalDate date = parseDateOrToday(form.getUpdateDate());
        int progress = normalizeProgress(form.getStatus(), form.getProgress());
        writeProgress(id, date, progress, form.getStatus(),
                trimOrNull(form.getNote(), CpmConstants.NOTE_MAX), current);
        itemMapper.syncLatestCache(id, form.getStatus(), progress);
        // 工时随进度一起行内填写：它是分布统计的旁路字段，服务端夹范围且不接受负数
        java.math.BigDecimal hours = requireWorkHours(form.getWorkHours());
        if (hours != null) {
            itemMapper.updateWorkHoursOwned(id, current.getId(), hours, current.getName());
        }
    }

    /** 延续带入：把未完结条目按今天再写一条流水（幂等：今天已有流水则跳过不报错）。 */
    @Transactional(rollbackFor = Exception.class)
    public void carryOver(long id) {
        SysUser current = guard.currentUser();
        CpmItem item = guard.requireOwnedItem(id, current);
        if ("done".equals(item.getStatus())) {
            throw new BusinessException("已完成條目無需延續");
        }
        LocalDate today = periods.today();
        if (updateMapper.countOnDate(id, today) > 0) {
            return;
        }
        writeProgress(id, today, item.getProgress(), item.getStatus(), "延續昨日", current);
        itemMapper.syncLatestCache(id, item.getStatus(), item.getProgress());
    }

    /* ==================== 内部 ==================== */

    private void writeProgress(long itemId, LocalDate date, int progress, String status, String note, SysUser current) {
        CpmItemUpdate row = new CpmItemUpdate();
        row.setItemId(itemId);
        row.setUpdateDate(date);
        row.setProgress(progress);
        row.setStatus(status);
        row.setNote(note);
        row.setCreatedBy(current.getName());
        updateMapper.insert(row);
    }

    private int normalizeProgress(String status, Integer progress) {
        if ("done".equals(status)) {
            return 100;
        }
        int value = progress == null ? 0 : progress;
        if (value < 0 || value > 100) {
            throw new BusinessException("進度必須在 0-100 之間");
        }
        return value;
    }

    private void validateCategoryAndStatus(String category, String status) {
        if (StringUtils.hasText(status) && !STATUSES.contains(status)) {
            throw new BusinessException("不支援的狀態");
        }
        if (StringUtils.hasText(category) && !categoryLabels().containsKey(category.trim())) {
            throw new BusinessException("分類不在任何啟用模板的詞表中");
        }
    }

    /**
     * 工时取值校验：null=不改动；负数与超上限一律拒绝。
     * <p>与 create/update/progress 三条写路径共用，避免「行内能存、编辑页存不下」的口径分裂。
     */
    private java.math.BigDecimal requireWorkHours(java.math.BigDecimal hours) {
        if (hours == null) {
            return null;
        }
        if (hours.signum() < 0 || hours.compareTo(MAX_WORK_HOURS_PER_ITEM) > 0) {
            throw new BusinessException("工時需在 0 ~ " + MAX_WORK_HOURS_PER_ITEM.stripTrailingZeros().toPlainString() + " 小時之間");
        }
        return hours.setScale(1, java.math.RoundingMode.HALF_UP);
    }

    private String requireTitle(String title) {
        String trimmed = title == null ? "" : title.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessException("標題不能為空");
        }
        if (trimmed.length() > CpmConstants.TITLE_MAX) {
            throw new BusinessException("標題最長 " + CpmConstants.TITLE_MAX + " 字");
        }
        return trimmed;
    }

    private LocalDate parseDateOrToday(String dateStr) {
        if (!StringUtils.hasText(dateStr)) {
            return periods.today();
        }
        return LocalDate.parse(dateStr);
    }

    /** 启用模板词表并集：key→显示名（AI 白名单与条目校验同源）。 */
    Map<String, String> categoryLabels() {
        Map<String, String> labels = new java.util.LinkedHashMap<>();
        for (CpmTemplate t : templateService.enabledTemplates()) {
            List<CpmDto.CategoryDef> cats = JsonUtils.parseList(t.getCategoriesJson(), CpmDto.CategoryDef.class);
            if (cats != null) {
                for (CpmDto.CategoryDef c : cats) {
                    if (StringUtils.hasText(c.getKey())) {
                        labels.putIfAbsent(c.getKey().trim(), StringUtils.hasText(c.getLabel()) ? c.getLabel().trim() : c.getKey().trim());
                    }
                }
            }
        }
        labels.putIfAbsent("general", "通用");
        return labels;
    }

    /** 有认定记录的条目 id（徽章口径：本人收到的、指向 item 的认定）。 */
    private Set<Long> recognizedItemIds(long userId) {
        Set<Long> ids = new HashSet<>();
        recognitionMapper.listArchive(userId).forEach(row -> {
            if ("item".equals(String.valueOf(row.get("target_type")))) {
                Object targetId = row.get("target_id");
                if (targetId instanceof Number n) {
                    ids.add(n.longValue());
                }
            }
        });
        return ids;
    }

    CpmDto.ItemVO toItemVO(CpmItem item, Map<String, String> labels) {
        CpmDto.ItemVO vo = new CpmDto.ItemVO();
        vo.setId(item.getId());
        vo.setTitle(item.getTitle());
        vo.setDetail(item.getDetail());
        vo.setCategory(item.getCategory());
        vo.setCategoryLabel(labels.getOrDefault(item.getCategory(), item.getCategory()));
        vo.setStatus(item.getStatus());
        vo.setProgress(item.getProgress());
        vo.setWorkDate(item.getWorkDate() == null ? null : item.getWorkDate().toString());
        vo.setWorkHours(item.getWorkHours());
        vo.setSourceType(item.getSourceType());
        vo.setSourceRef(item.getSourceRef());
        vo.setSourceLabel(item.getSourceLabel());
        vo.setTemplateKey(item.getTemplateKey());
        vo.setVersion(item.getVersion());
        vo.setRecognized(false);
        return vo;
    }

    private static String trimOrNull(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > max) {
            throw new BusinessException("內容超過長度上限 " + max);
        }
        return trimmed;
    }
}
