# @goodware/log Release History

## 8.0.4 2022-06-24

- Use child logger's category if category value provided is invalid (e.g., is an object)
- Update docs

## 8.0.3 2022-06-23

- redact events are emitted for child objects

## 8.0.1 - 8.0.3 2022-06-22

- Logger() constructor allows 'extra' to be passed in tags or context

## 8.0.0 2022-06-20

### Breaking changes

- logger(x,y) replaced with setLogger(x,y)
- Add 'context'
  - All forms of log functions accept a context parameter before category
  - Child loggers use context instead of data
- 'data' event renamed to 'redact'
- data() method removed from Loggers and Logger classes
- Ignore 'undefined' input parameters (as before) but treat null as a value. For example, if null is provided as data, it is logged as `{data: {data: null}}`. It adds an extra 'data' property in order accommodate other data to be logged - say, specified in `message.`

### Changes

- Context, message, and data objects are sent to 'redact' event separately

## 7.0.1 2022-05-10

Do not log error twice

## 7.0.0 2022-05-03

Rename metaKeys option to metaProperties

## 6.3.0 2022-05-01

Add commitSha to options

## 6.2.5 2022-05-01

- Add 'log' event

## 6.2.4 2022-05-01

- Add category property to 'data' event objects

## 6.2.3 2022-04-30

Breaking changes

- Rename 'log' event to 'data'

## 6.2.2 2022-04-24

Use winston-cloudwatch version 6

## 6.2.0 - 6.2.1 2022-04-24

Breaking changes

- Remove allowLevel and tags from redact options

Changes

- Add {boolean} recursive to redact options, defaults to true
- Add documentation for redact
- Add documentation for log events

## 6.1.1 2022-04-24

Rename 'transform' event to 'log'

## 6.1.0 2022-04-17

Added 'transform' event

## 6.0.2 - 6.0.3 2022-04-17

- Replace ulid package with newer ulidx
- Fix and change: Use AWS_CLOUDWATCH_LOGS_REGION or AWS_REGION environment variables. AWS_CLOUDWATCH_REGION and AWS_DEFAULT_REGION are no longer used.
- Replace mkdir-sync package with functions in the fs package
- Add additional error handling when creating file transports
- Add the current directory to the list of log file directories in case ./logs can not be created

## 6.0.0 - 6.0.1 2022-04-02

## Breaking Changes

- 'context' parameter renamed to 'data' to sync up with console.data configuration and CloudWatch JSON output

## 5.0.7 2022-03-29

Use AWS_REGION environment variable

## 5.0.5 - 5.0.6 2022-03-26

Use @goodware/winston-cloudwatch until [PR#184](https://github.com/lazywithclass/winston-cloudwatch/pull/184) is released

## 5.0.4 2022-03-26

Create log groups when missing.

Note: Missing log groups will not be created until [PR#184](https://github.com/lazywithclass/winston-cloudwatch/pull/184) is released.

## 5.0.0 - 5.0.3 2022-03-26

### Breaking Changes

- log() etc. methods return undefined for easier testing via REPL, RunKit, etc.

- @asw-sdk-client/cloudwatch-logs and winston-cloudwatch are optional dependencies
- Output all opened CloudWatch Logs group and stream names to the console

## 4.0.0 - 4.0.1 2022-03-20

### Breaking Changes

Due to winston-cloudwatch, this version might not work in NodeJS versions < 12 (lts/erbium)!

### Changes

- Upgrade to winston-cloudwatch v4
- Replace aws-sdk with @asw-sdk-client/cloudwatch-logs as a dependency required by winston-cloudwatch
- Replace nano with ulid
- Fix: [#49](https://github.com/good-ware/js-log/issues/49)
- Fix: [#46](https://github.com/good-ware/js-log/issues/46)

## 3.4.8 - 3.4.11 2021-12-1

- Documentation changes
- Reduce size of package zip file via .npmignore
- Add engines: to package.json
- Brief console output logs entire line in one color

## 3.4.7 2021-11-30

- Modify console output to colorize the entire line and log the level, category, and sorted tags

## 3.4.5 2021-08-27

- Change object-to-string depth default to 20 from 10

## 3.4.5 2021-08-25

- More bug fixes for the depth and groupId meta keys

## 3.4.3 2021-08-12

- Bug fixes for the depth and groupId meta keys

## 3.4.2 2021-07-31

- Add new meta key 'stack' because it is supported by the data-enabled console
- `loggers.info(undefined, {error: new Error('x')})` only outputs one message to the console
- Remove feature that replaces Error instances with text in data because it was redundant and noisy

## 3.4.0-3.4.1 2021-07-05

### Features

- [#24](https://github.com/good-ware/js-log/issues/24) Context stack

### Bug fixes

- [#41](https://github.com/good-ware/js-log/issues/41) AWS logstream name output when restart() is called
- Fix TaskLogger when the function throws an exception

## 3.3.6-3.3.8 2021-06-19

- Fix colorization for plain console
- Update docs

## 3.3.1 - 3.3.5 2021-06-18

- Add unit tests
- Update docs

## 3.3.0 2021-06-17

1. For plain console output, output level after the message
2. [#39 Child logger caching](https://github.com/good-ware/js-log/issues/39)

## 3.2.6 2021-06-15

Rename built-in log names starting with @log/ to start with @goodware instead

## 3.2.5 2021-06-15

Fix: log('warn' new Error()) logs as error

## 3.2.4 2021-06-14

Fix unit tests

## 3.2.3 2021-06-14

Change console output - add category after message

## 3.2.2 2021-06-13

Change console output - move log id after message

## 3.2.0 2021-06-12

- #35: Allow level in top-level transport keys (errorFile, console, etc.)
- Add more console unit tests

## 3.1.1 2021-06-11

### Bug Fixes

- file/errorFile directories value is ignored when an object is provided
- CloudWatch Logs error transports (console and errorFile) use default category overrides
- childLogger.ready does not work

### Other

- restart() and flush() are less noisy
- Complete the 'default' category work
- Constructor options has top-level errorFile key

## 3.1.0 2021-06-11

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

## 3.0.3 2021-06-08

- Rename meta keys: logId->id, logGroupId->groupId, logDepth->depth, logTransports->transports
- Output log id to console for searching files and CloudWatch Logs

## 3.0.2 2021-06-07

Update documentation

## 3.0.1 2021-06-07

- Add dateFormat, utc, and zippedArchive to 'file' in options schema
- Do not use peer dependencies

## 3.0.0 2021-06-06

Experient with peer dependencies

## 2.0.5 2021-06-06

Documentation changes

## 2.0.4 2021-06-05

### Bug Fixes

- Fix: For <level>([tags]), <level> was not included in the list of tags

### New Features

- Add id (meta key) to log entries
- Use ulid instead of uuid

## 2.0.2 2021-06-04

Bug fixes

## 2.0.0 2021-06-03

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

## 1.5.3 2021-06-01

### API Changes

- Use flush() instead of flushCloudWatchTransports()

### Bug Fixes

- Logging the same error object twice when there are circular references

## 1.5.2 2021-05-31

- console: in options allows an object that accepts data and color so that different categories can have different console transports
- Rename maxAge in file config to maxFiles to align with the DailyRotateFile transport

## 1.5.0 2021-05-28

- Logging methods (log, info, etc.), isLevelEnabled(), and child() accept a single object with tags, context, and category keys.
- Bug fix: loggers.child().child() was not combining tags and context

## 1.4.0 2021-05-03

1. Allow message in `logger.levelName([tags], message)` to be an object with message, tags, and context keys
2. Bug fix: 'tags' value was lost in loggers.child(tags).logger('loggerName')

## 1.3.5 2021-03-23

- The Ready and Stopping messages are logged at the default level

## 1.3.3 2021-03-22

- Add logging level methods to Loggers (e.g., error) (API change)
- Documentation (hide more with @ignore)
- Strip @goodware/log functions from stack traces
- Support Node 8 and higher by changing process.off() to process.removeListener()
- Link README to RunKit example
