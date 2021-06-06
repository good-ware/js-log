# Release History

## 3.0.0 2020-06-05

### Breaking Changes

- Use peerDependencies instead of dependencies (see README)

## 2.0.4 2020-06-05

### Bug Fixes

- Fix: For <level>([tags]), <level> was not included in the list of tags

### New Features

- Add logId (meta key) to log entries
- Use nanoid instead of uuid

## 2.0.2 2020-06-04

Bug fixes

## 2.0.0 2020-06-03

### Breaking Changes

- Loggers.tags() and Loggers.context() changed from static to regular methods
- isReady() changed from method to 'ready' 'get' property
- Logger methods tag(), context(), and category() changed from regular properties to methods

### Other API Changes

- Add Loggers.category() for consistency
- levelEnabled is an alias for isLevelEnabled

### Bug Fixes

#25, #26: These have the same output:

- loggers.log(new Error())
- loggers.error(new Error())
- loggers.child().log(new Error())
- loggers.child().error(new Error())
- loggers.log({error: new Error()})
- loggers.child().error({message: new Error()})

#25, #26: These have the same output:

- loggers.log(new Error(), 'Foo')
- loggers.error(new Error(), 'Foo')
- loggers.child().log(new Error(), 'Foo')
- loggers.child().error(new Error(), 'Foo')

## 1.5.3 2020-06-01

### API Changes

- Use flush() instead of flushCloudWatchTransports()

### Bug Fixes

- Logging the same error object twice when there are circular references

## 1.5.2 2020-05-31

- console: in options allows an object that accepts data and color so that different categories can have different console transports
- Rename maxAge in file config to maxFiles to align with the DailyRotateFile transport

## 1.5.0 2020-05-28

- Logging methods (log, info, etc.), isLevelEnabled(), and child() accept a single object with tags, context, and category keys.
- Bug fix: loggers.child().child() was not combining tags and context

## 1.4.0 2021-05-03

1. Allow message in `logger.levelName([tags], message)` to be an object with message, tags, and context keys
2. Bug fix: 'tags' value was lost in loggers.child(tags).logger('loggerName')
