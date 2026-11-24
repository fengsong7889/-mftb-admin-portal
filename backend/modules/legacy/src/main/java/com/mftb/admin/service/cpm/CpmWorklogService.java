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
import com.mftb.admin.constant.MeetingConstants;
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
import com.mftb.admin.service.MeetingActionSource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

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
    /**
     * 会议域只读端口：导入会议后的「会被取消」对账只能走它。
     *
     * <p>不直接注入 MeetingBookingMapper：那会把 cpm 绑上会议表结构，会议改列时
     * 台账会静默错判哪些会已取消（同 CpmSourceService 走端口的理由）。
     */
    private final MeetingActionSource meetingActions;

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
        /**
         * 进度流水的读取窗口与查询窗口解耦。
         *
         * <p>流水在台账里有两个消费者，它们要的区间不是一个东西：汇报的期初/期末快照要的是
         * 「本期收在哪里」（必须跟查询窗口，否则周报数字会跟着筛选档飘）；而进度弹层里的
         * 逐周轨迹要的是「这条子任务从开始到现在推过几次」。两者共用查询窗口时，默认的
         * 「本週」档会把历史剪成一期——用户看到的不是「这周推了多少」，而是「只有本周」，
         * 那个功能就白做了。日历仍按 readFrom/readTo 取（工时口径属于本期）。
         */
        LocalDate historyFrom = currentPeriodAnchor().minusDays(READ_BACK_DAYS);
        LocalDate historyTo = currentPeriodAnchor();
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
        Map<Long, List<CpmWorklogDto.HistoryVO>> trails = trails(current.getId(), historyFrom, historyTo);
        // 导入后会议被取消的对账：必须在拼 VO 之前做，否则同一份台账里会一半新一一半旧
        reconcileCancelledMeetings(current);
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
        // 来源成对写入（導入會議）：只一半就当手工录入，否则留下有 type 无 ref 的孤儿关联
        applySource(item, form.getSourceType(), form.getSourceRef());
        item.setGroupId(resolveGroupId(form.getGroupId(), current));
        item.setPlanStart(start);
        item.setPlanEnd(end);
        item.setPlanType(planType);
        item.setInsertedAt(insertedAtOf(planType, form.getInsertedAt(), currentPeriodAnchor()));
        applyNote(item, form.getNote());
        applyHours(item, form.getHours(), false, current.getId());
        item.setVersion(0);
        item.setDeleted(0);
        item.setCreatedBy(current.getName());
        item.setUpdatedBy(current.getName());
        try {
            itemMapper.insert(item);
        } catch (DuplicateKeyException e) {
            // uk_cpm_item_source 是重复导入的唯一裁判：两个标签页同时点「導入」不该长出两行
            throw new BusinessException("該對象已導入過，請直接在台账中查找它");
        }
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
        // 耗时单独一条 UPDATE：它不参与乐观锁，也不能因为改个小时数就把正文的 version 推高
        if (form.getHours() != null || Boolean.TRUE.equals(form.getHoursCleared())) {
            CpmItem target = itemMapper.selectAliveById(id);
            applyHours(target, form.getHours(), Boolean.TRUE.equals(form.getHoursCleared()), current.getId());
            itemMapper.updateLedgerHours(id, current.getId(), target.getWorkHours(),
                    target.getWorkHours() == null, current.getName());
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
        /* 进度快照只在这里算一次：列/色条/弹层读服务端结果，汇报侧也复用同一工具，
           不再让前端与后端各写一套 progressAt。期初给回顾上下文，期末给列上显示值。 */
        List<CpmWorklogDto.HistoryVO> history = trails == null || item.getId() == null
                ? List.of() : trails.getOrDefault(item.getId(), List.of());
        List<CpmProgressSnapshots.Point> points = CpmProgressSnapshots.ofHistory(history);
        int currentProgress = vo.getProgress();
        vo.setPeriodStartProgress(from == null ? currentProgress : CpmProgressSnapshots.at(points, item, from));
        CpmProgressSnapshots.Snapshot snapshot = CpmProgressSnapshots.snapshot(
                points, item, from, to, currentPeriodAnchor());
        vo.setPeriodProgress(snapshot.value());
        vo.setPeriodProgressKind(snapshot.kind());
        vo.setLatestProgressAt(snapshot.latestAt() == null ? null : snapshot.latestAt().toString());
        vo.setNote(item.getNoteHtml() == null ? "" : item.getNoteHtml());
        vo.setPlanType(item.getPlanType() == null ? CpmConstants.PLAN_TYPE_PLANNED : item.getPlanType());
        vo.setInsertedAt(item.getInsertedAt() == null ? null : item.getInsertedAt().toString());
        vo.setHours(calendar == null ? 0 : calendar.hours(item.getPlanStart(), item.getPlanEnd()));
        vo.setWorkdays(calendar == null ? 0 : calendar.workdays(item.getPlanStart(), item.getPlanEnd()));
        vo.setPeriodHours(vo.getHours());
        if (from != null && to != null && calendar != null) {
            vo.setPeriodHours(calendar.hoursInPeriod(item.getPlanStart(), item.getPlanEnd(), from, to));
        }
        // 手工覆盖必须同时回传原算值与覆盖值：只给一个数字，界面就无法解释「為什麼不是 8 的倍数」，
        // 也无法给出「恢复自動」这条退路
        BigDecimal manual = manualHoursOf(item);
        vo.setHoursOverride(manual);
        if (manual != null) {
            vo.setHours(manual.setScale(0, RoundingMode.HALF_UP).intValue());
            vo.setPeriodHours(overlapsWindow(item.getPlanStart(), item.getPlanEnd(), from, to) ? vo.getHours() : 0);
        }
        /* 加班拆分：由合计减工作日 × 8h 派生，不入库也不在这里另定口径。
           台账列、统计卡与汇报必须拿到同一个数，否则会出现「列上 +4h、卡片 +0h」。*/
        vo.setOvertimeHours(CpmWorkdays.overtimeHoursOf(vo.getHours(), vo.getWorkdays()));
        // 来源已取消优先于进度：一场被取消的会不该因为进度停在 60% 就被念成「还在进行中」
        vo.setCancelled(CpmConstants.STATUS_CANCELLED.equals(item.getStatus()));
        vo.setState(stateOf(item.getStatus(), item.getProgress(), item.getPlanStart()));
        vo.setSourceType(item.getSourceType());
        vo.setSourceRef(item.getSourceRef());
        vo.setRdmSyncEnabled(item.getRdmSyncEnabled());
        if (trails != null && item.getId() != null) {
            vo.setHistory(history);
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
                // 已取消单独成数后直接跳出：把它算进 pending 会让一个人永远完不成自己的指标，
                // 算进 hours 会让周报工时比实际投入一大截（两场被取消的会共 4 小时）
                if (task.isCancelled()) {
                    t.setCancelled(t.getCancelled() + 1);
                    continue;
                }
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

    /**
     * 来源写入：{@code source_type} 与 {@code source_ref} 必须成对，且取值受白名单约束。
     *
     * <p>白名单就是 {@code ck_cpm_item_source} 的 DDL 同源集合：把未登记的来源字符串直接
     * 落库，轻则被 CHECK 打回、重则造出一个没有任何导出口认识的关联。前端递什么都不算：
     * 导入入口只能由服务端产生候选，所以这里只验收合法性，不拿它当归属凭证。
     * <p>只传一半当作手工录入而不是报错：台账的行内保存是个整体补丁，手改标题时不应该
     * 因为前端少带了一个字段就整条保存失败。
     */
    private void applySource(CpmItem item, String sourceType, String sourceRef) {
        if (!StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceRef)) {
            item.setSourceType(CpmConstants.SOURCE_MANUAL);
            item.setSourceRef(null);
            return;
        }
        if (!CpmConstants.SOURCE_TYPES.contains(sourceType)) {
            throw new BusinessException("不支持的來源類型");
        }
        if (sourceRef.length() > 64) {
            throw new BusinessException("來源標識過長");
        }
        item.setSourceType(sourceType);
        item.setSourceRef(sourceRef.trim());
    }

    /**
     * 手工耗时的写入：先按工作日口径验上限，再落库。
     *
     * <p>值本身不是重点，{@code work_hours_source} 才是：不写来源就再也分不清哪个数字
     * 是用户量过的、哪个是工作日推出来的，而这两个数在汇报里必须能区分。
     * <p>上限不能只靠前端禁用保存：前端校验不是安全边界，绕过界面直接 POST 一个
     * 10000 就能把周报总工时撑成一个不可能的数字。这里也不静默夹紧：静默改用户
     * 输入会让人以为保存成功，而实际存的不是他填的数（旧实现是夹紧到 999）。
     * <p>未排期（两个日期缺一个）按一个工作日计上限而不是拒写：补录一件已经做完的
     * 事是台账最常见的用法，先有工时后排期是合理顺序。0 视为清除覆盖：真意为 0 的
     * 工时不是一个计划量，而是一个「还没估」。
     */
    private void applyHours(CpmItem item, BigDecimal hours, boolean cleared, long userId) {
        if (cleared || hours == null || hours.compareTo(BigDecimal.ZERO) <= 0) {
            item.setWorkHours(null);
            item.setWorkHoursSource(CpmConstants.WORKLOG_HOURS_SOURCE_NONE);
            return;
        }
        LocalDate start = item.getPlanStart();
        LocalDate end = item.getPlanEnd();
        int wd = (start == null || end == null || end.isBefore(start))
                ? 0
                : workdays.load(userId, start, end).workdays(start, end);
        int cap = CpmWorkdays.hoursCap(wd);
        if (hours.compareTo(BigDecimal.valueOf(cap)) > 0) {
            throw new BusinessException(String.format(
                    "耗時超出上限：%dh（%d 個工作日 × %dh）；請先拉長排期", cap, Math.max(wd, 1),
                    CpmConstants.WORKLOG_HOURS_CAP_PER_DAY));
        }
        item.setWorkHours(hours.setScale(1, RoundingMode.HALF_UP));
        item.setWorkHoursSource(CpmConstants.WORKLOG_HOURS_SOURCE_MANUAL);
    }

    /**
     * 手工耗时的读取口径：只有标记为 manual 且大于 0 的值才算覆盖。
     *
     * <p>不拿 {@code work_hours} 列本身的非空作凭：时段回算（{@code CpmTimeEntryService}）
     * 会把精确到分钟的合计写进同一列并标 source=segment。台账这一列回答的是
     * 「这段排期我估了多少小时」，把打卡合计当作计划值，就会在同一张表上长出两种语义
     *（口径：手工值 > 工作日×8h，时段与台账工时解耦）。
     *
     * <p>包可见供汇报聚合复用同一个判据：台账列与汇报工时必须同一处判定，否则就是
     * 「页面 12h、推送 8h」这种两边各自算对但互相打脸的数字。
     */
    static BigDecimal manualHoursOf(CpmItem item) {
        if (item.getWorkHours() == null || item.getWorkHours().compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        return CpmConstants.WORKLOG_HOURS_SOURCE_MANUAL.equals(item.getWorkHoursSource())
                ? item.getWorkHours() : null;
    }

    /**
     * 导入后会议被取消的对账：把已取消/已释放会议对应的条目落成 cancelled。
     *
     * <p>为什么放在读取而不是会议取消事务里推送：取消有四条入口（单场取消、系列取消的三种
     * scope、未到场自动释放），还可能有运维直接改库。逐条 hook 必漏一条，而且
     * 对本次上线之前已经取消的会永远补不回来。读取时对账只需一处，且天然幂等。
     *
     * <p>为什么对账失败不能阻断台账：会议域只是另一个域的一个只读端口，它报错时
     * 用户自己的台账仍然可读。宁可在日志里留痕，不要把别人的故障做成自己页面的红横幅。
     * 宁可这一页暂时还显示旧状态，也不要让人打不开自己的记录。
     */
    private void reconcileCancelledMeetings(SysUser current) {
        List<CpmItem> imported = itemMapper.listBySource(current.getId(), CpmConstants.SOURCE_MEETING);
        if (imported.isEmpty()) {
            return;
        }
        Set<String> cancelledRefs = new HashSet<>();
        try {
            List<Long> bookingIds = imported.stream()
                    .map(CpmItem::getSourceRef)
                    .filter(StringUtils::hasText)
                    .map(ref -> {
                        try {
                            return Long.valueOf(ref.trim());
                        } catch (NumberFormatException e) {
                            // 脏 source_ref（手工改库或旧数据）不参与对账：宁可它停在旧状态，
                            // 也不要因为一行脏数据把整次读取拉坑
                            return null;
                        }
                    })
                    .filter(Objects::nonNull)
                    .limit(CpmConstants.MEETING_RECONCILE_MAX)
                    .toList();
            Map<Long, String> statuses = meetingActions.findBookingStatuses(bookingIds);
            statuses.forEach((id, status) -> {
                if (MeetingConstants.isNonDeliverable(status)) {
                    cancelledRefs.add(String.valueOf(id));
                }
            });
        } catch (Exception e) {
            log.warn("台账会议取消对账跳过（会议域不可用）: user={} err={}", current.getId(), e.getMessage());
            return;
        }
        if (cancelledRefs.isEmpty()) {
            return;
        }
        int changed = itemMapper.markCancelledBySourceRefs(current.getId(), CpmConstants.SOURCE_MEETING,
                cancelledRefs, current.getName());
        if (changed > 0) {
            log.info("台账会议对账: user={} 已将 {} 条导入条目改为已取消", current.getId(), changed);
        }
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
        return stateOf(null, progress, start);
    }

    /**
     * 状态口径：已取消是唯一不由进度决定的档位。
     *
     * <p>storedStatus 只用来识别 cancelled；其余一律仍由进度与排期推导，不让存量的
     * status 列与进度互相顶牛（那会重演「進行中 + 100%」这种自相矛盾的组合）。
     */
    private static String stateOf(String storedStatus, Integer progress, LocalDate start) {
        if (CpmConstants.STATUS_CANCELLED.equals(storedStatus)) {
            return CpmConstants.STATUS_CANCELLED;
        }
        int value = progress == null ? 0 : progress;
        if (value >= 100) {
            return CpmConstants.STATUS_DONE;
        }
        if (start == null) {
            return "plan";
        }
        return value > 0 ? CpmConstants.STATUS_DOING : CpmConstants.STATUS_TODO;
    }

    /** 手工工时是否落在本次查询区间：有覆盖值时只判相交，不拆日（拆日就是编数字） */
    private static boolean overlapsWindow(LocalDate start, LocalDate end, LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            return true;
        }
        if (start == null || end == null) {
            return false;
        }
        return !end.isBefore(from) && !start.isAfter(to);
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

