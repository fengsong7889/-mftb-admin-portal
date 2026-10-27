package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * RDM 下拉选项视图（产品经理候选、系统/菜单/功能点级联）
 */
public class RdmOptionVO {

    /** 产品经理候选（含在途负载，用于分配与提交时推荐） */
    @Data
    public static class ProductManager {
        private Long userId;
        private String empNo;
        private String name;
        private String deptName;
        /** 负责业务域 */
        private List<String> domains;
        /** 在途需求数 */
        private Integer activeCount;
        /** 容量上限 */
        private Integer capacity;
    }

    /** 系统 → 菜单 级联节点 */
    @Data
    public static class MenuNode {
        private String key;
        private String title;
        private List<MenuNode> children;

        public MenuNode(String key, String title, List<MenuNode> children) {
            this.key = key;
            this.title = title;
            this.children = children;
        }
    }

    /** 功能点候选 */
    @Data
    public static class FunctionPoint {
        private String key;
        private String title;

        public FunctionPoint(String key, String title) {
            this.key = key;
            this.title = title;
        }
    }

    /** 员工候选（验收人/参与人选择） */
    @Data
    public static class Employee {
        private Long userId;
        private String empNo;
        private String name;
        private String deptName;
    }
}
