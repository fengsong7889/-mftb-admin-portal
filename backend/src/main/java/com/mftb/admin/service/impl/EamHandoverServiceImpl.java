package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamHandoverService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamHandoverServiceImpl implements EamHandoverService {

    private final EamHandoverMapper handoverMapper;
    private final EamHandoverItemMapper handoverItemMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamHandoverVO> page(EamHandoverQuery query) {
        Page<EamHandover> page = handoverMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamHandover::getCreatedAt, EamHandover::getId));
        List<EamHandoverVO> records = page.getRecords().stream().map(this::toVO).toList();
        // 批量填充 assetIds（列表页展开行需要）
        for (EamHandoverVO vo : records) {
            List<EamHandoverItem> items = handoverItemMapper.selectList(
                    new LambdaQueryWrapper<EamHandoverItem>()
                            .eq(EamHandoverItem::getHandoverId, vo.getId())
                            .select(EamHandoverItem::getAssetId));
            vo.setAssetIds(items.stream().map(EamHandoverItem::getAssetId).toList());
        }
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamHandoverVO detail(long id) {
        EamHandover handover = requireHandover(id);
        EamHandoverVO vo = toVO(handover);
        // 加载明细
        List<EamHandoverItem> items = handoverItemMapper.selectList(
                new LambdaQueryWrapper<EamHandoverItem>().eq(EamHandoverItem::getHandoverId, id));
        vo.setAssetIds(items.stream().map(EamHandoverItem::getAssetId).toList());
        List<EamHandoverVO.HandoverItemVO> itemVOs = items.stream().map(this::toItemVO).toList();
        vo.setItems(itemVOs);
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long register(EamHandoverSaveDTO dto) {
        // 1. 校验参数
        if (!hasText(dto.getFromUserName())) throw new BusinessException("交出人不能為空");
        if (!hasText(dto.getToUserName())) throw new BusinessException("接收人不能為空");
        if (dto.getFromUserName().trim().equals(dto.getToUserName().trim()))
            throw new BusinessException("接收人不可與交出人相同");
        if (dto.getAssetIds() == null || dto.getAssetIds().isEmpty())
            throw new BusinessException("請至少選擇一件資產");

        LocalDate handoverDate = parseDate(dto.getHandoverDate());

        // 2. 解析交出人（按姓名查找，可能已离职）
        SysUser fromUser = resolveUserByName(dto.getFromUserName());
        Long fromUserId = fromUser != null ? fromUser.getId() : null;
        String fromDepartment = hasText(dto.getFromDepartment()) ? dto.getFromDepartment()
                : (fromUser != null ? fromUser.getDepartment() : "");

        // 3. 解析接收人
        SysUser toUser = resolveUserByName(dto.getToUserName());
        if (toUser == null) throw new BusinessException("接收人不存在：" + dto.getToUserName());
        String toDepartment = hasText(dto.getToDepartment()) ? dto.getToDepartment()
                : (toUser.getDepartment() != null ? toUser.getDepartment() : "");

        // 4. 校验并锁定资产
        List<EamAsset> assets = new ArrayList<>();
        for (Long assetId : dto.getAssetIds()) {
            EamAsset asset = assetMapper.selectOne(
                    new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, assetId).last("FOR UPDATE"));
            if (asset == null) throw new BusinessException("資產不存在：#" + assetId);
            if (!"in_use".equals(asset.getStatus()))
                throw new BusinessException("僅使用中資產可交接，當前狀態：" + asset.getStatus());
            assets.add(asset);
        }

        // 5. 生成交接编号
        String handoverNo = bizSeqService.next(BizSeqService.RULE_EAM_HANDOVER);

        // 6. 创建交接单
        EamHandover handover = new EamHandover();
        handover.setHandoverNo(handoverNo);
        handover.setFromUserId(fromUserId);
        handover.setFromUserName(dto.getFromUserName().trim());
        handover.setFromDepartment(fromDepartment);
        handover.setToUserId(toUser.getId());
        handover.setToUserName(toUser.getName() != null ? toUser.getName() : toUser.getUsername());
        handover.setToDepartment(toDepartment);
        handover.setHandoverDate(handoverDate);
        handover.setAssetCount(dto.getAssetIds().size());
        handover.setReason(dto.getReason() != null ? dto.getReason() : "other");
        handover.setStatus("done");
        handover.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        handover.setOperatorName(operatorResolver.currentOperatorName());
        handover.setRemark(dto.getRemark());
        handover.setCreatedBy(operatorResolver.currentOperatorName());
        handover.setUpdatedBy(operatorResolver.currentOperatorName());
        handoverMapper.insert(handover);

        // 7. 创建明细 + 更新资产
        for (EamAsset asset : assets) {
            EamHandoverItem item = new EamHandoverItem();
            item.setHandoverId(handover.getId());
            item.setAssetId(asset.getId());
            item.setAssetNo(asset.getAssetNo());
            item.setAssetName(asset.getAssetName());
            item.setAssetType(asset.getAssetType());
            item.setOldDepartment(asset.getDepartment());
            item.setNewDepartment(toDepartment);
            handoverItemMapper.insert(item);

            // 更新资产使用人/部门（状态保持 in_use）
            asset.setCurrentHolderId(toUser.getId());
            asset.setUserName(toUser.getName() != null ? toUser.getName() : toUser.getUsername());
            asset.setDepartment(toDepartment);
            asset.setUpdatedBy(operatorResolver.currentOperatorName());
            assetMapper.updateById(asset);
        }

        log.info("交接登記成功: {} ({}件資產, {} → {})", handoverNo, assets.size(),
                dto.getFromUserName(), dto.getToUserName());
        return handover.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, String reason) {
        EamHandover handover = handoverMapper.selectForUpdate(id);
        if (handover == null) throw new BusinessException("交接記錄不存在");
        if ("cancelled".equals(handover.getStatus())) throw new BusinessException("交接已取消");

        handover.setStatus("cancelled");
        handover.setRemark(hasText(reason) ? reason : handover.getRemark());
        handover.setUpdatedBy(operatorResolver.currentOperatorName());
        handoverMapper.updateById(handover);

        // 回滚资产：恢复到交出人
        List<EamHandoverItem> items = handoverItemMapper.selectList(
                new LambdaQueryWrapper<EamHandoverItem>().eq(EamHandoverItem::getHandoverId, id));
        for (EamHandoverItem item : items) {
            EamAsset asset = assetMapper.selectById(item.getAssetId());
            if (asset != null && "in_use".equals(asset.getStatus())) {
                // 恢复到交出人
                if (handover.getFromUserId() != null) {
                    asset.setCurrentHolderId(handover.getFromUserId());
                    asset.setUserName(handover.getFromUserName());
                } else {
                    // 交出人已离职，释放资产
                    asset.setCurrentHolderId(null);
                    asset.setUserName(null);
                    asset.setStatus("idle");
                }
                asset.setDepartment(handover.getFromDepartment());
                asset.setUpdatedBy(operatorResolver.currentOperatorName());
                assetMapper.updateById(asset);
            }
        }

        log.info("交接取消: {} ({}件資產已回滾)", handover.getHandoverNo(), items.size());
    }

    // ─────────── 私有方法 ───────────

    private EamHandover requireHandover(long id) {
        EamHandover h = handoverMapper.selectById(id);
        if (h == null) throw new BusinessException("交接記錄不存在");
        return h;
    }

    /** 按姓名查找用户（优先精确匹配 name，回退 username） */
    private SysUser resolveUserByName(String name) {
        if (!hasText(name)) return null;
        String trimmed = name.trim();
        // 优先按姓名精确匹配
        SysUser user = userMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getName, trimmed).last("LIMIT 1"));
        if (user != null) return user;
        // 回退按登录账号匹配
        return userMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, trimmed).last("LIMIT 1"));
    }

    private EamHandoverVO toVO(EamHandover h) {
        EamHandoverVO vo = new EamHandoverVO();
        BeanUtils.copyProperties(h, vo, "handoverDate", "createdAt", "updatedAt");
        vo.setHandoverDate(DateTimeUtils.format(h.getHandoverDate()));
        vo.setCreatedAt(DateTimeUtils.format(h.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(h.getUpdatedAt()));
        return vo;
    }

    private EamHandoverVO.HandoverItemVO toItemVO(EamHandoverItem item) {
        EamHandoverVO.HandoverItemVO vo = new EamHandoverVO.HandoverItemVO();
        vo.setAssetId(item.getAssetId());
        vo.setAssetNo(item.getAssetNo());
        vo.setAssetName(item.getAssetName());
        vo.setAssetType(item.getAssetType());
        vo.setOldDepartment(item.getOldDepartment());
        vo.setNewDepartment(item.getNewDepartment());
        return vo;
    }

    private LambdaQueryWrapper<EamHandover> queryWrapper(EamHandoverQuery q) {
        LambdaQueryWrapper<EamHandover> w = new LambdaQueryWrapper<>();
        if (hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            w.and(x -> x.like(EamHandover::getHandoverNo, kw)
                    .or().like(EamHandover::getFromUserName, kw)
                    .or().like(EamHandover::getToUserName, kw));
        }
        if (hasText(q.getDepartment())) {
            w.and(x -> x.like(EamHandover::getFromDepartment, q.getDepartment())
                    .or().like(EamHandover::getToDepartment, q.getDepartment()));
        }
        if (hasText(q.getHandoverNo())) {
            w.like(EamHandover::getHandoverNo, q.getHandoverNo().trim());
        }
        if (hasText(q.getFromUserName())) {
            w.like(EamHandover::getFromUserName, q.getFromUserName().trim());
        }
        if (hasText(q.getToUserName())) {
            w.like(EamHandover::getToUserName, q.getToUserName().trim());
        }
        LocalDate dateStart = parseDateOrNull(q.getHandoverDateStart());
        if (dateStart != null) {
            w.ge(EamHandover::getHandoverDate, dateStart);
        }
        LocalDate dateEnd = parseDateOrNull(q.getHandoverDateEnd());
        if (dateEnd != null) {
            w.le(EamHandover::getHandoverDate, dateEnd);
        }
        if (hasText(q.getReason())) {
            w.eq(EamHandover::getReason, q.getReason().trim());
        }
        if (hasText(q.getOperatorName())) {
            w.like(EamHandover::getOperatorName, q.getOperatorName().trim());
        }
        return w;
    }

    private boolean hasText(String text) {
        return text != null && !text.isBlank();
    }

    /** 查询参数日期解析（非法格式忽略，不阻断查询） */
    private LocalDate parseDateOrNull(String value) {
        if (!hasText(value)) return null;
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("交接日期不能為空");
        try {
            return LocalDate.parse(value);
        } catch (RuntimeException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }
}
