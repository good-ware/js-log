# @goodware/log Release History

## 3.3.1 - 3.3.5 2020-06-18

- Add unit tests
- Update docs

## 3.3.0 2020-06-17

1. For plain console output, output level after the message
2. [#39 Child logger caching](https://github.com/good-ware/js-log/issues/39)

## 3.2.6 2020-06-15

Rename built-in log names starting with @log/ to start with @goodware instead

## 3.2.5 2020-06-15

Fix: log('warn' new Error()) logs as error

## 3.2.4 2020-06-14

Fix unit tests

## 3.2.3 2020-06-14

Change console output - add category after message

## 3.2.2 2020-06-13

Change console output - move log id after message

## 3.2.0 2020-06-12

- #35: Allow level in top-level transport keys (errorFile, console, etc.)
- Add more console unit tests

## 3.1.1 2020-06-11

### Bug Fixes

- file/errorFile directories value is ignored when an object is provided
- CloudWatch Logs error transports (console and errorFile) use default category overrides
- childLogger.ready does not work

### Other

- restart() and flush() are less noisy
- Complete the 'default' category work
- Constructor options has top-level errorFile key

## 3.1.0 2020-06-11

### Bug Fixes

- #31: Transport settings were not based on the 'default' category when objects were provided

### Loggers Options Schema Changes

- file and errorFile can contain objects that have the same properties as the top-level 'file' key

### New methods

- `restart()`
- `flushCloudWatchTransports()`
- Add missing `start()` method for child loggers

### Other

- Do not output the category name to the console. A new feature will be added for configuring the format.

## 3.0.3 2020-06-08

- Rename meta keys: logId->id, logGroupId->groupId, logDepth->depth, logTransports->transports
- Output log id to console for searching files and CloudWatch Logs

## 3.0.2 2020-06-07

Update documentation

## 3.0.1 2020-06-07

- Add dateFormat, utc, and zippedArchive to 'file' in options schema
- Do not use peer dependencies

## 3.0.0 2020-06-06

Experient with peer dependencies

## 2.0.5 2020-06-06

Documentation changes

## 2.0.4 2020-06-05

### Bug Fixes

- Fix: For <level>([tags]), <level> was not included in the list of tags

### New Features

- Add id (meta key) to log entries
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
