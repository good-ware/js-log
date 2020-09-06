# Winston3-Based Logging for NodeJS

[npm](https://www.npmjs.com/package/@goodware/log)

Better documentation is coming soon.

# Requirements

ECMAScript 2017

# Features

1. Brings HAPI-style logging via tags to Winston. Log entries can be filtered via tags in addition to logging levels.
2. Redaction of specific object keys. Redaction can be enabled and disabled via tags.
3. Safely logs large objects and arrays - even those with circular references
   3.1. Embedded 'cause' error objects are logged separately, grouping multiple log entries via uuid
4. Promotes object properties to a configurable subset of 'meta' properties
5. Reliable flushing (shut-down only)
6. Doesn't interfere with other code that uses Winston
7. This code is as efficient as possible; however, users are encouraged to call isLevelEnabled() (and even memoize it)
   to avoid creating expensive messages that won't be logged.

# Transports Supported

The following transports can be utilized. They are all optional.

- Console via [winston-console-format](https://www.npmjs.com/package/winston-console-format) and 'plain' console output
  which is more appropriate for production deployment
- File via [winston-daily-rotate-file](https://www.npmjs.com/package/winston-daily-rotate-file)
- AWS CloudWatch Logs via [winston-cloudwatch](https://www.npmjs.com/package/winston-console-format)

# What's Missing

The ability to add additional transports

# Usage

The Loggers class is a container that manages logger instances that have unique category names. Each logger has its
own settings, such as logging levels and transports.

Any number of Loggers instances can exist at any given time. This is useful if, say, independent libraries use this
package with different logging levels and other settings. The only caveat is Winston's design flaw that prevents
assigning different colors to the same level.

Loggers instances can also log messages via the methods log() and default(). Winston's splat formatter is not supported.
However, any type of data can be logged, such as strings, objects, arrays, and Errors (including their stack traces and
related errors).

Loggers are flushed via the asynchronous stop() method. Because of Winston's limitations, except for CloudWatch Logs,
transports are flushed by stopping them. Therefore, when a Loggers instance is stopped, it can not be used to log
messages until stop() completes and its start() method is later invoked. The asynchronous flushCloudWatch() method
flushes all active CloudWatch Logs transports.

The logger() and child() methods return logger instances. Logger instances have methods named after logging levels, such
as error(). Logging levels and their severities (and console colors) are provided to Loggers' constructor. This package
makes no assumptions about logging levels.

A Loggers instance is not a Winston logger. The logger() and child() methods do not return Winston loggers. If Winston-
specific functionality is needed, the winstonLogger() method returns Winston loggers.

Loggers and logger instances have the methods logger(), child(), winstonLogger(), isLevelEnabled(), log(), and
default(). Logger instances also have the methods loggers(), parent(), and level-specific methods.

Methods such as log() that log messages accept four optional parameters: tags, message, context, and category. They are
described below.

The Loggers class has static methods tags() and context() for merging multiple objects into a single object. These are
public but are rarely needed externally.

Finally, logger instances have the properties tags, context, and category.

## Unhandled exceptions and Promise rejections

While a Loggers instance is active, uncaught exceptions and Promise rejections are logged using a category specified via
the 'uncaughtCategory' options setting which defaults to 'uncaught.' The process is not terminated after logging
uncaught exceptions.

## Adding stack traces

When a log entry's level is 'error', the current stack trace is added to the to the 'stack' or 'logStack' meta key. This
behavior is disabled via the 'logStack' meta tag.

# Concepts

## options

An object provided to the constructor. Options are described by optionsObject.

## logger

A logger sends log entries to transports.

## category

The name of a logger. The default category is specified via the 'defaultCategory' options setting and defaults to
'general.' Transport filtering (based on tags) is specified on a per-category basis.

## log entry

An object that is sent to a transport. A log entry consists of meta and data.

## meta

The top-level keys of a log entry. Meta keys contain scalar values except for tags and logTransports which
are arrays. Meta keys are: timestamp, ms (elpased time between log entries), level, message, error, tags, category,
code, responseCode (renamed to statusCode), statusCode, logGroupId, logDepth, commitSha, correlationId, operationId,
requestId, tenantId, hostId, stage, version, service, stack, logStack, and logTransports.

## data

The keys remaining in 'both' after meta keys are removed (see 'both' below)

## level (severity)

Levels are associated with natural numbers. Per Winston's convention, a lower value indicates greater severity.
Therefore, 0 represents the highest severity.

Levels and their colors can be specified via the second argument provided to the constructor using the same object that
is provided when creating a Winston logger.

By default, Loggers uses Winston's default levels (aka
[npm log levels](https://github.com/winstonjs/winston#user-content-logging-levels) with the addition of two levels:

1. 'more' is between 'info' and 'verbose' and has the color cyan
2. 'db' is between 'verbose' and 'http' and has the color white
3. Therefore, from highest to lowest severity, the levels are: error, warn, info, more, verbose, db, http, debug, and
   silly.

## default level

When a level is not found in the provided tags, the default level, 'debug', is added to the tags.
The default level is specified via the 'defaultLevel' options setting.

## level methods

Methods that are named after levels, such as error(). The method log(tags, message, context, category)
is an alternative to the level methods. Level methods accept variant parameters. If the first parameter to a level
method is an array, the parameter list is (tags, message, context, category). Otherwise, it's (message, context,
category).

## level filtering

A log entry is sent to a transport only when its severity level is equal to or greater than the transport's level.

## tag

Tags are logged as an array of strings. Tags are specified via a single string, an array of strings, or an
object in which each key value is evaluated for truthiness. Tags are combined via the static method tags(a, b) where
b's tags override a's tags.

### tag and level

Tags are a superset of levels. A log entry's level is, by default, set to the tag with the highest
severity. Level methods override this behavior such that the level associated with the method is chosen.
The level can be specified via the logLevel meta tag. The level can also be modified via tag configuration.

## meta tag

Some tags alter logging behavior. The tags' value (tags can be specified as an object) enables and
disables the feature, based on their truthiness. Meta tags are not logged. Meta tag names start with 'log' and
'noLog.' Meta tags tags that start with noLog negate their corresponding meta tags. For example,
{logStack: true} is identical to 'logStack'. {logStack: false} is identical to 'noLogStack.' Meta tag names are:

### logLevel

Use the meta tag's value as a log entry's logging level

### logStack

Whether to add the current stack to meta. When true, populates the 'stack' or the 'logStack' meta key.
This is the default behavior when a log entry's level is 'error.'

## tag filtering

Tags can be used for additional filtering on a per-transport basis. Tags that are named after
severity levels do not participate in tag filtering. All tags are enabled by default. When a log entry's level is
'warn' or 'error', tags are enabled. This behavior can be overidden by the 'allowLevel' setting. Tags are enabled and
disabled on a per-category basis. The 'default' category specifies the default behavior for unlisted categories.

The following example enables the tag 'sql' for only two categories: one and two. Category 'one' changes the
level to 'more' and sends log entries only to the file and console transports. Category 'two' sends log entries to
all transports.

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
            // because the default is 'warn' which causes all log entries with warn and error levels to be logged.
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

## host id

Uniquely identifies the system that is running node

## stage

Identifies the environment in which node is running, such as 'dev' or 'prod'

## context

An optional string, array, or object to log with message. Two 'context' objects are combined via the static
method context(a, b) in which b's keys override a's keys if they overlap.

## message

A scalar, array, or object to log. If an object is provided, its 'message' property is moved to meta and
other properties can be copied to meta. The list of keys to copy to meta is altered via the 'metaKeys' options
setting. Properties are copied to meta if their values are scalar and their names are specified in metaKeys.

## both

message and 'context' are shallow copied and combined into a new object called 'both.' If message's keys overlap
with those in 'context,' 'context' is logged separately; both log entries will have the same logGroupId meta key value.

## error

Errors can be provided via both, both.error, both.cause, and both.originalError. Error objects may
also have these keys. All error objects are logged separately such that each log entry has the same logGroupId meta
key value. The values of the error, cause, and originalError are set to the Error objects' message property and
therefore do not, for example, contain stack traces. As Error objects are traversed, embedded error objects are also
traversed and logged recursively. The logDepth meta key contains a number, starting from 0, that indicates the
recursion depth from both.

## transport

A transport sends log entries to one of the following destinations:

- file

  Writes log entries with level equal to or higher than a specified level (defaults to 'info') to a file
  named category-timestamp.log.

- errorFile

  Writes log entries with level equal to or higher than a specified level (defaults to 'error') to a
  file named category-error-timestamp.log. Log entries are also sent to the file transport.

- cloudWatch

  Sends log entries to CloudWatch AWS service

- console

  Writes log entries to the process's STDOUT filehandle

### transport level

Use the 'categories' options setting to configure transports. It is not necessary to specify every category that is
actually used. The 'default' category specifies the base configuration for all categories. For example:

```js
categories: {
  default: { console: 'on', cloudWatch: 'info',
             file: 'default' },
  api: { console: 'off' },
}
```

Level filtering for each transport is configured via a level name, 'default,' 'on,' or 'off.' 'off' is the default.
Each transport type treats 'on' slightly differently:

- file: on -> info
- errorFile: on -> error
- cloudWatch: on -> warn
- console: on -> info, off -> warn if file and cloudWatch are both off

### console

The behavior of console transports is altered via the 'console' options setting.

When 'colors' is true, log entries sent to the console are colorized. To override the provided value, set the

```shell
CONSOLE_COLORS
```

environment variable such that blank, 0, and 'false' are false and all other values are true.

When 'data' is true, the maximum amount of information is sent to the console, including meta, data, embedded errors, overridden 'context' properties objects, and stack traces. When it is false, a small set of meta keys are sent to the console with a log entry's message. To override the value for 'data', set the

```shell
CONSOLE_DATA
```

environment variable such that blank, 0, and 'false' are false and all other values are true.

### file and errorFile

Log entries are written to files as JSON strings to a directory specified via the 'file' options setting. If no
directory in the provided array does not exist and can be created, the file-related transports are disabled. File
names contain the category and the date and hour of the local time when this object was instantiated. For error log
files, '-error' is appended to the category. Files have the extension .log. An example file name is:
uncaught-error-2020-07-18-18.log. Files are rotated and zipped on an hourly basis. The maximum number of archived
log files defaults to 14 days and can be specified via the 'file' options setting.

### cloudWatch

CloudWatch transports are configured with a log group name and an optional AWS region. Log entries are sent to
CloudWatch as JSON strings. One Loggers instance uses the same stream name for all cloudWatch transports. The
log group, on the other hand, can be specified on a per-category basis. The log stream name contains the date and
time (including the millisecond) when Loggers was instantiated followed by the host id. Any errors that occur
while sending log entries to CloudWatch are written to the console and to files named cloudwatch-error\*.log if a
file directory is specified.

If an AWS region is not specified, the environment variables are used in the following order:

1. AWS_CLOUDWATCH_LOGS_REGION
2. AWS_CLOUDWATCH_REGION
3. AWS_DEFAULT_REGION

# Begin/End/Error Utilities

Utility functions are provided for logging begin and end messages for common operations (database, http, etc.). Begin
log entries are tagged with 'begin.' End log entries are tagged with 'end.' The operationId property is set added
to both entries with the same uuid generated for the operation. If an exception is thrown, an error is logged. These
functions are implemented as static class methods.

The following classes are available:

- TaskLogger: For logging calls to aynchronous and asynchronous functions
- GeneratorLogger: Creates an object that is useful for logging operations that produce data (aka generators), usually
  via events or iterators
- MySqlLogger: For logging SQL statement execution via mysql2
- RequestLogger: For logging http requests via request-promise
