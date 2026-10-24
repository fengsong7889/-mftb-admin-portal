package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamBorrowService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;

/**
 * 资产借用实现，契约见 {@link EamBorrowService}。管理端与员工自助（my* 系列）共用一套表。
 * <p>
 * 事务边界：register, renew, cancel 标注 @Transactional(rollbackFor = Exception.class)，其余方法不开事务。
 * <p>
 * 协作依赖：EamBorrowMapper, EamAssetMapper, BizSeqService。
 */

@Slf4j
@Service
@RequiredArgsConstructor
public class EamBorrowServiceImpl implements EamBorrowService {

    private final EamBorrowMapper borrowMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamBorrowVO> page(EamBorrowQuery query) {
        Page<EamBorrow> page = borrowMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamBorrow::getCreatedAt, EamBorrow::getId));
        List<EamBorrowVO> records = page.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamBorrowVO detail(long id) {
        EamBorrow borrow = requireBorrow(id);
        return toVO(borrow);
    }

    @Override
    public PageResult<EamBorrowVO> myPage(EamBorrowQuery query) {
        SysUser current = requireLogin();
        // 个人口径：强制以当前登录人作为借用人过滤，不信任外部传入的 holderId
        query.setHolderId(current.getId());
        return page(query);
    }

    @Override
    public EamBorrowVO myDetail(long id) {
        SysUser current = requireLogin();
        EamBorrow borrow = requireBorrow(id);
        if (!Objects.equals(current.getId(), borrow.getHolderId())) {
            throw new BusinessException(403, "僅能查看與操作本人的資料");
        }
        return toVO(borrow);
    }

    @Override
    public EamBorrowStatsVO myStats() {
        SysUser current = requireLogin();
        EamBorrowStatsVO stats = new EamBorrowStatsVO();
        // 借用中/已逾期按到期日派生，与列表页签、VO 展示同源：
        // 库里的 status 不会随日期自动翻转（没有定时作业），直接读 status 会让
        // 过期借用永远显示「借用中」、已逾期卡恒为 0。
        stats.setActiveCount(borrowMapper.selectCount(effectiveWrapper(current.getId(), false)));
        stats.setOverdueCount(borrowMapper.selectCount(effectiveWrapper(current.getId(), true)));
        stats.setReturnedCount(countByStatus(current.getId(), "returned"));
        stats.setTotalCount(borrowMapper.selectCount(
                new LambdaQueryWrapper<EamBorrow>().eq(EamBorrow::getHolderId, current.getId())));
        return stats;
    }

    /** 有效借用（借用中/已逾期）的派生条件：status 只是登记值，到期日才是真相 */
    private LambdaQueryWrapper<EamBorrow> effectiveWrapper(Long holderId, boolean overdue) {
        LambdaQueryWrapper<EamBorrow> w = new LambdaQueryWrapper<EamBorrow>()
                .eq(EamBorrow::getHolderId, holderId)
                .in(EamBorrow::getStatus, "active", "overdue")
                .isNull(EamBorrow::getReturnDate);
        return overdue
                ? w.lt(EamBorrow::getDueDate, LocalDate.now())
                : w.ge(EamBorrow::getDueDate, LocalDate.now());
    }

    private SysUser requireLogin() {
        SysUser current = operatorResolver.currentUser();
        if (current == null) throw new BusinessException("未登錄");
        return current;
    }

    private Long countByStatus(Long holderId, String status) {
        return borrowMapper.selectCount(new LambdaQueryWrapper<EamBorrow>()
                .eq(EamBorrow::getHolderId, holderId)
                .eq(EamBorrow::getStatus, status));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long register(EamBorrowSaveDTO dto) {
        // 校验资产
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        if (!"idle".equals(asset.getStatus())) throw new BusinessException("僅閒置資產可借用");

        // 校验借用人
        SysUser holder = userMapper.selectById(dto.getHolderId());
        if (holder == null) throw new BusinessException("借用人不存在");

        // 校验日期
        LocalDate startDate = parseDate(dto.getStartDate());
        LocalDate dueDate = parseDate(dto.getDueDate());
        if (!dueDate.isAfter(startDate)) throw new BusinessException("到期日期須晚於借出日期");

        // 生成借用编号
        String borrowNo = bizSeqService.next(BizSeqService.RULE_EAM_BORROW);

        // 创建借用记录
        EamBorrow borrow = new EamBorrow();
        borrow.setBorrowNo(borrowNo);
        borrow.setAssetId(dto.getAssetId());
        borrow.setHolderId(dto.getHolderId());
        borrow.setHolderName(holder.getName() != null ? holder.getName() : holder.getUsername());
        borrow.setDepartment(dto.getDepartment());
        borrow.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        borrow.setOperatorName(operatorResolver.currentOperatorName());
        borrow.setStartDate(startDate);
        borrow.setDueDate(dueDate);
        borrow.setPurpose(dto.getPurpose());
        borrow.setRenewCount(0);
        borrow.setStatus(dueDate.isBefore(LocalDate.now()) ? "overdue" : "active");
        borrow.setCreatedBy(operatorResolver.currentOperatorName());
        borrow.setUpdatedBy(operatorResolver.currentOperatorName());
        borrowMapper.insert(borrow);

        // 更新资产状态
        asset.setCurrentHolderId(dto.getHolderId());
        asset.setStatus("in_use");
        asset.setUserName(holder.getName() != null ? holder.getName() : holder.getUsername());
        assetMapper.updateById(asset);

        return borrow.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void renew(long id, EamBorrowRenewDTO dto) {
        EamBorrow borrow = borrowMapper.selectForUpdate(id);
        if (borrow == null) throw new BusinessException("借用記錄不存在");
        if (!"active".equals(borrow.getStatus()) && !"overdue".equals(borrow.getStatus())) {
            throw new BusinessException("當前借用狀態不可續借");
        }

        LocalDate newDueDate = parseDate(dto.getNewDueDate());
        if (!newDueDate.isAfter(borrow.getDueDate())) {
            throw new BusinessException("新到期日期須晚於當前到期日期");
        }

        borrowMapper.renew(id, newDueDate, operatorResolver.currentOperatorName());

        // 如果之前逾期，续借后改为 active
        if ("overdue".equals(borrow.getStatus())) {
            borrow.setStatus("active");
            borrowMapper.updateById(borrow);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, String reason) {
        EamBorrow borrow = borrowMapper.selectForUpdate(id);
        if (borrow == null) throw new BusinessException("借用記錄不存在");
        if ("returned".equals(borrow.getStatus())) throw new BusinessException("已歸還的借用不可取消");
        if ("cancelled".equals(borrow.getStatus())) throw new BusinessException("借用已取消");

        borrow.setStatus("cancelled");
        borrow.setUpdatedBy(operatorResolver.currentOperatorName());
        borrowMapper.updateById(borrow);

        // 释放资产
        EamAsset asset = assetMapper.selectById(borrow.getAssetId());
        if (asset != null) {
            asset.setCurrentHolderId(null);
            asset.setStatus("idle");
            asset.setUserName(null);
            assetMapper.updateById(asset);
        }
    }

    private EamBorrow requireBorrow(long id) {
        EamBorrow borrow = borrowMapper.selectById(id);
        if (borrow == null) throw new BusinessException("借用記錄不存在");
        return borrow;
    }

    private EamBorrowVO toVO(EamBorrow borrow) {
        EamBorrowVO vo = new EamBorrowVO();
        BeanUtils.copyProperties(borrow, vo, "startDate", "dueDate", "returnDate", "createdAt", "updatedAt");
        vo.setStartDate(borrow.getStartDate() != null ? borrow.getStartDate().toString() : null);
        vo.setDueDate(borrow.getDueDate() != null ? borrow.getDueDate().toString() : null);
        vo.setReturnDate(borrow.getReturnDate() != null ? borrow.getReturnDate().toString() : null);
        vo.setCreatedAt(DateTimeUtils.format(borrow.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(borrow.getUpdatedAt()));

        // 资产信息
        EamAsset asset = assetMapper.selectById(borrow.getAssetId());
        if (asset != null) {
            vo.setAssetNo(asset.getAssetNo());
            vo.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
            vo.setParams(JsonUtils.parseMap(asset.getParams()));
            vo.setCategoryCode(asset.getCategoryCode());
            vo.setCompanyBrand(asset.getCompanyBrand());
        }

        // 计算逾期天数：逾期以到期日为准，库内 status 未必被翻转过（无定时作业），
        // 否则过期借用会永远显示「借用中」、逾期天数恒为空。
        if (borrow.getReturnDate() == null && borrow.getDueDate() != null
                && ("active".equals(borrow.getStatus()) || "overdue".equals(borrow.getStatus()))
                && borrow.getDueDate().isBefore(LocalDate.now())) {
            vo.setStatus("overdue");
            vo.setOverdueDays((int) ChronoUnit.DAYS.between(borrow.getDueDate(), LocalDate.now()));
        }

        return vo;
    }

    private LambdaQueryWrapper<EamBorrow> queryWrapper(EamBorrowQuery q) {
        LambdaQueryWrapper<EamBorrow> w = new LambdaQueryWrapper<>();
        if (hasText(q.getKeyword())) {
            w.and(x -> x.like(EamBorrow::getBorrowNo, q.getKeyword().trim())
                    .or().like(EamBorrow::getHolderName, q.getKeyword().trim()));
        }
        w.eq(q.getHolderId() != null, EamBorrow::getHolderId, q.getHolderId());
        // 借用中/已逾期按到期日派生（与 myStats 同一口径）：
        // 直接 eq(status) 会把过期未还的借用归到「借用中」，页签与统计卡都对不上。
        if (hasText(q.getStatus())) {
            if ("overdue".equals(q.getStatus())) {
                w.in(EamBorrow::getStatus, "active", "overdue")
                        .lt(EamBorrow::getDueDate, LocalDate.now())
                        .isNull(EamBorrow::getReturnDate);
            } else if ("active".equals(q.getStatus())) {
                w.in(EamBorrow::getStatus, "active", "overdue")
                        .ge(EamBorrow::getDueDate, LocalDate.now())
                        .isNull(EamBorrow::getReturnDate);
            } else {
                w.eq(EamBorrow::getStatus, q.getStatus());
            }
        }
        w.eq(hasText(q.getDepartment()), EamBorrow::getDepartment, q.getDepartment());
        if (hasText(q.getStartDate())) {
            w.ge(EamBorrow::getStartDate, LocalDate.parse(q.getStartDate(), DateTimeFormatter.ISO_DATE));
        }
        if (hasText(q.getEndDate())) {
            w.le(EamBorrow::getStartDate, LocalDate.parse(q.getEndDate(), DateTimeFormatter.ISO_DATE));
        }
        if (q.getCompanyBrand() != null) {
            List<Long> assetIds = assetMapper.selectList(
                    new LambdaQueryWrapper<EamAsset>()
                            .eq(EamAsset::getCompanyBrand, q.getCompanyBrand())
                            .select(EamAsset::getId)
            ).stream().map(EamAsset::getId).toList();
            if (assetIds.isEmpty()) {
                w.eq(EamBorrow::getId, -1L);
            } else {
                w.in(EamBorrow::getAssetId, assetIds);
            }
        }
        return w;
    }

    private boolean hasText(String text) { return text != null && !text.isBlank(); }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("日期不能為空");
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }
}
