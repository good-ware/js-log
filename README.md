# @goodware/log: Winston3-based logging to console, file, and/or AWS CloudWatch Logs

## Links

- [Release History](https://good-ware.github.io/js-log/tutorial-Releases)
- [npm](https://www.npmjs.com/package/@goodware/log)
- [git](https://github.com/good-ware/js-log)
- [API Docs](https://good-ware.github.io/js-log/)
- [RunKit Notebook Example](https://runkit.com/dev-guy/exploring-goodware-log)

## Requirements

If you are using CloudWatch logs as a transport, NodeJS 12 (LTS/erbium) or higher is required. Otherwise, any LTS version is sufficent.

## Installation

`npm i --save @goodware/log`

## Introduction

This package extends Winston3 with additional features such as tag-based filtering. It is intended for NodeJS runtimes including AWS Lambda. The package can log scalars, objects (even with cyclical references), arrays, and graphs of Error objects quickly and reliably. Log entries can be sent to the following transports: console (via winston-console-format), files (via winston-daily-rotate-file) in JSON format, and CloudWatch Logs (via winston-cloudwatch) in JSON format.

@goodware/log features a large unit test suite and has been servicing a commercial SaaS product for several years. It is BSD licensed.

## Features

1. HAPI-style tags: Log entries can be filtered by tags on a per-transport basis
2. Redaction of specific object keys. Redaction can be enabled and disabled via tags.
3. Safely logs large objects and arrays - even those with circular references 3.1. Embedded Error objects are logged separately (e.g., in the 'cause' and 'error' properties), grouping multiple log entries via a unique identifier
4. Promotes object properties to a configurable subset of 'meta' properties
5. Reliable flushing
6. Does not interfere with other code that uses Winston
7. This code is as efficient as possible; however, users are encouraged to call isLevelEnabled() (and even memoize it) to avoid creating expensive messages that won't be logged

## Transports Supported

The following transports can be utilized. They are all optional.

- The console (stdout) via [winston-console-format](https://www.npmjs.com/package/winston-console-format)
- Local JSON files via [winston-daily-rotate-file](https://www.npmjs.com/package/winston-daily-rotate-file)
- AWS CloudWatch Logs via [winston-cloudwatch](https://www.npmjs.com/package/winston-cloudwatch) in JSON format

## What's Missing

The ability to add additional transports

## Usage

### Loggers

The Loggers class is a container that manages logger instances that have unique category names. Each logger has its own settings, such as logging levels and transports.

Any number of Loggers instances can exist at any given time. This is useful if, say, independent libraries use this package with different logging levels and other settings. The only caveat is Winston's design flaw that prevents assigning different colors to the same level.

### Logging

Log messages via log(), default(), and methods that are named after logging levels (aka `level`()), such as info(). The list of available logging levels and the console color for each can be provided via options.

Log entries are created from four components (all optional): 'tags', 'message', 'context', and 'category.' This information can be passed as traditional ordered parameters or by passing a single object for named parameters. tags() and context() merge two objects into a single object. context() returns the default category (specified via options) if the provided value is blank. When named parameters are used, extra provided properties are logged as part of the message; for example, the following object can be logged: { tags: 'disk', message: 'A message', error: new Error('An error') }.

Winston's splat formatter is not enabled. However, any type of data can be logged, such as strings, objects, arrays, and Errors (including their stack traces and related errors).

The concept of tags was borrowed from the HAPI project. Tags are a superset of logging levels. Log entries have only one level; however, tags are logged as an array in order to facilitate searches. For example, when the tags are (info, web) the log entry is logged at the 'info' level. When tags contain multiple level names, predecence rules apply (see logLevel below; otherwise, the tag in the smallest array index wins.

`level`() (e.g. info()), optionally accept an array of tags as the first parameter. `log()`'s `tag` parameter can be a string, array, or an object whose properties are tag names and their values are evaluated for truthiness that indicates whether the tag is enabled. When named parameters are used, the 'tags' argument can be an object, array, or string.

The values for 'message' and 'context' can have any type. Error objects are treated specially: their stacks and dependency graphs are also logged. In most cases, 'message' is a string that is used as the log entry's message and 'context' is an object that appears in the log entry's 'data' property.

log(), default(), and `level`() optionally accept an Error object as the first parameter, followed by message, context, and category. 'error' is automatically added to the tags; however, 'level' for `level`() methods takes precedence. For example, `info(new Error('An error'))` is logged at the info level.

### Winston Loggers

One Winston logger is created for each unique category name. winstonLogger() returns a Winston logger given a category name.

### Child Loggers (flyweight)

logger() and child() return objects with their own tags, context, and category values. These objects have the same interface as the Loggers class. Child loggers are not real Winston Logger instances and are therefore lightweight.

Child loggers and Loggers instances have the following methods:

- tags(a, b) Combines a and b such that b's tags override a's tags. The result is combined with (and overrides) the child logger's tags.
- context(a, b) Combines a and b such that b's properties override a's properties. The result is combined with (and overrides) the properties in the child logger's context.
- category(a) Returns a if it is truthy; otherwise, it either returns the child logger's category or the default category (specified via options) if it is blank.

Context can be 'built up' by chaining calls to logger() and/or child().

```js
loggers.logger('dog').child('dogTag').child(null, { userId: 101 }).logger('anotherCategory').debug('Wow!');
```

### Caching Loggers

A logger can be associated with a category by providing an object as the second parameter to logger(). This changes the value that is returned by logger() when the same category is provided. For example:

```js
loggers.logger('dog', loggers.child('dogTag'));
```

### Stopping and Flushing

`stop()` is a heavyweight asynchronous method that safely closes all transports. It can be reversed via `start().` `restart()` is also available.

Only CloudWatch Logs transports can be flushed without stopping them. `flush()` is therefore an alias for `restart().` Use flushCloudWatchTransports() when you only need to flush CloudWatch Logs transports because it's substantially faster.

### Unhandled exceptions and Promise rejections

While a Loggers instance is active, uncaught exceptions and unhandled Promise rejections are logged using the category @log/unhandled. The process is not terminated after logging uncaught exceptions.

### Adding Stack Traces of API Callers

When a log entry's level is one of the values specified in the 'logStackLevels' options setting, the 'stack' meta key is set to the stack trace of the caller of the logging method (such as info()). This behavior is manually enabled and disabled via the 'logStack' meta tag.

## Concepts

### options

An object provided to Loggers' constructor. Options are described by optionsObject.

### logger

A logger sends log entries to transports. Loggers instances are loggers. child() and logger() return loggers.

A logger implements the following interface:

- start()
- stop()
- restart()
- ready (property)
- log()
- default() The default level is specified via option
- `level`() where `level` is a logging level name. Example: info()
- child()
- stack()
- logger(category [, loggerObject])
- parent() For child loggers to access their parent, which is either a Loggers object or a child logger
- loggers() For child loggers to access the Loggers object that created them
- winstonLogger()
- tags(), for combining tags
- context(), for combining context objects
- category() (mostly useful for retrieving the category assigned to Logger objects)
- flush()
- flushCloudWatchTransports()

### category

Per Winston terminology, a category is the name of a logger. When a category is not specified, the category specified via the 'defaultCategory' options setting is used. 'defaultCategory' defaults to 'general.' Transport filtering (based on tags) is specified on a per-category basis. Loggers inherit the settings of the 'default' category (not the 'defaultCategory' options setting).

### log entry

An object that is sent to a transport. A log entry consists of meta and data.

### meta

The top-level keys of a log entry. Meta keys contain scalar values except for tags and transports which are arrays. Meta keys are: timestamp, ms (elpased time between log entries), level, message, tags, category, id, groupId, depth, hostId, stage, version, service, stack, and transports. Certain properties in 'both' can be copied to meta keys, optionally renaming them, via the 'metaKeys' options setting.

### data

The keys remaining in 'both' after meta keys are removed (see 'both' below)

### level (severity)

Levels are associated with natural numbers. Per Winston's convention, a lower value indicates greater severity. Therefore, 0 means "most severe."

Levels and their colors can be specified via the second argument provided to the constructor using the same object that is provided when creating a Winston logger.

By default, Loggers uses Winston's default levels (aka [npm log levels](https://github.com/winstonjs/winston#user-content-logging-levels) with the addition of two levels:

1. 'fail' is more severe than 'error' and has the color red
2. 'more' is between 'info' and 'verbose' and has the color cyan
3. 'db' is between 'verbose' and 'http' and has the color yellow
4. Therefore, from highest to lowest severity, the levels are: fail, error, warn, info, more, verbose, db, http, debug, silly.

A custom set of levels can be provided to the Loggers class's constructor; however, the Loggers class assumes there is an 'error' level and the options model (via the defaults) assumes the following levels exist: error, warn, debug.

### default level

When a level is not found in the provided tags, the default level, 'debug', is assumed. The default level is specified via the 'defaultLevel' options setting.

### level methods

Methods that are named after logging levels, such as error(). log(tags, message, context, category) is an alternative to the level methods. Level methods accept variant parameters. If the first parameter to a level method is an array, the parameter list is (tags, message, context, category). Otherwise, it's (message, context, category).

### level filtering

A log entry is sent to a transport only when its severity level is equal to or greater than the transport's level.

### tag

Tags are logged as an array of strings. Tags are specified via a single string, an array of strings, or an object in which each key value is evaluated for truthiness. Tags are combined via the static method tags(a, b) where b's tags override a's tags.

#### tag and level

Tags are a superset of levels. A log entry's level is, by default, set to the tag with the highest severity. Level methods override this behavior such that the level associated with the method is chosen. The level can be specified via the logLevel meta tag. The level can also be modified via tag filtering options (see "tag filtering" below).

### meta tag

Some tags alter logging behavior. A tag's value (tags can be specified as an object) enables and disables the feature, based on their truthiness. Meta tags are not logged. Meta tag names start with 'log' and 'noLog.' Meta tags tags that start with noLog negate their corresponding meta tags. For example,
{logStack: true} is identical to 'logStack'. {logStack: false} is identical to 'noLogStack.' Meta tag names are:

#### logLevel

Use the meta tag's value as a log entry's logging level

#### logStack

Whether to add the current stack to meta. When true, populates the 'stack' meta key. This is the default behavior when the log entry's level is 'error.'

### tag-based filtering

Tags can be used to filter messages beyond logging levels. Tags that are named after logging levels do not participate in tag filtering. All tags are enabled by default. When using tag filtering, when the log entry's severity level is 'warn' higher, tags are enabled; however, this behavior can be overidden via the 'allowLevel' setting. Tags are enabled and disabled on a per-category basis. The 'default' category specifies the default behavior for unlisted categories.

The following example enables the tag 'sql' for only two categories: one and two. Category 'one' changes the level to 'more' and sends log entries only to the file and console transports. Category 'two' sends log entries to all transports.

```js
categories: {
  default: {
    tags: {
      sql: 'off', // Disable for all transports for all categories. Log entries with warn and error levels are logged.
    },
  },
  one: {
    tags: {
      sql: {
        // Fine-tune filtering for category 'one.' All of these keys are optional.
        allowLevel: 'off', // Enable tag filtering for all log entries regardless of their levels. 'off' is needed
          // because the default is 'warn'
        level: 'more', // Set the log entry's level to 'more'
        // Log entries are sent to all transports by default (console, file, errorFile, cloudWatch). Each transport
        // can be overridden:
        file: 'verbose', // Send a log entry with the 'sql' tag to the file transport if the log entry's severity
          // level is equal to or greater than 'verbose'
        console: 'on', // Send a log entry with the 'sql' tag to the console transport
        other: 'off', // Do not send a log entry with the 'sql' tag to CloudWatch
      },
    },
  },
  two: {
    tags: {
      sql: 'on', // Send all log entries with the 'sql' tag to all transports for category two
    },
  },
}
```

### host id

Uniquely identifies the system that is running node

### stage

Identifies the environment in which node is running, such as 'dev' or 'prod'

### context

An optional string, array, or object to log with message. Two 'context' objects are combined via the static
method context(a, b) in which b's keys override a's keys if they overlap.

### message

A scalar, array, or object to log. If an object is provided, its 'message' property is moved to meta and other properties can be copied to meta. The list of keys to copy to meta is altered via the 'metaKeys' options setting. Properties are copied to meta if their values are scalar and their names are specified in metaKeys.

### both

message and 'context' are shallow copied and combined into a new object called 'both.' If message's keys overlap with those in 'context,' 'context' is logged separately; both log entries will have the same groupId meta value.

### Errors

If both.error is truthy and both.message is falsey, both.message is set to `both.error.asString()`.

Error objects that are discovered in the top-level keys of both are logged separately, in a parent-child fashion, and recursively. This allows the stack trace and other details of every Error in a chain to be logged using applicable redaction rules. Each log entry contains the same groupId meta value. The data properties of parent entries contain the result of converting Error strings. For example, if both.error is an Error object, data.error will contain the Error object converted to a string. This process is performed recursively. Circular references are handled gracefully. The depth meta key contains a number, starting from 1, that indicates the recursion depth from both. The maximum recursion depth is specified via the 'maxErrorDepth' options setting. The maximum number of errors to log is specified via the 'maxErrors' options setting.

The following example produces three three log entries. error3 will be logged first, followed by error2, followed by error1. error1's corresponding log entry contains a data.cause key with a string value of 'Error: error2.'

```js
const error = new Error('error1');
const error2 = new Error('error2');
const error3 = new Error('error3');
error1.cause = error2;
error2.error = error3;
logger.log('error', error);
```

### transport

A transport sends log entries to one of the following destinations:

- file

  Writes log entries with level equal to or higher than a specified level (defaults to 'info') to a file named category-timestamp.log.

- errorFile

  Writes log entries with level equal to or higher than a specified level (defaults to 'error') to a file named category-error-timestamp.log. Log entries are also sent to the file transport.

- cloudWatch

  Sends log entries to CloudWatch AWS service

- console

  Writes log entries to the process's STDOUT filehandle

#### transport level

Use the 'categories' options setting to configure transports. It is not necessary to specify every category that is actually used. The 'default' category specifies the base configuration for all categories. For example:

```js
categories: {
  default: { console: 'on', cloudWatch: 'info',
             file: 'default' },
  api: { console: 'off' },
}
```

Level filtering for each transport is configured via a level name, 'default,' 'on,' or 'off.' 'off' is the default. Each transport type treats 'on' slightly differently:

- file: on -> info
- errorFile: on -> error
- cloudWatch: on -> warn
- console: on -> info, off -> warn if file and cloudWatch are both off

#### console

The behavior of console transports is altered via the 'console' options setting.

When 'colors' is true, log entries sent to the console are colorized. To override the provided value, set the

```shell
CONSOLE_COLORS
```

environment variable such that blank, 0, and 'false' are false and all other values are true.

When 'data' is true, the maximum amount of information is sent to the console, including meta, context, embedded errors, and stack traces. When it is false, a subset of meta keys are sent to the console with the log entry's message. To override the value for 'data', set the

```shell
CONSOLE_DATA
```

environment variable such that blank, 0, and 'false' are false and all other values are true.

Inside the categories: property, the console propery can contain a string or an object containing the data and colors keys that override the 'console' options settings.

#### file and errorFile

Log entries are written to files as JSON strings to a directory specified via the 'file' options setting. If no directory in the provided array does not exist and can be created, the file-related transports are disabled. File names contain the category and the date and hour of the local time when this object was instantiated. Category names may contain operating-system directory separators and must conform to the filesystem rules of the operating system. For error log files, '-error' is appended to the category. Files have the extension .log. An example file name is: `general-error-2020-07-18-18.log`. Files are rotated and zipped on an hourly basis. The maximum number of archived log files defaults to 14 days and can be specified via the 'file' options setting.

#### cloudWatch

CloudWatch transports are configured with a log group name and an optional AWS region. Log entries are sent to CloudWatch as JSON strings. One Loggers instance uses the same stream name for all cloudWatch transports. The log group, on the other hand, can be specified on a per-category basis. The log stream name contains the date and time (including the millisecond) when Loggers was instantiated followed by the host id. Any errors that occur while sending log entries to CloudWatch are written to the console and to files named cloudwatch-error\*.log if a file directory is specified.

If an AWS region is not specified, the environment variables are used in the following order:

1. AWS_CLOUDWATCH_LOGS_REGION
2. AWS_CLOUDWATCH_REGION
3. AWS_DEFAULT_REGION

## Begin/End/Error Utility Classes

Utility functions are provided for logging begin and end messages for common operations (database, http, etc.). Begin log entries are tagged with 'begin.' End log entries are tagged with 'end.' The operationId property is added to both log entries with the same unique identifier generated for the operation. If an exception is thrown, an error is logged. These functions are implemented as static methods.

The following classes are available:

- TaskLogger: For logging calls to aynchronous and asynchronous functions
- GeneratorLogger: Creates an object that is useful for logging operations that produce data (aka generators), usually via events or iterators
- MySqlLogger: For logging SQL statement execution via mysql2
- RequestLogger: For logging http requests via request-promise

### TaskLogger

#### Example

The following example sets result to 'Some data.'

```js
TaskLogger = require('@goodware/log/TaskLogger');
Loggers = require('@goodware/log');

const logger = new Loggers({ defaultLevel: 'info' });

let result;
TaskLogger.execute(logger, async () => 'Some data', 'Doing it').then((value) => {
  result = value;
});
```

## Maintainer Notes

### Deployment

First, push to git.

1. Change the version number in package.json
2. `npm run prepub`
3. Commit and push
4. Publish to npm: `npm run pub2`
