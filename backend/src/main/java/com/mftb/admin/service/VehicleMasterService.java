package com.mftb.admin.service;

import com.mftb.admin.dto.VehicleMasterDto;

import java.util.List;

/**
 * 车辆参数库服务：品牌 → 车系 → 年款车型 三级主数据。
 *
 * <p>它是车辆档案的下拉来源，因此查询接口默认只要启用中的记录，
 * 管理界面再单独取全部（含禁用），两套口径用 includeDisabled 显式区分，
 * 不靠"前端自己过滤掉禁用项"——那会让禁用数据在界面上以另一种形式复活。
 */
public interface VehicleMasterService {

    List<VehicleMasterDto.BrandVO> listBrands(boolean includeDisabled);

    long saveBrand(VehicleMasterDto.BrandSave save);

    void deleteBrand(long id);

    List<VehicleMasterDto.SeriesVO> listSeries(Long brandId, boolean includeDisabled);

    long saveSeries(VehicleMasterDto.SeriesSave save);

    void deleteSeries(long id);

    List<VehicleMasterDto.ModelVO> listModels(Long seriesId, boolean includeDisabled);

    long saveModel(VehicleMasterDto.ModelSave save);

    void deleteModel(long id);
}
