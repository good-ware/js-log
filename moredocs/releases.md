# Release History

## 1.5.3 2020-06-01

- Bug fix: Logging the same error object twice when there are circular references

## 1.5.2 2020-05-31

- console: allows an object that accepts data and color so that different categories can have different console transports
- Rename maxAge in file config to maxFiles to align with the DailyRotateFile transport

## 1.5.0 2020-05-28

- Logging methods (log, info, etc.), isLevelEnabled(), and child() accept a single object with tags, context, and category keys.
- Bug fix: loggers.child().child() was not combining tags and context

## 1.4.0 2021-05-03

1. Allow message in `logger.levelName([tags], message)` to be an object with message, tags, and context keys
2. Bug fix: 'tags' value was lost in loggers.child(tags).logger('loggerName')
