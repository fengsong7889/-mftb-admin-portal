package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamInventoryItem;
import com.mftb.admin.entity.EamInventoryTask;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamInventoryItemMapper;
import com.mftb.admin.mapper.EamInventoryTaskMapper;
import com.mftb.admin.service.EamInventoryService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 资产盘点服务实现
 * <p>
 * 业务流程：
 * <ol>
 *   <li>发起盘点 → 快照当前所有未报废资产作为应盘清单</li>
 *   <li>逐资产核对 → 标记正常/缺失/损坏</li>
 *   <li>提交结果 → 自动计算差异并完成任务</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamInventoryServiceImpl implements EamInventoryService {

    private final EamInventoryTaskMapper taskMapper;
    private final EamInventoryItemMapper itemMapper;
    private final EamAssetMapper assetMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    private static final Set<String> VALID_ITEM_STATUSES = Set.of("normal", "lost", "damaged");

    @Override
    public PageResult<EamInventoryTaskVO> page(EamInventoryQuery query) {
        LambdaQueryWrapper<EamInventoryTask> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            wrapper.like(EamInventoryTask::getTaskName, query.getKeyword());
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(EamInventoryTask::getStatus, query.getStatus());
        }
        Page<EamInventoryTask> page = taskMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper.orderByDesc(EamInventoryTask::getCreatedAt, EamInventoryTask::getId));
        List<EamInventoryTaskVO> records = page.getRecords().stream().map(this::toTaskVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamInventoryTaskVO detail(long id) {
        EamInventoryTask task = taskMapper.selectById(id);
        if (task == null) throw new BusinessException("盤點任務不存在");
        EamInventoryTaskVO vo = toTaskVO(task);

        // 查询明细列表
        List<EamInventoryItem> items = itemMapper.selectList(
                new LambdaQueryWrapper<EamInventoryItem>()
                        .eq(EamInventoryItem::getTaskId, id)
                        .orderByAsc(EamInventoryItem::getId));
        vo.setItems(items.stream().map(this::toItemVO).toList());
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String create(EamInventoryCreateDTO dto) {
        if (!StringUtils.hasText(dto.getTaskName())) throw new BusinessException("盤點任務名稱不能為空");
        if (!StringUtils.hasText(dto.getOperator())) throw new BusinessException("盤點人不能為空");

        // 生成盘点任务编号（PD + YYYYMMDD + 4位）
        String taskNo = bizSeqService.next(BizSeqService.RULE_EAM_INVENTORY);

        // 快照当前所有未报废资产
        List<EamAsset> assets = assetMapper.selectList(
                new LambdaQueryWrapper<EamAsset>()
                        .ne(EamAsset::getStatus, "scrapped")
                        .eq(EamAsset::getDeleted, 0)
                        .orderByAsc(EamAsset::getId));

        // 创建盘点任务
        EamInventoryTask task = new EamInventoryTask();
        task.setTaskNo(taskNo);
        task.setTaskName(dto.getTaskName());
        task.setInventoryDate(LocalDate.now().toString());
        task.setOperator(dto.getOperator());
        task.setExpectedCount(assets.size());
        task.setActualCount(0);
        task.setDiffCount(0);
        task.setStatus("in_progress");
        task.setRemark("");
        task.setCreatedBy(operatorResolver.currentOperatorName());
        task.setUpdatedBy(operatorResolver.currentOperatorName());
        taskMapper.insert(task);

        // 批量创建盘点明细（每条资产一条，初始状态 pending）
        String operator = operatorResolver.currentOperatorName();
        for (EamAsset asset : assets) {
            EamInventoryItem item = new EamInventoryItem();
            item.setTaskId(task.getId());
            item.setAssetId(asset.getId());
            item.setAssetNo(asset.getAssetNo());
            item.setAssetName(asset.getAssetName());
            item.setAssetType(asset.getAssetType());
            item.setLocation(asset.getLocation());
            item.setStatus("pending");
            item.setRemark("");
            item.setCreatedBy(operator);
            item.setUpdatedBy(operator);
            itemMapper.insert(item);
        }

        log.info("创建盘点任务: {} ({}), 应盘资产 {} 件", taskNo, dto.getTaskName(), assets.size());
        return taskNo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void submit(EamInventorySubmitDTO dto) {
        if (!StringUtils.hasText(dto.getTaskNo())) throw new BusinessException("盤點任務編號不能為空");

        EamInventoryTask task = taskMapper.selectOne(
                new LambdaQueryWrapper<EamInventoryTask>()
                        .eq(EamInventoryTask::getTaskNo, dto.getTaskNo()));
        if (task == null) throw new BusinessException("盤點任務不存在");
        if (!"in_progress".equals(task.getStatus())) {
            throw new BusinessException("僅允許提交進行中的盤點任務");
        }

        // 查询该任务的所有明细
        List<EamInventoryItem> existingItems = itemMapper.selectList(
                new LambdaQueryWrapper<EamInventoryItem>()
                        .eq(EamInventoryItem::getTaskId, task.getId()));
        Map<Long, EamInventoryItem> itemMap = existingItems.stream()
                .collect(Collectors.toMap(EamInventoryItem::getAssetId, Function.identity()));

        // 更新每条明细的盘点状态
        if (dto.getItems() != null) {
            for (EamInventorySubmitItemDTO submitItem : dto.getItems()) {
                if (submitItem.getAssetId() == null) continue;
                if (!VALID_ITEM_STATUSES.contains(submitItem.getStatus())) {
                    throw new BusinessException("無效的盤點狀態: " + submitItem.getStatus());
                }
                EamInventoryItem item = itemMap.get(submitItem.getAssetId());
                if (item == null) {
                    log.warn("盘点提交中包含不在任务清单中的资产 ID={}, 跳过", submitItem.getAssetId());
                    continue;
                }
                item.setStatus(submitItem.getStatus());
                if (StringUtils.hasText(submitItem.getRemark())) {
                    item.setRemark(submitItem.getRemark());
                }
                item.setUpdatedBy(operatorResolver.currentOperatorName());
                itemMapper.updateById(item);
            }
        }

        // 重新查询更新后的明细，计算统计
        List<EamInventoryItem> updatedItems = itemMapper.selectList(
                new LambdaQueryWrapper<EamInventoryItem>()
                        .eq(EamInventoryItem::getTaskId, task.getId()));

        // 统计：pending 视为未盘到（按缺失计），normal 为实盘正常
        long normalCount = updatedItems.stream().filter(i -> "normal".equals(i.getStatus())).count();
        long pendingCount = updatedItems.stream().filter(i -> "pending".equals(i.getStatus())).count();
        // 实盘数量 = 正常 + 损坏（实际找到的资产）
        long actualCount = updatedItems.stream()
                .filter(i -> "normal".equals(i.getStatus()) || "damaged".equals(i.getStatus()))
                .count();
        int diffCount = (int) (actualCount - task.getExpectedCount());

        // 更新任务统计
        task.setActualCount((int) actualCount);
        task.setDiffCount(diffCount);
        task.setStatus("completed");
        if (StringUtils.hasText(dto.getRemark())) {
            task.setRemark(dto.getRemark());
        }
        task.setUpdatedBy(operatorResolver.currentOperatorName());
        taskMapper.updateById(task);

        log.info("提交盘点结果: {} (应盘={}, 实盘={}, 差异={}), 未盘 {} 件",
                dto.getTaskNo(), task.getExpectedCount(), actualCount, diffCount, pendingCount);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id) {
        EamInventoryTask task = taskMapper.selectById(id);
        if (task == null) throw new BusinessException("盤點任務不存在");
        if (!"in_progress".equals(task.getStatus())) {
            throw new BusinessException("僅允許取消進行中的盤點任務");
        }

        task.setStatus("cancelled");
        task.setUpdatedBy(operatorResolver.currentOperatorName());
        taskMapper.updateById(task);

        log.info("取消盘点任务: {} (id={})", task.getTaskNo(), id);
    }

    /* ==================== VO 转换 ==================== */

    private EamInventoryTaskVO toTaskVO(EamInventoryTask task) {
        EamInventoryTaskVO vo = new EamInventoryTaskVO();
        BeanUtils.copyProperties(task, vo, "createdAt", "updatedAt");
        vo.setCreatedAt(DateTimeUtils.format(task.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(task.getUpdatedAt()));
        return vo;
    }

    private EamInventoryItemVO toItemVO(EamInventoryItem item) {
        EamInventoryItemVO vo = new EamInventoryItemVO();
        BeanUtils.copyProperties(item, vo, "createdAt", "updatedAt");
        vo.setCreatedAt(DateTimeUtils.format(item.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(item.getUpdatedAt()));
        return vo;
    }
}
