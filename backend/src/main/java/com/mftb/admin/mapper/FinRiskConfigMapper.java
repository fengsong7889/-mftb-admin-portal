package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.dto.FinRiskPageRow;
import com.mftb.admin.entity.FinRiskConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface FinRiskConfigMapper extends BaseMapper<FinRiskConfig> {

    /**
     * 风控列表数据源（登记制）: 仅展示已登记的集团×品牌风控配置，
     * 关联账户（余额/状态，与账户余额菜单同步）与集团名称；
     * 统计指标（欠款/已付/已消费/可用额度）由服务层聚合计算。
     */
    String RISK_FROM = """
            FROM biz_fin_risk_config c
            LEFT JOIN biz_fin_account a
              ON a.group_code = c.group_code AND a.brand = c.brand AND a.deleted = 0
            LEFT JOIN biz_merchant_group g
              ON g.group_code = c.group_code AND g.deleted = 0
            WHERE c.deleted = 0
            <if test='groupId != null and groupId != ""'>
              AND c.group_code LIKE CONCAT('%', #{groupId}, '%')
            </if>
            <if test='groupName != null and groupName != ""'>
              AND COALESCE(g.group_name, c.group_name) LIKE CONCAT('%', #{groupName}, '%')
            </if>
            <if test='brand != null and brand != ""'>
              AND c.brand = #{brand}
            </if>
            <if test='accountStatus != null and accountStatus != ""'>
              AND COALESCE(a.status, 'normal') = #{accountStatus}
            </if>
            <if test='releaseMode != null and releaseMode != ""'>
              AND COALESCE(c.release_mode, 'repay') = #{releaseMode}
            </if>
            <if test='updatedBy != null and updatedBy != ""'>
              AND c.updated_by LIKE CONCAT('%', #{updatedBy}, '%')
            </if>
            <if test='updatedFrom != null'>
              AND c.updated_at &gt;= #{updatedFrom}
            </if>
            <if test='updatedTo != null'>
              AND c.updated_at &lt; #{updatedTo}
            </if>
            """;

    @Select("<script>"
            + "SELECT c.group_code AS group_code, COALESCE(g.group_name, c.group_name) AS group_name, "
            + "c.brand AS brand, COALESCE(a.status, 'normal') AS account_status, "
            + "COALESCE(c.release_mode, 'repay') AS release_mode, c.monthly_release_ratio AS monthly_release_ratio, "
            + "c.status AS status, c.remark AS remark, c.updated_by AS updated_by, "
            + "DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at "
            + RISK_FROM
            + "ORDER BY c.id ASC "
            + "LIMIT #{offset}, #{size}"
            + "</script>")
    List<FinRiskPageRow> selectRiskPage(@Param("groupId") String groupId,
                                        @Param("groupName") String groupName,
                                        @Param("brand") String brand,
                                        @Param("accountStatus") String accountStatus,
                                        @Param("releaseMode") String releaseMode,
                                        @Param("updatedBy") String updatedBy,
                                        @Param("updatedFrom") java.time.LocalDateTime updatedFrom,
                                        @Param("updatedTo") java.time.LocalDateTime updatedTo,
                                        @Param("offset") long offset,
                                        @Param("size") long size);

    @Select("<script>"
            + "SELECT COUNT(*) "
            + RISK_FROM
            + "</script>")
    long countRisk(@Param("groupId") String groupId,
                   @Param("groupName") String groupName,
                   @Param("brand") String brand,
                   @Param("accountStatus") String accountStatus,
                   @Param("releaseMode") String releaseMode,
                   @Param("updatedBy") String updatedBy,
                   @Param("updatedFrom") java.time.LocalDateTime updatedFrom,
                   @Param("updatedTo") java.time.LocalDateTime updatedTo);
}
