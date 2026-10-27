package com.mftb.admin.mapper;

import com.mftb.admin.dto.EamConsumableApplicantStatVO;
import com.mftb.admin.dto.EamConsumableCompanyStatVO;
import com.mftb.admin.dto.EamConsumableDeptStatVO;
import com.mftb.admin.dto.EamConsumableItemStatVO;
import com.mftb.admin.dto.EamConsumableReportSummaryVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 耗材消耗统计报表 Mapper（SQL 层聚合，数据源 = 出入库流水 + 库存表）
 * <p>
 * 统计口径：
 *   采购入库 = txn_type in (in_purchase)；手工/期初 = in_manual
 *   消耗 = out_claim（出库领用，取绝对值）；退料冲减 = in_return
 *   库存金额 = biz_eam_consumable_stock.total_cost 实时汇总（不受时间过滤）
 * 日期过滤按 COALESCE(biz_date, DATE(created_at))，兼容迁移前无 biz_date 的历史流水。
 */
@Mapper
public interface EamConsumableReportMapper {

    String TXN_WHERE =
            "<if test='start != null'> AND COALESCE(biz_date, DATE(created_at)) &gt;= #{start}</if>"
            + "<if test='end != null'> AND COALESCE(biz_date, DATE(created_at)) &lt;= #{end}</if>"
            + "<if test='companyBrand != null'> AND company_brand = #{companyBrand}</if>"
            + "<if test='purchaseCompanyId != null'> AND purchase_company_id = #{purchaseCompanyId}</if>";

    /** 汇总指标（流水部分） */
    @Select("<script>SELECT "
            + "COALESCE(SUM(CASE WHEN txn_type = 'in_purchase' THEN amount ELSE 0 END), 0) AS purchaseAmount, "
            + "COALESCE(SUM(CASE WHEN txn_type = 'in_purchase' THEN qty ELSE 0 END), 0) AS purchaseQty, "
            + "COALESCE(SUM(CASE WHEN txn_type = 'in_manual' THEN amount ELSE 0 END), 0) AS manualInboundAmount, "
            + "COALESCE(SUM(CASE WHEN txn_type LIKE 'in\\_%' THEN amount ELSE 0 END), 0) AS inboundTotalAmount, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_claim' THEN amount ELSE 0 END), 0) AS consumeAmount, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_claim' THEN qty ELSE 0 END), 0) AS consumeQty, "
            + "COALESCE(SUM(CASE WHEN txn_type = 'in_return' THEN amount ELSE 0 END), 0) AS returnAmount, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_adjust' THEN amount ELSE 0 END), 0) AS adjustOutAmount "
            + "FROM biz_eam_consumable_txn WHERE 1 = 1 " + TXN_WHERE + "</script>")
    EamConsumableReportSummaryVO summary(@Param("start") java.time.LocalDate start,
                                         @Param("end") java.time.LocalDate end,
                                         @Param("companyBrand") Long companyBrand,
                                         @Param("purchaseCompanyId") Long purchaseCompanyId);

    @Select("<script>SELECT COALESCE(SUM(qty), 0) AS stockQty, COALESCE(SUM(total_cost), 0) AS stockAmount "
            + "FROM biz_eam_consumable_stock WHERE 1 = 1 "
            + "<if test='companyBrand != null'> AND company_brand = #{companyBrand}</if>"
            + "<if test='purchaseCompanyId != null'> AND purchase_company_id = #{purchaseCompanyId}</if>"
            + "</script>")
    java.util.Map<String, Object> stockTotals(@Param("companyBrand") Long companyBrand,
                                              @Param("purchaseCompanyId") Long purchaseCompanyId);

    /** 按公司（品牌+购买公司）聚合流水 */
    @Select("<script>SELECT company_brand AS companyBrand, purchase_company_id AS purchaseCompanyId, "
            + "COALESCE(SUM(CASE WHEN txn_type IN ('in_purchase','in_manual') THEN qty ELSE 0 END), 0) AS inboundQty, "
            + "COALESCE(SUM(CASE WHEN txn_type IN ('in_purchase','in_manual') THEN amount ELSE 0 END), 0) AS inboundAmount, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_claim' THEN qty ELSE 0 END), 0) AS consumeQty, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_claim' THEN amount ELSE 0 END), 0) AS consumeAmount, "
            + "COALESCE(SUM(CASE WHEN txn_type = 'in_return' THEN qty ELSE 0 END), 0) AS returnQty, "
            + "COALESCE(SUM(CASE WHEN txn_type = 'in_return' THEN amount ELSE 0 END), 0) AS returnAmount "
            + "FROM biz_eam_consumable_txn WHERE 1 = 1 " + TXN_WHERE
            + " GROUP BY company_brand, purchase_company_id ORDER BY consumeAmount DESC</script>")
    List<EamConsumableCompanyStatVO> statsByCompany(@Param("start") java.time.LocalDate start,
                                                    @Param("end") java.time.LocalDate end,
                                                    @Param("companyBrand") Long companyBrand,
                                                    @Param("purchaseCompanyId") Long purchaseCompanyId);

    /** 按公司聚合当前库存（实时） */
    @Select("<script>SELECT company_brand AS companyBrand, purchase_company_id AS purchaseCompanyId, "
            + "COALESCE(SUM(qty), 0) AS stockQty, COALESCE(SUM(total_cost), 0) AS stockAmount "
            + "FROM biz_eam_consumable_stock GROUP BY company_brand, purchase_company_id</script>")
    List<EamConsumableCompanyStatVO> stockByCompany();

    /** 按部门聚合消耗（out_claim） */
    @Select("<script>SELECT department_id AS departmentId, MAX(department) AS department, "
            + "COALESCE(-SUM(qty), 0) AS consumeQty, COALESCE(-SUM(amount), 0) AS consumeAmount, "
            + "COUNT(DISTINCT CASE WHEN ref_type = 'claim' THEN ref_id END) AS claimCount "
            + "FROM biz_eam_consumable_txn WHERE txn_type = 'out_claim' " + TXN_WHERE
            + " GROUP BY department_id ORDER BY consumeAmount DESC</script>")
    List<EamConsumableDeptStatVO> statsByDept(@Param("start") java.time.LocalDate start,
                                              @Param("end") java.time.LocalDate end,
                                              @Param("companyBrand") Long companyBrand,
                                              @Param("purchaseCompanyId") Long purchaseCompanyId);

    /** 按员工聚合消耗（out_claim） */
    @Select("<script>SELECT applicant_id AS applicantId, MAX(applicant_emp_id) AS applicantEmpId, "
            + "MAX(applicant_name) AS applicantName, MAX(department) AS department, "
            + "COALESCE(-SUM(qty), 0) AS consumeQty, COALESCE(-SUM(amount), 0) AS consumeAmount, "
            + "COUNT(DISTINCT CASE WHEN ref_type = 'claim' THEN ref_id END) AS claimCount "
            + "FROM biz_eam_consumable_txn WHERE txn_type = 'out_claim' " + TXN_WHERE
            + " GROUP BY applicant_id ORDER BY consumeAmount DESC</script>")
    List<EamConsumableApplicantStatVO> statsByApplicant(@Param("start") java.time.LocalDate start,
                                                        @Param("end") java.time.LocalDate end,
                                                        @Param("companyBrand") Long companyBrand,
                                                        @Param("purchaseCompanyId") Long purchaseCompanyId);

    /** 按耗材聚合入库与消耗 */
    @Select("<script>SELECT item_id AS itemId, MAX(item_code) AS itemCode, MAX(item_name) AS itemName, "
            + "COALESCE(SUM(CASE WHEN txn_type IN ('in_purchase','in_manual') THEN qty ELSE 0 END), 0) AS inboundQty, "
            + "COALESCE(SUM(CASE WHEN txn_type IN ('in_purchase','in_manual') THEN amount ELSE 0 END), 0) AS inboundAmount, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_claim' THEN qty ELSE 0 END), 0) AS consumeQty, "
            + "COALESCE(-SUM(CASE WHEN txn_type = 'out_claim' THEN amount ELSE 0 END), 0) AS consumeAmount "
            + "FROM biz_eam_consumable_txn WHERE 1 = 1 " + TXN_WHERE
            + " GROUP BY item_id ORDER BY consumeAmount DESC, inboundAmount DESC</script>")
    List<EamConsumableItemStatVO> statsByItem(@Param("start") java.time.LocalDate start,
                                              @Param("end") java.time.LocalDate end,
                                              @Param("companyBrand") Long companyBrand,
                                              @Param("purchaseCompanyId") Long purchaseCompanyId);

    /** 按耗材聚合当前库存（实时） */
    @Select("SELECT item_id AS itemId, COALESCE(SUM(qty), 0) AS stockQty, COALESCE(SUM(total_cost), 0) AS stockAmount "
            + "FROM biz_eam_consumable_stock GROUP BY item_id")
    List<EamConsumableItemStatVO> stockByItem();
}
