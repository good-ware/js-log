# Release History

## 1.5.1 2020-05-30

- Logging methods (log, info, etc.), isLevelEnabled(), and child() accept a single object with tags, context, and category keys.
- Bug fix: loggers.child().child() was not combining tags and context

## 1.4.1 2020-05-04

Do not accept 'category' from logger.levelName([tags], message). Passing categories is deprecated since loggers.logger(category) works.

## 1.4.0 2021-05-03

1. Allow message in `logger.levelName([tags], message)` to be an object with message, tags, and context keys
2. Bug fix: 'tags' value was lost in loggers.child(tags).logger('loggerName')

