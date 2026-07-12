# NAS 部署与运维

## 1. 生产环境

NAS：

- hostname: fn-nas
- IP: 192.168.1.49
- 已有 public key SSH
- 禁止索取、输出或覆盖私钥和密码
- NAS staging port: `18080:8787` (host 18080 → container 8787)
- Admin URL: `http://192.168.1.49:18080/admin`

## 2. 部署前

必须：

- HEAD == origin/master；
- all required tests pass；
- sensitive scan pass；
- runtime data backup；
- 确认 bind mount 或 image copy。

## 3. 部署方式

### Bind Mount

同步 host source path，按真实 service restart。

### Image Copy

`docker compose build` + `docker compose up -d`。

禁止把 `docker exec cp` 当最终持久部署方式。

## 4. 部署后

验证：

- host SHA；
- container SHA；
- state API；
- news API；
- frame API；
- MQTT；
- news uniqueness；
- frame bytes；
- code4=0；
- health snapshot。

## 5. ESP32

没有真实串口日志与屏幕观察：

```text
ESP32_RUNTIME_STATUS=NOT TESTED
```

不得写 PASS。
