# Release History

## 1.4.1 2020-05-04

Do not accept 'category' from logger.levelMethod(tags, message). Passing categories is deprecated since loggers.logger() is better supported now.

## 1.4.0 2021-05-03

1. Allow message in `logger.info([tags], message)` to be an object with .message, and .tags, and .context keys
2. Bug fix: 'tags' value was lost in loggers.child(tags).logger('loggerName')
