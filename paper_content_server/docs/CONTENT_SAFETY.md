# 图片内容安全

## 1. 政策

色情/NSFW 零容忍。

严格 fail-closed：

```text
safe → continue
suspicious → delete
unsafe → delete
uncertain → delete
```

## 2. 删除范围

发现 unsafe/suspicious/uncertain 后：

1. 从索引移除；
2. raw 删除；
3. processed 删除；
4. thumbnail 删除；
5. temp download 删除；
6. derived render 删除；
7. frame cache 删除；
8. snapshot cache 删除；
9. active publication reference 删除；
10. history rollback blocked；
11. 仅 tombstone 保留。

## 3. 两个图库同样严格

Learning Library 和 Custom Library 都必须经过安全门。

用户上传不能绕过安全门。

## 4. Tombstone

仅允许：

- assetId；
- contentHash；
- source；
- decision；
- reasonCode；
- deletedAt。

不得保留图片字节。

## 5. 测试

至少：

- unsafe selected=0；
- suspicious selected=0；
- uncertain selected=0；
- deleted file count 正确；
- active unsafe refs=0；
- cache unsafe refs=0；
- snapshot unsafe refs=0；
- rollback unsafe refs=0。
