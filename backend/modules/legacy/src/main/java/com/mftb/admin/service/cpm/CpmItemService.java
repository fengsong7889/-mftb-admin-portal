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
import com.mftb.admin.entity.CpmTimeEntry;
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

    /** 取值白名单一律引用常量集合：DDL 的 CHECK 由同一集合拼出，两处不可能各写一份 */
    private static final java.util.Set<String> STATUSES = CpmConstants.ITEM_STATUSES;
    private static final java.util.Set<String> SOURCE_TYPES = CpmConstants.SOURCE_TYPES;
    /**
     * 工时上限（小时）：列是 DECIMAL(4,1)，物理上限 999.9；这里取一个远高于真实投入的整数，
     * 目的只是把「手滑多打一个 0」挡在写库之前——工时仅供分布统计，不参与任何评价。
     */
    private static final java.math.BigDecimal MAX_WORK_HOURS_PER_ITEM = new java.math.BigDecimal("200.0");

    private final CpmItemMapper itemMapper;
    private final CpmItemUpdateMapper updateMapper;
    private final CpmRecognitionMapper recognitionMapper;
    /** 时段读写统一走本域服务：条目侧只取实体，映射 VO 的方法只有一份 */
    private final CpmTimeEntryService timeEntryService;
    private final CpmTemplateService templateService;
    private final CpmPeriods periods;
    private final CpmAccessGuard guard;
    /** 进度写入后的 RDM 回写：只依赖 Mapper 与跨域端口，与本类无相互依赖，直接进构造器 */
    private final CpmRdmSyncService rdmSyncService;

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
        // 当日时段一次取回后按条目分组：逐条目再查会把「打开日视图」变成 N+1 请求风暴
        Map<Long, List<CpmTimeEntry>> segmentsOfDay = new java.util.LinkedHashMap<>();
        timeEntryService.listOnDate(current.getId(), date)
                .forEach(segment -> segmentsOfDay
                        .computeIfAbsent(segment.getItemId(), k -> new ArrayList<>()).add(segment));
        itemMapper.listActiveOn(current.getId(), date).forEach(item -> {
            CpmDto.ItemVO iv = toItemVO(item, labels);
            iv.setRecognized(recognized.contains(item.getId()));
            List<CpmTimeEntry> own = segmentsOfDay.getOrDefault(item.getId(), List.of());
            iv.setDayMinutes(own.stream().mapToInt(CpmTimeEntry::getDurationMinutes).sum());
            vo.getItems().add(iv);
        });
        itemMapper.listCarryCandidates(current.getId(), date)
                .forEach(item -> vo.getCarryCandidates().add(toItemVO(item, labels)));
        // 时段明细单独随视图返回：条目行要显示「今天几段」，但不该为每个条目各发一次请求
        segmentsOfDay.forEach((itemId, rows) -> {
            CpmDto.ItemTimeVO time = new CpmDto.ItemTimeVO();
            time.setItemId(itemId);
            time.setSegments(timeEntryService.toVOList(rows));
            time.setDayMinutes(rows.stream().mapToInt(CpmTimeEntry::getDurationMinutes).sum());
            vo.getTimes().add(time);
        });
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
        // 任务级关联才落 rdm_task_id：需求级没有可写的进度真值（RDM 日报明确不用 requirement.progress）
        if (CpmConstants.SOURCE_RDM_TASK.equals(sourceType)) {
            item.setRdmTaskId(requireTaskId(form.getSourceRef()));
            // 导入即默认允许回写，除非调用方显式关掉；总闸关闭时本列只是「意愿」，不产生副作用
            item.setRdmSyncEnabled(Boolean.FALSE.equals(form.getRdmSyncEnabled()) ? 0 : 1);
            item.setRdmSyncState(CpmConstants.SYNC_PENDING);
        } else {
            item.setRdmSyncEnabled(0);
        }
        item.setWorkHoursSource(item.getWorkHours() == null || item.getWorkHours().signum() <= 0 ? "none" : "manual");
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
        /*
         * RDM 回写放在本事务最后一步，但失败绝不回滚上面的写入：过程层记录不该被交付层规则拒绝掉。
         * 反过来也不能吞掉结果——状态一律落 rdm_sync_* 四列，界面把原因显示出来。
         * 注意这里传的是「写入前」的 item（含 preStatus 与上次已知进度），
         * unblock 与 progress 的区分、以及乐观锁的 expectedProgress 基准都依赖它。
         */
        rdmSyncService.syncAfterProgress(item, form.getStatus(), progress, form.getNote(), current);
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

    /**
     * 任务级来源的 id 校验：{@code source_ref} 必须能解析成任务 id。
     *
     * <p>不解析就直接写 {@code rdm_task_id}，会让「界面上关联成功、回写时才发现是脏值」
     * 变成必然发生的一次 500；而且脏 ref 还会通过唯一键占住这个来源对象，让正确的那次导入被说成重复。
     */
    private static Long requireTaskId(String sourceRef) {
        if (!StringUtils.hasText(sourceRef)) {
            throw new BusinessException("RDM 任務關聯缺少任務 ID");
        }
        try {
            long taskId = Long.parseLong(sourceRef.trim());
            if (taskId <= 0) {
                throw new NumberFormatException();
            }
            return taskId;
        } catch (NumberFormatException e) {
            throw new BusinessException("RDM 任務 ID 格式不正確");
        }
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
        /* 阶段三：时间与回写都是「读列即得」的派生值，界面不再自己算第二遍 */
        vo.setFirstStartAt(text(item.getFirstStartAt()));
        vo.setLastEndAt(text(item.getLastEndAt()));
        vo.setWorkHoursSource(item.getWorkHoursSource());
        vo.setTotalMinutes(item.getWorkHours() == null || item.getWorkHours().signum() <= 0
                ? null
                : item.getWorkHours().multiply(java.math.BigDecimal.valueOf(60))
                        .setScale(0, java.math.RoundingMode.HALF_UP).intValue());
        vo.setRdmSync(rdmSyncOf(item));
        return vo;
    }

    /**
     * 条目上的回写状态。
     *
     * <p>没有 taskId 就返回 null 而不是一个 pending 空壳：需求级/手工/会议来源的条目
     * 永远不可能回写，给它们一个「未回寫」徽标等于制造一个点不动还一直在的假状态。
     */
    private static CpmDto.RdmSyncVO rdmSyncOf(CpmItem item) {
        if (item.getRdmTaskId() == null) {
            return null;
        }
        CpmDto.RdmSyncVO sync = new CpmDto.RdmSyncVO();
        sync.setEnabled(Integer.valueOf(1).equals(item.getRdmSyncEnabled()));
        sync.setState(item.getRdmSyncState() == null ? CpmConstants.SYNC_PENDING : item.getRdmSyncState());
        sync.setMessage(item.getRdmSyncMessage());
        sync.setSyncedAt(text(item.getRdmSyncedAt()));
        sync.setTaskId(item.getRdmTaskId());
        sync.setRdmProgress(item.getRdmProgressSeen());
        return sync;
    }

    private static String text(java.time.LocalDateTime value) {
        return value == null ? null : value.withNano(0).toString().replace('T', ' ');
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
