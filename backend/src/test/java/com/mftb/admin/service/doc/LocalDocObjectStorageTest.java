package com.mftb.admin.service.doc;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 存储根目录不可写时的行为（生产 CrashLoopBackOff 回归用例）。
 * <p>
 * 背景：容器以非 root 用户运行时 /app 不可写，旧实现直接在构造函数抛异常，
 * 导致整个后台起不来。约定改为：构造不抛，只有真正读写文档时才报可读错误。
 */
class LocalDocObjectStorageTest {

    @Test
    @DisplayName("目录不可写时构造不抛异常，仅文档操作报错")
    void degradesWhenRootNotWritable(@TempDir Path tempDir) throws IOException {
        // 用一个普通文件冒充目录：createDirectories 必然失败
        Path rootAsFile = tempDir.resolve("not-a-dir");
        Files.writeString(rootAsFile, "x");

        LocalDocObjectStorage storage = assertDoesNotThrow(
                () -> new LocalDocObjectStorage(rootAsFile.toString()));

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> storage.size("a/b.txt"));
        assertTrue(ex.getMessage().contains("文档对象存储不可用"));
        assertTrue(ex.getMessage().contains("DOC_STORAGE_LOCAL_ROOT"));
    }

    @Test
    @DisplayName("目录可写时正常初始化并返回 local provider")
    void worksWhenRootWritable(@TempDir Path tempDir) {
        LocalDocObjectStorage storage = new LocalDocObjectStorage(tempDir.resolve("doc-assets").toString());
        assertTrue(Files.isDirectory(tempDir.resolve("doc-assets")));
        assertTrue(Files.isDirectory(tempDir.resolve("doc-assets").resolve("tmp")));
        assertTrue(storage.provider().equals("local"));
    }
}
