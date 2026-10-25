package com.mftb.admin.service.doc;

import java.io.InputStream;
import java.nio.file.Path;

/**
 * 文档对象存储抽象。P0 提供本地磁盘实现；生产接 S3 兼容存储时只替换实现，
 * 业务表只保留 object_key，不感知具体供应商。
 */
public interface DocObjectStorage {
    String provider();

    /** 返回一个受控临时文件路径，供上传流落盘后再原子移动。 */
    Path newTempFile();

    void put(String objectKey, Path source);

    InputStream open(String objectKey);

    long size(String objectKey);

    void delete(String objectKey);
}
