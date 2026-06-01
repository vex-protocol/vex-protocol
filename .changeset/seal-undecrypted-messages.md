---
"@vex-chat/libvex": patch
---

Fix at-rest encryption of undecrypted messages in SQLite storage. Previously, messages that arrived but failed decryption (non-empty, non-placeholder entries) were written to disk unencrypted; they are now encrypted with the at-rest key like all other messages.
