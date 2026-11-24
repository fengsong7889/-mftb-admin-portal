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
import com.mftb.admin.dto.CpmWorklogDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmItemUpdate;
import com.mftb.admin.entity.CpmWorkCalendar;
import com.mftb.admin.entity.CpmWorklogGroup;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmItemUpdateMapper;
import com.mftb.admin.mapper.CpmWorkCalendarMapper;
import com.mftb.admin.mapper.CpmWorklogGroupMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 工作台账服务：工作項 × 子任務（= biz_cpm_item）× 计划排期 × 进度流水 × 工时口径日历。
 *
 * <p>三条硬口径：
 * 1) 归属人一律取登录人，表单没有身份字段位置；未分组条目汇进虚拟分组展示，
 *    不让「昨天记的一行」在页面上凭空消失；
 * 2) 子任务就是条目：台账不再另立任务表，日报/汇报/认定继续读同一张 biz_cpm_item，
 *    两处事实必然分叉是本域反复验证过的教训；
 * 3) 工时由服务端按日历算：耗时决定汇报数字与推送内容，「页面算一套、通知算一套」
 *    在这里从一开始就断掉。
 *
 * <p>并发：条目更新走 version 乐观锁（影响 0 行=冲突，转「请刷新重试」）；
 * 工作項标题、日历日期都靠唯一键兜重复，而不是靠前端按钮禁用。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmWorklogService {

    /** 虚拟分组 id：未分组条目（旧的日报流水）在台账里汇到这一行下 */
    public static final long UNGROUPED_ID = 0L;
    /** 台账一次读取的日历窗口：向前 400 天足够覆盖「全部」档的历史排期 */
    private static final int READ_BACK_DAYS = 400;

    private final CpmWorklogGroupMapper groupMapper;
    private final CpmItemMapper itemMapper;
    private final CpmItemUpdateMapper updateMapper;
    private final CpmWorkCalendarMapper calendarMapper;
    private final CpmWorkdays workdays;
    private final CpmAccessGuard guard;
    /** 「今天」只从业务时区取：服务器时区与业务时区不一致时，跨零点用户会被算进昨天 */
    private final CpmPeriods periods;

    /* ==================== 读取 ==================== */

    /**
     * 一次台账读取：分组 + 子任务 + 区间日历 + 服务端统计。
     *
     * @param startStr 查询区间起（可空=全部时间）
     * @param endStr   查询区间止（可空）
     */
    public CpmWorklogDto.LedgerVO ledger(String startStr, String endStr) {
        SysUser current = guard.currentUser();
        LocalDate from = parseDate(startStr);
        LocalDate to = parseDate(endStr);
        if (from != null && to != null && to.isBefore(from)) {
            throw new BusinessException("查询区间的结束日期早于开始日期");
        }
        LocalDate readFrom = from != null ? from : currentPeriodAnchor().minusDays(READ_BACK_DAYS);
        LocalDate readTo = to != null ? to : currentPeriodAnchor();
        CpmWorkdays.Ledger calendar = workdays.load(current.getId(), readFrom, readTo);

        Map<Long, List<CpmItem>> byGroup = new LinkedHashMap<>();
        List<CpmItem> ungrouped = new ArrayList<>();
        for (CpmItem item : itemMapper.listLedger(current.getId())) {
            if (item.getGroupId() == null || item.getGroupId() == UNGROUPED_ID) {
                ungrouped.add(item);
            } else {
                byGroup.computeIfAbsent(item.getGroupId(), k -> new ArrayList<>()).add(item);
            }
        }
        Map<Long, List<CpmWorklogDto.HistoryVO>> trails = trails(current.getId(), readFrom, readTo);

        CpmWorklogDto.LedgerVO vo = new CpmWorklogDto.LedgerVO();
        vo.setRangeStart(from == null ? null : from.toString());
        vo.setRangeEnd(to == null ? null : to.toString());
        for (CpmWorklogGroup group : groupMapper.listMine(current.getId())) {
            vo.getGroups().add(toGroupVO(group, byGroup.getOrDefault(group.getId(), List.of()),
                    calendar, from, to, trails));
        }
        if (!ungrouped.isEmpty()) {
            CpmWorklogDto.GroupVO virtual = new CpmWorklogDto.GroupVO();
            virtual.setId(UNGROUPED_ID);
            virtual.setTitle(null);
            virtual.setHue(0);
            virtual.setSortOrder(Integer.MAX_VALUE);
            virtual.setTasks(toTaskVOs(ungrouped, calendar, from, to, trails));
            vo.getGroups().add(virtual);
        }
        vo.setHolidays(calendar.datesOfType(CpmConstants.DAY_TYPE_HOLIDAY, readFrom, readTo));
        vo.setMakeups(calendar.datesOfType(CpmConstants.DAY_TYPE_MAKEUP, readFrom, readTo));
        vo.setCompOffs(calendar.datesOfType(CpmConstants.DAY_TYPE_COMP_OFF, readFrom, readTo));
        vo.setLeaves(calendar.datesOfType(CpmConstants.DAY_TYPE_LEAVE, readFrom, readTo));
        vo.setTotals(totals(vo, calendar, from, to));
        return vo;
    }

    /* ==================== 工作項 ==================== */

    @Transactional
    public CpmWorklogDto.GroupVO createGroup(CpmWorklogDto.GroupForm form) {
        SysUser current = guard.currentUser();
        List<CpmWorklogGroup> mine = groupMapper.listMine(current.getId());
        CpmWorklogGroup entity = new CpmWorklogGroup();
        entity.setUserId(current.getId());
        entity.setTitle(requireTitle(form.getTitle()));
        entity.setHue(form.getHue() == null ? mine.size() % (CpmConstants.GROUP_HUE_MAX + 1)
                : Math.max(0, Math.min(CpmConstants.GROUP_HUE_MAX, form.getHue())));
        entity.setSortOrder(mine.size());
        entity.setRdmRequirementId(form.getRdmRequirementId());
        entity.setDeleted(0);
        // 审计列必须服务层显式落值：实体上的 @TableField(fill) 只决定「这列进不进 INSERT」，
        // 而全局 MetaObjectHandler（MyBatisPlusConfig）只填 createdAt/updatedAt 两个时间列。
        // createdBy/updatedBy 留空就是把 NULL 写进 NOT NULL 列，新增直接撞约束报「數據庫操作異常」
        // （与 CpmItemService 同口径；身份取自 JWT 解出的 current，不给前端可写位置）
        entity.setCreatedBy(current.getName());
        entity.setUpdatedBy(current.getName());
        try {
            groupMapper.insert(entity);
        } catch (DuplicateKeyException e) {
            // 同名工作項只允许一个：双击/重复导入都撞这条唯一键，而不是长出两行一样的主线
            throw new BusinessException("已存在同名工作項，请换个标题或直接使用它");
        }
        return groupVO(entity);
    }

    @Transactional
    public CpmWorklogDto.GroupVO updateGroup(long id, CpmWorklogDto.GroupForm form) {
        SysUser current = guard.currentUser();
        CpmWorklogGroup group = requireOwnedGroup(id, current);
        group.setTitle(requireTitle(form.getTitle()));
        if (form.getHue() != null) {
            group.setHue(Math.max(0, Math.min(CpmConstants.GROUP_HUE_MAX, form.getHue())));
        }
        if (form.getRdmRequirementId() != null) {
            group.setRdmRequirementId(form.getRdmRequirementId());
        }
        // updateById 会把加载出来的旧 updated_by 原样写回，不显式改就是「谁建的就永远是谁改的」
        group.setUpdatedBy(current.getName());
        try {
            groupMapper.updateById(group);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("已存在同名工作項，请换个标题");
        }
        return groupVO(group);
    }

    /**
     * 删除工作項：连同其子任务一起软删。
     *
     * <p>不级联就会留下一堆 group_id 指向已删分组的孤儿排期——它们既不在原分组里显示，
     * 也不会进虚拟分组，等于用户的排期事实被静默丢弃。软删保留行，撤销能原样恢复。
     */
    @Transactional
    public void deleteGroup(long id) {
        SysUser current = guard.currentUser();
        CpmWorklogGroup group = requireOwnedGroup(id, current);
        int tasks = itemMapper.softDeleteByGroup(group.getId(), current.getId(), current.getName());
        groupMapper.softDelete(group.getId(), current.getId(), current.getName());
        log.info("工作項已删除: id={} 连带子任务 {} 条", group.getId(), tasks);
    }

    @Transactional
    public void restoreGroup(long id) {
        SysUser current = guard.currentUser();
        if (groupMapper.restore(id, current.getId(), current.getName()) == 0) {
            throw new BusinessException("工作項不存在或不属于本人");
        }
        itemMapper.restoreByGroup(id, current.getId(), current.getName());
    }

    /** 行序落库：前端拖拽给出的顺序就是事实，一次批量写回，逐行只影响本人那几行。 */
    @Transactional
    public void reorderGroups(List<Long> ids) {
        SysUser current = guard.currentUser();
        if (ids == null || ids.isEmpty()) {
            return;
        }
        int index = 0;
        for (Long id : ids) {
            if (id != null && id != UNGROUPED_ID) {
                groupMapper.updateSort(id, current.getId(), index, current.getName());
            }
            index++;
        }
    }

    /* ==================== 子任务（= 条目） ==================== */

    @Transactional
    public CpmWorklogDto.TaskVO createTask(CpmWorklogDto.TaskForm form) {
        SysUser current = guard.currentUser();
        LocalDate start = parseDate(form.getStart());
        LocalDate end = parseDate(form.getEnd());
        validateRange(start, end);
        int progress = clampProgress(form.getProgress());
        String planType = planTypeOrThrow(form.getPlanType());

        CpmItem item = new CpmItem();
        item.setUserId(current.getId());
        item.setTitle(requireTitle(form.getTitle()));
        item.setCategory(CpmConstants.LEDGER_CATEGORY);
        item.setStatus(statusOf(progress, start));
        item.setProgress(progress);
        // 归属日取计划起日，未排期取今天：汇报按 work_date 分组，两处口径必须同一句话
        item.setWorkDate(start != null ? start : currentPeriodAnchor());
        item.setSourceType(CpmConstants.SOURCE_MANUAL);
        item.setGroupId(resolveGroupId(form.getGroupId(), current));
        item.setPlanStart(start);
        item.setPlanEnd(end);
        item.setPlanType(planType);
        item.setInsertedAt(insertedAtOf(planType, form.getInsertedAt(), currentPeriodAnchor()));
        applyNote(item, form.getNote());
        item.setVersion(0);
        item.setDeleted(0);
        item.setCreatedBy(current.getName());
        item.setUpdatedBy(current.getName());
        itemMapper.insert(item);
        appendTrail(item, current);
        return taskVO(item, workdays.load(current.getId(), itemPeriodFrom(item), currentPeriodAnchor().plusYears(1)),
                null, null, Map.of());
    }

    @Transactional
    public CpmWorklogDto.TaskVO updateTask(long id, CpmWorklogDto.TaskForm form) {
        SysUser current = guard.currentUser();
        CpmItem item = guard.requireOwnedItemForUpdate(id, current);
        LocalDate start = parseDate(form.getStart());
        LocalDate end = parseDate(form.getEnd());
        if (start == null) {
            start = item.getPlanStart();
        }
        if (end == null) {
            end = item.getPlanEnd();
        }
        validateRange(start, end);
        if (start != null && end != null && end.isBefore(start)) {
            // 只改开始日把结束日甩到后面时，如实对齐而不是报错后各存各的
            end = start;
        }
        int progress = form.getProgress() == null ? nullOrZero(item.getProgress()) : clampProgress(form.getProgress());
        String planType = planTypeOrThrow(form.getPlanType() == null ? item.getPlanType() : form.getPlanType());
        LocalDate insertedAt = insertedAtOf(planType, form.getInsertedAt(), currentPeriodAnchor());
        String noteHtml = null;
        String noteText = null;
        if (form.getNote() != null) {
            noteHtml = CpmNoteHtml.sanitize(form.getNote());
            noteText = CpmNoteHtml.toPlainText(form.getNote());
        }
        int affected = itemMapper.updateLedgerFields(
                item.getId(), current.getId(), item.getVersion(),
                form.getGroupId() == null ? null : resolveGroupId(form.getGroupId(), current),
                form.getTitle() == null ? null : requireTitle(form.getTitle()),
                null, start, end, start == null, end == null,
                planType, insertedAt, CpmConstants.PLAN_TYPE_PLANNED.equals(planType),
                statusOf(progress, start), progress, noteHtml, noteText,
                current.getUsername());
        if (affected == 0) {
            throw new BusinessException("記錄已被更新，請刷新後重試");
        }
        if (form.getProgress() != null && form.getProgress() != nullOrZero(item.getProgress())) {
            CpmItem fresh = itemMapper.selectAliveById(id);
            appendTrail(fresh, current);
            if (fresh.getPlanStart() != null && !fresh.getPlanStart().equals(item.getWorkDate())) {
                itemMapper.updateWorkDate(id, current.getId(), fresh.getPlanStart(), current.getUsername());
            }
        }
        return taskVO(itemMapper.selectAliveById(id),
                workdays.load(current.getId(), start != null ? start : itemPeriodFrom(item),
                        currentPeriodAnchor().plusYears(1)), null, null, Map.of());
    }

    @Transactional
    public void deleteTask(long id) {
        SysUser current = guard.currentUser();
        CpmItem item = guard.requireOwnedItem(id, current);
        itemMapper.softDeleteOwned(item.getId(), current.getId(), current.getName());
    }

    @Transactional
    public void restoreTask(long id) {
        SysUser current = guard.currentUser();
        if (itemMapper.restoreOwned(id, current.getId(), current.getName()) == 0) {
            throw new BusinessException("該記錄不是本人可恢復的刪除項");
        }
    }

    /* ==================== 工时口径日历 ==================== */

    /**
     * 登记某天的口径。
     *
     * <p>使用侧永远只写本人作用域：法定假日/补班的全局名单由治理侧维护，
     * 让任意员工点一下就能改全员工时，等于把全局数字交给最后一个点击的人。
     * 本人名单同日覆盖全局，所以个人「补班」能把某个法定假日算进自己的工时，
     * 而个人「请假」能把普通工作日扣掉。
     */
    @Transactional
    public void setCalendar(CpmWorklogDto.CalendarForm form) {
        SysUser current = guard.currentUser();
        LocalDate date = parseDate(form.getDate());
        if (date == null) {
            throw new BusinessException("日期格式应为 yyyy-MM-dd");
        }
        CpmWorkCalendar existing = calendarMapper.selectOne(current.getId(), date);
        String type = form.getType();
        if (type == null || type.isBlank()) {
            if (existing != null) {
                calendarMapper.deleteOwned(existing.getId(), current.getId());
            }
            return;
        }
        if (!CpmConstants.DAY_TYPES.contains(type)) {
            throw new BusinessException("不支持的日期类型");
        }
        if (existing == null) {
            CpmWorkCalendar row = new CpmWorkCalendar();
            row.setUserId(current.getId());
            row.setWorkDate(date);
            row.setDayType(type);
            row.setNote(trim(form.getNote(), CpmConstants.SYNC_MESSAGE_MAX));
            row.setDeleted(0);
            row.setCreatedBy(current.getName());
            row.setUpdatedBy(current.getName());
            calendarMapper.insert(row);
            return;
        }
        existing.setDayType(type);
        existing.setNote(trim(form.getNote(), CpmConstants.SYNC_MESSAGE_MAX));
        existing.setUpdatedBy(current.getName());
        calendarMapper.updateById(existing);
    }

    /**
     * 清空本人某一年的口径登记。
     *
     * <p>只删本人行：全局法定名单属于所有人，不能因为某个人点了「清空本年」
     * 就把全公司的节假日名单抹掉。
     */
    @Transactional
    public int clearCalendarYear(int year) {
        SysUser current = guard.currentUser();
        if (year < 1970 || year > 2999) {
            throw new BusinessException("年份不合法");
        }
        return calendarMapper.deleteOwnedYear(current.getId(), LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
    }

    /* ==================== 一次性导入本地台账 ==================== */

    /**
     * 把浏览器本地台账导入服务端（迁移通道）。
     *
     * <p>导入是幂等的：同名工作項跳过并计数，不覆盖用户后来在服务端改过的内容——
     * 「导入」一旦变成「覆盖」，用户第二次点它就会把自己这几天的编辑抹掉。
     */
    @Transactional
    public CpmWorklogDto.ImportResultVO importLocal(CpmWorklogDto.ImportForm form) {
        SysUser current = guard.currentUser();
        CpmWorklogDto.ImportResultVO result = new CpmWorklogDto.ImportResultVO();
        if (form.getGroups() == null || form.getGroups().isEmpty()) {
            return result;
        }
        if (form.getGroups().size() > CpmConstants.IMPORT_GROUP_MAX) {
            throw new BusinessException("一次导入的工作項数量超过上限");
        }
        Map<String, Long> existingTitles = new LinkedHashMap<>();
        groupMapper.listMine(current.getId()).forEach(g -> existingTitles.put(g.getTitle(), g.getId()));

        for (CpmWorklogDto.ImportGroup group : form.getGroups()) {
            String title = requireTitle(group.getTitle());
            Long groupId = existingTitles.get(title);
            if (groupId == null) {
                CpmWorklogGroup entity = new CpmWorklogGroup();
                entity.setUserId(current.getId());
                entity.setTitle(title);
                entity.setHue(group.getHue() == null ? 0
                        : Math.max(0, Math.min(CpmConstants.GROUP_HUE_MAX, group.getHue())));
                entity.setSortOrder(groupMapper.listMine(current.getId()).size());
                entity.setDeleted(0);
                entity.setCreatedBy(current.getName());
                entity.setUpdatedBy(current.getName());
                groupMapper.insert(entity);
                groupId = entity.getId();
                existingTitles.put(title, groupId);
                result.setGroups(result.getGroups() + 1);
            } else {
                result.setSkippedGroups(result.getSkippedGroups() + 1);
            }
            List<CpmWorklogDto.ImportTask> tasks = group.getTasks() == null ? List.of() : group.getTasks();
            if (tasks.size() > CpmConstants.IMPORT_TASK_MAX_PER_GROUP) {
                throw new BusinessException("单个工作項的子任务数量超过上限");
            }
            for (CpmWorklogDto.ImportTask task : tasks) {
                if (importTask(current, groupId, task)) {
                    result.setTasks(result.getTasks() + 1);
                } else {
                    result.setSkippedTasks(result.getSkippedTasks() + 1);
                }
            }
        }
        result.setCalendarDays(importCalendar(current, form));
        log.info("本地台账导入完成: 用户={} 新建工作項 {} 跳过 {} 新建子任务 {} 跳过 {} 日历 {} 天",
                current.getId(), result.getGroups(), result.getSkippedGroups(),
                result.getTasks(), result.getSkippedTasks(), result.getCalendarDays());
        return result;
    }

    /* ==================== 内部 ==================== */

    private boolean importTask(SysUser current, long groupId, CpmWorklogDto.ImportTask task) {
        LocalDate start = parseDate(task.getStart());
        LocalDate end = parseDate(task.getEnd());
        validateRange(start, end);
        String title = requireTitle(task.getTitle());
        // 同工作項下同名同起日的子任务视为已导入：重复点按钮不该长出两行一样的事实
        boolean already = itemMapper.listLedger(current.getId()).stream().anyMatch(i ->
                i.getGroupId() != null && i.getGroupId() == groupId
                        && title.equals(i.getTitle())
                        && java.util.Objects.equals(i.getPlanStart(), start));
        if (already) {
            return false;
        }
        int progress = clampProgress(task.getProgress());
        String planType = planTypeOrThrow(task.getPlanType());
        CpmItem item = new CpmItem();
        item.setUserId(current.getId());
        item.setTitle(title);
        item.setCategory(CpmConstants.LEDGER_CATEGORY);
        item.setStatus(statusOf(progress, start));
        item.setProgress(progress);
        item.setWorkDate(start != null ? start : currentPeriodAnchor());
        item.setSourceType(CpmConstants.SOURCE_MANUAL);
        item.setGroupId(groupId);
        item.setPlanStart(start);
        item.setPlanEnd(end);
        item.setPlanType(planType);
        item.setInsertedAt(insertedAtOf(planType, task.getInsertedAt(), currentPeriodAnchor()));
        applyNote(item, task.getNote());
        item.setVersion(0);
        item.setDeleted(0);
        item.setCreatedBy(current.getName());
        item.setUpdatedBy(current.getName());
        itemMapper.insert(item);
        if (task.getHistory() != null && !task.getHistory().isEmpty()) {
            // 流水原样搬：汇报的期初/期末快照依赖它，只补一条今天会让历史进度凭空变成 0
            for (CpmWorklogDto.HistoryVO h : task.getHistory()) {
                LocalDate at = parseDate(h.getAt());
                if (at == null) {
                    continue;
                }
                CpmItemUpdate row = new CpmItemUpdate();
                row.setItemId(item.getId());
                row.setUpdateDate(at);
                row.setProgress(clampProgress(h.getProgress()));
                row.setStatus(statusOf(row.getProgress(), at));
                row.setCreatedBy(current.getName());
                updateMapper.insert(row);
            }
        } else {
            appendTrail(item, current);
        }
        return true;
    }

    private int importCalendar(SysUser current, CpmWorklogDto.ImportForm form) {
        int saved = 0;
        for (Map.Entry<String, String> entry : calendarEntries(form).entrySet()) {
            LocalDate date = parseDate(entry.getKey());
            if (date == null || !CpmConstants.DAY_TYPES.contains(entry.getValue())) {
                continue;
            }
            if (calendarMapper.selectOne(current.getId(), date) != null) {
                continue;
            }
            CpmWorkCalendar row = new CpmWorkCalendar();
            row.setUserId(current.getId());
            row.setWorkDate(date);
            row.setDayType(entry.getValue());
            row.setDeleted(0);
            row.setCreatedBy(current.getName());
            row.setUpdatedBy(current.getName());
            calendarMapper.insert(row);
            saved++;
        }
        return saved;
    }

    /** 四类名单合成「日期→类型」，顺序按 holidays→compOff→leave→makeup，与前端判定优先级一致 */
    private Map<String, String> calendarEntries(CpmWorklogDto.ImportForm form) {
        Map<String, String> map = new LinkedHashMap<>();
        putAll(map, form.getHolidays(), CpmConstants.DAY_TYPE_HOLIDAY);
        putAll(map, form.getCompOffs(), CpmConstants.DAY_TYPE_COMP_OFF);
        putAll(map, form.getLeaves(), CpmConstants.DAY_TYPE_LEAVE);
        putAll(map, form.getMakeups(), CpmConstants.DAY_TYPE_MAKEUP);
        return map;
    }

    private void putAll(Map<String, String> map, List<String> dates, String type) {
        if (dates == null) {
            return;
        }
        dates.stream().filter(d -> d != null && !d.isBlank()).forEach(d -> map.putIfAbsent(d, type));
    }

    private Map<Long, List<CpmWorklogDto.HistoryVO>> trails(long userId, LocalDate from, LocalDate to) {
        Map<Long, List<CpmWorklogDto.HistoryVO>> map = new LinkedHashMap<>();
        updateMapper.listByUserAndRange(userId, from, to).forEach(row -> map
                .computeIfAbsent(row.getItemId(), k -> new ArrayList<>())
                .add(new CpmWorklogDto.HistoryVO(row.getUpdateDate().toString(),
                        row.getProgress() == null ? 0 : row.getProgress())));
        return map;
    }

    private CpmWorklogDto.GroupVO toGroupVO(CpmWorklogGroup group, List<CpmItem> tasks,
                                            CpmWorkdays.Ledger calendar, LocalDate from, LocalDate to,
                                            Map<Long, List<CpmWorklogDto.HistoryVO>> trails) {
        CpmWorklogDto.GroupVO vo = groupVO(group);
        vo.setTasks(toTaskVOs(tasks, calendar, from, to, trails));
        return vo;
    }

    private CpmWorklogDto.GroupVO groupVO(CpmWorklogGroup group) {
        CpmWorklogDto.GroupVO vo = new CpmWorklogDto.GroupVO();
        vo.setId(group.getId());
        vo.setTitle(group.getTitle());
        vo.setHue(group.getHue() == null ? 0 : group.getHue());
        vo.setSortOrder(group.getSortOrder() == null ? 0 : group.getSortOrder());
        vo.setRdmRequirementId(group.getRdmRequirementId());
        return vo;
    }

    private List<CpmWorklogDto.TaskVO> toTaskVOs(List<CpmItem> items, CpmWorkdays.Ledger calendar,
                                                 LocalDate from, LocalDate to,
                                                 Map<Long, List<CpmWorklogDto.HistoryVO>> trails) {
        List<CpmWorklogDto.TaskVO> out = new ArrayList<>();
        for (CpmItem item : items) {
            out.add(taskVO(item, calendar, from, to, trails));
        }
        return out;
    }

    private CpmWorklogDto.TaskVO taskVO(CpmItem item, CpmWorkdays.Ledger calendar,
                                        LocalDate from, LocalDate to,
                                        Map<Long, List<CpmWorklogDto.HistoryVO>> trails) {
        CpmWorklogDto.TaskVO vo = new CpmWorklogDto.TaskVO();
        vo.setId(item.getId());
        vo.setGroupId(item.getGroupId() == null ? UNGROUPED_ID : item.getGroupId());
        vo.setTitle(item.getTitle());
        vo.setStart(item.getPlanStart() == null ? null : item.getPlanStart().toString());
        vo.setEnd(item.getPlanEnd() == null ? null : item.getPlanEnd().toString());
        vo.setProgress(item.getProgress() == null ? 0 : item.getProgress());
        vo.setNote(item.getNoteHtml() == null ? "" : item.getNoteHtml());
        vo.setPlanType(item.getPlanType() == null ? CpmConstants.PLAN_TYPE_PLANNED : item.getPlanType());
        vo.setInsertedAt(item.getInsertedAt() == null ? null : item.getInsertedAt().toString());
        vo.setHours(calendar == null ? 0 : calendar.hours(item.getPlanStart(), item.getPlanEnd()));
        vo.setWorkdays(calendar == null ? 0 : calendar.workdays(item.getPlanStart(), item.getPlanEnd()));
        vo.setPeriodHours(vo.getHours());
        if (from != null && to != null && calendar != null) {
            vo.setPeriodHours(calendar.hoursInPeriod(item.getPlanStart(), item.getPlanEnd(), from, to));
        }
        vo.setState(stateOf(item.getProgress(), item.getPlanStart()));
        vo.setSourceType(item.getSourceType());
        vo.setSourceRef(item.getSourceRef());
        vo.setRdmSyncEnabled(item.getRdmSyncEnabled());
        if (trails != null && item.getId() != null) {
            vo.setHistory(trails.getOrDefault(item.getId(), new ArrayList<>()));
        }
        return vo;
    }

    /** 统计与页面/汇报同一口径：有区间时完成时点按期内判定，与汇报的 doneAt 同源 */
    private CpmWorklogDto.TotalsVO totals(CpmWorklogDto.LedgerVO vo, CpmWorkdays.Ledger calendar,
                                          LocalDate from, LocalDate to) {
        CpmWorklogDto.TotalsVO t = new CpmWorklogDto.TotalsVO();
        int total = 0;
        int sumProgress = 0;
        for (CpmWorklogDto.GroupVO group : vo.getGroups()) {
            for (CpmWorklogDto.TaskVO task : group.getTasks()) {
                boolean inRange = from == null || (task.getStart() != null && task.getEnd() != null
                        && task.getStart().compareTo(to.toString()) <= 0
                        && task.getEnd().compareTo(from.toString()) >= 0);
                if (from != null && !inRange) {
                    continue;
                }
                total++;
                int progress = task.getProgress();
                sumProgress += progress;
                if (progress >= 100) {
                    t.setDone(t.getDone() + 1);
                } else if (task.getStart() == null) {
                    t.setBacklog(t.getBacklog() + 1);
                    t.setPending(t.getPending() + 1);
                } else if (progress > 0) {
                    t.setDoing(t.getDoing() + 1);
                } else {
                    t.setPending(t.getPending() + 1);
                }
                if (CpmConstants.PLAN_TYPE_INSERTED.equals(task.getPlanType())) {
                    t.setInserted(t.getInserted() + 1);
                }
                t.setHours(t.getHours() + task.getPeriodHours());
            }
        }
        t.setTotal(total);
        t.setAvgProgress(total == 0 ? 0 : Math.round((float) sumProgress / total));
        return t;
    }

    private CpmWorklogGroup requireOwnedGroup(long id, SysUser current) {
        CpmWorklogGroup group = groupMapper.selectAliveById(id);
        if (group == null || !current.getId().equals(group.getUserId())) {
            throw new BusinessException("工作項不存在或不属于本人");
        }
        return group;
    }

    private Long resolveGroupId(Long groupId, SysUser current) {
        if (groupId == null || groupId == UNGROUPED_ID) {
            return null;
        }
        requireOwnedGroup(groupId, current);
        return groupId;
    }

    /** 进度变更写一条流水（当天可多条，读取时取最后一笔）：汇报期初/期末快照的唯一来源 */
    private void appendTrail(CpmItem item, SysUser current) {
        CpmItemUpdate row = new CpmItemUpdate();
        row.setItemId(item.getId());
        row.setUpdateDate(currentPeriodAnchor());
        row.setProgress(item.getProgress() == null ? 0 : item.getProgress());
        row.setStatus(item.getStatus());
        row.setNote(null);
        row.setCreatedBy(current.getName());
        updateMapper.insert(row);
    }

    private void applyNote(CpmItem item, String note) {
        if (note == null) {
            return;
        }
        item.setNoteHtml(CpmNoteHtml.sanitize(note));
        item.setNoteText(CpmNoteHtml.toPlainText(note));
    }

    private static String statusOf(int progress, LocalDate start) {
        if (progress >= 100) {
            return CpmConstants.STATUS_DONE;
        }
        if (start == null) {
            return CpmConstants.STATUS_TODO;
        }
        return progress > 0 ? CpmConstants.STATUS_DOING : CpmConstants.STATUS_TODO;
    }

    private static String stateOf(Integer progress, LocalDate start) {
        int value = progress == null ? 0 : progress;
        if (value >= 100) {
            return CpmConstants.STATUS_DONE;
        }
        if (start == null) {
            return "plan";
        }
        return value > 0 ? CpmConstants.STATUS_DOING : CpmConstants.STATUS_TODO;
    }

    private LocalDate itemPeriodFrom(CpmItem item) {
        return item.getPlanStart() == null ? currentPeriodAnchor().minusDays(READ_BACK_DAYS) : item.getPlanStart();
    }

    /** 业务时区的今天：所有「今天」的判定都走 CpmPeriods，避免服务器时区把跨零点用户算进昨天 */
    private LocalDate currentPeriodAnchor() {
        return periods.today();
    }

    private static int nullOrZero(Integer value) {
        return value == null ? 0 : value;
    }

    private static int clampProgress(Integer progress) {
        if (progress == null) {
            return 0;
        }
        return Math.max(0, Math.min(100, progress));
    }

    private static String planTypeOrThrow(String planType) {
        if (planType == null || planType.isBlank()) {
            return CpmConstants.PLAN_TYPE_PLANNED;
        }
        if (!CpmConstants.PLAN_TYPES.contains(planType)) {
            throw new BusinessException("不支持的计划属性");
        }
        return planType;
    }

    private static LocalDate insertedAtOf(String planType, String insertedAt, LocalDate today) {
        if (!CpmConstants.PLAN_TYPE_INSERTED.equals(planType)) {
            return null;
        }
        LocalDate parsed = parseDate(insertedAt);
        return parsed != null ? parsed : today;
    }

    private static void validateRange(LocalDate start, LocalDate end) {
        if (start != null && end != null && end.isBefore(start)) {
            throw new BusinessException("結束日期不能早於開始日期");
        }
    }

    private static String requireTitle(String title) {
        String value = title == null ? "" : title.trim();
        if (value.isEmpty()) {
            throw new BusinessException("標題不能為空");
        }
        return trim(value, CpmConstants.TITLE_MAX);
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String cleaned = value.trim();
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max);
    }

    private static LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim().substring(0, Math.min(10, value.trim().length())));
        } catch (DateTimeParseException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }

}

