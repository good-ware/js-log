# Release History

## 1.4.0 2021-05-03

1. Allow message in `logger.info([tags], message)` to be an object with .message, and .tags, and .context keys
2. Bug fix: 'tags' value was lost in loggers.child(tags).logger('loggerName')
