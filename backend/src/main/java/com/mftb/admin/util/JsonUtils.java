package com.mftb.admin.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.MenuPermissionDTO;

import java.util.ArrayList;
import java.util.List;

/**
 * JSON 工具: 处理 function_roles / permissions 字段的序列化与反序列化
 */
public final class JsonUtils {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private JsonUtils() {
    }

    /** 解析角色ID JSON数组, 解析失败返回空列表 */
    public static List<Long> parseLongList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<Long>>() {
            });
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /** 解析菜单权限 JSON数组, 解析失败返回空列表 */
    public static List<MenuPermissionDTO> parsePermissions(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<MenuPermissionDTO>>() {
            });
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /** 解析字符串 JSON数组, 解析失败返回空列表 */
    public static List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<String>>() {
            });
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    /** 序列化为 JSON 字符串 */
    public static String toJson(Object obj) {
        try {
            return MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            return "[]";
        }
    }
}
