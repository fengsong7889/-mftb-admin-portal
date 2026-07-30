package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.entity.FinAccount;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface FinAccountMapper extends BaseMapper<FinAccount> {

    /**
     * 账户余额列表派生查询：以集团管理数据为源，按「集团 × 品牌」展开，
     * 仅当集团存在对应品牌的门店时才产生一行（门店 brand 支持逗号分隔多品牌），
     * 再关联推广金账户表取余额，尚未开户的组合显示零余额、正常状态。
     */
    String DERIVED_FROM = """
            FROM biz_merchant_group g
            JOIN (SELECT 'flashBee' AS brand UNION ALL SELECT 'mFood') b
              ON EXISTS (SELECT 1 FROM biz_store s
                          WHERE s.group_id = g.id AND s.deleted = 0
                            AND FIND_IN_SET(b.brand, REPLACE(IFNULL(s.brand, ''), ' ', '')))
            LEFT JOIN biz_fin_account a
              ON a.group_code = g.group_code AND a.brand = b.brand AND a.deleted = 0
            WHERE g.deleted = 0
            <if test='groupId != null and groupId != ""'>
              AND g.group_code LIKE CONCAT('%', #{groupId}, '%')
            </if>
            <if test='groupName != null and groupName != ""'>
              AND g.group_name LIKE CONCAT('%', #{groupName}, '%')
            </if>
            <if test='brand != null and brand != ""'>
              AND b.brand = #{brand}
            </if>
            <if test='status != null and status != ""'>
              AND COALESCE(a.status, 'normal') = #{status}
            </if>
            """;

    @Select("<script>"
            + "SELECT a.id AS id, g.group_code AS group_id, g.group_name AS group_name, b.brand AS brand, "
            + "COALESCE(a.virtual_balance, 0) AS virtual_balance, "
            + "COALESCE(a.actual_balance, 0) AS actual_balance, "
            + "COALESCE(a.status, 'normal') AS status, "
            + "a.updated_by AS updated_by, "
            + "DATE_FORMAT(COALESCE(a.updated_at, g.updated_at), '%Y-%m-%d %H:%i:%s') AS updated_at "
            + DERIVED_FROM
            + "ORDER BY g.group_code ASC, b.brand ASC "
            + "LIMIT #{offset}, #{size}"
            + "</script>")
    List<FinAccountVO> selectDerivedPage(@Param("groupId") String groupId,
                                         @Param("groupName") String groupName,
                                         @Param("brand") String brand,
                                         @Param("status") String status,
                                         @Param("offset") long offset,
                                         @Param("size") long size);

    @Select("<script>"
            + "SELECT COUNT(*) "
            + DERIVED_FROM
            + "</script>")
    long countDerived(@Param("groupId") String groupId,
                      @Param("groupName") String groupName,
                      @Param("brand") String brand,
                      @Param("status") String status);
}
