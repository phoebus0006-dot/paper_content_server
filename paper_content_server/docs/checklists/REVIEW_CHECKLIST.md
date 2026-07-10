# Reviewer Checklist

## Git

- [ ] HEAD 与 remote 一致
- [ ] 非空 commit
- [ ] commit message 与 diff 一致
- [ ] 无 secret
- [ ] 无 runtime state 污染

## News

- [ ] 6 条
- [ ] canonical URL unique
- [ ] article ID unique
- [ ] final title unique
- [ ] placeholder=0
- [ ] foreign untranslated=0
- [ ] translation fidelity 有真实证据
- [ ] title 1 line
- [ ] summary 2–3 lines

## Libraries

- [ ] Learning auto fetch 真实存在
- [ ] 自动源内容具有学习价值
- [ ] Custom Library 独立
- [ ] source isolation
- [ ] no silent fallback
- [ ] unsafe/suspicious/uncertain 删除

## MQTT

- [ ] activate before notify
- [ ] callback only sets flag
- [ ] poll fallback retained
- [ ] duplicate coalesced
- [ ] reconnect resubscribe

## Frame

- [ ] 192010 bytes
- [ ] state/frame ID coherent
- [ ] nibble scan
- [ ] code4=0

## Evidence

- [ ] production HTTP
- [ ] NAS container state
- [ ] ESP32 NOT TESTED when no serial logs
