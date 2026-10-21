package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDeliveryItemDTO;
import com.mftb.admin.dto.RdmDeliveryItemVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmEvidenceInvalidation;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * RDM 交付项管理服务（Batch 1）。
 * <p>交付项是「需求下一个可独立验收的交付单元」：每条交付项有独立的范围版本、验收人、
 * 验收路径、测试批次和上线记录。状态机只允许服务端推导（recalculateStatus），
 * 客户端只能通过事实录入（任务进度、测试结果、验收签字）间接推动状态，
 * 避免前端直接 setStatus 绕过闸门。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmDeliveryItemService {

    private static final String SEQ_DELIVERY_ITEM = "rdm_delivery_item";

    /** executeOnce 业务类型：范围冻结（任务19 / 缺口4） */
    private static final String BIZ_SCOPE_FREEZE = "rdm_scope_freeze";
    /** executeOnce 业务类型：范围版本变更（任务19 / 缺口4） */
    private static final String BIZ_SCOPE_VERSION = "rdm_scope_version";

    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final RdmTestBatchMapper testBatchMapper;
    private final RdmTestExecutionMapper testExecutionMapper;
    private final RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmProjectMapper projectMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final RdmAccessGuard accessGuard;
    /** Batch 2：范围变更证据失效登记（仅用于范围变更时写入失效记录 insert） */
    private final RdmEvidenceInvalidationMapper evidenceInvalidationMapper;
    /** 任务33：范围变更「证据失效过滤」统一委派共享解析器，消除三处重复（只读失效登记） */
    private final EvidenceValidityResolver evidenceValidityResolver;
    /** 任务19 / 缺口4：交付项写操作的 V3 流程版本分层校验 */
    private final RdmFlowVersionGuard flowVersionGuard;
    /** 任务19 / 缺口4：冻结/范围变更写操作接入原子幂等 executeOnce */
    private final RdmIdempotentService idempotentService;

    /* ==================== 查询 ==================== */

    /** 交付项分页列表 */
    public Page<RdmDeliveryItemVO.ListItem> listItems(RdmDeliveryItemDTO.Query query, Long currentUserId) {
        RdmDeliveryItemDTO.Query q = query == null ? new RdmDeliveryItemDTO.Query() : query;
        LambdaQueryWrapper<RdmDeliveryItem> wrapper = new LambdaQueryWrapper<>();
        if (q.getReqId() != null) {
            wrapper.eq(RdmDeliveryItem::getReqId, q.getReqId());
        }
        if (q.getProjectId() != null) {
            wrapper.eq(RdmDeliveryItem::getProjectId, q.getProjectId());
        }
        if (StringUtils.hasText(q.getStatus())) {
            wrapper.eq(RdmDeliveryItem::getStatus, q.getStatus());
        }
        if (q.getCoordinatorUserId() != null) {
            wrapper.eq(RdmDeliveryItem::getCoordinatorUserId, q.getCoordinatorUserId());
        }
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            wrapper.and(w -> w.like(RdmDeliveryItem::getTitle, kw).or().like(RdmDeliveryItem::getItemNo, kw));
        }
        wrapper.orderByDesc(RdmDeliveryItem::getUpdatedAt);

        Page<RdmDeliveryItem> page = new Page<>(normalizePage(q.getPageNo()), normalizeSize(q.getPageSize()));
        Page<RdmDeliveryItem> result = deliveryItemMapper.selectPage(page, wrapper);

        // 批量加载关联数据
        List<RdmDeliveryItem> records = result.getRecords();
        List<Long> itemIds = records.stream().map(RdmDeliveryItem::getId).filter(Objects::nonNull).toList();
        Map<Long, String> reqTitleMap = loadReqTitles(records.stream().map(RdmDeliveryItem::getReqId).filter(Objects::nonNull).distinct().toList());
        Map<Long, String> reqNoMap = loadReqNos(records.stream().map(RdmDeliveryItem::getReqId).filter(Objects::nonNull).distinct().toList());
        Map<Long, String> projectNameMap = loadProjectNames(records.stream().map(RdmDeliveryItem::getProjectId).filter(Objects::nonNull).distinct().toList());
        Map<Long, Integer> progressMap = computeTaskProgressBatch(itemIds);
        Map<Long, String> testStatusMap = computeTestStatusBatch(itemIds);
        Map<Long, String> acceptanceStatusMap = computeAcceptanceStatusBatch(itemIds);

        Page<RdmDeliveryItemVO.ListItem> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(records.stream().map(item -> {
            RdmDeliveryItemVO.ListItem vo = new RdmDeliveryItemVO.ListItem();
            vo.setId(item.getId());
            vo.setItemNo(item.getItemNo());
            vo.setReqId(item.getReqId());
            vo.setReqTitle(reqTitleMap.get(item.getReqId()));
            vo.setReqNo(reqNoMap.get(item.getReqId()));
            vo.setProjectId(item.getProjectId());
            vo.setProjectName(projectNameMap.get(item.getProjectId()));
            vo.setTitle(item.getTitle());
            vo.setStatus(item.getStatus());
            vo.setCoordinatorUserName(item.getCoordinatorUserName());
            vo.setAcceptancePath(item.getAcceptancePath());
            vo.setPlanStartDate(DateTimeUtils.format(item.getPlanStartDate()));
            vo.setPlanEndDate(DateTimeUtils.format(item.getPlanEndDate()));
            vo.setScopeVersion(item.getScopeVersion());
            vo.setBlockedFlag(item.getBlockedFlag());
            vo.setTaskProgress(progressMap.getOrDefault(item.getId(), 0));
            vo.setTestStatus(testStatusMap.get(item.getId()));
            vo.setAcceptanceStatus(acceptanceStatusMap.get(item.getId()));
            vo.setUpdatedAt(DateTimeUtils.format(item.getUpdatedAt()));
            return vo;
        }).toList());
        return voPage;
    }

    /** 交付项详情 */
    public RdmDeliveryItemVO.Detail getItemDetail(Long id, Long currentUserId) {
        RdmDeliveryItem item = requireItem(id);
        RdmDeliveryItemVO.Detail vo = new RdmDeliveryItemVO.Detail();
        vo.setId(item.getId());
        vo.setItemNo(item.getItemNo());
        vo.setReqId(item.getReqId());
        RdmRequirement req = item.getReqId() == null ? null : requirementMapper.selectById(item.getReqId());
        if (req != null) {
            vo.setReqTitle(req.getTitle());
            vo.setReqNo(req.getReqNo());
        }
        vo.setProjectId(item.getProjectId());
        if (item.getProjectId() != null) {
            RdmProject project = projectMapper.selectById(item.getProjectId());
            if (project != null) {
                vo.setProjectName(project.getName());
            }
        }
        vo.setTitle(item.getTitle());
        vo.setStatus(item.getStatus());
        vo.setCoordinatorUserName(item.getCoordinatorUserName());
        vo.setCoordinatorUserId(item.getCoordinatorUserId());
        vo.setAcceptancePath(item.getAcceptancePath());
        vo.setPlanStartDate(DateTimeUtils.format(item.getPlanStartDate()));
        vo.setPlanEndDate(DateTimeUtils.format(item.getPlanEndDate()));
        vo.setScopeVersion(item.getScopeVersion());
        vo.setBlockedFlag(item.getBlockedFlag());
        vo.setScopeDesc(item.getScopeDesc());
        vo.setAcceptanceCriteria(item.getAcceptanceCriteria());
        vo.setPrdSnapshotId(item.getPrdSnapshotId());
        vo.setProductAcceptorUserName(item.getProductAcceptorUserName());
        vo.setBizAcceptorUserName(item.getBizAcceptorUserName());
        vo.setVersion(item.getVersion());
        vo.setCreatedAt(DateTimeUtils.format(item.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(item.getUpdatedAt()));
        // 推导字段
        vo.setTaskProgress(computeTaskProgress(id));
        vo.setTestStatus(computeTestStatus(id));
        vo.setAcceptanceStatus(computeAcceptanceStatus(id));
        // 关联子资源
        vo.setTasks(taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, id)
                .orderByAsc(RdmWorkTask::getCreatedAt)));
        vo.setTestBatches(loadTestBatchesForItem(id));
        vo.setAcceptanceRecords(acceptanceRecordMapper.selectList(new LambdaQueryWrapper<RdmAcceptanceRecord>()
                .eq(RdmAcceptanceRecord::getDeliveryItemId, id)
                .orderByDesc(RdmAcceptanceRecord::getCreatedAt)));
        vo.setIssues(issueMapper.selectList(new LambdaQueryWrapper<RdmIssue>()
                .eq(RdmIssue::getDeliveryItemId, id)
                .orderByDesc(RdmIssue::getCreatedAt)));
        return vo;
    }

    /* ==================== 写入 ==================== */

    /** 创建交付项 */
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryItem createItem(RdmDeliveryItemDTO.Create dto, Long currentUserId) {
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        if (dto.getReqId() == null) {
            throw new BusinessException("關聯需求不能為空");
        }
        if (!StringUtils.hasText(dto.getTitle())) {
            throw new BusinessException("交付項標題不能為空");
        }
        // 需求必须存在
        RdmRequirement req = requirementMapper.selectById(dto.getReqId());
        if (req == null) {
            throw new BusinessException("關聯需求不存在");
        }

        RdmDeliveryItem item = new RdmDeliveryItem();
        item.setItemNo(bizSeqService.next(SEQ_DELIVERY_ITEM));
        item.setReqId(dto.getReqId());
        item.setProjectId(dto.getProjectId());
        item.setTitle(dto.getTitle().trim());
        item.setScopeDesc(dto.getScopeDesc());
        item.setAcceptanceCriteria(dto.getAcceptanceCriteria());
        item.setScopeVersion(1);
        item.setCoordinatorUserId(dto.getCoordinatorUserId());
        item.setCoordinatorUserName(resolveUserName(dto.getCoordinatorUserId(), dto.getCoordinatorUserName()));
        item.setProductAcceptorUserId(dto.getProductAcceptorUserId());
        item.setProductAcceptorUserName(resolveUserName(dto.getProductAcceptorUserId(), dto.getProductAcceptorUserName()));
        item.setBizAcceptorUserId(dto.getBizAcceptorUserId());
        item.setBizAcceptorUserName(resolveUserName(dto.getBizAcceptorUserId(), dto.getBizAcceptorUserName()));
        // 验收路径：DTO > 项目默认 > A
        item.setAcceptancePath(resolveAcceptancePath(dto.getAcceptancePath(), dto.getProjectId()));
        item.setPlanStartDate(parseDate(dto.getPlanStartDate(), "計劃開始日期"));
        item.setPlanEndDate(parseDate(dto.getPlanEndDate(), "計劃結束日期"));
        item.setStatus(RdmConstants.DI_PREPARING);
        item.setBlockedFlag(0);
        deliveryItemMapper.insert(item);
        log.info("創建交付項: id={}, no={}, reqId={}, operator={}", item.getId(), item.getItemNo(), dto.getReqId(), currentUserId);
        return item;
    }

    /** 编辑交付项（乐观锁 + 分层校验 + 冻结保护） */
    @Transactional(rollbackFor = Exception.class)
    public void updateItem(Long id, RdmDeliveryItemDTO.Update dto, Long currentUserId) {
        RdmDeliveryItem item = requireItem(id);
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        // 任务19 / 缺口4：分层校验 —— 对象写权限 → V3 → 乐观锁 → 冻结状态，缺一不可；前端隐藏按钮不作为边界。
        // ① 对象写权限：反查所属需求，校验登录人在该需求上有交付写权限（不是持有菜单 edit 就能改别人的交付项）。
        // 身份由 accessGuard 从认证主体解析，不依赖入参 currentUserId。
        accessGuard.requireDeliveryWriter(item.getReqId(), "編輯交付項");
        // ② V3：交付项是 V3 分层链路语义，所属需求必须为 V3，挡住旧流程误入。
        if (!flowVersionGuard.isDeliveryItemFlowV3(id)) {
            throw new BusinessException("交付項僅適用於分批交付流程（V3）");
        }
        // ③ 乐观锁：expectedVersion 不匹配即拒（并发编辑保护）。
        if (dto.getExpectedVersion() == null || !dto.getExpectedVersion().equals(item.getVersion())) {
            throw new BusinessException("交付項已被他人修改，請刷新後重試");
        }
        // ④ 冻结保护：范围冻结后，普通 PATCH 不得绕过冻结改范围/验收标准/验收路径/状态，
        // 否则冻结形同虚设；改口径必须走 createNewScopeVersion 留痕并使旧证据失效。
        if (item.getScopeFrozenAt() != null) {
            if (dto.getScopeDesc() != null) {
                throw new BusinessException("範圍已凍結，不能通過普通編輯修改範圍描述，請走「新範圍版本」流程");
            }
            if (dto.getAcceptanceCriteria() != null) {
                throw new BusinessException("範圍已凍結，不能通過普通編輯修改驗收標準，請走「新範圍版本」流程");
            }
            if (StringUtils.hasText(dto.getAcceptancePath())) {
                throw new BusinessException("範圍已凍結，不能通過普通編輯修改驗收路徑，請走「新範圍版本」流程");
            }
            if (StringUtils.hasText(dto.getStatus())) {
                throw new BusinessException("範圍已凍結，不能通過普通編輯修改交付項狀態");
            }
        }
        if (StringUtils.hasText(dto.getTitle())) {
            item.setTitle(dto.getTitle().trim());
        }
        if (dto.getScopeDesc() != null) {
            item.setScopeDesc(dto.getScopeDesc());
        }
        if (dto.getAcceptanceCriteria() != null) {
            item.setAcceptanceCriteria(dto.getAcceptanceCriteria());
        }
        if (dto.getCoordinatorUserId() != null) {
            item.setCoordinatorUserId(dto.getCoordinatorUserId());
            item.setCoordinatorUserName(resolveUserName(dto.getCoordinatorUserId(), dto.getCoordinatorUserName()));
        }
        if (dto.getProductAcceptorUserId() != null) {
            item.setProductAcceptorUserId(dto.getProductAcceptorUserId());
            item.setProductAcceptorUserName(resolveUserName(dto.getProductAcceptorUserId(), dto.getProductAcceptorUserName()));
        }
        if (dto.getBizAcceptorUserId() != null) {
            item.setBizAcceptorUserId(dto.getBizAcceptorUserId());
            item.setBizAcceptorUserName(resolveUserName(dto.getBizAcceptorUserId(), dto.getBizAcceptorUserName()));
        }
        if (StringUtils.hasText(dto.getAcceptancePath())) {
            item.setAcceptancePath(dto.getAcceptancePath().toUpperCase());
        }
        if (dto.getPlanStartDate() != null) {
            item.setPlanStartDate(parseDate(dto.getPlanStartDate(), "計劃開始日期"));
        }
        if (dto.getPlanEndDate() != null) {
            item.setPlanEndDate(parseDate(dto.getPlanEndDate(), "計劃結束日期"));
        }
        if (StringUtils.hasText(dto.getStatus())) {
            item.setStatus(dto.getStatus());
        }
        if (deliveryItemMapper.updateById(item) == 0) {
            throw new BusinessException("交付項已被他人修改，請刷新後重試");
        }
        log.info("更新交付項: id={}, operator={}", id, currentUserId);
    }

    /* ==================== 状态推导 ==================== */

    /**
     * 重算交付项状态：基于任务/测试/验收事实推导，不允许手动设置跳跃。
     * <p>状态默认只能前进（preparing→developing→testing→pending_acceptance→pending_release→released_pending→done）；
     * <b>例外（任务19 / 缺口4）</b>：当范围变更使旧测试/验收证据失效后，支撑高状态的事实已不再成立，
     * 此时必须允许状态回退（不能只单调前进），否则「按旧范围验过的 done」会带着失效证据蒙混过关。
     * 回退仅在存在证据失效记录时才放行，避免事实抖动把状态无故打回；阻塞标记由 blockedFlag 独立管理。
     */
    @Transactional(rollbackFor = Exception.class)
    public void recalculateStatus(Long deliveryItemId) {
        RdmDeliveryItem item = requireItem(deliveryItemId);
        String current = item.getStatus();

        // computeStatus 已过滤失效证据：若支撑当前高状态的验收/测试证据已因范围变更失效，computed 会低于 current。
        String computed = computeStatus(deliveryItemId, item);
        if (!computed.equals(current)) {
            int computedOrder = statusOrder(computed);
            int currentOrder = statusOrder(current);
            if (computedOrder > currentOrder) {
                // 前进：事实推进（任务/测试/验收）
                item.setStatus(computed);
                deliveryItemMapper.updateById(item);
                log.info("交付項狀態推導: id={}, {} → {}", deliveryItemId, current, computed);
            } else if (computedOrder < currentOrder && hasInvalidatedEvidence(deliveryItemId)) {
                // 回退：仅当存在「范围变更导致的证据失效」时才允许，且以过滤失效证据后的推导值为准。
                item.setStatus(computed);
                deliveryItemMapper.updateById(item);
                log.info("交付項狀態因證據失效回退: id={}, {} → {}", deliveryItemId, current, computed);
            }
        }
        // 阻塞标记：有任何 blocked 任务即标阻塞
        long blockedTasks = taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId)
                .eq(RdmWorkTask::getStatus, "blocked"));
        int newFlag = blockedTasks > 0 ? 1 : 0;
        if (!Objects.equals(item.getBlockedFlag(), newFlag)) {
            item.setBlockedFlag(newFlag);
            deliveryItemMapper.updateById(item);
        }
    }

    /**
     * 该交付项是否存在「范围变更导致的证据失效」记录（任务19 / 缺口4）。
     * <p>决定 recalculateStatus 是否允许状态回退：只有确因范围变更使旧证据失效，才把状态打回，
     * 避免下游事实短暂抖动造成状态来回跳。
     */
    private boolean hasInvalidatedEvidence(Long deliveryItemId) {
        // 任务33：委派共享解析器（与测试/验收门禁同源同一失效登记读取口径）
        return evidenceValidityResolver.hasAnyInvalidation(deliveryItemId);
    }

    /** 加载仍然有效（未因范围变更失效）的测试批次，供状态推导与测试状态回显使用。 */
    private List<RdmTestBatch> loadValidTestBatches(Long deliveryItemId) {
        // 任务33：全量批次仍按本服务口径加载（delivery_item_ids_json 关联过滤），失效过滤委派共享解析器
        return evidenceValidityResolver.validTestBatches(deliveryItemId, loadTestBatchesForItem(deliveryItemId));
    }

    /** 加载仍然有效（未因范围变更失效）的验收记录，按创建时间倒序，供状态推导与验收状态回显使用。 */
    private List<RdmAcceptanceRecord> loadValidAcceptanceRecords(Long deliveryItemId) {
        // 任务33：全量记录仍按本服务口径加载（createdAt 倒序，computeAcceptanceStatus 取首条依赖此序），失效过滤委派共享解析器
        List<RdmAcceptanceRecord> all = acceptanceRecordMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceRecord>()
                        .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId)
                        .orderByDesc(RdmAcceptanceRecord::getCreatedAt));
        return evidenceValidityResolver.validAcceptanceRecords(deliveryItemId, all);
    }

    /**
     * 按任务解析提测/验收范围（研发「按任务交付给测试」的入口语义）。
     *
     * <p><b>为何不改提测核心</b>：测试批次、用例快照、验收记录、发布闸门全部以
     * {@code delivery_item_id} 为唯一验收单位。若把“验收单位”改成多态（交付项或任务），
     * 上述每一处都要分叉。这里只做一层入口映射：任务已挂交付项就复用，没挂就归入该需求的
     * 默认交付项（{@link #getOrCreateDefaultItem}）并回填 {@code rdm_work_task.delivery_item_id}。
     *
     * <p><b>安全边界</b>：任务必须属于传入需求，否则拒绝——
     * 否则 A 需求的任务会被算进 B 需求的提测范围，冻结出越界快照。
     */
    @Transactional(rollbackFor = Exception.class)
    public List<RdmDeliveryItem> resolveTaskScope(Long reqId, List<Long> taskIds, Long currentUserId) {
        if (reqId == null) {
            throw new BusinessException("需求不能為空");
        }
        if (taskIds == null || taskIds.isEmpty()) {
            throw new BusinessException("請至少選擇一個任務");
        }
        // 只有 V3 才以交付项为验收单位；V1/V2 需求没有交付项语义，不得从这里混入
        flowVersionGuard.requireFlowV3(reqId);
        List<Long> ids = taskIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            throw new BusinessException("請至少選擇一個任務");
        }
        List<RdmWorkTask> tasks = taskMapper.selectBatchIds(ids);
        if (tasks == null || tasks.isEmpty()) {
            throw new BusinessException("任務不存在或已刪除");
        }
        for (RdmWorkTask task : tasks) {
            if (task.getReqId() == null || !reqId.equals(task.getReqId())) {
                throw new BusinessException("任務不屬於當前需求，拒絕按任務提測");
            }
        }

        Map<Long, RdmDeliveryItem> resolved = new LinkedHashMap<>();
        RdmDeliveryItem defaultItem = null;
        for (RdmWorkTask task : tasks) {
            RdmDeliveryItem item = task.getDeliveryItemId() == null
                    ? null : deliveryItemMapper.selectById(task.getDeliveryItemId());
            if (item == null || !reqId.equals(item.getReqId())) {
                if (defaultItem == null) {
                    defaultItem = getOrCreateDefaultItem(reqId, currentUserId);
                }
                item = defaultItem;
                // 回填任务归属：下次同一任务再提测就能直接复用，不必重复解析
                task.setDeliveryItemId(item.getId());
                taskMapper.updateById(task);
            }
            resolved.putIfAbsent(item.getId(), item);
        }
        log.info("按任務解析提測範圍: reqId={}, tasks={}, items={}, operator={}",
                reqId, tasks.size(), resolved.size(), currentUserId);
        return new ArrayList<>(resolved.values());
    }

    /**
     * 为简单需求获取或创建默认交付项。
     * <p>简单需求（无拆分必要）自动创建一个覆盖整条需求的交付项，
     * 避免用户手动操作一步无意义的"新建交付项"。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmDeliveryItem getOrCreateDefaultItem(Long reqId, Long currentUserId) {
        if (reqId == null) {
            throw new BusinessException("需求ID不能為空");
        }
        // 已有交付项则返回第一条
        List<RdmDeliveryItem> existing = deliveryItemMapper.selectList(
                new LambdaQueryWrapper<RdmDeliveryItem>()
                        .eq(RdmDeliveryItem::getReqId, reqId)
                        .orderByAsc(RdmDeliveryItem::getCreatedAt)
                        .last("LIMIT 1"));
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        // 自动创建
        RdmRequirement req = requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("需求不存在");
        }
        RdmDeliveryItemDTO.Create dto = new RdmDeliveryItemDTO.Create();
        dto.setReqId(reqId);
        dto.setProjectId(req.getProjectId());
        dto.setTitle(req.getTitle());
        dto.setCoordinatorUserId(req.getDevOwnerUserId());
        dto.setCoordinatorUserName(req.getDevOwnerName());
        dto.setProductAcceptorUserId(req.getAssigneePmUserId());
        dto.setProductAcceptorUserName(req.getAssigneePmName());
        dto.setBizAcceptorUserId(req.getAcceptorUserId());
        dto.setBizAcceptorUserName(req.getAcceptorName());
        dto.setPlanStartDate(req.getPlanDevDate() == null ? null : req.getPlanDevDate().toString());
        dto.setPlanEndDate(req.getPlanReleaseDate() == null ? null : req.getPlanReleaseDate().toString());
        return createItem(dto, currentUserId);
    }

    /* ==================== 范围版本（Batch 2 / Phase 1A） ==================== */

    /**
     * 冻结交付项范围（客户端调用的幂等入口）—— 冻结后修改须走范围变更流程（{@link #createNewScopeVersion}）。
     * <p>只有协调人或管理员可冻结；重复冻结拒绝，避免覆盖首次冻结时间导致留痕失真。
     * <p><b>任务19 / 缺口4 + 决策1/2</b>：以 executeOnce 包裹，本身即事务边界，实际逻辑落在 {@link #doFreezeScope}。
     * <b>服务端派生幂等键（决策1，不改 DTO/Controller）</b>：freeze-scope 是无 body 的 POST，无 client 令牌，
     * 改由服务端派生：resourceKey={@code delivery_item:<itemId>}，clientRequestId={@code freeze:scope_v<当前范围版本>}
     *（以 scopeVersion 作判别子：冻结不改变 scopeVersion，同一版本的冻结重试→回放；范围变更升版解冻后再冻结→新版本判别子→各自执行）。
     */
    public void freezeScope(Long itemId, Long currentUserId) {
        RdmDeliveryItem item = requireItem(itemId);
        int scopeVersion = item.getScopeVersion() == null ? 1 : item.getScopeVersion();
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_SCOPE_FREEZE)
                .resourceKey("delivery_item:" + itemId)
                .clientRequestId("freeze:scope_v" + scopeVersion)
                .requestHash(idempotentService.stableRequestHash(List.of(
                        "freeze", String.valueOf(itemId), String.valueOf(scopeVersion), String.valueOf(currentUserId))))
                .build();
        // executeOnce 自身即事务边界；doFreezeScope 的 @Transactional 以 REQUIRED 加入本事务。
        idempotentService.executeOnce(key, () -> {
            doFreezeScope(itemId, currentUserId);
            return null;
        }, Void.class);
    }

    /** 冻结范围的实际逻辑（事务内纯逻辑，不含 executeOnce）。 */
    @Transactional(rollbackFor = Exception.class)
    public void doFreezeScope(Long itemId, Long currentUserId) {
        RdmDeliveryItem item = requireItem(itemId);
        if (item.getScopeFrozenAt() != null) {
            throw new BusinessException("範圍已凍結，無需重複凍結");
        }
        accessGuard.requireDeliveryCoordinator(itemId, currentUserId);
        item.setScopeFrozenAt(LocalDateTime.now());
        item.setScopeFrozenBy(currentUserId);
        if (deliveryItemMapper.updateById(item) == 0) {
            throw new BusinessException("交付項已被他人修改，請刷新後重試");
        }
        log.info("交付項範圍已凍結: itemId={}, userId={}", itemId, currentUserId);
    }

    /**
     * 创建新范围版本（客户端调用的幂等入口）—— 范围变更：version+1，解冻，并把旧范围下的证据登记为失效。
     * <p>证据只登记失效、不删除：旧测试/验收是历史事实，删了就无从追溯“当时按什么范围验的”。
     * <p><b>任务19 / 缺口4 + 决策1/2</b>：以 executeOnce 包裹，实际逻辑落在 {@link #doCreateNewScopeVersion}。
     * <b>服务端派生幂等键（决策1）</b>：范围变更 DTO 无 client 令牌。注意：范围变更会 bump scopeVersion，
     * 若用「当前 scopeVersion」作判别子，提交后的重试会因版本已进而被当成新操作再次执行（双副作用）；
     * 故这里以「请求内容哈希」作 clientRequestId，保证同一逻辑变更无论重试多少次都稳定命中同一幂等键→回放，
     * 不同内容的变更→不同键→各自执行；requestHash 同取内容哈希用于一致性校验。
     */
    public void createNewScopeVersion(Long itemId, String changeReason, String newScopeDesc,
                                      String newAcceptanceCriteria, Long currentUserId) {
        // 前置 fail-fast：不为非法请求白占幂等位
        RdmDeliveryItem item = requireItem(itemId);
        if (item.getScopeFrozenAt() == null) {
            throw new BusinessException("範圍未凍結，无需变更版本");
        }
        if (!StringUtils.hasText(changeReason)) {
            throw new BusinessException("範圍變更原因不能為空");
        }
        String contentHash = idempotentService.stableRequestHash(List.of(
                String.valueOf(itemId),
                changeReason,
                newScopeDesc == null ? "" : newScopeDesc,
                newAcceptanceCriteria == null ? "" : newAcceptanceCriteria));
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_SCOPE_VERSION)
                .resourceKey("delivery_item:" + itemId)
                .clientRequestId("scope_change:" + contentHash)
                .requestHash(contentHash)
                .build();
        idempotentService.executeOnce(key, () -> {
            doCreateNewScopeVersion(itemId, changeReason, newScopeDesc, newAcceptanceCriteria, currentUserId);
            return null;
        }, Void.class);
    }

    /** 范围版本变更的实际逻辑（事务内纯逻辑，不含 executeOnce）。 */
    @Transactional(rollbackFor = Exception.class)
    public void doCreateNewScopeVersion(Long itemId, String changeReason, String newScopeDesc,
                                        String newAcceptanceCriteria, Long currentUserId) {
        RdmDeliveryItem item = requireItem(itemId);
        if (item.getScopeFrozenAt() == null) {
            throw new BusinessException("範圍未凍結，无需变更版本");
        }
        if (!StringUtils.hasText(changeReason)) {
            throw new BusinessException("範圍變更原因不能為空");
        }
        accessGuard.requireDeliveryCoordinator(itemId, currentUserId);

        int oldVersion = item.getScopeVersion() == null ? 1 : item.getScopeVersion();
        int newVersion = oldVersion + 1;
        // 任务19 / 缺口4：范围变更必须关联批准引用。DTO 无 approvalRef、不宜加 DB 列，
        // 故由服务端派生稳定 scopeChangeId 作为可追溯的批准/审计标识，写入不可变的 scopeChangeLog 历史条目（保留历史不删）。
        String scopeChangeId = "SC-" + itemId + "-" + oldVersion + "to" + newVersion;

        item.setScopeVersion(newVersion);
        if (newScopeDesc != null) {
            item.setScopeDesc(newScopeDesc);
        }
        if (newAcceptanceCriteria != null) {
            item.setAcceptanceCriteria(newAcceptanceCriteria);
        }
        // 追加变更日志（写入 item.scopeChangeLog，随主更新一并落库）
        appendScopeChangeLog(item, oldVersion, newVersion, changeReason, currentUserId, scopeChangeId);
        if (deliveryItemMapper.updateById(item) == 0) {
            throw new BusinessException("交付項已被他人修改，請刷新後重試");
        }
        // 解冻：updateById 默认忽略 null 字段，须用 UpdateWrapper 显式置空
        deliveryItemMapper.update(null, new LambdaUpdateWrapper<RdmDeliveryItem>()
                .eq(RdmDeliveryItem::getId, itemId)
                .set(RdmDeliveryItem::getScopeFrozenAt, null)
                .set(RdmDeliveryItem::getScopeFrozenBy, null));

        invalidateRelatedEvidence(itemId, oldVersion, newVersion, currentUserId, changeReason);
        // 任务19 / 缺口4：范围变更使旧测试/验收证据失效后，立即重算状态，让「证据失效导致的状态回退」当场生效，
        // 否则交付项会停在按旧范围推得的 done/pending_release，直到下一次手动重算。
        recalculateStatus(itemId);
        log.info("交付項範圍版本變更: itemId={}, v{}→v{}, scopeChangeId={}, reason={}", itemId, oldVersion, newVersion, scopeChangeId, changeReason);
    }

    /** 获取范围版本历史（解析 scope_change_log JSON） */
    public List<ScopeVersionEntry> getScopeVersionHistory(Long itemId) {
        RdmDeliveryItem item = requireItem(itemId);
        List<Map<String, Object>> raw = JsonUtils.parseMapList(item.getScopeChangeLog());
        List<ScopeVersionEntry> history = new ArrayList<>();
        for (Map<String, Object> entry : raw) {
            ScopeVersionEntry e = new ScopeVersionEntry();
            e.setVersion(toInt(entry.get("version")));
            e.setReason(entry.get("reason") == null ? null : String.valueOf(entry.get("reason")));
            e.setUserId(toLong(entry.get("userId")));
            e.setUserName(entry.get("userName") == null ? null : String.valueOf(entry.get("userName")));
            e.setTime(entry.get("time") == null ? null : String.valueOf(entry.get("time")));
            history.add(e);
        }
        return history;
    }

    /** 追加一条范围变更日志到 item.scopeChangeLog（JSON 数组）；scopeChangeId 为可追溯的批准/审计标识 */
    private void appendScopeChangeLog(RdmDeliveryItem item, int oldVersion, int newVersion,
                                      String reason, Long userId, String scopeChangeId) {
        List<Map<String, Object>> entries = JsonUtils.parseMapList(item.getScopeChangeLog());
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("scopeChangeId", scopeChangeId);
        entry.put("version", newVersion);
        entry.put("fromVersion", oldVersion);
        entry.put("reason", reason);
        entry.put("userId", userId);
        entry.put("userName", resolveUserName(userId, null));
        entry.put("time", DateTimeUtils.format(LocalDateTime.now()));
        entries.add(entry);
        item.setScopeChangeLog(JsonUtils.toJson(entries));
    }

    /**
     * 失效相关证据：范围变更后，把该交付项下的测试批次与验收记录登记为「基于旧范围，已失效」。
     * <p>只写失效记录、不删除也不改证据本身的状态，保留完整历史事实。
     */
    private void invalidateRelatedEvidence(Long itemId, int oldVersion, int newVersion, Long userId, String reason) {
        LocalDateTime now = LocalDateTime.now();
        for (RdmTestBatch batch : loadTestBatchesForItem(itemId)) {
            insertInvalidation(itemId, RdmEvidenceInvalidation.TYPE_TEST_BATCH, batch.getId(),
                    oldVersion, newVersion, userId, reason, now);
        }
        List<RdmAcceptanceRecord> records = acceptanceRecordMapper.selectList(
                new LambdaQueryWrapper<RdmAcceptanceRecord>().eq(RdmAcceptanceRecord::getDeliveryItemId, itemId));
        for (RdmAcceptanceRecord record : records) {
            insertInvalidation(itemId, RdmEvidenceInvalidation.TYPE_ACCEPTANCE, record.getId(),
                    oldVersion, newVersion, userId, reason, now);
        }
    }

    private void insertInvalidation(Long itemId, String type, Long evidenceId, int oldVersion, int newVersion,
                                    Long userId, String reason, LocalDateTime now) {
        if (evidenceId == null) {
            return;
        }
        RdmEvidenceInvalidation inv = new RdmEvidenceInvalidation();
        inv.setDeliveryItemId(itemId);
        inv.setEvidenceType(type);
        inv.setEvidenceId(evidenceId);
        inv.setOldScopeVersion(oldVersion);
        inv.setNewScopeVersion(newVersion);
        inv.setInvalidatedAt(now);
        inv.setInvalidatedBy(userId);
        inv.setReason(reason != null && reason.length() > 300 ? reason.substring(0, 300) : reason);
        evidenceInvalidationMapper.insert(inv);
    }

    private static Integer toInt(Object value) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return value == null ? null : Integer.valueOf(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Long toLong(Object value) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return value == null ? null : Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 范围版本历史条目 */
    @Data
    public static class ScopeVersionEntry {
        private Integer version;
        private String reason;
        private Long userId;
        private String userName;
        private String time;
    }

    /* ==================== 内部工具 ==================== */

    private RdmDeliveryItem requireItem(Long id) {
        RdmDeliveryItem item = id == null ? null : deliveryItemMapper.selectById(id);
        if (item == null) {
            throw new BusinessException("交付項不存在");
        }
        return item;
    }

    private String computeStatus(Long deliveryItemId, RdmDeliveryItem item) {
        // 任务19 / 缺口4：只按「未因范围变更失效」的证据推导状态，失效的验收/测试记录不再作为凭证。
        List<RdmAcceptanceRecord> validRecords = loadValidAcceptanceRecords(deliveryItemId);
        // 验收记录通过 → 看路径决定 pending_release / released_pending / done
        boolean passedAcceptance = validRecords.stream()
                .anyMatch(r -> RdmConstants.ACCEPT_PASS.equals(r.getConclusion()));
        if (passedAcceptance) {
            if (RdmConstants.PATH_A.equals(item.getAcceptancePath())) {
                return RdmConstants.DI_PENDING_RELEASE;
            } else {
                return RdmConstants.DI_DONE;
            }
        }
        // 有条件通过 → pending_release
        boolean conditionalAcceptance = validRecords.stream()
                .anyMatch(r -> RdmConstants.ACCEPT_CONDITIONAL.equals(r.getConclusion()));
        if (conditionalAcceptance) {
            return RdmConstants.DI_PENDING_RELEASE;
        }
        // 测试批次通过 → pending_acceptance
        List<RdmTestBatch> batches = loadValidTestBatches(deliveryItemId);
        boolean testPassed = batches.stream().anyMatch(b -> RdmConstants.TB_PASSED.equals(b.getStatus()));
        if (testPassed) {
            return RdmConstants.DI_PENDING_ACCEPTANCE;
        }
        // 测试批次执行中 → testing
        boolean testing = batches.stream().anyMatch(b ->
                RdmConstants.TB_EXECUTING.equals(b.getStatus()) || RdmConstants.TB_ACCEPTED.equals(b.getStatus()));
        if (testing) {
            return RdmConstants.DI_TESTING;
        }
        // 有任务进行中 → developing
        long doingTasks = taskMapper.selectCount(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId)
                .in(RdmWorkTask::getStatus, List.of("doing", "done", "blocked")));
        if (doingTasks > 0) {
            return RdmConstants.DI_DEVELOPING;
        }
        return RdmConstants.DI_PREPARING;
    }

    private int statusOrder(String status) {
        if (status == null) return 0;
        return switch (status) {
            case RdmConstants.DI_PREPARING -> 1;
            case RdmConstants.DI_DEVELOPING -> 2;
            case RdmConstants.DI_TESTING -> 3;
            case RdmConstants.DI_PENDING_ACCEPTANCE -> 4;
            case RdmConstants.DI_PENDING_RELEASE -> 5;
            case RdmConstants.DI_RELEASED_PENDING -> 6;
            case RdmConstants.DI_DONE -> 7;
            default -> 0;
        };
    }

    private List<RdmTestBatch> loadTestBatchesForItem(Long deliveryItemId) {
        if (deliveryItemId == null) return List.of();
        // test_batch 通过 delivery_item_ids_json 关联（JSON 数组），只能全查后过滤
        // 对于数据量大的场景应改为关联表，当前先按 JSON contains 过滤
        return testBatchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                        .like(RdmTestBatch::getDeliveryItemIdsJson, String.valueOf(deliveryItemId)))
                .stream()
                .filter(b -> {
                    List<Long> ids = JsonUtils.parseLongList(b.getDeliveryItemIdsJson());
                    return ids != null && ids.contains(deliveryItemId);
                })
                .toList();
    }

    private Integer computeTaskProgress(Long deliveryItemId) {
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId));
        if (tasks.isEmpty()) return 0;
        int total = tasks.size();
        long done = tasks.stream().filter(t -> "done".equals(t.getStatus())).count();
        return (int) (done * 100 / total);
    }

    private String computeTestStatus(Long deliveryItemId) {
        // 任务19 / 缺口4：已因范围变更失效的测试批次不再计入测试状态。
        List<RdmTestBatch> batches = loadValidTestBatches(deliveryItemId);
        if (batches.isEmpty()) return null;
        if (batches.stream().anyMatch(b -> RdmConstants.TB_PASSED.equals(b.getStatus()))) return "passed";
        if (batches.stream().anyMatch(b -> RdmConstants.TB_FAILED.equals(b.getStatus()))) return "failed";
        if (batches.stream().anyMatch(b -> RdmConstants.TB_EXECUTING.equals(b.getStatus()))) return "executing";
        return "pending";
    }

    private String computeAcceptanceStatus(Long deliveryItemId) {
        // 任务19 / 缺口4：已因范围变更失效的验收记录不再作为当前验收状态。
        List<RdmAcceptanceRecord> records = loadValidAcceptanceRecords(deliveryItemId);
        if (records.isEmpty()) return null;
        RdmAcceptanceRecord latest = records.get(0);
        return latest.getConclusion();
    }

    private Map<Long, Integer> computeTaskProgressBatch(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) return Collections.emptyMap();
        List<RdmWorkTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .in(RdmWorkTask::getDeliveryItemId, itemIds));
        Map<Long, List<RdmWorkTask>> grouped = tasks.stream()
                .filter(t -> t.getDeliveryItemId() != null)
                .collect(Collectors.groupingBy(RdmWorkTask::getDeliveryItemId));
        return grouped.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, e -> {
            List<RdmWorkTask> list = e.getValue();
            if (list.isEmpty()) return 0;
            long done = list.stream().filter(t -> "done".equals(t.getStatus())).count();
            return (int) (done * 100 / list.size());
        }));
    }

    private Map<Long, String> computeTestStatusBatch(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) return Collections.emptyMap();
        // 简化：对每个 itemId 独立计算（批量场景可优化为单次全查后分组）
        return itemIds.stream().collect(Collectors.toMap(id -> id, id -> {
            String s = computeTestStatus(id);
            return s == null ? "" : s;
        }, (a, b) -> a));
    }

    private Map<Long, String> computeAcceptanceStatusBatch(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) return Collections.emptyMap();
        return itemIds.stream().collect(Collectors.toMap(id -> id, id -> {
            String s = computeAcceptanceStatus(id);
            return s == null ? "" : s;
        }, (a, b) -> a));
    }

    /**
     * 批量装配的空集兜底一律用 {@code Collections.emptyMap()}，禁止 {@code Map.of()}：
     * 调用方用可能为 NULL 的外键回取（如 {@code item.getProjectId()}），而 JDK 不可变 Map 的
     * {@code get(null)} 会抛 NPE（HashMap 只返回 null）。整页结果的关联外键全为 NULL 时，
     * 列表接口就会 500「系統繁忙」——真实原因被 GlobalExceptionHandler 兜住，用户与监控都看不到。
     */
    private Map<Long, String> loadReqTitles(List<Long> reqIds) {
        if (reqIds == null || reqIds.isEmpty()) return Collections.emptyMap();
        return requirementMapper.selectBatchIds(reqIds).stream()
                .collect(Collectors.toMap(RdmRequirement::getId, r -> r.getTitle() == null ? "" : r.getTitle(), (a, b) -> a));
    }

    private Map<Long, String> loadReqNos(List<Long> reqIds) {
        if (reqIds == null || reqIds.isEmpty()) return Collections.emptyMap();
        return requirementMapper.selectBatchIds(reqIds).stream()
                .collect(Collectors.toMap(RdmRequirement::getId, r -> r.getReqNo() == null ? "" : r.getReqNo(), (a, b) -> a));
    }

    private Map<Long, String> loadProjectNames(List<Long> projectIds) {
        if (projectIds == null || projectIds.isEmpty()) return Collections.emptyMap();
        return projectMapper.selectBatchIds(projectIds).stream()
                .collect(Collectors.toMap(RdmProject::getId, p -> p.getName() == null ? "" : p.getName(), (a, b) -> a));
    }

    /**
     * 验收路径解析：DTO > 项目默认 > A。
     *
     * <p>必须在此收敛枚举：库里 acceptance_path 是 VARCHAR(10) 且只有 A/B 两种语义，
     * 旧写法把任意传入值大写后直接落库，超长的字符串会撞 MysqlDataTruncation，
     * 被 GlobalExceptionHandler 兜成「數據庫操作異常, 請稍後重試」——用户看不到是自己选错了路径，
     * 监控里也只有一条无业务语义的 500（端到端实跑时送 acceptancePath=PRODUCT_ONLY 即复现）。
     * 不能只靠前端下拉兜底：接口是边界。
     */
    private String resolveAcceptancePath(String dtoPath, Long projectId) {
        if (StringUtils.hasText(dtoPath)) {
            return requireAcceptancePath(dtoPath.toUpperCase());
        }
        if (projectId != null) {
            RdmProject project = projectMapper.selectById(projectId);
            if (project != null && StringUtils.hasText(project.getDefaultAcceptancePath())) {
                return requireAcceptancePath(project.getDefaultAcceptancePath().toUpperCase());
            }
        }
        return RdmConstants.PATH_A;
    }

    private String requireAcceptancePath(String path) {
        if (!RdmConstants.PATH_A.equals(path) && !RdmConstants.PATH_B.equals(path)) {
            throw new BusinessException("驗收路徑只支持 A（先驗收後上線）或 B（先上線後驗收），當前值：" + path);
        }
        return path;
    }

    private String resolveUserName(Long userId, String fallback) {
        if (StringUtils.hasText(fallback)) {
            return fallback;
        }
        if (userId == null) {
            return null;
        }
        SysUser user = userMapper.selectById(userId);
        return user == null ? null : user.getName();
    }

    private LocalDate parseDate(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(fieldName + "格式不正確，應為 yyyy-MM-dd");
        }
    }

    private long normalizePage(Integer pageNo) {
        return pageNo == null || pageNo < 1 ? 1 : pageNo;
    }

    private long normalizeSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) return 20;
        return Math.min(pageSize, 200);
    }
}
