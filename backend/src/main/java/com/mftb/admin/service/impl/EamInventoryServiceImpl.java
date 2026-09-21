package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamInventoryEvent;
import com.mftb.admin.entity.EamInventoryItem;
import com.mftb.admin.entity.EamInventoryTask;
import com.mftb.admin.entity.EamLocation;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamInventoryEventMapper;
import com.mftb.admin.mapper.EamInventoryItemMapper;
import com.mftb.admin.mapper.EamInventoryTaskMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EamInventoryService;
import com.mftb.admin.service.EamTransferLookup;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeSet;
import java.util.stream.Collectors;

/**
 * 资产盘点服务实现（v2）。
 * <p>业务主线：圈定范围并预览 → 冻结应盘清单+账面快照 → 逐条/批量核对暂存 → 结束预检查
 * → 完整完成或部分完成 → 只读报告/导出。全过程仅写盘点任务/明细/操作日志，不改台账与其他业务数据。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamInventoryServiceImpl implements EamInventoryService {

    private final EamInventoryTaskMapper taskMapper;
    private final EamInventoryItemMapper itemMapper;
    private final EamInventoryEventMapper eventMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final EamLocationMapper locationMapper;
    private final EamInventoryScopeResolver scopeResolver;
    private final EamInventoryCheckSupport checkSupport;
    private final EamTransferLookup lookup;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    private static final int CONTRACT_V2 = 2;
    private static final DateTimeFormatter DTF = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<String> ITEM_STATUSES = List.of("pending", "normal", "lost", "damaged");

    /* ====================================================================== */
    /*  预览 / 创建                                                            */
    /* ====================================================================== */

    @Override
    public EamInventoryPreviewVO preview(InventoryScope scope) {
        scopeResolver.validate(scope);
        var resolved = scopeResolver.resolve(scope);
        LambdaQueryWrapper<EamAsset> wrapper = scopeResolver.toWrapper(resolved);
        long total = assetMapper.selectCount(wrapper);
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (String st : resolved.statuses()) {
            statusCounts.put(st, assetMapper.selectCount(scopeResolver.toWrapper(resolved).eq(EamAsset::getStatus, st)));
        }
        List<EamAsset> sample = assetMapper.selectList(wrapper.orderByAsc(EamAsset::getId).last("LIMIT 20"));
        EamInventoryPreviewVO vo = new EamInventoryPreviewVO();
        vo.setTotal((int) total);
        vo.setStatusCounts(statusCounts);
        vo.setScopeHash(scopeResolver.fingerprint(resolved));
        vo.setScopeSummary(summaryOf(resolved));
        vo.setSample(sample.stream().map(this::toPreviewItem).toList());
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public EamInventoryCreatedVO create(EamInventoryCreateDTO dto) {
        if (!StringUtils.hasText(dto.getTaskName())) throw new BusinessException("盤點任務名稱不能為空");
        if (dto.getTaskName().length() > 200) throw new BusinessException("任務名稱最多 200 字");
        if (dto.getRemark() != null && dto.getRemark().length() > 500) throw new BusinessException("備註最多 500 字");
        String requestKey = requireRequestKey(dto.getRequestKey());

        SysUser operator = operatorResolver.currentUser();
        if (operator == null) throw new BusinessException("請先登入");

        // 幂等：同创建人 + requestKey 命中既有任务则回放
        EamInventoryTask dup = taskMapper.selectByCreateRequest(operator.getId(), requestKey);
        if (dup != null) return new EamInventoryCreatedVO(dup.getId(), dup.getTaskNo());

        scopeResolver.validate(dto.getScope());
        var resolved = scopeResolver.resolve(dto.getScope());
        String fingerprint = scopeResolver.fingerprint(resolved);
        if (StringUtils.hasText(dto.getScopeHash()) && !dto.getScopeHash().equals(fingerprint)) {
            throw new BusinessException("盤點範圍已發生變化，請重新預覽後再發起");
        }

        List<EamAsset> assets = assetMapper.selectList(scopeResolver.toWrapper(resolved).orderByAsc(EamAsset::getId));
        if (assets.isEmpty()) throw new BusinessException("應盤清單為空，請調整範圍後重試");

        // 解析盘点负责人
        SysUser owner = operator;
        if (dto.getOwnerId() != null) {
            owner = userMapper.selectById(dto.getOwnerId());
            if (owner == null) throw new BusinessException("盤點負責人不存在");
        }
        String ownerName = displayName(owner);

        EamInventoryTask task = new EamInventoryTask();
        task.setTaskNo(bizSeqService.next(BizSeqService.RULE_EAM_INVENTORY));
        task.setTaskName(dto.getTaskName().trim());
        task.setInventoryDate(LocalDate.now().toString());
        task.setOperator(ownerName);
        task.setContractVersion(CONTRACT_V2);
        task.setScopeMode(resolved.scopeMode());
        task.setScopeJson(JsonUtils.toJson(dto.getScope()));
        task.setScopeResolvedJson(JsonUtils.toJson(summaryOf(resolved)));
        task.setScopeHash(fingerprint);
        task.setSnapshotAt(LocalDateTime.now());
        task.setOwnerId(owner.getId());
        task.setOwnerEmpNo(owner.getEmpId());
        task.setOwnerName(ownerName);
        task.setCreatedById(operator.getId());
        task.setCreatedByEmpNo(operator.getEmpId());
        task.setTaskRevision(0);
        task.setExpectedCount(assets.size());
        task.setActualCount(0);
        task.setDiffCount(0);
        task.setCheckedCount(0);
        task.setConfirmedCount(0);
        task.setAnomalyCount(0);
        task.setNotCheckedCount(assets.size());
        task.setMissingCount(0);
        task.setDamagedCount(0);
        task.setLocationDiffCount(0);
        task.setHolderDiffCount(0);
        task.setRecheckCount(0);
        task.setStatus("in_progress");
        task.setRemark(Objects.toString(dto.getRemark(), ""));
        task.setCreateRequestKey(requestKey);
        task.setCreateRequestHash(md5(JsonUtils.toJson(dto)));
        task.setCreatedBy(operatorResolver.currentOperatorName());
        task.setUpdatedBy(operatorResolver.currentOperatorName());
        try {
            taskMapper.insert(task);
        } catch (DuplicateKeyException e) {
            EamInventoryTask raced = taskMapper.selectByCreateRequest(operator.getId(), requestKey);
            if (raced != null) return new EamInventoryCreatedVO(raced.getId(), raced.getTaskNo());
            throw e;
        }

        String actor = operatorResolver.currentOperatorName();
        Map<Long, String> empNoCache = new HashMap<>();
        for (EamAsset a : assets) {
            String holderEmpNo = resolveHolderEmpNo(a.getCurrentHolderId(), empNoCache);
            EamInventoryItem item = new EamInventoryItem();
            item.setTaskId(task.getId());
            item.setAssetId(a.getId());
            item.setAssetNo(a.getAssetNo());
            item.setAssetName(EamAssetServiceImpl.stripBrandPrefix(a.getAssetName(), a.getBrand()));
            item.setAssetType(a.getAssetType());
            item.setLocation(a.getLocation());
            item.setStatus("pending");
            item.setRemark("");
            item.setContractVersion(CONTRACT_V2);
            item.setBookSnapshotJson(checkSupport.bookSnapshotJson(a, holderEmpNo, a.getLocation()));
            item.setLedgerFingerprint(checkSupport.ledgerFingerprint(a));
            item.setHolderName(a.getUserName());
            item.setHolderEmpNo(holderEmpNo);
            item.setHolderDept(a.getDepartment());
            item.setLocationCheckResult(null);
            item.setHolderCheckResult(null);
            item.setItemRevision(0);
            item.setRecheckRequired(0);
            item.setAnomalyFlag(0);
            item.setCreatedBy(actor);
            item.setUpdatedBy(actor);
            itemMapper.insert(item);
        }
        recordEvent(task.getId(), null, "create", null, null, null,
                "發起盤點：" + task.getTaskName() + "，應盤 " + assets.size() + " 件");
        log.info("创建盘点任务: {} ({}) 应盘 {} 件", task.getTaskNo(), task.getTaskName(), assets.size());
        return new EamInventoryCreatedVO(task.getId(), task.getTaskNo());
    }

    /* ====================================================================== */
    /*  列表 / 详情 / 明细 / 日志                                              */
    /* ====================================================================== */

    @Override
    public PageResult<EamInventoryTaskVO> page(EamInventoryQuery query) {
        LambdaQueryWrapper<EamInventoryTask> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) w.like(EamInventoryTask::getTaskName, query.getKeyword().trim());
        if (StringUtils.hasText(query.getTaskNo())) w.like(EamInventoryTask::getTaskNo, query.getTaskNo().trim());
        if (StringUtils.hasText(query.getOwnerKeyword())) {
            String kw = query.getOwnerKeyword().trim();
            w.and(x -> x.like(EamInventoryTask::getOwnerName, kw).or().like(EamInventoryTask::getOwnerEmpNo, kw));
        }
        if (StringUtils.hasText(query.getStatus())) w.eq(EamInventoryTask::getStatus, query.getStatus());
        if (StringUtils.hasText(query.getDateFrom())) w.ge(EamInventoryTask::getInventoryDate, query.getDateFrom());
        if (StringUtils.hasText(query.getDateTo())) w.le(EamInventoryTask::getInventoryDate, query.getDateTo());
        Page<EamInventoryTask> page = taskMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                w.orderByDesc(EamInventoryTask::getCreatedAt, EamInventoryTask::getId));
        return new PageResult<>(page.getRecords().stream().map(this::toTaskVO).toList(), page.getTotal());
    }

    @Override
    public EamInventoryTaskVO detail(long id) {
        EamInventoryTask task = requireTask(id);
        return toTaskVO(task);
    }

    @Override
    public PageResult<EamInventoryItemVO> items(long id, EamInventoryItemQuery query) {
        requireTask(id);
        LambdaQueryWrapper<EamInventoryItem> w = new LambdaQueryWrapper<EamInventoryItem>()
                .eq(EamInventoryItem::getTaskId, id);
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            w.and(x -> x.like(EamInventoryItem::getAssetNo, kw).or().like(EamInventoryItem::getAssetName, kw));
        }
        if ("unchecked".equals(query.getCheckProgress())) w.eq(EamInventoryItem::getStatus, "pending");
        else if ("checked".equals(query.getCheckProgress())) w.ne(EamInventoryItem::getStatus, "pending").eq(EamInventoryItem::getRecheckRequired, 0);
        else if ("recheck".equals(query.getCheckProgress())) w.eq(EamInventoryItem::getRecheckRequired, 1);
        if ("missing".equals(query.getAnomaly())) w.eq(EamInventoryItem::getStatus, "lost");
        else if ("damaged".equals(query.getAnomaly())) w.eq(EamInventoryItem::getStatus, "damaged");
        else if ("location_diff".equals(query.getAnomaly())) w.eq(EamInventoryItem::getLocationCheckResult, EamInventoryCheckSupport.RESULT_DIFF);
        else if ("holder_diff".equals(query.getAnomaly())) w.eq(EamInventoryItem::getHolderCheckResult, EamInventoryCheckSupport.RESULT_DIFF);
        if (query.getLocationId() != null) {
            EamLocation loc = locationMapper.selectById(query.getLocationId());
            if (loc != null) w.like(EamInventoryItem::getLocation, loc.getName());
        }
        Page<EamInventoryItem> page = itemMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                w.orderByAsc(EamInventoryItem::getId));
        // 批量读取当前台账用于期间变更对照
        Map<Long, EamAsset> current = loadCurrentAssets(page.getRecords().stream().map(EamInventoryItem::getAssetId).toList());
        return new PageResult<>(page.getRecords().stream().map(it -> toItemVO(it, current.get(it.getAssetId()))).toList(), page.getTotal());
    }

    @Override
    public List<EamInventoryEventVO> events(long id) {
        requireTask(id);
        return eventMapper.selectList(new LambdaQueryWrapper<EamInventoryEvent>()
                        .eq(EamInventoryEvent::getTaskId, id)
                        .orderByDesc(EamInventoryEvent::getId))
                .stream().map(this::toEventVO).toList();
    }

    /* ====================================================================== */
    /*  核对保存 / 批量                                                        */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public EamInventoryItemVO saveItem(long taskId, long itemId, EamInventoryItemCheckDTO dto) {
        EamInventoryTask task = lockEditableTask(taskId);
        String requestKey = StringUtils.hasText(dto.getRequestKey()) ? dto.getRequestKey().trim() : null;
        if (requestKey != null) {
            EamInventoryEvent existing = findEvent(taskId, requestKey);
            if (existing != null) return toItemVO(requireItem(itemId), loadCurrentAsset(requireItem(itemId).getAssetId()));
        }

        EamInventoryItem item = itemMapper.selectForUpdate(itemId);
        if (item == null || !Objects.equals(item.getTaskId(), taskId)) throw new BusinessException("盤點明細不存在或與任務不匹配");
        if (dto.getItemRevision() != null && !dto.getItemRevision().equals(item.getItemRevision())) {
            throw new BusinessException("該資產已被其他人更新，請刷新後重試");
        }
        String status = StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : item.getStatus();
        if (!ITEM_STATUSES.contains(status)) throw new BusinessException("無效的盤點狀態：" + status);

        boolean reset = "pending".equals(status);
        Map<String, Object> book = JsonUtils.parseMap(item.getBookSnapshotJson());
        Long bookLocationId = asLong(book.get("locationId"));
        String bookLocationName = asStr(book.get("locationName"));
        Long bookHolderId = asLong(book.get("holderId"));
        String bookHolderName = asStr(book.get("holderName"));

        LocalDateTime checkedAt = resolveCheckedAt(dto.getCheckedAt());
        UpdateWrapper<EamInventoryItem> upd = new UpdateWrapper<EamInventoryItem>().eq("id", itemId);
        String beforeJson = checkSnapshot(item);
        if (reset) {
            upd.set("status", "pending").set("actual_location_id", null).set("actual_location_name", null)
                    .set("actual_location_other", null).set("location_check_result", null)
                    .set("actual_holder_type", null).set("actual_holder_id", null).set("actual_holder_emp_no", null)
                    .set("actual_holder_name", null).set("actual_holder_external", null).set("holder_check_result", null)
                    .set("check_method", null).set("checked_at", null).set("checked_by", null).set("checked_by_id", null)
                    .set("checked_by_emp_no", null).set("current_snapshot_json", null).set("recheck_required", 0)
                    .set("anomaly_flag", 0).set("remark", trimOrNull(dto.getRemark()));
        } else {
            validateCheck(dto, status);
            SysUser actualHolder = resolveActualHolder(dto);
            String actualLocName = actualHolder == null ? null : displayName(actualHolder);
            String locResult = checkSupport.locationResult(status, bookLocationId, bookLocationName,
                    dto.getActualLocationId(), actualLocName, dto.getActualLocationOther());
            String holderResult = checkSupport.holderResult(status, bookHolderId, bookHolderName,
                    dto.getActualHolderType(), dto.getActualHolderId(), dto.getActualHolderExternal());
            EamAsset cur = loadCurrentAsset(item.getAssetId());
            int recheck = cur != null && !checkSupport.ledgerFingerprint(cur).equals(item.getLedgerFingerprint()) ? 1 : 0;
            boolean anomaly = checkSupport.isAnomaly(status, locResult, holderResult);
            upd.set("status", status)
                    .set("actual_location_id", dto.getActualLocationId())
                    .set("actual_location_name", locResult != null && dto.getActualLocationId() != null ? locationName(dto.getActualLocationId()) : null)
                    .set("actual_location_other", trimOrNull(dto.getActualLocationOther()))
                    .set("location_check_result", locResult)
                    .set("actual_holder_type", trimOrNull(dto.getActualHolderType()))
                    .set("actual_holder_id", "EMPLOYEE".equals(dto.getActualHolderType()) ? dto.getActualHolderId() : null)
                    .set("actual_holder_emp_no", actualHolder != null ? actualHolder.getEmpId() : null)
                    .set("actual_holder_name", actualHolder != null ? displayName(actualHolder) : null)
                    .set("actual_holder_external", "EXTERNAL".equals(dto.getActualHolderType()) ? trimOrNull(dto.getActualHolderExternal()) : null)
                    .set("holder_check_result", holderResult)
                    .set("check_method", trimOrNull(dto.getCheckMethod()))
                    .set("checked_at", checkedAt)
                    .set("checked_by", operatorResolver.currentOperatorName())
                    .set("checked_by_id", operatorResolver.currentUser().getId())
                    .set("checked_by_emp_no", operatorResolver.currentUser().getEmpId())
                    .set("current_snapshot_json", cur != null ? checkSupport.currentSnapshotJson(cur, resolveHolderEmpNo(cur.getCurrentHolderId(), new HashMap<>()), cur.getLocation()) : null)
                    .set("recheck_required", recheck)
                    .set("anomaly_flag", anomaly ? 1 : 0)
                    .set("remark", trimOrNull(dto.getRemark()));
        }
        upd.set("item_revision", item.getItemRevision() + 1)
                .set("updated_by", operatorResolver.currentOperatorName());
        itemMapper.update(null, upd);

        recomputeAndPersistStats(task);
        recordEvent(taskId, itemId, reset ? "reset" : "check", requestKey,
                md5(JsonUtils.toJson(dto)), beforeJson, checkSnapshot(requireItem(itemId)));
        EamInventoryItem saved = requireItem(itemId);
        return toItemVO(saved, loadCurrentAsset(saved.getAssetId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int batchCheck(long taskId, EamInventoryBatchCheckDTO dto) {
        EamInventoryTask task = lockEditableTask(taskId);
        if (dto.getItemIds() == null || dto.getItemIds().isEmpty()) throw new BusinessException("請先勾選要批量核對的資產");
        if (dto.getItemIds().size() > 100) throw new BusinessException("單次批量核對最多 100 項");
        List<Long> ids = new ArrayList<>(new TreeSet<>(dto.getItemIds()));
        if (StringUtils.hasText(dto.getRequestKey())) {
            EamInventoryEvent existing = findEvent(taskId, dto.getRequestKey().trim());
            if (existing != null) return 0;
        }
        List<EamInventoryItem> items = itemMapper.selectForUpdateByIds(ids);
        if (items.size() != ids.size()) throw new BusinessException("部分明細不存在或與任務不匹配");
        for (EamInventoryItem it : items) {
            if (!Objects.equals(it.getTaskId(), taskId)) throw new BusinessException("明細不屬於該盤點任務");
            if (!"pending".equals(it.getStatus())) throw new BusinessException("資產 " + it.getAssetNo() + " 已有核對結果，請改用逐項核對");
            if (it.getRecheckRequired() != null && it.getRecheckRequired() != 0) throw new BusinessException("資產 " + it.getAssetNo() + " 存在期間業務變更，請逐項複核");
        }
        LocalDateTime now = LocalDateTime.now();
        Long opId = operatorResolver.currentUser().getId();
        String actor = operatorResolver.currentOperatorName();
        String empNo = operatorResolver.currentUser().getEmpId();
        int applied = 0;
        for (EamInventoryItem it : items) {
            EamAsset cur = loadCurrentAsset(it.getAssetId());
            int recheck = cur != null && !checkSupport.ledgerFingerprint(cur).equals(it.getLedgerFingerprint()) ? 1 : 0;
            Map<String, Object> book = JsonUtils.parseMap(it.getBookSnapshotJson());
            Long bookLocationId = asLong(book.get("locationId"));
            Long bookHolderId = asLong(book.get("holderId"));
            UpdateWrapper<EamInventoryItem> upd = new UpdateWrapper<EamInventoryItem>().eq("id", it.getId())
                    .set("status", "normal")
                    .set("actual_location_id", bookLocationId)
                    .set("actual_location_name", it.getLocation())
                    .set("location_check_result", EamInventoryCheckSupport.RESULT_CONSISTENT)
                    .set("actual_holder_type", bookHolderId == null ? "NONE" : "EMPLOYEE")
                    .set("actual_holder_id", bookHolderId)
                    .set("actual_holder_name", it.getHolderName())
                    .set("actual_holder_emp_no", it.getHolderEmpNo())
                    .set("holder_check_result", EamInventoryCheckSupport.RESULT_CONSISTENT)
                    .set("check_method", "ONSITE").set("checked_at", now)
                    .set("checked_by", actor).set("checked_by_id", opId).set("checked_by_emp_no", empNo)
                    .set("current_snapshot_json", cur != null ? checkSupport.currentSnapshotJson(cur, resolveHolderEmpNo(cur.getCurrentHolderId(), new HashMap<>()), cur.getLocation()) : null)
                    .set("recheck_required", recheck).set("anomaly_flag", 0)
                    .set("item_revision", it.getItemRevision() + 1).set("updated_by", actor);
            itemMapper.update(null, upd);
            applied++;
        }
        recomputeAndPersistStats(task);
        recordEvent(taskId, null, "batch", StringUtils.hasText(dto.getRequestKey()) ? dto.getRequestKey().trim() : null,
                md5(JsonUtils.toJson(dto)), null, "批量核對 " + applied + " 項");
        return applied;
    }

    /* ====================================================================== */
    /*  结束 / 取消                                                            */
    /* ====================================================================== */

    @Override
    public EamInventoryPrepareCloseVO prepareClose(long id) {
        EamInventoryTask task = requireTask(id);
        if (!"in_progress".equals(task.getStatus())) throw new BusinessException("僅進行中的任務可執行結束預檢查");
        Stats s = computeStats(id, task.getExpectedCount());
        EamInventoryPrepareCloseVO vo = new EamInventoryPrepareCloseVO();
        vo.setTaskRevision(task.getTaskRevision());
        vo.setNotCheckedCount(s.notChecked);
        vo.setRecheckCount(s.recheck);
        vo.setCheckedCount(s.checked);
        vo.setCanComplete(s.notChecked == 0);
        vo.setCanPartial(s.checked > 0 && s.notChecked > 0);
        vo.setPrepareHash(prepareHash(task, s));
        vo.setStats(toStatsVO(task, s));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void complete(long id, EamInventoryCloseDTO dto) {
        EamInventoryTask task = taskMapper.selectForUpdate(id);
        if (task == null) throw new BusinessException("盤點任務不存在");
        if (task.getContractVersion() == null || task.getContractVersion() < CONTRACT_V2) {
            throw new BusinessException("歷史盤點任務不可結單，請新建任務後繼續");
        }
        if (!"in_progress".equals(task.getStatus())) throw new BusinessException("任務已結束，不可重複操作");
        if (StringUtils.hasText(dto.getRequestKey())) {
            EamInventoryEvent existing = findEvent(id, dto.getRequestKey().trim());
            if (existing != null) return;
        }
        if (dto.getExpectedTaskRevision() != null && !dto.getExpectedTaskRevision().equals(task.getTaskRevision())) {
            throw new BusinessException("任務已更新，請重新預檢查");
        }
        String closeType = dto.getCloseType();
        if (!"COMPLETE".equals(closeType) && !"PARTIAL".equals(closeType)) throw new BusinessException("無效的結束方式");
        // 结束时按当前台账刷新期间变更并冻结比对快照
        freezeCurrentSnapshots(id);
        Stats s = computeStats(id, task.getExpectedCount());
        if ("COMPLETE".equals(closeType)) {
            if (s.notChecked > 0) throw new BusinessException("仍有 " + s.notChecked + " 項未核對，請選擇部分完成或繼續核對");
        } else {
            if (s.notChecked == 0) throw new BusinessException("全部已核對應選擇完整完成");
            if (s.checked == 0) throw new BusinessException("尚無任何核對記錄，不能生成部分完成報告");
            if (!StringUtils.hasText(dto.getReason())) throw new BusinessException("部分完成必須填寫結束原因");
            if (dto.getReason().length() > 500) throw new BusinessException("結束原因最多 500 字");
        }
        String actor = operatorResolver.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();
        UpdateWrapper<EamInventoryTask> upd = new UpdateWrapper<EamInventoryTask>().eq("id", id)
                .set("status", "COMPLETE".equals(closeType) ? "completed" : "partially_completed")
                .set("close_type", closeType).set("close_reason", trimOrNull(dto.getReason()))
                .set("closed_at", now).set("closed_by", actor).set("closed_by_id", operatorResolver.currentUser().getId())
                .set("task_revision", task.getTaskRevision() + 1).set("updated_by", actor);
        applyStats(upd, s);
        taskMapper.update(null, upd);
        recordEvent(id, null, "COMPLETE".equals(closeType) ? "complete" : "partial",
                StringUtils.hasText(dto.getRequestKey()) ? dto.getRequestKey().trim() : null,
                md5(JsonUtils.toJson(dto)), null,
                "任務結束：" + closeType + "，已核對 " + s.checked + "/應盤 " + task.getExpectedCount());
        log.info("盘点任务结束 id={} closeType={}", id, closeType);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, EamInventoryCancelDTO dto) {
        if (!StringUtils.hasText(dto.getReason())) throw new BusinessException("取消原因不能為空");
        if (dto.getReason().length() > 500) throw new BusinessException("取消原因最多 500 字");
        EamInventoryTask task = taskMapper.selectForUpdate(id);
        if (task == null) throw new BusinessException("盤點任務不存在");
        if (!"in_progress".equals(task.getStatus())) throw new BusinessException("僅進行中的任務可取消");
        String actor = operatorResolver.currentOperatorName();
        taskMapper.update(null, new UpdateWrapper<EamInventoryTask>().eq("id", id)
                .set("status", "cancelled").set("close_type", "CANCEL").set("cancel_reason", dto.getReason().trim())
                .set("cancelled_at", LocalDateTime.now()).set("cancelled_by", actor)
                .set("task_revision", task.getTaskRevision() + 1).set("updated_by", actor));
        recordEvent(id, null, "cancel", StringUtils.hasText(dto.getRequestKey()) ? dto.getRequestKey().trim() : null,
                md5(JsonUtils.toJson(dto)), null, "取消任務：" + dto.getReason().trim());
        log.info("盘点任务取消 id={}", id);
    }

    /* ====================================================================== */
    /*  导出                                                                  */
    /* ====================================================================== */

    @Override
    public String exportTasksCsv(EamInventoryQuery query) {
        LambdaQueryWrapper<EamInventoryTask> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) w.like(EamInventoryTask::getTaskName, query.getKeyword().trim());
        if (StringUtils.hasText(query.getStatus())) w.eq(EamInventoryTask::getStatus, query.getStatus());
        List<EamInventoryTask> tasks = taskMapper.selectList(w.orderByDesc(EamInventoryTask::getId));
        StringBuilder sb = new StringBuilder();
        sb.append(csvRow(List.of("任務編號", "任務名稱", "範圍模式", "負責人", "工號", "應盤", "已核對", "異常", "未完成", "狀態", "發起日期", "結束時間"))).append('\n');
        for (EamInventoryTask t : tasks) {
            sb.append(csvRow(List.of(t.getTaskNo(), t.getTaskName(), Objects.toString(t.getScopeMode(), "ALL"),
                    Objects.toString(t.getOwnerName(), t.getOperator()), Objects.toString(t.getOwnerEmpNo(), ""),
                    str(t.getExpectedCount()), str(t.getCheckedCount()), str(t.getAnomalyCount()), str(t.getNotCheckedCount()),
                    statusLabel(t.getStatus()), t.getInventoryDate(),
                    t.getClosedAt() != null ? t.getClosedAt().format(DTF) : ""))).append('\n');
        }
        return sb.toString();
    }

    @Override
    public String exportReportCsv(long id, String mode) {
        EamInventoryTask task = requireTask(id);
        LambdaQueryWrapper<EamInventoryItem> w = new LambdaQueryWrapper<EamInventoryItem>().eq(EamInventoryItem::getTaskId, id);
        if ("missing".equals(mode)) w.and(x -> x.in(EamInventoryItem::getStatus, "lost", "damaged")
                .or().eq(EamInventoryItem::getLocationCheckResult, EamInventoryCheckSupport.RESULT_DIFF)
                .or().eq(EamInventoryItem::getHolderCheckResult, EamInventoryCheckSupport.RESULT_DIFF));
        else if ("unchecked".equals(mode)) w.eq(EamInventoryItem::getStatus, "pending");
        List<EamInventoryItem> items = itemMapper.selectList(w.orderByAsc(EamInventoryItem::getId));
        StringBuilder sb = new StringBuilder();
        sb.append("# 盤點報告 ").append(task.getTaskNo()).append(" / ").append(task.getTaskName())
                .append(" / 狀態:").append(statusLabel(task.getStatus()))
                .append(" / 數據基準:").append(task.getClosedAt() != null ? task.getClosedAt().format(DTF) : task.getSnapshotAt() != null ? task.getSnapshotAt().format(DTF) : "").append('\n');
        sb.append(csvRow(List.of("資產編號", "名稱", "分類", "倉庫(帳面)", "使用人(帳面)", "工號", "部門", "實物結果", "位置核對", "持有人核對", "核對時間", "備註"))).append('\n');
        for (EamInventoryItem it : items) {
            sb.append(csvRow(List.of(it.getAssetNo(), it.getAssetName(), Objects.toString(it.getAssetType(), ""),
                    Objects.toString(it.getLocation(), ""), Objects.toString(it.getHolderName(), ""),
                    Objects.toString(it.getHolderEmpNo(), ""), Objects.toString(it.getHolderDept(), ""),
                    itemStatusLabel(it.getStatus()), Objects.toString(it.getLocationCheckResult(), ""),
                    Objects.toString(it.getHolderCheckResult(), ""),
                    it.getCheckedAt() != null ? it.getCheckedAt().format(DTF) : "", Objects.toString(it.getRemark(), "")))).append('\n');
        }
        return sb.toString();
    }

    @Override
    public Map<String, Object> options() {
        Map<String, Object> map = new LinkedHashMap<>();
        List<Map<String, Object>> locations = locationMapper.selectList(
                        new LambdaQueryWrapper<EamLocation>().orderByAsc(EamLocation::getSort, EamLocation::getId))
                .stream().map(l -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", l.getId());
                    m.put("name", l.getName());
                    m.put("parentId", l.getParentId());
                    return m;
                }).toList();
        map.put("locations", locations);
        var opts = lookup.options();
        map.put("departments", opts.departments());
        map.put("categories", opts.categories());
        map.put("statuses", EamInventoryScopeResolver.DEFAULT_STATUSES);
        return map;
    }

    /* ====================================================================== */
    /*  内部：任务/统计/快照/映射                                              */
    /* ====================================================================== */

    private EamInventoryTask requireTask(long id) {
        EamInventoryTask t = taskMapper.selectById(id);
        if (t == null) throw new BusinessException("盤點任務不存在");
        return t;
    }

    private EamInventoryItem requireItem(long id) {
        EamInventoryItem it = itemMapper.selectById(id);
        if (it == null) throw new BusinessException("盤點明細不存在");
        return it;
    }

    private EamInventoryTask lockEditableTask(long taskId) {
        EamInventoryTask task = taskMapper.selectForUpdate(taskId);
        if (task == null) throw new BusinessException("盤點任務不存在");
        if (task.getContractVersion() == null || task.getContractVersion() < CONTRACT_V2) {
            throw new BusinessException("歷史盤點任務不可核對，請新建新版任務");
        }
        if (!"in_progress".equals(task.getStatus())) throw new BusinessException("任務已結束，不可再修改核對結果");
        return task;
    }

    /** 结构化统计（口径见方案 §2.5） */
    private static class Stats {
        int checked, confirmed, anomaly, notChecked, missing, damaged, locationDiff, holderDiff, recheck;
    }

    private Stats computeStats(long taskId, Integer expected) {
        Stats s = new Stats();
        s.checked = countItems(checkedWrapper(taskId));
        s.missing = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId).eq("status", "lost"));
        s.damaged = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId).eq("status", "damaged"));
        s.confirmed = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId).in("status", "normal", "damaged"));
        s.locationDiff = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId)
                .eq("location_check_result", EamInventoryCheckSupport.RESULT_DIFF));
        s.holderDiff = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId)
                .eq("holder_check_result", EamInventoryCheckSupport.RESULT_DIFF));
        s.recheck = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId).eq("recheck_required", 1));
        s.anomaly = countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId)
                .and(x -> x.in("status", "lost", "damaged")
                        .or().eq("location_check_result", EamInventoryCheckSupport.RESULT_DIFF)
                        .or().eq("holder_check_result", EamInventoryCheckSupport.RESULT_DIFF)));
        int exp = expected == null ? countItems(new QueryWrapper<EamInventoryItem>().eq("task_id", taskId)) : expected;
        s.notChecked = Math.max(0, exp - s.checked);
        return s;
    }

    private QueryWrapper<EamInventoryItem> checkedWrapper(long taskId) {
        return new QueryWrapper<EamInventoryItem>().eq("task_id", taskId)
                .ne("status", "pending").eq("recheck_required", 0)
                .ne("location_check_result", EamInventoryCheckSupport.RESULT_PENDING)
                .ne("holder_check_result", EamInventoryCheckSupport.RESULT_PENDING);
    }

    private int countItems(QueryWrapper<EamInventoryItem> w) {
        Long c = itemMapper.selectCount(w);
        return c == null ? 0 : c.intValue();
    }

    private void recomputeAndPersistStats(EamInventoryTask task) {
        Stats s = computeStats(task.getId(), task.getExpectedCount());
        UpdateWrapper<EamInventoryTask> upd = new UpdateWrapper<EamInventoryTask>().eq("id", task.getId())
                .set("actual_count", s.confirmed).set("diff_count", s.confirmed - task.getExpectedCount())
                .set("task_revision", task.getTaskRevision() + 1);
        applyStats(upd, s);
        taskMapper.update(null, upd);
        task.setTaskRevision(task.getTaskRevision() + 1);
    }

    private void applyStats(UpdateWrapper<EamInventoryTask> upd, Stats s) {
        upd.set("checked_count", s.checked).set("confirmed_count", s.confirmed).set("anomaly_count", s.anomaly)
                .set("not_checked_count", s.notChecked).set("missing_count", s.missing).set("damaged_count", s.damaged)
                .set("location_diff_count", s.locationDiff).set("holder_diff_count", s.holderDiff).set("recheck_count", s.recheck);
    }

    /** 结束时刷新每条明细的当前台账快照并落 recheck/anomaly（一次性冻结报告依据） */
    private void freezeCurrentSnapshots(long taskId) {
        List<EamInventoryItem> items = itemMapper.selectList(new LambdaQueryWrapper<EamInventoryItem>()
                .eq(EamInventoryItem::getTaskId, taskId).ne(EamInventoryItem::getStatus, "pending"));
        for (EamInventoryItem it : items) {
            EamAsset cur = loadCurrentAsset(it.getAssetId());
            if (cur == null) continue;
            int recheck = checkSupport.ledgerFingerprint(cur).equals(it.getLedgerFingerprint()) ? 0 : 1;
            boolean anomaly = checkSupport.isAnomaly(it.getStatus(), it.getLocationCheckResult(), it.getHolderCheckResult());
            itemMapper.update(null, new UpdateWrapper<EamInventoryItem>().eq("id", it.getId())
                    .set("recheck_required", recheck).set("anomaly_flag", anomaly ? 1 : 0)
                    .set("closed_snapshot_json", checkSupport.currentSnapshotJson(cur, resolveHolderEmpNo(cur.getCurrentHolderId(), new HashMap<>()), cur.getLocation())));
        }
    }

    private String prepareHash(EamInventoryTask task, Stats s) {
        return md5(task.getId() + ":" + task.getTaskRevision() + ":" + s.checked + ":" + s.notChecked + ":" + s.recheck);
    }

    private EamInventoryStatsVO toStatsVO(EamInventoryTask task, Stats s) {
        EamInventoryStatsVO vo = new EamInventoryStatsVO();
        vo.setExpectedCount(task.getExpectedCount());
        vo.setCheckedCount(s.checked);
        vo.setConfirmedCount(s.confirmed);
        vo.setNotCheckedCount(s.notChecked);
        vo.setAnomalyCount(s.anomaly);
        vo.setMissingCount(s.missing);
        vo.setDamagedCount(s.damaged);
        vo.setLocationDiffCount(s.locationDiff);
        vo.setHolderDiffCount(s.holderDiff);
        vo.setRecheckCount(s.recheck);
        return vo;
    }

    private EamInventoryTaskVO toTaskVO(EamInventoryTask task) {
        EamInventoryTaskVO vo = new EamInventoryTaskVO();
        vo.setId(task.getId());
        vo.setContractVersion(task.getContractVersion() == null ? 1 : task.getContractVersion());
        vo.setTaskNo(task.getTaskNo());
        vo.setTaskName(task.getTaskName());
        vo.setInventoryDate(task.getInventoryDate());
        vo.setOperator(task.getOperator());
        vo.setOwnerId(task.getOwnerId());
        vo.setOwnerName(task.getOwnerName());
        vo.setOwnerEmpNo(task.getOwnerEmpNo());
        vo.setScopeMode(task.getScopeMode());
        vo.setScopeSummary(parseScopeSummary(task.getScopeResolvedJson()));
        vo.setExpectedCount(task.getExpectedCount());
        vo.setActualCount(task.getActualCount());
        vo.setDiffCount(task.getDiffCount());
        vo.setStatus(task.getStatus());
        vo.setCloseType(task.getCloseType());
        vo.setCloseReason(task.getCloseReason());
        vo.setClosedAt(DateTimeUtils.format(task.getClosedAt()));
        vo.setCancelledAt(DateTimeUtils.format(task.getCancelledAt()));
        vo.setCancelReason(task.getCancelReason());
        vo.setTaskRevision(task.getTaskRevision());
        vo.setSnapshotAt(DateTimeUtils.format(task.getSnapshotAt()));
        vo.setRemark(task.getRemark());
        vo.setCreatedBy(task.getCreatedBy());
        vo.setCreatedAt(DateTimeUtils.format(task.getCreatedAt()));
        vo.setUpdatedBy(task.getUpdatedBy());
        vo.setUpdatedAt(DateTimeUtils.format(task.getUpdatedAt()));
        EamInventoryStatsVO stats = new EamInventoryStatsVO();
        stats.setExpectedCount(task.getExpectedCount());
        stats.setCheckedCount(nz(task.getCheckedCount()));
        stats.setConfirmedCount(nz(task.getConfirmedCount()));
        stats.setNotCheckedCount(nz(task.getNotCheckedCount()));
        stats.setAnomalyCount(nz(task.getAnomalyCount()));
        stats.setMissingCount(nz(task.getMissingCount()));
        stats.setDamagedCount(nz(task.getDamagedCount()));
        stats.setLocationDiffCount(nz(task.getLocationDiffCount()));
        stats.setHolderDiffCount(nz(task.getHolderDiffCount()));
        stats.setRecheckCount(nz(task.getRecheckCount()));
        vo.setStats(stats);
        return vo;
    }

    private EamInventoryItemVO toItemVO(EamInventoryItem it, EamAsset cur) {
        EamInventoryItemVO vo = new EamInventoryItemVO();
        vo.setId(it.getId());
        vo.setTaskId(it.getTaskId());
        vo.setContractVersion(it.getContractVersion() == null ? 1 : it.getContractVersion());
        vo.setAssetId(it.getAssetId());
        vo.setAssetNo(it.getAssetNo());
        vo.setAssetName(it.getAssetName());
        vo.setAssetType(it.getAssetType());
        vo.setLocation(it.getLocation());
        vo.setStatus(it.getStatus());
        vo.setRemark(it.getRemark());
        vo.setHolderName(it.getHolderName());
        vo.setHolderEmpNo(it.getHolderEmpNo());
        vo.setBookDept(it.getHolderDept());
        Map<String, Object> book = JsonUtils.parseMap(it.getBookSnapshotJson());
        vo.setBookStatus(asStr(book.get("status")));
        vo.setBookHoldType(asStr(book.get("holdType")));
        vo.setBookLocationId(asLong(book.get("locationId")));
        vo.setHolderId(asLong(book.get("holderId")));
        vo.setCompanyBrand(asInt(book.get("companyBrand")));
        vo.setActualLocationId(it.getActualLocationId());
        vo.setActualLocationName(it.getActualLocationName());
        vo.setActualLocationOther(it.getActualLocationOther());
        vo.setLocationCheckResult(it.getLocationCheckResult());
        vo.setActualHolderType(it.getActualHolderType());
        vo.setActualHolderId(it.getActualHolderId());
        vo.setActualHolderEmpNo(it.getActualHolderEmpNo());
        vo.setActualHolderName(it.getActualHolderName());
        vo.setActualHolderExternal(it.getActualHolderExternal());
        vo.setHolderCheckResult(it.getHolderCheckResult());
        vo.setCheckMethod(it.getCheckMethod());
        vo.setCheckedAt(DateTimeUtils.format(it.getCheckedAt()));
        vo.setCheckedBy(it.getCheckedBy());
        vo.setCheckedByEmpNo(it.getCheckedByEmpNo());
        vo.setItemRevision(it.getItemRevision());
        vo.setAnomalyFlag(it.getAnomalyFlag());
        if (cur != null) {
            boolean changed = !checkSupport.ledgerFingerprint(cur).equals(it.getLedgerFingerprint());
            vo.setRecheckRequired((nz(it.getRecheckRequired()) == 1 || changed) ? 1 : 0);
            vo.setCurrentStatus(cur.getStatus());
            vo.setCurrentLocationName(cur.getLocation());
            vo.setCurrentHolderName(cur.getUserName());
        } else {
            vo.setRecheckRequired(nz(it.getRecheckRequired()));
        }
        return vo;
    }

    private EamInventoryItemVO toPreviewItem(EamAsset a) {
        EamInventoryItemVO vo = new EamInventoryItemVO();
        vo.setAssetId(a.getId());
        vo.setAssetNo(a.getAssetNo());
        vo.setAssetName(EamAssetServiceImpl.stripBrandPrefix(a.getAssetName(), a.getBrand()));
        vo.setAssetType(a.getAssetType());
        vo.setLocation(a.getLocation());
        vo.setBookStatus(a.getStatus());
        vo.setHolderName(a.getUserName());
        vo.setBookDept(a.getDepartment());
        return vo;
    }

    private EamInventoryEventVO toEventVO(EamInventoryEvent e) {
        EamInventoryEventVO vo = new EamInventoryEventVO();
        vo.setId(e.getId());
        vo.setItemId(e.getItemId());
        vo.setAction(e.getAction());
        vo.setReason(e.getReason());
        vo.setBeforeJson(e.getBeforeJson());
        vo.setAfterJson(e.getAfterJson());
        vo.setOperatorId(e.getOperatorId());
        vo.setOperatorName(e.getOperatorName());
        vo.setOperatorEmpNo(e.getOperatorEmpNo());
        vo.setCreatedAt(DateTimeUtils.format(e.getCreatedAt()));
        return vo;
    }

    /* ====================================================================== */
    /*  辅助                                                                  */
    /* ====================================================================== */

    private void validateCheck(EamInventoryItemCheckDTO dto, String status) {
        if (StringUtils.hasText(dto.getRemark()) && dto.getRemark().length() > 500) throw new BusinessException("備註最多 500 字");
        boolean found = "normal".equals(status) || "damaged".equals(status);
        if (found) {
            if (!StringUtils.hasText(dto.getActualHolderType())) throw new BusinessException("請核對實際持有人後再保存");
            if (dto.getActualLocationId() == null && !StringUtils.hasText(dto.getActualLocationOther())) {
                throw new BusinessException("請核對實際位置後再保存");
            }
            if ("EXTERNAL".equals(dto.getActualHolderType()) && !StringUtils.hasText(dto.getActualHolderExternal())) {
                throw new BusinessException("外部保管需填寫保管方名稱");
            }
        }
    }

    private SysUser resolveActualHolder(EamInventoryItemCheckDTO dto) {
        if (!"EMPLOYEE".equals(dto.getActualHolderType()) || dto.getActualHolderId() == null) return null;
        SysUser u = userMapper.selectById(dto.getActualHolderId());
        if (u == null) throw new BusinessException("實際持有人在職核對失敗：員工不存在");
        if (u.getStatus() != null && u.getStatus() != 1) throw new BusinessException("實際持有人已停用，請重新選擇");
        return u;
    }

    private String actualHolderName(EamInventoryItemCheckDTO dto, SysUser resolved) {
        if (resolved != null) return resolved.getName();
        if (StringUtils.hasText(dto.getActualLocationOther())) return null;
        return null;
    }

    private LocalDateTime resolveCheckedAt(String value) {
        if (!StringUtils.hasText(value)) return LocalDateTime.now();
        try {
            LocalDateTime parsed = LocalDateTime.parse(value.trim(), DTF);
            if (parsed.isAfter(LocalDateTime.now())) throw new BusinessException("核對時間不可晚於當前時間");
            return parsed;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("核對時間格式應為 yyyy-MM-dd HH:mm:ss");
        }
    }

    private String requireRequestKey(String raw) {
        if (!StringUtils.hasText(raw) || !raw.trim().matches("[a-zA-Z0-9-]{16,64}")) {
            throw new BusinessException("請求編號無效，請刷新後重試");
        }
        return raw.trim();
    }

    private String locationName(Long id) {
        EamLocation l = id == null ? null : locationMapper.selectById(id);
        return l == null ? null : l.getName();
    }

    private Map<Long, EamAsset> loadCurrentAssets(List<Long> assetIds) {
        List<Long> ids = assetIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        return assetMapper.selectList(new LambdaQueryWrapper<EamAsset>().in(EamAsset::getId, ids))
                .stream().collect(Collectors.toMap(EamAsset::getId, a -> a, (x, y) -> x));
    }

    private EamAsset loadCurrentAsset(Long assetId) {
        return assetId == null ? null : assetMapper.selectById(assetId);
    }

    private String resolveHolderEmpNo(Long holderId, Map<Long, String> cache) {
        if (holderId == null) return null;
        return cache.computeIfAbsent(holderId, id -> {
            SysUser u = userMapper.selectById(id);
            return u == null ? null : u.getEmpId();
        });
    }

    private String displayName(SysUser u) {
        return StringUtils.hasText(u.getName()) ? u.getName() : u.getUsername();
    }

    private String checkSnapshot(EamInventoryItem it) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", it.getStatus());
        m.put("locationCheck", it.getLocationCheckResult());
        m.put("holderCheck", it.getHolderCheckResult());
        m.put("checkMethod", it.getCheckMethod());
        m.put("remark", it.getRemark());
        m.put("revision", it.getItemRevision());
        return JsonUtils.toJson(m);
    }

    private Map<String, Object> parseScopeSummary(String json) {
        if (!StringUtils.hasText(json)) return Map.of();
        return JsonUtils.parseMap(json);
    }

    private void recordEvent(long taskId, Long itemId, String action, String requestKey, String requestHash,
                              String before, String after) {
        EamInventoryEvent e = new EamInventoryEvent();
        e.setTaskId(taskId);
        e.setItemId(itemId);
        e.setAction(action);
        e.setRequestKey(requestKey);
        e.setRequestHash(requestHash);
        e.setBeforeJson(before);
        e.setAfterJson(after);
        SysUser u = operatorResolver.currentUser();
        e.setOperatorId(u != null ? u.getId() : null);
        e.setOperatorName(operatorResolver.currentOperatorName());
        e.setOperatorEmpNo(u != null ? u.getEmpId() : null);
        eventMapper.insert(e);
    }

    private EamInventoryEvent findEvent(long taskId, String requestKey) {
        return eventMapper.selectOne(new LambdaQueryWrapper<EamInventoryEvent>()
                .eq(EamInventoryEvent::getTaskId, taskId)
                .eq(EamInventoryEvent::getRequestKey, requestKey)
                .last("LIMIT 1"));
    }

    private Map<String, Object> summaryOf(EamInventoryScopeResolver.ResolvedScope r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scopeMode", r.scopeMode());
        m.put("locationIds", r.locationIds());
        m.put("locationNames", r.locationNames());
        m.put("categoryIds", r.categoryIds());
        m.put("categoryNames", r.categoryNames());
        m.put("departmentNames", r.departmentNames());
        m.put("companyBrand", r.companyBrand());
        m.put("statuses", r.statuses());
        return m;
    }

    private String statusLabel(String status) {
        return switch (Objects.toString(status, "")) {
            case "in_progress" -> "進行中";
            case "completed" -> "已完成";
            case "partially_completed" -> "部分完成";
            case "cancelled" -> "已取消";
            default -> Objects.toString(status, "");
        };
    }

    private String itemStatusLabel(String s) {
        return switch (Objects.toString(s, "")) {
            case "pending" -> "未確認";
            case "normal" -> "實物完好";
            case "lost" -> "未找到";
            case "damaged" -> "實物損壞";
            default -> Objects.toString(s, "");
        };
    }

    private int nz(Integer v) {
        return v == null ? 0 : v;
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private String trimOrNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private String firstText(String a, String b) {
        return StringUtils.hasText(a) ? a : Objects.toString(b, "");
    }

    private String csvCell(String value) {
        String v = value == null ? "" : value;
        // 公式注入防护：以 = + - @ 或制表/回车开头的文本前缀单引号
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) v = "'" + v;
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }

    private String csvRow(List<String> cells) {
        return cells.stream().map(this::csvCell).collect(Collectors.joining(","));
    }

    private Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private Integer asInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        try { return Integer.parseInt(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private String asStr(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private String md5(String raw) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("MD5").digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("摘要計算失敗", e);
        }
    }
}
