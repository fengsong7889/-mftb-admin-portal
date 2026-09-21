package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.EamAssetLifecycleService;
import com.mftb.admin.service.EamCompensationService;
import com.mftb.admin.service.EamLossService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamLossServiceImpl implements EamLossService {

    private final EamLossMapper lossMapper;
    private final EamLossEventMapper lossEventMapper;
    private final EamAssetMapper assetMapper;
    private final EamClaimMapper claimMapper;
    private final EamBorrowMapper borrowMapper;
    private final EamReturnMapper returnMapper;
    private final EamScrapMapper scrapMapper;
    private final EamCompensationMapper compensationMapper;
    private final SysUserMapper userMapper;
    private final EamLocationMapper locationMapper;
    private final DepartmentService departmentService;
    private final EamCompensationService compensationService;
    private final EamAssetLifecycleService lifecycleService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /** 遗失单合法状态 */
    private static final List<String> VALID_STATUSES = List.of("searching", "found_pending", "recovered", "written_off");
    /** 允许主动报失的资产状态 */
    private static final List<String> LOSSABLE_ASSET_STATUSES = List.of("idle", "in_use");

    /* ====================================================================== */
    /*  查询                                                                   */
    /* ====================================================================== */

    @Override
    public PageResult<EamLossVO> page(EamLossQuery query) {
        Page<EamLoss> page = lossMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamLoss::getCreatedAt, EamLoss::getId));
        List<EamLossVO> records = page.getRecords().stream().map(this::toVO).toList();
        fillStatistics(records);
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamLossVO detail(long id) {
        EamLoss loss = requireLoss(id);
        EamLossVO vo = toVO(loss);
        // 加载事件日志
        List<EamLossEvent> events = lossEventMapper.selectList(
                new LambdaQueryWrapper<EamLossEvent>()
                        .eq(EamLossEvent::getLossId, id)
                        .orderByDesc(EamLossEvent::getCreatedAt, EamLossEvent::getId));
        vo.setEvents(events.stream().map(this::toEventVO).toList());
        fillStatistics(List.of(vo));
        return vo;
    }

    /* ====================================================================== */
    /*  主动报失                                                                */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long create(EamLossSaveDTO dto) {
        if (dto.getAssetId() == null) throw new BusinessException("資產 ID 不能為空");
        if (!StringUtils.hasText(dto.getLossDate())) throw new BusinessException("遺失日期不能為空");
        if (!StringUtils.hasText(dto.getLossReason())) throw new BusinessException("報失原因不能為空");

        LocalDate lossDate = parseDate(dto.getLossDate());
        if (lossDate.isAfter(LocalDate.now())) throw new BusinessException("遺失日期不可晚於今日");

        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        if (!LOSSABLE_ASSET_STATUSES.contains(asset.getStatus()))
            throw new BusinessException("當前資產狀態不允許報失（僅閒置、使用中可報失）");

        // 检查是否已有未结束遗失单
        Long openCount = lossMapper.selectCount(
                new LambdaQueryWrapper<EamLoss>()
                        .eq(EamLoss::getAssetId, asset.getId())
                        .in(EamLoss::getStatus, "searching", "found_pending"));
        if (openCount > 0) throw new BusinessException("該資產已有未結束的遺失單，不可重複報失");

        // 幂等：同操作人同请求键直接返回既有遗失单（在资产行锁内检查）
        SysUser currentUser = operatorResolver.currentUser();
        Long operatorId = currentUser != null ? currentUser.getId() : null;
        if (StringUtils.hasText(dto.getRequestKey())) {
            Long priorLossId = lifecycleService.findBizIdByRequestKey(operatorId, dto.getRequestKey());
            if (priorLossId != null) {
                log.info("主動報失冪等命中：requestKey={}, lossId={}", dto.getRequestKey(), priorLossId);
                return priorLossId;
            }
        }

        // 持有关系快照（释放前读取）
        String sourceType = "direct";
        Long sourceId = 0L;
        Long holderId = asset.getCurrentHolderId();
        String holderName = asset.getUserName();
        String department = asset.getDepartment();
        String beforeStatus = asset.getStatus();

        // 预判来源（供遗失单 sourceType/sourceId；实际关闭由生命周期服务在锁内执行）
        if ("in_use".equals(beforeStatus)) {
            if (asset.getActiveClaimId() != null) {
                EamClaim claim = claimMapper.selectById(asset.getActiveClaimId());
                if (claim != null && "claimed".equals(claim.getStatus())) {
                    sourceType = "claim";
                    sourceId = claim.getId();
                }
            } else {
                EamBorrow activeBorrow = borrowMapper.selectOne(new LambdaQueryWrapper<EamBorrow>()
                        .eq(EamBorrow::getAssetId, asset.getId())
                        .in(EamBorrow::getStatus, "active", "overdue")
                        .orderByDesc(EamBorrow::getId).last("LIMIT 1"));
                if (activeBorrow != null) {
                    sourceType = "borrow";
                    sourceId = activeBorrow.getId();
                }
            }
        }

        // 生成遗失编号
        String lossNo = bizSeqService.next(BizSeqService.RULE_EAM_LOSS);

        // 创建遗失单
        EamLoss loss = new EamLoss();
        loss.setLossNo(lossNo);
        loss.setSourceType(sourceType);
        loss.setSourceId(sourceId);
        loss.setAssetId(asset.getId());
        loss.setAssetNo(asset.getAssetNo());
        loss.setAssetName(asset.getAssetName());
        loss.setAssetType(asset.getAssetType());
        loss.setBrand(asset.getBrand());
        loss.setAssetStatusAtLoss(beforeStatus);
        loss.setOriginalHolderId(holderId);
        loss.setOriginalHolderName(holderName);
        loss.setOriginalDepartment(department);
        loss.setLastKnownLocation(StringUtils.hasText(dto.getLastKnownLocation())
                ? dto.getLastKnownLocation() : asset.getLocation());
        loss.setLossDate(lossDate);
        loss.setLossReason(dto.getLossReason());
        loss.setReporterId(operatorId);
        loss.setReporterName(operatorResolver.currentOperatorName());
        loss.setStatus("searching");
        loss.setFromMigration(0);
        loss.setCreatedBy(operatorResolver.currentOperatorName());
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        loss.setRequestKey(StringUtils.hasText(dto.getRequestKey()) ? dto.getRequestKey() : null);
        lossMapper.insert(loss);

        // 关闭有效来源（领用或借用）→ loss_closed，回填终止单据 ID
        EamAssetLifecycleService.ClosedSource closed =
                lifecycleService.closeActiveSource(asset, EamAssetLifecycleService.CLOSE_LOSS, loss.getId(), "報失登記：" + dto.getLossReason());

        // 记录持有关系状态事件（释放前，asset 仍为旧状态）
        lifecycleService.recordEvent(asset, "loss", loss.getId(), closed, "lost", department, lossDate, dto.getRequestKey());

        // 解除持有关系并置为遗失（显式清空持有人/领用关联）
        lifecycleService.releaseAssetToStatus(asset, "lost", null, null);

        // 记录事件
        addSystemEvent(loss.getId(), "create", "登記遺失：" + dto.getLossReason(), null, null);

        log.info("主動報失：lossNo={}, assetId={}, asset={}, closedSource={}",
                lossNo, asset.getId(), asset.getAssetNo(), closed.sourceType());
        return loss.getId();
    }

    /* ====================================================================== */
    /*  编辑遗失单                                                              */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void update(long id, EamLossSaveDTO dto) {
        EamLoss loss = lossMapper.selectForUpdate(id);
        if (loss == null) throw new BusinessException("遺失單不存在");
        if (!"searching".equals(loss.getStatus()))
            throw new BusinessException("僅尋找中狀態可編輯遺失資料");
        if (!StringUtils.hasText(dto.getChangeReason()))
            throw new BusinessException("修改原因不能為空");

        String beforeJson = snapshotJson(loss.getLossDate(), loss.getLossReason(), loss.getLastKnownLocation());

        if (StringUtils.hasText(dto.getLossDate())) loss.setLossDate(parseDate(dto.getLossDate()));
        if (StringUtils.hasText(dto.getLossReason())) loss.setLossReason(dto.getLossReason());
        if (StringUtils.hasText(dto.getLastKnownLocation())) loss.setLastKnownLocation(dto.getLastKnownLocation());
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        lossMapper.updateById(loss);

        String afterJson = snapshotJson(loss.getLossDate(), loss.getLossReason(), loss.getLastKnownLocation());
        addSystemEvent(id, "edit", "修改遺失資料：" + dto.getChangeReason(), beforeJson, afterJson);

        log.info("編輯遺失單：lossId={}, lossNo={}", id, loss.getLossNo());
    }

    /* ====================================================================== */
    /*  登记找回                                                                */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recover(long id, EamLossRecoverDTO dto) {
        EamLoss loss = lossMapper.selectForUpdate(id);
        if (loss == null) throw new BusinessException("遺失單不存在");
        if (!"searching".equals(loss.getStatus()))
            throw new BusinessException("僅尋找中狀態可登記找回");
        if (!StringUtils.hasText(dto.getRecoveredDate()))
            throw new BusinessException("找回日期不能為空");

        LocalDate recoveredDate = parseDate(dto.getRecoveredDate());
        if (recoveredDate.isAfter(LocalDate.now())) throw new BusinessException("找回日期不可晚於今日");
        if (loss.getLossDate() != null && recoveredDate.isBefore(loss.getLossDate()))
            throw new BusinessException("找回日期不可早於遺失日期");

        loss.setStatus("found_pending");
        loss.setRecoveredDate(recoveredDate);
        loss.setRecoveredLocation(dto.getRecoveredLocation());
        SysUser currentUser = operatorResolver.currentUser();
        loss.setRecoveredById(currentUser != null ? currentUser.getId() : null);
        loss.setRecoveredByName(operatorResolver.currentOperatorName());
        loss.setRecoveredNote(dto.getRecoveredNote());
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        lossMapper.updateById(loss);

        // 资产状态改为待验收
        EamAsset asset = assetMapper.selectById(loss.getAssetId());
        if (asset != null) {
            asset.setStatus("pending_inspection");
            asset.setUpdatedBy(operatorResolver.currentOperatorName());
            assetMapper.updateById(asset);
        }

        addSystemEvent(id, "recover", "登記找回", null, null);

        // 找回后触发赔付找回复核标记
        try {
            compensationService.markLossRecoveryReview(id);
        } catch (Exception e) {
            log.warn("找回触发赔付复核标记失败 lossId={}: {}", id, e.getMessage());
        }

        log.info("登記找回：lossId={}, lossNo={}", id, loss.getLossNo());
    }

    /* ====================================================================== */
    /*  验收处置                                                                */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void inspect(long id, EamLossInspectDTO dto) {
        EamLoss loss = lossMapper.selectForUpdate(id);
        if (loss == null) throw new BusinessException("遺失單不存在");
        if (!"found_pending".equals(loss.getStatus()))
            throw new BusinessException("僅待驗收狀態可進行驗收處置");
        if (!StringUtils.hasText(dto.getInspectionResult()))
            throw new BusinessException("驗收結果不能為空");
        if (!StringUtils.hasText(dto.getInspectionDate()))
            throw new BusinessException("驗收日期不能為空");

        LocalDate inspectionDate = parseDate(dto.getInspectionDate());
        String result = dto.getInspectionResult();

        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, loss.getAssetId()).last("FOR UPDATE"));

        switch (result) {
            case "normal" -> {
                // 正常归位：清持有人，转闲置
                if (!StringUtils.hasText(dto.getReceiveDepartment()))
                    throw new BusinessException("正常歸位必須指定接收部門");
                String receiveDept = departmentService.requireEnabledDepartmentName(dto.getReceiveDepartment());
                if (asset != null) {
                    asset.setStatus("idle");
                    asset.setCurrentHolderId(null);
                    asset.setUserName(null);
                    asset.setActiveClaimId(null);
                    asset.setDepartment(receiveDept);
                    applyReceiveLocation(asset, dto.getReceiveLocationId());
                    assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                            .eq("id", asset.getId())
                            .set("status", "idle")
                            .set("current_holder_id", null)
                            .set("user_name", null)
                            .set("active_claim_id", null)
                            .set("department", asset.getDepartment())
                            .set("location_id", asset.getLocationId())
                            .set("location", asset.getLocation()));
                }
            }
            case "damaged" -> {
                // 转维修：自动创建维修记录
                if (asset != null) {
                    asset.setStatus("in_repair");
                    asset.setUpdatedBy(operatorResolver.currentOperatorName());
                    assetMapper.updateById(asset);
                }
                // 维修记录由前端跳转维修管理模块创建，此处仅更新状态
            }
            case "scrapped" -> {
                // 实物报废：自动创建报废记录
                if (asset != null) {
                    asset.setStatus("scrapped");
                    asset.setUpdatedBy(operatorResolver.currentOperatorName());
                    assetMapper.updateById(asset);
                }
                long scrapId = createScrapFromInspect(loss, asset, inspectionDate);
                loss.setScrapId(scrapId);
            }
            default -> throw new BusinessException("不支持的驗收結果：" + result);
        }

        loss.setStatus("recovered");
        loss.setInspectionResult(result);
        loss.setInspectionDate(inspectionDate);
        loss.setInspectionNote(dto.getInspectionNote());
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        lossMapper.updateById(loss);

        addSystemEvent(id, "inspect", "驗收處置：" + result, null, null);
        log.info("驗收處置：lossId={}, lossNo={}, result={}", id, loss.getLossNo(), result);
    }

    /* ====================================================================== */
    /*  遗失核销                                                                */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void writeOff(long id, EamLossWriteOffDTO dto) {
        EamLoss loss = lossMapper.selectForUpdate(id);
        if (loss == null) throw new BusinessException("遺失單不存在");
        if (!"searching".equals(loss.getStatus()) && !"found_pending".equals(loss.getStatus()))
            throw new BusinessException("僅尋找中或待驗收狀態可核銷");
        if (!StringUtils.hasText(dto.getWriteOffDate()))
            throw new BusinessException("核銷日期不能為空");
        if (!StringUtils.hasText(dto.getWriteOffReason()))
            throw new BusinessException("核銷原因不能為空");

        LocalDate writeOffDate = parseDate(dto.getWriteOffDate());

        loss.setStatus("written_off");
        loss.setWriteOffDate(writeOffDate);
        loss.setWriteOffReason(dto.getWriteOffReason());
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        lossMapper.updateById(loss);

        // 资产状态改为遗失核销
        EamAsset asset = assetMapper.selectById(loss.getAssetId());
        if (asset != null) {
            asset.setStatus("written_off");
            asset.setCurrentHolderId(null);
            asset.setUserName(null);
            asset.setActiveClaimId(null);
            assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                    .eq("id", asset.getId())
                    .set("status", "written_off")
                    .set("current_holder_id", null)
                    .set("user_name", null)
                    .set("active_claim_id", null));
        }

        addSystemEvent(id, "write_off", "遺失核銷：" + dto.getWriteOffReason(), null, null);
        log.info("遺失核銷：lossId={}, lossNo={}", id, loss.getLossNo());
    }

    /* ====================================================================== */
    /*  跟进事件                                                               */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long addEvent(long id, EamLossEventDTO dto) {
        EamLoss loss = requireLoss(id);
        if (!"searching".equals(loss.getStatus()) && !"found_pending".equals(loss.getStatus()))
            throw new BusinessException("僅尋找中或待驗收狀態可追加跟進");
        if (!StringUtils.hasText(dto.getEventDesc()))
            throw new BusinessException("跟進描述不能為空");

        EamLossEvent event = new EamLossEvent();
        event.setLossId(id);
        event.setEventType("follow_up");
        event.setEventDesc(dto.getEventDesc());
        SysUser currentUser = operatorResolver.currentUser();
        event.setOperatorId(currentUser != null ? currentUser.getId() : null);
        event.setOperatorName(operatorResolver.currentOperatorName());
        lossEventMapper.insert(event);

        log.info("追加跟進事件：lossId={}, eventId={}", id, event.getId());
        return event.getId();
    }

    /* ====================================================================== */
    /*  从归还验收自动创建（内部调用）                                              */
    /* ====================================================================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createFromReturn(long returnId) {
        EamReturn ret = returnMapper.selectForUpdate(returnId);
        if (ret == null) throw new BusinessException("歸還記錄不存在");
        if (!"lost".equals(ret.getAssetCondition()))
            throw new BusinessException("僅遺失狀況的歸還可自動建立遺失單");

        // 幂等：已有 return_id 关联的遗失单则直接返回
        EamLoss existing = lossMapper.selectOne(
                new LambdaQueryWrapper<EamLoss>().eq(EamLoss::getReturnId, returnId));
        if (existing != null) {
            log.info("歸還記錄 {} 已關聯遺失單 {}，跳過自動創建", returnId, existing.getId());
            return existing.getId();
        }

        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset == null) throw new BusinessException("關聯資產不存在 assetId=" + ret.getAssetId());

        // 生成遗失编号
        String lossNo = bizSeqService.next(BizSeqService.RULE_EAM_LOSS);

        // 解析持有人信息
        Long holderId = ret.getEmployeeId();
        String holderName = null;
        if (holderId != null) {
            SysUser holder = userMapper.selectById(holderId);
            if (holder != null) holderName = holder.getName() != null ? holder.getName() : holder.getUsername();
        }

        EamLoss loss = new EamLoss();
        loss.setLossNo(lossNo);
        loss.setSourceType("return");
        loss.setSourceId(returnId);
        loss.setReturnId(returnId);
        loss.setAssetId(asset.getId());
        loss.setAssetNo(asset.getAssetNo());
        loss.setAssetName(asset.getAssetName());
        loss.setAssetType(asset.getAssetType());
        loss.setBrand(asset.getBrand());
        loss.setAssetStatusAtLoss(asset.getStatus());
        loss.setOriginalHolderId(holderId);
        loss.setOriginalHolderName(holderName);
        loss.setOriginalDepartment(asset.getDepartment());
        loss.setLastKnownLocation(asset.getLocation());
        loss.setLossDate(ret.getReturnDate());
        loss.setLossReason(StringUtils.hasText(ret.getExceptionReason())
                ? ret.getExceptionReason() : "歸還驗收選擇遺失");
        loss.setReporterId(ret.getOperatorId());
        loss.setReporterName(ret.getOperatorName());
        loss.setStatus("searching");
        loss.setFromMigration(0);
        loss.setCreatedBy(operatorResolver.currentOperatorName());
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        lossMapper.insert(loss);

        // 资产置为遗失
        setAssetStatus(asset, "lost", holderId);

        addSystemEvent(loss.getId(), "create",
                "歸還驗收自動建立遺失單（歸還單號 " + ret.getReturnNo() + "）", null, null);

        log.info("歸還驗收自動建立遺失單：lossNo={}, returnId={}, assetId={}", lossNo, returnId, asset.getId());
        return loss.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateStatusByReturnId(long returnId, String newStatus, LocalDate writeOffDate) {
        EamLoss loss = lossMapper.selectOne(
                new LambdaQueryWrapper<EamLoss>().eq(EamLoss::getReturnId, returnId));
        if (loss == null) {
            log.warn("歸還記錄 {} 未關聯遺失單，跳過狀態同步", returnId);
            return;
        }
        loss.setStatus(newStatus);
        if ("written_off".equals(newStatus)) {
            loss.setWriteOffDate(writeOffDate);
            loss.setWriteOffReason("歸還處置遺失核銷");
        }
        loss.setUpdatedBy(operatorResolver.currentOperatorName());
        lossMapper.updateById(loss);

        // 核销时同步资产台账：置为遗失核销终态并清除持有人/领用关联，
        // 避免归还处置为遗失核销后资产仍停留在 in_use 造成交接/领用数据不一致
        if ("written_off".equals(newStatus)) {
            EamAsset asset = assetMapper.selectById(loss.getAssetId());
            if (asset != null) {
                setAssetStatus(asset, "written_off", null);
                log.info("歸還處置核銷同步資產台账：assetId={}, assetNo={}, status=written_off",
                        asset.getId(), asset.getAssetNo());
            } else {
                log.warn("歸還處置核銷同步資產台账失敗：資產不存在 assetId={}, returnId={}",
                        loss.getAssetId(), returnId);
            }
        }

        log.info("歸還處置同步更新遺失單狀態：lossId={}, lossNo={}, status={}, returnId={}",
                loss.getId(), loss.getLossNo(), newStatus, returnId);
    }

    /* ====================================================================== */
    /*  内部方法                                                                */
    /* ====================================================================== */

    private EamLoss requireLoss(long id) {
        EamLoss loss = lossMapper.selectById(id);
        if (loss == null) throw new BusinessException("遺失單不存在");
        return loss;
    }

    /** 设置资产状态（清除持有人信息） */
    private void setAssetStatus(EamAsset asset, String newStatus, Long clearHolderId) {
        asset.setStatus(newStatus);
        asset.setUpdatedBy(operatorResolver.currentOperatorName());
        if ("lost".equals(newStatus) || "written_off".equals(newStatus)) {
            // 清除持有人和领用关联
            asset.setCurrentHolderId(null);
            asset.setUserName(null);
            asset.setActiveClaimId(null);
            assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                    .eq("id", asset.getId())
                    .set("status", newStatus)
                    .set("current_holder_id", null)
                    .set("user_name", null)
                    .set("active_claim_id", null));
        } else {
            assetMapper.updateById(asset);
        }
    }

    /** 应用接收位置 */
    private void applyReceiveLocation(EamAsset asset, Long receiveLocationId) {
        if (receiveLocationId != null && receiveLocationId > 0) {
            EamLocation location = locationMapper.selectById(receiveLocationId);
            if (location != null) {
                asset.setLocationId(location.getId());
                asset.setLocation(location.getName());
            } else {
                log.warn("驗收歸位失敗：存放位置不存在 locationId={}", receiveLocationId);
            }
        }
    }

    /** 从验收处置自动创建报废记录 */
    private long createScrapFromInspect(EamLoss loss, EamAsset asset, LocalDate scrapDate) {
        if (asset == null) throw new BusinessException("資產不存在，無法建立報廢記錄");
        EamScrap scrap = new EamScrap();
        scrap.setAssetId(asset.getId());
        scrap.setAssetNo(asset.getAssetNo());
        scrap.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        scrap.setAssetType(asset.getAssetType());
        scrap.setBrand(asset.getBrand());
        scrap.setScrapDate(scrapDate);
        scrap.setApplyBy(operatorResolver.currentOperatorName());
        SysUser currentUser = operatorResolver.currentUser();
        if (currentUser != null) scrap.setEmpId(currentUser.getEmpId());
        String reason = "遺失找回驗收報廢（遺失單號 " + loss.getLossNo() + "）";
        if (StringUtils.hasText(loss.getInspectionNote())) reason += "：" + loss.getInspectionNote();
        scrap.setReason(reason);
        scrap.setResidualValue(BigDecimal.ZERO);
        scrap.setStatus("pending");
        scrap.setCreatedBy(operatorResolver.currentOperatorName());
        scrap.setUpdatedBy(operatorResolver.currentOperatorName());
        scrapMapper.insert(scrap);
        log.info("驗收處置自動建立報廢記錄 scrapId={}, lossId={}", scrap.getId(), loss.getId());
        return scrap.getId();
    }

    /** 记录系统事件 */
    private void addSystemEvent(long lossId, String eventType, String desc, String before, String after) {
        EamLossEvent event = new EamLossEvent();
        event.setLossId(lossId);
        event.setEventType(eventType);
        event.setEventDesc(desc);
        event.setBeforeValue(before);
        event.setAfterValue(after);
        SysUser currentUser = operatorResolver.currentUser();
        event.setOperatorId(currentUser != null ? currentUser.getId() : null);
        event.setOperatorName(operatorResolver.currentOperatorName());
        lossEventMapper.insert(event);
    }

    /** VO 转换 */
    private EamLossVO toVO(EamLoss loss) {
        EamLossVO vo = new EamLossVO();
        BeanUtils.copyProperties(loss, vo, "lossDate", "recoveredDate", "inspectionDate",
                "writeOffDate", "createdAt", "updatedAt");
        vo.setLossDate(DateTimeUtils.format(loss.getLossDate()));
        vo.setRecoveredDate(DateTimeUtils.format(loss.getRecoveredDate()));
        vo.setInspectionDate(DateTimeUtils.format(loss.getInspectionDate()));
        vo.setWriteOffDate(DateTimeUtils.format(loss.getWriteOffDate()));
        vo.setCreatedAt(DateTimeUtils.format(loss.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(loss.getUpdatedAt()));

        // 使用遗失单上存储的资产状态快照（创建时保存）
        if (StringUtils.hasText(loss.getAssetStatusAtLoss())) {
            vo.setAssetStatus(loss.getAssetStatusAtLoss());
        }

        // 填充所属品牌
        EamAsset asset = assetMapper.selectById(loss.getAssetId());
        if (asset != null) {
            vo.setCompanyBrand(asset.getCompanyBrand());
        }

        // 计算未结天数
        if (loss.getLossDate() != null) {
            LocalDate endDate = ("recovered".equals(loss.getStatus()) && loss.getInspectionDate() != null)
                    ? loss.getInspectionDate()
                    : ("written_off".equals(loss.getStatus()) && loss.getWriteOffDate() != null)
                    ? loss.getWriteOffDate()
                    : LocalDate.now();
            vo.setOpenDays((int) ChronoUnit.DAYS.between(loss.getLossDate(), endDate));
        }

        // 关联赔付单号
        if (loss.getCompensationId() != null) {
            EamCompensation comp = compensationMapper.selectById(loss.getCompensationId());
            if (comp != null) vo.setCompensationNo(comp.getCompNo());
        }

        // 原持有人工号
        if (loss.getOriginalHolderId() != null) {
            SysUser holder = userMapper.selectById(loss.getOriginalHolderId());
            if (holder != null) vo.setOriginalHolderNo(holder.getEmpId());
        }

        // 登记人工号
        if (loss.getReporterId() != null) {
            SysUser reporter = userMapper.selectById(loss.getReporterId());
            if (reporter != null) vo.setReporterNo(reporter.getEmpId());
        }

        // 找回登记人工号
        if (loss.getRecoveredById() != null) {
            SysUser recoverer = userMapper.selectById(loss.getRecoveredById());
            if (recoverer != null) vo.setRecoveredByNo(recoverer.getEmpId());
        }

        // 最后更新人姓名
        if (StringUtils.hasText(loss.getUpdatedBy())) {
            vo.setUpdatedByName(loss.getUpdatedBy());
        }

        return vo;
    }

    private EamLossVO.EventVO toEventVO(EamLossEvent event) {
        EamLossVO.EventVO vo = new EamLossVO.EventVO();
        vo.setId(event.getId());
        vo.setEventType(event.getEventType());
        vo.setEventDesc(event.getEventDesc());
        vo.setBeforeValue(event.getBeforeValue());
        vo.setAfterValue(event.getAfterValue());
        vo.setChangeReason(event.getChangeReason());
        vo.setOperatorId(event.getOperatorId());
        vo.setOperatorName(event.getOperatorName());
        vo.setEvidenceId(event.getEvidenceId());
        vo.setCreatedAt(DateTimeUtils.format(event.getCreatedAt()));

        // 操作人工号
        if (event.getOperatorId() != null) {
            SysUser operator = userMapper.selectById(event.getOperatorId());
            if (operator != null) vo.setOperatorNo(operator.getEmpId());
        }

        return vo;
    }

    /** 填充统计信息（跟进次数、最近跟进时间） */
    private void fillStatistics(List<EamLossVO> vos) {
        if (vos.isEmpty()) return;
        List<Long> lossIds = vos.stream().map(EamLossVO::getId).filter(Objects::nonNull).toList();
        if (lossIds.isEmpty()) return;

        // 批量查询跟进事件统计
        List<EamLossEvent> followUps = lossEventMapper.selectList(
                new LambdaQueryWrapper<EamLossEvent>()
                        .in(EamLossEvent::getLossId, lossIds)
                        .eq(EamLossEvent::getEventType, "follow_up")
                        .orderByAsc(EamLossEvent::getCreatedAt));
        for (EamLossVO vo : vos) {
            List<EamLossEvent> events = followUps.stream()
                    .filter(e -> vo.getId().equals(e.getLossId())).toList();
            vo.setFollowUpCount(events.size());
            if (!events.isEmpty()) {
                vo.setLastFollowUpAt(DateTimeUtils.format(events.get(events.size() - 1).getCreatedAt()));
            }
        }
    }

    /** 构建查询条件 */
    private LambdaQueryWrapper<EamLoss> queryWrapper(EamLossQuery q) {
        LambdaQueryWrapper<EamLoss> w = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            w.and(x -> x.like(EamLoss::getLossNo, kw)
                    .or().like(EamLoss::getAssetNo, kw)
                    .or().like(EamLoss::getAssetName, kw)
                    .or().like(EamLoss::getOriginalHolderName, kw));
        }
        if (StringUtils.hasText(q.getLossNo())) {
            w.like(EamLoss::getLossNo, q.getLossNo().trim());
        }
        if (StringUtils.hasText(q.getAssetKeyword())) {
            String kw = q.getAssetKeyword().trim();
            w.and(x -> x.like(EamLoss::getAssetNo, kw)
                    .or().like(EamLoss::getAssetName, kw));
        }
        if (StringUtils.hasText(q.getOriginalHolderName())) {
            w.like(EamLoss::getOriginalHolderName, q.getOriginalHolderName().trim());
        }
        if (StringUtils.hasText(q.getSourceType())) {
            w.eq(EamLoss::getSourceType, q.getSourceType());
        }
        if (StringUtils.hasText(q.getStatus())) {
            w.eq(EamLoss::getStatus, q.getStatus());
        }
        if (StringUtils.hasText(q.getDepartment())) {
            w.like(EamLoss::getOriginalDepartment, q.getDepartment().trim());
        }
        if (StringUtils.hasText(q.getStartDate())) {
            w.ge(EamLoss::getLossDate, LocalDate.parse(q.getStartDate(), DateTimeFormatter.ISO_DATE));
        }
        if (StringUtils.hasText(q.getEndDate())) {
            w.le(EamLoss::getLossDate, LocalDate.parse(q.getEndDate(), DateTimeFormatter.ISO_DATE));
        }
        if (StringUtils.hasText(q.getUpdatedBy())) {
            w.like(EamLoss::getUpdatedBy, q.getUpdatedBy().trim());
        }
        if (StringUtils.hasText(q.getUpdateStartDate())) {
            w.ge(EamLoss::getUpdatedAt, LocalDate.parse(q.getUpdateStartDate(), DateTimeFormatter.ISO_DATE).atStartOfDay());
        }
        if (StringUtils.hasText(q.getUpdateEndDate())) {
            w.le(EamLoss::getUpdatedAt, LocalDate.parse(q.getUpdateEndDate(), DateTimeFormatter.ISO_DATE).atTime(23, 59, 59));
        }
        if (q.getCompanyBrand() != null) {
            java.util.List<Long> brandAssetIds = assetMapper.selectList(
                    new LambdaQueryWrapper<EamAsset>()
                            .eq(EamAsset::getCompanyBrand, q.getCompanyBrand())
                            .select(EamAsset::getId)
            ).stream().map(EamAsset::getId).toList();
            if (brandAssetIds.isEmpty()) {
                w.eq(EamLoss::getId, -1L);
            } else {
                w.in(EamLoss::getAssetId, brandAssetIds);
            }
        }
        return w;
    }

    private String snapshotJson(Object... values) {
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < values.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("\"v").append(i).append("\":\"").append(values[i] != null ? values[i] : "").append("\"");
        }
        sb.append("}");
        return sb.toString();
    }

    private boolean hasText(String text) { return text != null && !text.isBlank(); }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("日期不能為空");
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }
}
