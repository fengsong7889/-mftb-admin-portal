package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamAssetTransfer;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamAssetTransferMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EamAssetTransferService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * 资产调拨服务实现
 * <p>
 * 登记流程：锁定资产 → 校验 in_use → 解析新使用人（工号优先/姓名回退）
 * → 生成调拨单（DB+YYYYMMDD+4位）→ 落单快照 from/to → 更新资产归属
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamAssetTransferServiceImpl implements EamAssetTransferService {

    private final EamAssetTransferMapper transferMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamAssetTransferVO> page(EamAssetTransferQuery query) {
        Page<EamAssetTransfer> page = transferMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamAssetTransfer::getCreatedAt, EamAssetTransfer::getId));
        return new PageResult<>(
                page.getRecords().stream().map(this::toVO).toList(),
                page.getTotal());
    }

    @Override
    public EamAssetTransferVO detail(long id) {
        return toVO(requireTransfer(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long register(EamAssetTransferSaveDTO dto) {
        // 1. 校验参数
        if (dto.getAssetId() == null) throw new BusinessException("請選擇要調撥的資產");
        if (!hasText(dto.getToUserName())) throw new BusinessException("新使用人不能為空");
        if (!hasText(dto.getToDepartment())) throw new BusinessException("新歸屬部門不能為空");
        if (!hasText(dto.getReason())) throw new BusinessException("調撥原因不能為空");

        LocalDate transferDate = parseDate(dto.getTransferDate());

        // 2. 锁定资产并校验状态
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        if (!"in_use".equals(asset.getStatus()))
            throw new BusinessException("僅使用中資產可調撥，當前狀態：" + asset.getStatus());

        // 3. 解析新使用人（工号优先精确匹配，回退姓名/账号）
        SysUser toUser = resolveNewUser(dto.getToUserEmpId(), dto.getToUserName());
        if (toUser == null) throw new BusinessException("新使用人不存在：" + dto.getToUserName());

        // 4. 生成调拨编号
        String transferNo = bizSeqService.next(BizSeqService.RULE_EAM_TRANSFER);

        // 5. 落调拨单（快照 from/to）
        EamAssetTransfer transfer = new EamAssetTransfer();
        transfer.setTransferNo(transferNo);
        transfer.setAssetId(asset.getId());
        transfer.setAssetNo(asset.getAssetNo());
        transfer.setAssetName(asset.getAssetName());
        transfer.setFromUserId(asset.getCurrentHolderId());
        transfer.setFromUserName(asset.getUserName() != null ? asset.getUserName() : "");
        transfer.setFromDepartment(asset.getDepartment() != null ? asset.getDepartment() : "");
        transfer.setToUserId(toUser.getId());
        transfer.setToUserName(toUser.getName() != null ? toUser.getName() : toUser.getUsername());
        transfer.setToUserEmpId(toUser.getEmpId() != null ? toUser.getEmpId() : "");
        transfer.setToDepartment(dto.getToDepartment().trim());
        transfer.setTransferDate(transferDate);
        transfer.setReason(dto.getReason().trim());
        transfer.setStatus("done");
        transfer.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        transfer.setOperatorName(operatorResolver.currentOperatorName());
        transfer.setRemark(dto.getRemark());
        transfer.setCreatedBy(operatorResolver.currentOperatorName());
        transfer.setUpdatedBy(operatorResolver.currentOperatorName());
        transferMapper.insert(transfer);

        // 6. 更新资产归属
        asset.setCurrentHolderId(toUser.getId());
        asset.setUserName(toUser.getName() != null ? toUser.getName() : toUser.getUsername());
        asset.setDepartment(dto.getToDepartment().trim());
        asset.setUpdatedBy(operatorResolver.currentOperatorName());
        assetMapper.updateById(asset);

        log.info("調撥登記成功: {} (資產 {} {} → {})", transferNo, asset.getAssetNo(),
                transfer.getFromUserName(), transfer.getToUserName());
        return transfer.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, String reason) {
        EamAssetTransfer transfer = transferMapper.selectForUpdate(id);
        if (transfer == null) throw new BusinessException("調撥記錄不存在");
        if ("cancelled".equals(transfer.getStatus())) throw new BusinessException("調撥已取消");

        transfer.setStatus("cancelled");
        transfer.setRemark(hasText(reason) ? reason : transfer.getRemark());
        transfer.setUpdatedBy(operatorResolver.currentOperatorName());
        transferMapper.updateById(transfer);

        // 回滚资产：恢复到原使用人/原部门
        EamAsset asset = assetMapper.selectById(transfer.getAssetId());
        if (asset != null && "in_use".equals(asset.getStatus())) {
            if (transfer.getFromUserId() != null) {
                asset.setCurrentHolderId(transfer.getFromUserId());
                asset.setUserName(transfer.getFromUserName());
            } else {
                // 原使用人已离职，释放资产
                asset.setCurrentHolderId(null);
                asset.setUserName(null);
                asset.setStatus("idle");
            }
            asset.setDepartment(transfer.getFromDepartment());
            asset.setUpdatedBy(operatorResolver.currentOperatorName());
            if (transfer.getFromUserId() != null) {
                assetMapper.updateById(asset);
            } else {
                // MyBatis-Plus updateById 默认 NOT_NULL 策略，null 字段需用 UpdateWrapper 显式清空
                assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                        .eq("id", asset.getId())
                        .set("current_holder_id", null)
                        .set("user_name", null)
                        .set("status", "idle")
                        .set("department", asset.getDepartment())
                        .set("updated_by", asset.getUpdatedBy()));
            }
        }

        log.info("調撥取消: {} (資產 {} 已回滾)", transfer.getTransferNo(), transfer.getAssetNo());
    }

    // ─────────── 私有方法 ───────────

    private EamAssetTransfer requireTransfer(long id) {
        EamAssetTransfer t = transferMapper.selectById(id);
        if (t == null) throw new BusinessException("調撥記錄不存在");
        return t;
    }

    /** 解析新使用人：工号优先精确匹配，回退按姓名/账号 */
    private SysUser resolveNewUser(String empId, String name) {
        // 1. 工号精确匹配
        if (hasText(empId)) {
            SysUser byEmp = userMapper.selectOne(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getEmpId, empId.trim()).last("LIMIT 1"));
            if (byEmp != null) return byEmp;
        }
        // 2. 姓名解析（兼容 "姓名(工号)" 后缀格式）
        String cleanName = extractName(name);
        if (hasText(cleanName)) {
            SysUser byName = userMapper.selectOne(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getName, cleanName).last("LIMIT 1"));
            if (byName != null) return byName;
            // 3. 回退账号匹配
            return userMapper.selectOne(
                    new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, cleanName).last("LIMIT 1"));
        }
        return null;
    }

    /** 从 "姓名(工号)" 格式中提取纯姓名 */
    private String extractName(String raw) {
        if (!hasText(raw)) return null;
        String s = raw.trim();
        int idx = s.indexOf('(');
        if (idx > 0) s = s.substring(0, idx);
        idx = s.indexOf('（');
        if (idx > 0) s = s.substring(0, idx);
        return s.trim();
    }

    private EamAssetTransferVO toVO(EamAssetTransfer t) {
        EamAssetTransferVO vo = new EamAssetTransferVO();
        BeanUtils.copyProperties(t, vo, "transferDate", "createdAt", "updatedAt");
        vo.setTransferDate(DateTimeUtils.format(t.getTransferDate()));
        vo.setCreatedAt(DateTimeUtils.format(t.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(t.getUpdatedAt()));
        return vo;
    }

    private LambdaQueryWrapper<EamAssetTransfer> queryWrapper(EamAssetTransferQuery q) {
        LambdaQueryWrapper<EamAssetTransfer> w = new LambdaQueryWrapper<>();
        if (hasText(q.getAssetNo())) {
            w.like(EamAssetTransfer::getAssetNo, q.getAssetNo().trim());
        }
        if (hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            w.and(x -> x.like(EamAssetTransfer::getTransferNo, kw)
                    .or().like(EamAssetTransfer::getAssetName, kw)
                    .or().like(EamAssetTransfer::getFromUserName, kw)
                    .or().like(EamAssetTransfer::getToUserName, kw));
        }
        LocalDate dateStart = parseDateOrNull(q.getStartDate());
        if (dateStart != null) w.ge(EamAssetTransfer::getTransferDate, dateStart);
        LocalDate dateEnd = parseDateOrNull(q.getEndDate());
        if (dateEnd != null) w.le(EamAssetTransfer::getTransferDate, dateEnd);
        return w;
    }

    private boolean hasText(String text) {
        return text != null && !text.isBlank();
    }

    private LocalDate parseDateOrNull(String value) {
        if (!hasText(value)) return null;
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("調撥日期不能為空");
        try {
            return LocalDate.parse(value);
        } catch (RuntimeException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }
}
