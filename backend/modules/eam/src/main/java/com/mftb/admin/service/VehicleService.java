package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleDto;

import java.util.List;

/**
 * 车辆档案与授权服务
 *
 * <p>职责边界：只管车辆运行档案、可用部门/管理人员授权、驾驶资格核验、可派性判定。
 * 资产的购置/入库/领用/报废仍归 EAM 资产域，本服务不代写资产台账。
 */
public interface VehicleService {

    /** 分页查询车辆档案（按登录人可见范围过滤） */
    PageResult<VehicleDto.VO> page(VehicleDto.Query query);

    /** 车辆详情（含授权关系与当前占用数） */
    VehicleDto.VO detail(long id);

    /** 新增或编辑档案：id 为空即新增；编辑必须带回 expectVersion */
    long save(VehicleDto.Save dto);

    /** 变更运行状态（列表 Switch） */
    void changeStatus(long id, VehicleDto.StatusChange dto);

    /** 变更「允许授权直接登记」开关（配置动作，独立于办理权限） */
    void changeDirectRegister(long id, VehicleDto.DirectRegisterToggle dto);

    /**
     * 可用车辆候选。
     *
     * <p>返回的是"可见但可能不可派"的全集，不可派原因放在 blockers 里：
     * 静默隐藏会让使用方以为"没车了"，而真实原因往往是某台车证件没录或正在维修。
     */
    List<VehicleDto.Option> available(VehicleDto.AvailableQuery query);

    /** 驾驶资格列表 */
    List<VehicleDto.QualificationVO> listQualifications();

    /** 新增驾驶资格核验记录（一期只存最小字段） */
    long saveQualification(VehicleDto.QualificationSave dto);
}
