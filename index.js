// =============================================================================
// Developer Notes
//
// 1. typeof(null) === 'object'. Use instanceof Object instead.
// 2. This code uses 'in' instead of Object.keys because protoptype fields
//    are useful to log
// =============================================================================
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-plusplus */
/* eslint-disable no-param-reassign */
/* eslint-disable-next-line max-classes-per-file */
const ansiRegex = require('ansi-regex')(); // version 6 requires Node 12, so 5 is used
const deepCleaner = require('deep-cleaner');
const EventEmitter = require('events');
const fs = require('fs');
const hostId = require('hostid');
const humanizeDuration = require('humanize-duration');
const Joi = require('joi');
const path = require('path');
const prune = require('json-prune');
const { ulid } = require('ulidx');
const util = require('util');

// Winston3
const winston = require('winston');
require('winston-daily-rotate-file'); // This looks weird but it's correct
const { consoleFormat: WinstonConsoleFormat } = require('winston-console-format');

// Local includes
const { monitorEventLoopDelay } = require('perf_hooks');
const Stack = require('./Stack');
const { name: myName, version: myVersion } = require('./package.json'); // Discard the rest

// Global variables
let WinstonCloudWatch;
let noCloudWatch;

const addErrorSymbol = Symbol.for('error');

const { format } = winston;

const transportNames = ['file', 'errorFile', 'cloudWatch', 'console'];

const nonenumerableKeys = ['message', 'stack'];

/**
 * @ignore
 * @private
 * Property names in object passed to transformArgs
 */
const transformArgsProperties = {
  tags: undefined,
  message: undefined,
  data: undefined,
  context: undefined,
  category: undefined,
};

/**
 * @ignore
 * @private
 * Removes internal functions from the stack trace. This only works for code that uses this module. It
 * doesn't work for unit tests.
 */
const stripStack = /\n {4}at [^(]+\(.*[/|\\]@goodware[/|\\]log[/|\\][^)]+\)/g;

/**
 * @private
 * @ignore
 * Used for tag filtering
 */
const transportObj = {};
transportNames.forEach((transport) => {
  transportObj[transport] = null;
});

/**
 * @private
 * @ignore
 * Category names for internal loggers
 */
const reservedCategories = {
  unhandled: '@goodware/unhandled',
  cloudWatch: '@goodware/cloudwatch',
  log: '@goodware/log', // When the API is misused
};

/**
 * @private
 * @ignore
 * Internal class for identifying the return value of transformArgs()
 */
class LogArgs {}

/**
 * @private
 * @ignore
 * Internal class for identifying log entries that are created by Loggers::logEntry
 */
class LogEntry {}

/**
 * @private
 * @ignore
 * Internal class for identifying objects returned by context
 */
class Context {}

/**
 * Manages logger objects that can send log entries to the console, files, and AWS CloudWatch Logs
 */
class Loggers extends EventEmitter {
  /**
   * Private Properties
   *  {object} options
   *  {object} unitTest
   *  {boolean} props.starting
   *  {boolean} props.stopping
   *  {boolean} props.stopped
   *  {number} props.restarting
   *  {string} props.created
   *  {string} props.hostId
   *  {object[]} props.loggers
   *  {string[]} props.metaProperties
   *  {object} props.meta Has properties with the same name as the metaProperties
   *  {function} props.unhandledPromiseListener
   *  {function[]} props.stopWaiters
   *  {string[]} props.levels {string} with 'default'
   *  {object} props.logStackLevels
   *  {object} props.winstonLoggers {string} category -> Winston logger
   *  {object} props.userMeta {string} metaFieldName -> undefined. Added to new LogEntry objects.
   *  {string[]} props.redact keys to nonrecursively remove from data
   *  {string[]} props.recursiveRedact keys to recursively remove from data
   *  {string} props.cloudWatchStream
   *  {object[]} props.cloudWatchTransports
   *  {object} props.categoryTags {string} category -> {{string} tag -> {object}}
   *  {object} props.hasCategoryTags {string} category -> {boolean}
   *  {object} props.levelSeverity {string} level plus 'on', 'off', and 'default'
   *   -> {Number} {object} winstonLevels Passed to Winston when creating a logger
   *  {object} props.loggerStacks
   *
   * Notes to Maintainers
   *  1. tags, message, and data provided to public methods should never be modified
   *  2. The output of Object.keys and Object.entries should be cached for static objects
   *  3. 'in' is used with caller-supplied objects instead of Object.keys() or Object.entries() in order to work with
   *     parent classes since keys() and entries() returns 'own' properties only 
   *
   * @todo
   * 1. When console data is requested but colors are disabled, output data without colors using a new formatter
   * 2. Add a new metatag to output to the plain console
   * 3. Document defaultTagAllowLevel
   * 4. Custom levels and colors RunKit example
   * 5. Move Logger to another module - see
   *    https://medium.com/visual-development/how-to-fix-nasty-circular-dependency-issues-once-and-for-all-in-javascript-typescript-a04c987cf0de
   */
  /**
   * @constructor
   * @param {object} options
   * @param {object} [levels] An object with properties levels and colors, both of which are objects whose keys are
   * level names. This is the same object that is provided when creating Winston loggers. See an example at
   * https://www.npmjs.com/package/winston#using-custom-logging-levels
   */
  constructor(options, levels = Loggers.defaultLevels) {
    super();

    const props = {
      stopped: true,
      restarting: 0,
      // levels must be set before validating options
      levels: Object.keys(levels.levels),
      created: Loggers.now(),
      hostId: hostId(),
      loggers: {},
      winstonLoggers: {},
      meta: { message: 'message', stack: 'stack' },
      userMeta: {},
      categoryTags: {},
      hasCategoryTags: {},
      cloudWatchLogGroups: {},
    };

    this.props = props;

    // =============================================
    // Copy environment variables to options (begin)

    /**
     * @private
     * @ignore
     * Sets options.console.{key} if a CONSOLE_{KEY} environment variable exists
     * @param {string} key 'data' or 'colors'
     */
    const envToConsoleKey = (key) => {
      const envKey = `CONSOLE_${key.toUpperCase()}`;
      const value = process.env[envKey];
      if (value === undefined) return;
      options.console[key] = value === 'true' ? true : !!Number(value);
    };

    // Copy environment variables to options (end)

    // Validate options
    options = this.validateOptions(options);
    this.options = options;

    envToConsoleKey('colors');
    envToConsoleKey('data');

    // Do not add default until after validating
    this.props.levels.push('default');

    // Level color
    {
      let { colors } = levels;
      const { levelColors } = options;
      if (levelColors) {
        colors = { ...colors };
        Object.entries(levelColors).forEach(([level, color]) => {
          colors[level] = color;
        });
      }

      winston.addColors(colors);
    }

    /**
     * @type {object}
     * Maps level names to integers where lower values have higher severity
     */
    this.winstonLevels = levels.levels;

    this.props.levelSeverity = { ...levels.levels };
    Object.assign(this.props.levelSeverity, {
      off: -1,
      default: this.props.levelSeverity[options.defaultLevel],
      on: 100000,
    });

    // Process meta properties (begin)
    {
      const { meta } = props;

      Object.entries(options.metaProperties).forEach(([key, value]) => {
        if (!value) value = key;
        meta[key] = key;
        props.userMeta[key] = undefined;
      });

      props.metaProperties = Object.keys(meta);
    }
    // Process meta properties (end)

    // Add the default category if it's missing
    {
      const category = options.categories;
      if (!category.default) category.default = {};
    }

    // Process category tag switches
    if (!this.processCategoryTags('default')) props.categoryTags.default = { on: true };

    // Set props.logStackLevels
    {
      const obj = {};
      props.logStackLevels = obj;

      options.logStackLevels.forEach((level) => {
        if (level === 'default') level = options.defaultLevel;
        obj[level] = null;
      });
    }

    // For the default category, convert the settings for each transport from string to object and potentially overwrite
    // corresponding transport settings in the top-level keys such as console
    {
      const { default: defaultConfig } = options.categories;

      if (defaultConfig) {
        Object.entries(defaultConfig).forEach(([key, value]) => {
          if (!(key in transportObj)) return;
          if (!(value instanceof Object)) value = { level: value };
          Object.assign(options[key], value);
        });
      }
    }

    // =====================
    // Preprocess redactions
    this.props.redact = Object.entries(options.redact).reduce((prev, [key, value]) => {
      if (!value.recursive) prev[key] = null;
      return prev;
    }, {});

    this.props.recursiveRedact = Object.entries(options.redact).reduce((prev, [key, value]) => {
      if (value.recursive) prev.push(key);
      return prev;
    }, []);

    // =========================
    // Add logging-level methods
    this.addLevelMethods(this);

    this.start();
  }

  /**
   * @private
   * @ignore
   * @param {WeakSet} processed
   * @param {object} obj
   * @param {object} result
   */
  static deepCopy(processed, object) {
    processed.add(object);

    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in object) {
      let value = object[key];
      if (value instanceof Object && !(value instanceof Array) && !processed.has(value)) {
        if ('stack' in value || 'message' in value) {
          value = {...value, stack: value.stack, message: value.message};
          object[key] = value;
        }
        Loggers.deepCopy(processed, value);
      }
    }
  }

  /**
   * @private
   * @ignore
   * Determines any of the arguments is an object with an Error instance
   * @param {Array} args
   * @returns {boolean}
   */
  static hasError(...args) {
    return args.some((arg) => {
      if (arg instanceof Error) return true;
      if (!(arg instanceof Object) || arg instanceof Array) return false;
      // eslint-disable-next-line no-restricted-syntax
      for (const key in arg) if (arg[key] instanceof Error) return true;
      return false;
    });
  }

  /**
   * @private
   * @ignore
   * Determines whether an object has any properties. Faster than Object.keys(object).length.
   * See https://jsperf.com/testing-for-any-keys-in-js
   * @param {object} object An object to test
   * @returns {boolean} true if object has properties (including inherited)
   */
  static hasProperty(object) {
    // See https://stackoverflow.com/questions/679915/how-do-i-test-for-an-empty-javascript-object
    if (!(object instanceof Object) || (object instanceof Array)) return false;
    // message and stack are invisible; any others?
    // eslint-disable-next-line no-restricted-syntax, guard-for-in, no-unreachable-loop
    for (const prop in object) return true;
    if ('message' in object || 'stack' in object) return true;
    return false;
  }

  /**
   * @private
   * @ignore
   * Converts a number to a string with leading zeroes
   * @param {Number} num The number to convert
   * @param {Number} size The minimum number of digits
   * @returns {string} num converted to a string with leading zeroes if necessary
   */
  static pad(num, size = 2) {
    let s = num.toString();
    while (s.length < size) s = `0${s}`;
    return s;
  }

  /**
   * @private
   * @ignore
   * Returns local time in ISO8601 format with the local timezone offset
   * @returns {string}
   */
  static now() {
    const now = new Date();
    const tzo = now.getTimezoneOffset();

    return `${now.getFullYear()}-${Loggers.pad(now.getMonth() + 1)}-${Loggers.pad(now.getDate())}T${Loggers.pad(
      now.getHours()
    )}:${Loggers.pad(now.getMinutes())}:${Loggers.pad(now.getSeconds())}.${Loggers.pad(now.getMilliseconds(), 3)}${
      !tzo ? 'Z' : `${(tzo > 0 ? '-' : '+') + Loggers.pad(Math.abs(tzo) / 60)}:${Loggers.pad(tzo % 60)}`
    }`;
  }

  /**
   * Combines tags into a single tags object
   * @param {Array} [args]
   * @returns {object}
   */
  // eslint-disable-next-line class-methods-use-this
  tags(...args) {
    const newTags = {};

    args.forEach((tags) => {
      if (tags instanceof Object) {
        if (tags instanceof Array) {
          tags.forEach((tag) => {
            if (tag) newTags[tag] = true;
          });
        } else {
          Object.assign(newTags, tags);
        }
      } else if (tags) {
        newTags[tags] = true;
      }
    });

    return newTags;
  }

  /**
   * @private
   * @ignore
   * Converts a value to an object
   * @param {*} [data]
   * @param {string} [key] message, data, or context, defaults to context. The key name to use when data is not an
   *   object.
   * @returns {object|undefined}
   */
  static toObject(data, key = 'context') {
    if (data === undefined) return data;
    if (typeof data === 'function') return undefined;

    if (data instanceof Object && !(data instanceof Array)) {
      if (key === 'data' && data instanceof Error) return { error: data };
      return data;
    }

    return { [key]: data };
  }

  /**
   * @private
   * @ignore
   * @param {string} [level]
   * @param {object} tags
   * @param {string} category
   * @param {*} context
   * @returns {object|undefined}
   */
  toContext(level, tags, category, context) {
    if (context instanceof Context) return context;
    context = Loggers.toObject(context);

    if (!context) return undefined;

    const event = { tags, category, arg: context, type: 'context' };
    if (level) event.level = level;

    try {
      this.emit('redact', event);
      ({ arg: context } = event);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Redact context event handler failed', error);
    }

    // Redact context
    const result = ('message' in context || 'stack' in context) ? 
     {message: context.message, stack: context.stack} : {};
    const { redact } = this.props;
    let hasObject;

    // eslint-disable-next-line no-restricted-syntax
    for (const key in context) {
      if (!(key in redact)) {
        const value = context[key];
        if (typeof value !== 'function') result[key] = value;
        if (value instanceof Object) hasObject = true;
      }
    }

    // Recursively reveal objects that have message and stack
    if (hasObject) Loggers.deepCopy(new WeakSet(), result);
    return Loggers.hasProperty(result) ? result:undefined;
  }

  /**
   * Accessor for context 
   * @returns {object}
   */
  // eslint-disable-next-line class-methods-use-this
  context() {
    return {};
  }

  /**
   * @private
   * @ignore
   * Combines multiple contexts into one context object
   * @param {string} [level]
   * @param {string} [tags]
   * @param {*} [tags]
   * @param {string} [category]
   * @param {Array} [args]
   * @returns {object}
   */
  mergeContext(level, tags, category, ...args) {
    tags = this.tags(tags);
    category = this.category(category);

    let prevCopied;
    let mergedContext = args.reduce((prev, arg) => {
      // toContext performs redaction
      arg = this.toContext(level, tags, category, arg);

      if (!arg) return prev;
      if (!prev) return arg;

      if (!prevCopied) {
        // Make a shallow copy
        prev = { ...prev };
        prevCopied = true;
      }

      return Object.assign(prev, arg);
    }, undefined);

    if (mergedContext === undefined || mergedContext instanceof Context) return mergedContext;

    // =======================================================================
    // Prune data. This unfortunately removes keys that have undefined values.
    mergedContext = JSON.parse(prune(mergedContext, this.options.message.depth, this.options.message.arrayLength));

    {
      const { recursiveRedact } = this.props;
      if (recursiveRedact.length) deepCleaner(mergedContext, recursiveRedact);
    }

    return Object.assign(
      new Context(),
      mergedContext
    );
  }

  /**
   * @private
   * @ignore
   * Adds methods named after levels, such as error()
   * @param target The object to modify
   */
  addLevelMethods(target) {
    // eslint-disable-next-line no-return-assign
    this.props.levels.forEach((level) => target[level] = (...args) => Loggers.logLevel(target, level, ...args));
  }

  /**
   * @private
   * @ignore
   * Processes options
   * @param {object} options
   * @returns {object} options with defaults added
   */
  validateOptions(options) {
    if (!options) options = {};

    // =============================
    // Joi model for options (begin)
    const levelEnum = Joi.string().valid(...this.props.levels);
    const defaultLevelEnum = Joi.alternatives(levelEnum, Joi.string().valid('default'));
    const offDefaultLevelEnum = Joi.alternatives(defaultLevelEnum, Joi.string().valid('off'));
    const onOffDefaultLevelEnum = Joi.alternatives(offDefaultLevelEnum, Joi.string().valid('on'));

    // Console settings
    const consoleObject = Joi.object({
      level: onOffDefaultLevelEnum,
      colors: Joi.boolean().description('If true, outputs text with ANSI colors to the console').default(true),
      data: Joi.boolean().description('If true, sends data, error objects, stack traces, etc. to the console'),
      childErrors: Joi.boolean().default(true).description('If true, logs child error objects'),
    });

    // File settings
    const fileObject = Joi.object({
      level: onOffDefaultLevelEnum,
      directories: Joi.array()
        .items(Joi.string())
        .default(Loggers.defaultFileDirectories)
        .description('Use an empty array for read-only filesystems'),
      datePattern: Joi.string().default('YYYY-MM-DD-HH'),
      utc: Joi.boolean().default(true),
      zippedArchive: Joi.boolean().default(true),
      maxSize: Joi.string().default('20m'),
      maxFiles: Joi.alternatives(Joi.number(), Joi.string()).default('14d')
        .description(`If a number, it is the maximum number of files to keep. If a string, it is the maximum \
age of files to keep in days, followed by the chracter 'd'.`),
    });

    // Region and logGroup are required by winston-cloudwatch but they can be provided under categories
    const cloudWatchObject = Joi.object({
      level: onOffDefaultLevelEnum,
      region: Joi.string(),
      logGroup: Joi.string(),
      uploadRate: Joi.number()
        .integer()
        .min(1)
        .default(2000)
        .description('The frequency in which entries are sent to CloudWatch. Number of milliseconds between flushes.'),
    });

    // Add flushTimeout for the top cloudWatch key only
    const cloudWatchTopObject = cloudWatchObject.keys({
      flushTimeout: Joi.number()
        .integer()
        .min(1)
        .default(90000)
        .description(
          `The maximum number of milliseconds to wait when sending the current batch of log entries to CloudWatch`
        ),
    });

    // Options provided to the constructor. The defaults in this object assume the following levels exist:
    // error, warn, debug
    const optionsSchema = Joi.object({
      // Process-related meta
      stage: Joi.string().description('Added as a meta property if provided'),
      service: Joi.string().description('Added as a meta property if provided'),
      version: Joi.string().description('Added as a meta property if provided'),
      commitSha: Joi.string().description('Added as a meta property if provided'),

      // Defaults
      defaultCategory: Joi.string().default('general'),
      defaultLevel: levelEnum.default('debug').description('Which level to use when a level is not found in tags'),
      defaultTagAllowLevel: offDefaultLevelEnum.default('warn'),

      // Colors
      levelColors: Joi.object().pattern(levelEnum, Joi.string().required()),

      // Set the 'stack' meta with the current call stack
      logStackLevels: Joi.array().items(defaultLevelEnum).default(['error']),

      // meta properties
      metaProperties: Joi.object()
        .pattern(Joi.string(), Joi.string().allow(null)) // They can be renamed
        .default(Loggers.defaultMetaProperties)
        .description(`Which properties to copy from context and data the option to rename properties`),

      // Redaction
      redact: Joi.object()
        .pattern(
          Joi.string(),
          Joi.object({
            recursive: Joi.boolean().default(true),
          }).default({})
        )
        .default({}),

      // Errors
      errors: Joi.object({
        depth: Joi.number()
          .integer()
          .min(1)
          .default(5)
          .description(
            'Errors reference other errors, creating a graph. This is the maximum error graph depth to traverse.'
          ),
        max: Joi.number()
          .integer()
          .min(1)
          .default(20)
          .description(
            'Errors reference other errors. This is the maximum number of errors to log when logging one message.'
          ),
      }).default({}),

      message: Joi.object({
        // Converting objects to strings
        arrayLength: Joi.number()
          .integer()
          .min(1)
          .default(20)
          .description('The maximum number of elements to process when converting an array to a string'),
        depth: Joi.number()
          .integer()
          .min(1)
          .default(20)
          .description('The maximum depth to traverse when converting an object to a string'),
      }).default({}),

      // Turn console status messages on and off
      say: Joi.object({
        flushed: Joi.boolean().default(true),
        flushing: Joi.boolean().default(true),
        ready: Joi.boolean().default(true),
        stopping: Joi.boolean().default(true),
        stopped: Joi.boolean().default(true),
        cloudWatch: Joi.boolean().default(true),
      }).default({}),

      // CloudWatch settings
      cloudWatch: cloudWatchTopObject.default({}),

      // Console settings
      console: consoleObject.default({}),

      // File settings
      file: fileObject.default({}),
      errorFile: fileObject.default({}),

      // Categories
      categories: Joi.object()
        .pattern(
          Joi.string(),
          Joi.object({
            tags: Joi.object().pattern(
              Joi.string(),
              Joi.alternatives(
                onOffDefaultLevelEnum,
                Joi.object({
                  allowLevel: offDefaultLevelEnum.description(`\
Enable the tag for log entries with severity levels equal to or greater than the provided value`),
                  level: defaultLevelEnum.description('Alters the level of the log entry'),
                  other: onOffDefaultLevelEnum.description('Which value to use for transports not listed'),
                  file: onOffDefaultLevelEnum,
                  console: onOffDefaultLevelEnum,
                  errorFile: onOffDefaultLevelEnum,
                  cloudWatch: onOffDefaultLevelEnum,
                })
              )
            ),
            file: Joi.alternatives(fileObject, onOffDefaultLevelEnum),
            errorFile: Joi.alternatives(fileObject, onOffDefaultLevelEnum),
            console: Joi.alternatives(consoleObject, onOffDefaultLevelEnum),
            cloudWatch: Joi.alternatives(cloudWatchObject, onOffDefaultLevelEnum),
          })
        )
        .default({}),

      // Testing
      unitTest: Joi.boolean(),
    }).label('Loggers options');
    // Joi model for options (end)
    // ===========================

    // TODO cache options schema
    let validation = optionsSchema.validate(options);
    if (validation.error) throw new Error(validation.error.message);
    // Add defaults to default empty objects
    validation = optionsSchema.validate(validation.value);
    if (validation.error) throw new Error(validation.error.message);
    return validation.value;
  }

  /**
   * Starts the logger after the constructor or stop() is called
   */
  start() {
    if (!this.props.stopped) return;

    // This is a synchronous method so reentrancy is impossible unless there's an infinite loop
    if (this.props.starting) throw new Error('Starting');

    this.props.starting = true;

    const { options } = this;

    if (options.unitTest) {
      // eslint-disable-next-line no-console
      console.log(`Unit test mode enabled  [info ${myName}]`);

      this.unitTest = {
        entries: [],
        groupIds: {},
        dataCount: 0,
        throwErrorFileError: true,
      };

      transportNames.forEach((transport) => {
        this.unitTest[transport] = { entries: [] };
      });
    }

    this.props.stopped = false;

    // ==========================================================================
    // Create one logger for uncaught exceptions and unhandled Promise rejections

    // process.on('uncaughtException') is dangerous and doesn't work for exceptions thrown in a function called by the
    // event loop -- e.g., setTimeout(() => {throw...})
    // Use the magic in Winston transports instead to catch uncaught exceptions
    const unhandledLoggers = this.logger(reservedCategories.unhandled);
    if (unhandledLoggers.isLevelEnabled('error')) {
      // Create a real Winston logger that has a transport with handleExceptions: true
      unhandledLoggers.winstonLogger();
      // Store this function so it can be removed later
      this.props.unhandledPromiseListener = (error) => {
        unhandledLoggers.error('Unhandled Promise rejection', { error });
      };
      process.on('unhandledRejection', this.props.unhandledPromiseListener);
    }

    this.props.starting = false;

    if (!this.props.restarting && options.say.ready) {
      const { service = '', stage = '', version = '', commitSha = '' } = options;

      this.log(
        undefined,
        `Ready: ${service} ${stage} v${version} ${commitSha} [${myName} v${myVersion}]`,
        undefined,
        undefined,
        reservedCategories.log
      );
    }
  }

  /**
   * @private
   * @ignore
   * Creates a directory for log files
   * @param {string[]} directories
   * @returns {string} A directory path
   */
  static createLogDirectory({ directories }) {
    if (!directories) return undefined;

    let logDirectory;

    directories.every((dir) => {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (error) {
        return true; // Next directory
      }
      logDirectory = dir;
      return false; // Stop iterating
    });

    if (!logDirectory) {
      // eslint-disable-next-line no-console
      console.error(`Failed creating log file directory. Directories attempted:  [error ${myName}]
${directories.join(`  [error ${myName}]\n`)}  [error ${myName}]`);
    }

    return logDirectory;
  }

  /**
   * Checks a category value
   * @param {string} [category]
   * @returns {string} Returns the provided category if it is a truthy string; otherwise, returns the default category.
   * Logs a warning when the value is truthy and its type is not a string.
   * @throws When this.options.unitTest is true, throws an exception if the category is not a string
   */
  category(category) {
    if (category) {
      const type = typeof category;
      if (type === 'string') return category;

      // =================================================
      // Value with invalid datatype provided for category
      const error = Error(`Invalid datatype provided for category (${type})`);

      const stack = error.stack.replace(stripStack, '');
      this.log('error', stack, undefined, undefined, reservedCategories.log);
      // eslint-disable-next-line no-console
      console.error(`${stack}  [error ${myName}]`);

      // Throw exception when unit testing
      if (this.options.unitTest) throw error;
    }

    return this.options.defaultCategory;
  }

  /**
   * @private
   * @ignore
   * Processes tag switches for one category specified in this.options
   * @param {string} category
   * @returns {boolean} true only if tag switches are defined for the category
   */
  processCategoryTags(category) {
    if (category in this.props.hasCategoryTags) return this.props.hasCategoryTags[category];

    // this.options looks like:
    // categories: {
    //   foo: {
    //     tags: {
    //       sql: {
    //         file: 'on'
    let tags = this.options.categories[category];
    if (tags) ({ tags } = tags);

    if (!tags) {
      this.props.hasCategoryTags[category] = false;
      return false;
    }

    const categoryTags = {};
    this.props.categoryTags[category] = categoryTags;

    // This code is only called once per category so use of Object.entries is fine
    Object.entries(tags).forEach(([tag, tagInfo]) => {
      if (typeof tagInfo === 'string') {
        // Level name
        categoryTags[tag] = { on: tagInfo };
      } else {
        categoryTags[tag] = tagInfo;
      }
    });

    this.props.hasCategoryTags[category] = true;
    return true;
  }

  /**
   * @private
   * @ignore
   * Determines whether a log entry can be sent to a transport
   * @param {string} transportName
   * @param {object} info Log entry
   * @returns {object} Either returns logEntry unaltered or a falsy value
   */
  checkTags(transportName, info) {
    if (info.transports && !info.transports.includes(transportName)) return false;
    if (this.unitTest) this.unitTest[transportName].entries.push(info);
    return info;
  }

  /**
   * @private
   * @ignore
   * Returns default meta for log entries
   * @param {string} category
   * @returns {object}
   */
  static defaultMeta(category) {
    // Do not add more fields here. category is needed by the custom formatter for logging uncaught exceptions.
    return {
      category, // The category of the Winston logger, not the category provided to log() etc.
    };
  }

  /**
   * @private
   * @ignore
   * Combines a custom Winston formatter with format.ms()
   * @returns {object} A Winston formatter
   */
  formatter() {
    return format.combine(winston.format((info) => this.format(info))(), format.ms());
  }

  /**
   * @private
   * @ignore
   * Winston customer formatter
   *  1. Enforces log() is called to support uncaught exception logging
   *  2. Manages this.unitTest object for unit test validation
   *  3. Adds 'ms' to log entries
   * @param {object} info The log entry to format
   * @returns {object} info or false
   */
  format(info) {
    if (info instanceof LogEntry) {
      if (this.unitTest) {
        this.unitTest.entries.push(info);
        if (info.groupId) this.unitTest.groupIds[info.groupId] = null;
        if (info.data) ++this.unitTest.dataCount;
      }
      return info;
    }
    // ========================================================
    // This is the uncaught exception handler. Reroute to log()
    const { category } = info; // From defaultMeta
    delete info.category;
    let { level } = info;
    if (!level || typeof level !== 'string') {
      level = 'error';
    } else {
      delete info.level;
    }
    if (info.stack) {
      // Remove stack from logEntry.message
      const { message } = info;
      let index = message.indexOf('\n');
      if (index >= 0) {
        const index2 = message.indexOf('\r');
        if (index2 >= 0 && index2 < index) index = index2;
        info.message = message.substr(0, index);
      }
    }
    this.log(level, info, undefined, category);
    return false;
  }

  /**
   * @private
   * @ignore
   * Console formatter for 'no data'
   * @param {object} info A log entry
   * @returns {string}
   */
  static printf(info) {
    const { id, level, ms, message, category, tags } = info;
    let colorBegin;
    let colorEnd;
    {
      // Extract color codes from the level
      const codes = level.match(ansiRegex);
      if (codes) {
        [colorBegin, colorEnd] = codes;
      } else {
        // eslint-disable-next-line no-multi-assign
        colorBegin = colorEnd = '';
      }
    }
    const spaces = message ? '  ' : '';
    const t2 = tags.slice(1);
    t2.unshift(category);
    return `${colorBegin}${ms} ${colorEnd}${message}${colorBegin}${spaces}[${tags[0]} ${t2.join(
      ' '
    )} ${id}]${colorEnd}`;
  }

  /**
   * @private
   * @ignore
   * Creates a console transport
   * @param {string} level
   * @param {boolean} handleExceptions
   * @param {object} settings
   * @returns {object} A new console transport
   */
  createConsoleTransport(level, handleExceptions, settings) {
    if (!settings) settings = this.options.console;
    const { colors, data, childErrors } = settings;

    if (data) {
      // Fancy console
      const consoleFormat = WinstonConsoleFormat({
        showMeta: true,
        inspectOptions: {
          depth: Infinity,
          colors,
          maxArrayLength: Infinity,
          breakLength: 120,
          compact: Infinity,
        },
      });

      const checkTags = winston.format((info) => this.checkTags('console', info))();

      return new winston.transports.Console({
        handleExceptions,
        level,
        format: colors
          ? format.combine(checkTags, format.colorize({ all: true }), consoleFormat)
          : format.combine(checkTags, consoleFormat),
      });
    }

    // Plain console
    const checkTags = winston.format((info) => {
      if (!childErrors && info.depth > 1) return false;
      return this.checkTags('console', info);
    })();

    const printf = format.printf(Loggers.printf);

    return new winston.transports.Console({
      handleExceptions,
      level,
      format: colors
        ? format.combine(checkTags, format.colorize({ all: true }), printf)
        : format.combine(checkTags, printf),
    });
  }

  /**
   * @private
   * @ignore
   * Sets this.props.cloudWatch*
   */
  initCloudWatch() {
    if (this.props.cloudWatchTransports) return;
    this.props.cloudWatchTransports = [];

    if (!this.props.cloudWatchStream) {
      let stream = this.props.created.replace('T', ' ');
      // CloudWatch UI already sorts on time
      stream = `${stream} ${this.props.hostId}`;
      stream = stream.replace(/:/g, '');
      this.props.cloudWatchStream = stream;
    }
  }

  /**
   * @private
   * @ignore
   * Creates Winston logger for CloudWatch errors that logs to the console and possibly to a file
   * @returns {object} logger
   */
  createCloudWatchErrorLoggers() {
    const transports = [];

    // Console
    transports.push(this.createConsoleTransport('error', false));

    const { options } = this;
    const { cloudWatch: category } = reservedCategories;

    // File
    const settings = options.categories[category] || {};
    const fileOptions = { ...this.options.errorFile };
    let level = settings.errorFile;
    if (level instanceof Object) {
      Object.assign(fileOptions, level);
      level = undefined;
    }

    if (!level) ({ level } = fileOptions);
    if (!level) level = 'off';
    else if (level === 'default') {
      level = options.defaultLevel;
    } else if (level === 'on') {
      level = 'error';
    }

    if (level !== 'off') {
      const logDirectory = Loggers.createLogDirectory(fileOptions);

      if (logDirectory) {
        const filename = path.join(logDirectory, `${category}-%DATE%`);

        const { maxSize, maxFiles, utc, zippedArchive, datePattern } = fileOptions;

        try {
          transports.push(
            new winston.transports.DailyRotateFile({
              filename,
              extension: '.log',
              datePattern,
              utc,
              zippedArchive,
              maxSize,
              maxFiles,
              format: format.json(),
              level,
              handleExceptions: false,
            })
          );
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed creating CloudWatch error file transport: ${filename}  [error ${myName}]
${error}  [error ${myName}]`);
        }
      }
    }

    return winston.createLogger({
      defaultMeta: Loggers.defaultMeta(reservedCategories.cloudWatch),
      exitOnError: false,
      format: this.formatter(),
      levels: this.props.levelSeverity,
      transports,
    });
  }

  /**
   * @private
   * @ignore
   * Handles errors from the CloudWatch transport
   * @param {object} error
   */
  cloudWatchError(error) {
    const { code } = error;
    if (code === 'ThrottlingException' || code === 'DataAlreadyAcceptedException') return;

    // TODO: Submit feature request. See cwTransportShortCircuit
    // InvalidParameterException is thrown when the formatter provided to
    // winston-cloudwatch returns false
    // eslint-disable-next-line no-underscore-dangle
    if (error.__type === 'InvalidParameterException') return;

    this.log(error, undefined, undefined, undefined, reservedCategories.cloudWatch);
  }

  /**
   * @private
   * @ignore
   * Flushes a CloudWatch transport. See https://github.com/lazywithclass/winston-cloudwatch/issues/128.
   * @param {object} transport
   * @param {Number} timeout
   * @returns {Promise}
   */
  flushCloudWatchTransport(transport, timeout) {
    // TODO: Fix this when WinstonCloudWatch makes flush timeout an option
    // https://github.com/lazywithclass/winston-cloudwatch/issues/129
    // This ends up taking way too long if, say, the aws-sdk is not properly configured. Submit issue to
    // winston-cloudwatch.

    // timeout = 1000; // For testing

    transport.flushTimeout = Date.now() + timeout;
    return new Promise((resolve) => {
      transport.kthxbye((error) => {
        // error = new Error('testing this'); // For testing
        if (error) this.cloudWatchError(error);
        resolve();
      });
    });
  }

  /**
   * Flushes Cloudwatch transports
   * @returns {Promise}
   */
  async flushCloudWatchTransports() {
    const { cloudWatchTransports } = this.props;
    if (!cloudWatchTransports || !cloudWatchTransports.length) return;

    // Flush timeout is only on the top-level cloudWatch key
    const { flushTimeout } = this.options.cloudWatch;

    let flushMessageTask;
    let flushMessageSent;

    if (this.options.say.flushing) {
      // Output a message if flush takes longer than 2.5 seconds
      flushMessageTask = setTimeout(() => {
        const duration = humanizeDuration(flushTimeout);
        flushMessageSent = true;
        flushMessageTask = undefined;
        // eslint-disable-next-line no-console
        console.log(`Waiting up to ${duration} to flush AWS CloudWatch Logs  [info ${myName}]`);
      }, 2500);
    }

    await Promise.all(cloudWatchTransports.map((transport) => this.flushCloudWatchTransport(transport, flushTimeout)));

    // For testing the message
    // await new Promise( (resolve) => setTimeout(resolve, 10000));

    if (flushMessageTask) clearTimeout(flushMessageTask);

    if (flushMessageSent) {
      // eslint-disable-next-line no-console
      console.log(`Flushed AWS CloudWatch Logs  [info ${myName}]`);
    }
  }

  /**
   * Flushes transports that support flushing, which is currently only CloudWatch.
   * @returns {Promise}
   */
  flush() {
    return this.restart();
  }

  /**
   * @private
   * @ignore
   * Closes all loggers
   * @returns {Promise}
   * @throws {None}
   */
  async close() {
    if (this.unitTest && !this.unitTest.flush) {
      // This unhandled Promise rejection is handled after this method finishes by the default handler
      Promise.reject(new Error('Expected error: Rejected promise while stopping'));
    }

    await this.flushCloudWatchTransports();

    // Close loggers in the background except the CloudWatch error logger
    await Promise.all(
      Object.entries(this.props.winstonLoggers).map(([category, logger]) => {
        if (!logger.writable || category === reservedCategories.cloudWatch) return Promise.resolve();
        return new Promise((resolve, reject) => {
          logger
            .once('error', reject)
            .once('close', resolve)
            .once('finish', () => setImmediate(() => logger.close()))
            .end();
        }).catch((error) =>
          // eslint-disable-next-line no-console
          console.error(`Failed closing '${category}'  [error ${myName}]
${error}  [error ${myName}]`)
        );
      })
    );

    // Close the CloudWatch error logger last
    if (this.props.cloudWatchTransports) {
      // Flush again because uncaught exceptions can be sent to CloudWatch transports during close
      // https://github.com/lazywithclass/winston-cloudwatch/issues/129
      await this.flushCloudWatchTransports();
      delete this.props.cloudWatchTransports;

      if (this.unitTest) {
        const count = this.unitTest.entries.length;
        this.cloudWatchError(new Error('Expected error: Testing CloudWatch error while stopping'));
        if (count === this.unitTest.entries.length) throw new Error('CloudWatch error handler failed');
      }
    }

    this.props.winstonLoggers = {};

    const errorLogger = this.props.winstonLoggers[reservedCategories.cloudWatch];

    if (errorLogger && errorLogger.writable) errorLogger.close();

    if (this.unitTest) {
      // Test error handlers after closing loggers
      if (this.unitTest.flush) process.exit();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    if (this.props.unhandledPromiseListener) {
      process.removeListener('unhandledRejection', this.props.unhandledPromiseListener);
      delete this.props.unhandledPromiseListener;
    }

    this.props.stopping = false;
    this.props.stopped = true;

    if (!this.props.restarting && this.options.say.stopped) {
      const { service = '', stage = '', version = '', commitSha = '' } = this.options;
      // eslint-disable-next-line no-console
      console.log(`Stopped: ${service} ${stage} v${version} ${commitSha}  [info ${myName} v${myVersion}]`);
    }
  }

  /**
   * Restarts
   * @returns {Promise}
   */
  async restart() {
    const { props } = this;
    if (props.starting) throw new Error('Starting'); // Impossible

    if (props.stopped) {
      this.start();
    } else {
      ++props.restarting;
      try {
        await this.stop();
        this.start();
      } finally {
        --props.restarting;
      }
    }
  }

  /**
   * Flushes loggers and stops them
   * @returns {Promise}
   * @throws {None}
   */
  async stop() {
    if (this.props.stopped) return;

    if (this.props.stopping) {
      // Stop is already running. Wait for it to finish.
      await new Promise((resolve) => {
        if (this.props.stopWaiters) {
          this.props.stopWaiters.push(resolve);
        } else {
          this.props.stopWaiters = [resolve];
          if (this.unitTest) this.unitTest.hasStopWaiters = true;
        }
      });

      return;
    }

    if (!this.props.restarting && this.options.say.stopping) {
      const { service, stage, version } = this.options;
      this.log(undefined, `Stopping: ${service} v${version} ${stage}`, undefined, undefined, reservedCategories.log);
    }

    this.props.stopping = true;

    if (this.unitTest) {
      this.stop().then(() => {
        if (!this.unitTest.hasStopWaiters) throw new Error('Waiting while stopping failed');
      });
    }

    await this.close();

    if (this.props.stopWaiters) {
      this.props.stopWaiters.forEach((resolve) => resolve());
      delete this.props.stopWaiters;
    }
  }

  /**
   * @private
   * @ignore
   * Creates a Winston logger for a category
   * @param {string} category
   * @param {object} defaults
   * @returns {object} Winston logger
   */
  createWinstonLoggers(category) {
    if (this.props.stopped) throw new Error('Stopped');

    let logger;

    if (category === reservedCategories.cloudWatch) {
      // ======================================================================
      // Write winston-cloudwatch errors to the console and, optionally, a file
      if (!WinstonCloudWatch) throw new Error('winston-cloudwatch is not installed'); // This can't happen
      logger = this.createCloudWatchErrorLoggers();
    } else {
      if (this.props.stopping) throw new Error('Stopping');

      const { options } = this;
      const settings = options.categories[category] || {};

      const transports = [];

      // ====
      // File
      {
        const fileOptions = { ...options.file };

        let level = settings.file;
        if (level instanceof Object) {
          Object.assign(fileOptions, level);
          level = undefined;
        }
        if (!level) ({ level } = fileOptions);
        if (!level) level = 'off';
        else if (level === 'default') {
          level = options.defaultLevel;
        } else if (level === 'on') {
          level = 'info';
        }

        if (level !== 'off') {
          const logDirectory = Loggers.createLogDirectory(fileOptions);

          if (logDirectory) {
            const filename = path.join(logDirectory, `${category}-%DATE%`);

            const checkTags = winston.format((info) => this.checkTags('file', info))();
            const { maxSize, maxFiles, utc, zippedArchive, datePattern } = fileOptions;

            try {
              transports.push(
                new winston.transports.DailyRotateFile({
                  filename,
                  extension: '.log',
                  datePattern,
                  utc,
                  zippedArchive,
                  maxSize,
                  maxFiles,
                  format: format.combine(checkTags, format.json()),
                  level,
                  handleExceptions: category === reservedCategories.unhandled,
                })
              );
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error(`Failed creating file transport: ${filename}  [error ${myName}]
${error}  [error ${myName}]`);
            }
          }
        }
      }

      // ==========
      // Error file
      {
        const fileOptions = { ...options.errorFile };
        let level = settings.errorFile;
        if (level instanceof Object) {
          Object.assign(fileOptions, level);
          level = undefined;
        }
        if (!level) ({ level } = fileOptions);
        if (!level) level = 'off';
        else if (level === 'default') {
          level = options.defaultLevel;
        } else if (level === 'on') {
          level = 'error';
        }

        if (level !== 'off') {
          const logDirectory = Loggers.createLogDirectory(fileOptions);

          if (logDirectory) {
            const filename = path.join(logDirectory, `${category}-error-%DATE%`);

            const checkTags = winston.format((info) => this.checkTags('errorFile', info))();
            const { maxSize, maxFiles, utc, zippedArchive, datePattern } = fileOptions;

            try {
              transports.push(
                new winston.transports.DailyRotateFile({
                  filename,
                  extension: '.log',
                  datePattern,
                  zippedArchive,
                  utc,
                  maxSize,
                  maxFiles,
                  format: format.combine(checkTags, format.json()),
                  level,
                  handleExceptions: category === reservedCategories.unhandled,
                })
              );
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error(`Failed creating error file transport: ${filename}  [error ${myName}]
${error}  [error ${myName}]`);
              // Ignore the error - unable to write to the directory
            }
          }
        }
      }

      // ============================
      // CloudWatch
      if (!noCloudWatch) {
        let awsOptions = { ...options.cloudWatch };
        let level = settings.cloudWatch;
        if (level instanceof Object) {
          Object.assign(awsOptions, level);
          level = undefined;
        }
        if (!level) ({ level } = awsOptions);
        if (!level) level = 'off';
        else if (level === 'default') {
          level = options.defaultLevel;
        } else if (level === 'on') {
          level = 'warn';
        }

        if (level !== 'off') {
          let { logGroup: logGroupName } = awsOptions;

          if (!awsOptions.region) {
            const { env } = process;
            awsOptions.region = env.AWS_CLOUDWATCH_LOGS_REGION || env.AWS_REGION;
          }

          if (!awsOptions.region) {
            // eslint-disable-next-line no-console
            console.error(`Region was not specified for AWS CloudWatch Logs for '${category}'  [error ${myName}]`);
          } else if (!logGroupName) {
            // eslint-disable-next-line no-console
            console.error(`Log group was not specified for AWS CloudWatch Logs for '${category}'  [error ${myName}]`);
          } else {
            if (!WinstonCloudWatch) {
              try {
                // Lazy load winston-cloudwatch
                // eslint-disable-next-line global-require
                WinstonCloudWatch = require('winston-cloudwatch');
              } catch (error) {
                // eslint-disable-next-line no-console
                console.warn(`winston-cloudwatch is not installed: ${error.message}  [warn ${myName}]`);
                noCloudWatch = true;
              }
            }

            if (WinstonCloudWatch) {
              this.initCloudWatch();
              const { uploadRate } = awsOptions;

              // Remove invalid characters from log group name
              // See https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_CreateLogGroup.html
              logGroupName = logGroupName.replace(/[^a-z0-9_/.#-]/gi, '');

              // log group ends with a slash
              logGroupName = `${logGroupName.replace(/[/]+$/, '').replace(/[/][/]+$/g, '')}/`;

              awsOptions = { region: awsOptions.region };

              const checkTags = (info) => {
                // TODO: Submit feature request. See cwTransportShortCircuit
                if (!this.checkTags('cloudWatch', info)) return '';
                return JSON.stringify(info);
              };

              // TODO: add more options supported by winston-cloudwatch
              // See https://github.com/lazywithclass/winston-cloudwatch/blob/e705a18220bc9be0564ad27b299127c6ee56a28b/typescript/winston-cloudwatch.d.ts

              if (this.options.say.cloudWatch && !(logGroupName in this.props.cloudWatchLogGroups)) {
                this.props.cloudWatchLogGroups[logGroupName] = null;
                // eslint-disable-next-line no-console
                console.log(
                  // eslint-disable-next-line max-len
                  `Writing to AWS CloudWatch Logs stream: ${logGroupName}${this.props.cloudWatchStream}  [info ${myName}]`
                );
              }

              const transport = new WinstonCloudWatch({
                messageFormatter: checkTags,
                logStreamName: this.props.cloudWatchStream,
                ensureLogGroup: true,
                logGroupName,
                awsOptions,
                level,
                errorHandler: (error) => this.cloudWatchError(error),
                uploadRate,
                handleExceptions: category === reservedCategories.unhandled,
              });

              this.props.cloudWatchTransports.push(transport);
              transports.push(transport);
            }
          }
        }
      }

      // ===============================================
      // Console
      // Must be last because it's the default transport
      {
        const consoleOptions = { ...options.console };
        let level = settings.console;
        if (level instanceof Object) {
          Object.assign(consoleOptions, level);
          level = undefined;
        }
        if (!level) ({ level } = consoleOptions);
        if (!level) level = 'info';
        else if (level === 'default') {
          level = options.defaultLevel;
        } else if (level === 'on') {
          level = 'info';
        }

        // Winston wants at least one transport (error file transport is intentionally ignored because it's only error)
        // so console is always active. This has the added benefit of ensuring that the unhandled exception logger has
        // at least one transport with handleExceptions: true; otherwise, undhandled exceptions will kill the process.
        if (!transports.length && level === 'off') level = 'error';

        if (level !== 'off') {
          transports.push(
            this.createConsoleTransport(level, category === reservedCategories.unhandled, consoleOptions)
          );
        }
      }

      // All transports created
      logger = winston.createLogger({
        defaultMeta: Loggers.defaultMeta(category),
        exitOnError: false,
        format: this.formatter(),
        levels: this.winstonLevels,
        transports,
      });
    }

    this.props.winstonLoggers[category] = logger;
    return logger;
  }

  /**
   * Returns a Winston logger associated with a category
   * @param {string} [category]
   * @returns {object} A Winston logger
   */
  winstonLogger(category) {
    category = this.category(category);
    let logger = this.props.winstonLoggers[category];
    if (!logger) logger = this.createWinstonLoggers(category);

    return logger;
  }

  /**
   * @private
   * @ignore
   * Accessor for the options provided for a category
   * @param {string} [category]
   * @returns {object} An object or undefined
   */
  categoryOptions(category) {
    return this.options.categories[this.category(category)];
  }

  /**
   * Associates a logger with a category
   * @param {string} [category]
   * @param {Loggers|object} [logger]
   * @returns {Loggers|object}
   */
  setLogger(category, logger) {
    return this.logger(category, logger);
  }

  /**
   * Returns a logger associated with a category. Optionally associates a logger with a category.
   * @param {string} [category]
   * @param {Loggers|object} [logger]
   * @returns {Loggers|object}
   */
  logger(category, logger) {
    category = this.category(category);
    const { loggers } = this.props;
    if (logger) {
      // Ensure the logger's category is the same as the category argument
      if (category !== logger.category()) {
        // eslint-disable-next-line no-use-before-define
        logger = new Logger(logger, undefined, undefined, category);
      }
      loggers[category] = logger;
      return logger;
    }

    logger = loggers[category];
    if (logger) return logger;

    if (category === this.options.defaultCategory) {
      logger = this;
    } else {
      // eslint-disable-next-line no-use-before-define
      logger = new Logger(this, undefined, undefined, category);
    }

    loggers[category] = logger;
    return logger;
  }

  /**
   * Creates a child logger
   * @param {*} [tags]
   * @param {*} [context]
   * @param {string} [category]
   * @returns {object}
   */
  child(tags, context, category) {
    // eslint-disable-next-line no-use-before-define
    return new Logger(this, tags, context, category);
  }

  /**
   * Retrieves a named Stack instance
   * @param {string} [name]
   * @returns {Stack}
   */
  stack(name) {
    let { stacks } = this.props;
    if (!stacks) {
      stacks = {};
      this.props.stacks = stacks;
    }

    let stack = stacks[name];
    if (stack) return stack;

    stack = new Stack();
    stacks[name] = stack;
    return stack;
  }

  /**
   * @returns {Loggers}
   */
  get loggers() {
    return this;
  }

  /**
   * @returns {Loggers}
   */
  get parent() {
    return this;
  }

  /**
   * Indicates whether this object and its child loggers are ready to log messages
   * @returns {boolean} Returns false if messages can not be logged because the logger is stopping or has been stopped
   */
  get ready() {
    const { props } = this;
    return !props.stopped && !props.stopping;
  }

  /**
   * @private
   * @ignore
   * Tranforms arugments sent to log methods, child(), and isLoggerEnabled()
   * @param {*} [tags]
   * @param {*} [message]
   * @param {*} [data]
   * @param {*} [context]
   * @param {string} [category]
   * @returns {LogArgs}
   */
  transformArgs(tags, message, data, context, category) {
    if (tags instanceof LogArgs) return tags;

    let extra;

    // First argument is an Error object?
    if (tags instanceof Error) {
      category = context;
      context = data;
      data = message;
      message = tags;
      tags = undefined;
    } else if (
      tags instanceof Object &&
      !(tags instanceof Array) &&
      context === undefined &&
      message === undefined &&
      data === undefined && (
        'tags' in tags ||
        'category' in tags ||
        'context' in tags ||
        'message' in tags ||
        'data' in tags )) {
      category = tags.category || category;
      // eslint-disable-next-line no-restricted-syntax
      for (const key in tags) if (!(key in transformArgsProperties)) {
        if (!extra) extra = {};
        extra[key] = tags[key];
      }
      ({ tags, message, data, context } = tags);
    } else if (
      message instanceof Object &&
      !(message instanceof Array) &&
      context === undefined &&
      data === undefined && (
        'tags' in message ||
        'category' in message ||
        'context' in message ||
        'message' in message ||
        'data' in message )) {
      category = message.category || category;
      // eslint-disable-next-line no-restricted-syntax
      for (const key in message) if (!(key in transformArgsProperties)) {
        if (!extra) extra = {};
        extra[key] = message[key];
      }
      if (message.tags) tags = this.tags(tags, message.tags);
      ({ message, data, context } = message);
    }
    
    if (context !== undefined && context !== null) context = [context];

    if (message === undefined && data instanceof Error) {
      message = data;
      data = undefined;
    } else {
      if (message instanceof Object && !(message instanceof Array) && !Loggers.hasProperty(message)) {
        message = undefined;
      }

      if (data instanceof Object && !(data instanceof Array) && !Loggers.hasProperty(data)) data = undefined;

      // Swap message and data
      if ((message instanceof Object) && (data !== null) && (data !== undefined) && !(data instanceof Object)) {
        const data2 = data;
        data = message;
        message = data2;
      }
    }

    const ret = {
      tags: this.tags(tags),
      context,
      message,
      data,
      extra,
      category,
    };

    return Object.assign(new LogArgs(), ret);
  }

  /**
   * @escription Determines whether a log entry will be sent to a logger
   * @param {*} [tagsOrNamedParameters]
   * @param {string} [category]
   * @returns {object} If the message will be logged, returns an object with properties tags, logger, level, transports,
   * and category. Otherwise, returns false.
   */
  isLevelEnabled(tagsOrNamedParameters, category) {
    if (this.props.stopped) {
      const stack = new Error().stack.replace(stripStack, '');
      // eslint-disable-next-line no-console
      console.error(`Stopped  [error ${myName}]
${stack}  [error ${myName}]`);
      return false;
    }

    let tags;
    ({ tags, category } = this.transformArgs(tagsOrNamedParameters, undefined, undefined, undefined, category));

    // transformArgs can not return the default category because Logger calls it
    category = this.category(category); // Use default category if not provided

    // Mix in category logger's tags
    // Because child loggers can be assigned to to this.logger(category)
    // (search for Mix in)
    {
      const cat = this.logger(category);
      if (cat !== this) tags = cat.tags(tags); // TODO testme
    }

    this.processCategoryTags(category);

    // ==========================================================
    // Determine the level to use when determining whether to log
    let level;
    let tagNames;

    {
      // =============================================================
      // logLevel meta tag is used when methods like info() are called
      const value = tags.logLevel;
      if (value) {
        tags = { ...tags };
        delete tags.logLevel;
        level = value === 'default' ? this.options.defaultLevel : value;
        tags[level] = true;
      }

      // tags is returned by Loggers.tags() which doesn't involve parent classes so Object.keys() is acceptable
      tagNames = Object.keys(tags);

      if (!level) {
        // ====================================================================================
        // Populate level such that, for example, 'error' overrides 'debug' if both are present
        let levelNum = 100000;

        tagNames.forEach((tag) => {
          if (tags[tag]) {
            const num = this.props.levelSeverity[tag];
            if (num !== undefined && num < levelNum) {
              levelNum = num;
              level = tag === 'default' ? this.options.defaultLevel : tag;
            }
          }
        });
      }
    }

    // ===================================================
    // Add error tag when Error is provided as the message
    if (tags[addErrorSymbol]) {
      delete tags[addErrorSymbol];
      if (!tags.error) {
        tags.error = true;
        tagNames.unshift('error'); // error appears first
        if (!level) level = 'error';
      }
    }

    if (!level) level = this.options.defaultLevel;

    let transports;

    if (tagNames.length) {
      // Look for a blocked tag
      // TODO: Defaults should be specified at the category level or via the category named 'default'
      // TODO: Cache results for tags for the category that aren't yet defined in config
      const categoryTags = this.props.categoryTags[category];
      const defaultTags = this.props.categoryTags.default;
      let nextLevel = level;

      if (
        !tagNames.every((tag) => {
          // Return true to continue
          if (this.props.levelSeverity[tag] !== undefined) return true; // It's a level tag

          let categoryTransports;
          if (categoryTags) categoryTransports = categoryTags[tag];

          let checkDefault = true;
          // Check allowLevel
          if (categoryTransports) {
            const { allowLevel } = categoryTransports;
            if (allowLevel) {
              if (this.props.levelSeverity[level] <= this.props.levelSeverity[allowLevel]) return true;
              checkDefault = false;
            }
          }

          const defaultTransports = defaultTags[tag];

          if (checkDefault) {
            if (defaultTransports) {
              const { allowLevel } = defaultTransports;
              if (allowLevel) {
                // TODO: cache this
                if (this.props.levelSeverity[level] <= this.props.levelSeverity[allowLevel]) return true;
              } else if (
                this.props.levelSeverity[level] <= this.props.levelSeverity[this.options.defaultTagAllowLevel]
              ) {
                // Defaults to warn (severity 1)
                // TODO: Cache this
                return true;
              }
            } else if (this.props.levelSeverity[level] <= this.props.levelSeverity[this.options.defaultTagAllowLevel]) {
              // Defaults to warn (severity 1)
              // TODO: Cache this
              return true;
            }
          }

          // The .on key specifies whether the (category, tag) pair is enabled
          // and is computed only once
          if (categoryTransports) {
            const { on } = categoryTransports;
            if (this.props.levelSeverity[level] > this.props.levelSeverity[on]) return false;
          } else {
            if (!defaultTransports) return true;
            const { on } = defaultTransports;
            if (this.props.levelSeverity[level] > this.props.levelSeverity[on]) return false;
          }

          // Alter level?
          if (categoryTransports) {
            let { level: lvl } = categoryTransports;
            if (lvl) {
              if (lvl === 'default') lvl = this.options.defaultLevel;
              if (this.props.levelSeverity[lvl] < this.props.levelSeverity[nextLevel]) {
                // TODO: Exit early if isLevelEnabled(lvl) is false
                nextLevel = lvl;
              }
            }
          }

          // Process per-transport switches. Remove keys from transports.
          transportNames.forEach((transport) => {
            if (transports && !(transport in transports)) return true;

            checkDefault = true;

            if (categoryTransports) {
              let on = categoryTransports[transport];
              if (on) {
                checkDefault = false;
                if (this.props.levelSeverity[level] > this.props.levelSeverity[on]) {
                  if (!transports) transports = { ...transportObj };
                  delete transports[transport];
                }
              } else {
                on = categoryTransports.other;
                if (on) {
                  checkDefault = false;
                  if (this.props.levelSeverity[level] > this.props.levelSeverity[on]) {
                    if (!transports) transports = { ...transportObj };
                    delete transports[transport];
                  }
                }
              }
            }

            if (checkDefault && defaultTransports) {
              let on = defaultTransports[transport];
              if (on) {
                if (this.props.levelSeverity[level] > this.props.levelSeverity[on]) {
                  if (!transports) transports = { ...transportObj };
                  delete transports[transport];
                }
              } else {
                on = defaultTransports.other;
                if (on) {
                  if (this.props.levelSeverity[level] > this.props.levelSeverity[on]) {
                    if (!transports) transports = { ...transportObj };
                    delete transports[transport];
                  }
                }
              }
            }

            return true;
          });

          return !transports || Loggers.hasProperty(transports);
        })
      ) {
        return false;
      }

      // Turn transports from an object to an array of keys
      if (transports) transports = Object.keys(transports);

      // Change the level based on tag settings
      if (nextLevel) level = nextLevel;
    }

    const logger = this.winstonLogger(category);
    if (!logger.isLevelEnabled(level)) return false;

    return {
      category,
      level,
      logger,
      tags,
      transports,
    };
  }

  /**
   * Alias for isLevelEnabled
   * @param {Array} [args]
   */
  levelEnabled(...args) {
    return this.levelEnabled(...args);
  }

  /**
   * @private
   * @ignore
   * Converts an object to a string
   * @param {*} value null not allowed
   * @returns {string|boolean} A string or false
   */
  objectToString(value) {
    if (value instanceof Array) {
      value = JSON.parse(prune(value, this.options.message.depth, this.options.message.arrayLength));
      return util.inspect(value);
    }

    // Allow the object to speak for itself
    let msg = value.toString();
    if (msg !== '[object Object]') return msg;

    msg = value.message;

    if (msg) {
      msg = msg.toString(); // Avoid recursion
      if (msg === '[object Object]') return false;
      return msg;
    }

    return false;
  }

  /**
   * @private
   * @ignore
   * Does nothing if the provided key is redacted. Helper function to combine 'message' and 'data'.
   * Handles overlapping keys in both. Sets state.currentData to state.data or state.dataData and then sets
   * state.currentData[key] to value.
   * @param {object} state An object with keys data, dataData, and currentData
   * @param {string} key
   * @param {*} value Value to store in the property named 'key'
   */
  copyData(state, key, value) {
    // Check redaction (nonrecursive)
    if (value === undefined) return;
    if (typeof value === 'function') return;

    if (key in this.props.redact) return;

    if (!state.currentData) {
      state.data = {};
      state.currentData = state.data;
    } else if (state.currentData === state.data && key in state.data && value !== state.data[key]) {
      // message and data overlap; their values differ
      state.dataData = {};
      state.currentData = state.dataData;
    }

    state.currentData[key] = value;
  }

  /**
   * @private
   * @ignore
   * Creates a log entry
   * @param {object} info A value returned by isLevelEnabled()
   * @param {Array} context
   * @param {*} message
   * @param {*} data
   * @param {object} [extra]
   * @param {Number} depth When falsy, create the 'root' log entry. When truthy, create a secondary entry that is in
   * the same group as the root log entry.
   * 1. When the level is in this.props.logStackLevels, the stack is added when falsy
   * 2. The logStack and noLogStack meta tags are applied when falsy
   * @returns {object} A log entry
   */
  logEntry(info, context, message, data, extra, depth) {
    const entry = new LogEntry();
    const { level, tags } = info;

    // undefined values are placeholders for ordering and are deleted at the end of this method.
    // false values are not removed.
    Object.assign(entry, {
      message: undefined,
      level,
      timestamp: Loggers.now(),
      ms: false, // Set via a formatter; intentionally not removed
      tags: false,
      ...this.props.userMeta,
      category: info.category, // Overwritten by defaultMeta
      id: ulid(),
      groupId: false, // Set and removed by send()
      depth: 0, // Set and removed by send()
      stage: this.options.stage,
      hostId: this.props.hostId,
      service: this.options.service,
      version: this.options.version,
      commitSha: this.options.commitSha,
      logStack: false, // Set and removed by send()
      stack: false, // Set and removed by send()
      context: undefined,
      data: undefined,
      transports: info.transports,
    });

    // Points to data first and dataData if there are the same keys in message and data
    const state = {};

    // Mix in category logger's context (isLevelEnabled does this for tags)
    // Because child loggers can be assigned to to this.logger(category)
    // (search for Mix in)
    {
      const { category } = info;
      const cat = this.logger(category);
      if (cat !== this) context = cat.mergeContext(level, tags, category, context);
    }

    // ==========================================
    // Send message and/or data to event handlers
    if (message !== undefined && message != null) {
      const event = { category: entry.category, context, arg: message, level, tags, type: 'message' };
      try {
        this.emit('redact', event);
        ({ arg: message } = event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Redact message event handler failed', error);
      }
    }

    if (data !== undefined && data !== null) {
      const event = { category: entry.category, context, arg: data, level, tags, type: 'data' };
      try {
        this.emit('redact', event);
        ({ arg: data } = event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Redact data event handler failed', error);
      }
    }

    if (extra) {
      const event = { category: entry.category, context, level, tags, type: 'extra' };
      // eslint-disable-next-line no-restricted-syntax, guard-for-in
      for (const key in extra) {
        try {
          event.arg = extra[key];
          this.emit('redact', event);
          extra[key] = event.arg;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Redact data event handler failed', error);
        }
      }
    }

    // Combine message and data to state
    const items = [];

    if (message !== undefined) {
      const type = typeof message;
      if (type === 'object') {
        // includes null
        items.push(Loggers.toObject(message, 'message'));
      } else if (type !== 'function') {
        items.push(this.objectToString(message));
      }
    }

    if (data !== undefined && typeof data !== 'function') items.push(Loggers.toObject(data, 'data'));
    if (extra !== undefined) items.push(extra);

    items.forEach((item) => {
      if (item instanceof Object) {
        // eslint-disable-next-line no-restricted-syntax
        for (const key in item) {
          // message and stack are handled later
          if (!nonenumerableKeys.includes(key)) this.copyData(state, key, item[key]);
        }

        const { stack } = item;
        if (stack && typeof stack === 'string') this.copyData(state, 'stack', stack);

        // If the object has a conversion to string, use it. Otherwise, use its message property if it's a scalar.
        const str = this.objectToString(item);
        if (str) this.copyData(state, 'message', str);

        const msg = item.message;
        if (msg !== undefined && (!str || msg !== str)) {
          this.copyData(state, str ? '_message' : 'message', msg);
        }
      } else {
        // Copy message to data where it will be moved to meta
        this.copyData(state, 'message', item.toString());
      }
    });

    // ============================
    // Move keys in context to meta
    if (context) {
      let foundKey;

      this.props.metaProperties.forEach((key) => {
        let value = context[key];
        if (value === undefined || typeof value === 'function') return;

        if (value instanceof Date) value = value.toISOString();
        else if (value instanceof Object) return;

        if (!foundKey) {
          context = { ...context };
          foundKey = true;
        }

        // Rename object key to meta property
        entry[this.props.meta[key]] = value;
        delete context[key];
      });

      // Stop the data console transport from logging context like "context: Context {...}"
      if (!foundKey) context = {...context};

      if (Loggers.hasProperty(context)) entry.context = context;
    }

    // =========================
    // Move keys in both to meta
    const { data: entryData } = state;
    if (entryData) {
      this.props.metaProperties.forEach((key) => {
        let value = entryData[key];
        if (value === undefined || typeof value === 'function') return;

        if (value instanceof Date) value = value.toISOString();
        else if (value instanceof Object) return;

        // Rename object key to meta property
        entry[this.props.meta[key]] = value;
        delete entryData[key];
      });

      entry.data = entryData;
    }

    // Remove meta properties that have undefined values
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in entry) {
      const value = entry[key];
      if (value === undefined) delete entry[key];
    }

    // If entry.message doesn't exist or is undefined, '' is the message instead of the level
    if (entry.message === undefined) entry.message = '';

    if (state.dataData) entry.dataData = state.dataData;

    // Add stack trace?
    let addStack = !depth && (info.level in this.props.logStackLevels);

    // Turn tags into an array and put the level in the front without modifying the object in entry.tags
    if (tags) {
      // Make sure meta tags are deleted

      let value = tags.noLogStack;

      if (value !== undefined) {
        if (!depth) addStack = !value;
        delete tags.noLogStack;
      }

      value = tags.logStack;
      if (value !== undefined) {
        if (!depth) addStack = value;
        delete tags.logStack;
      }

      // Move the level to the front of the tags array and sort the remaining tags
      const tags2 = Object.keys(tags).filter((tag) => tags[tag] && tag !== level);
      entry.tags = [level, ...tags2.sort()];
    } else {
      entry.tags = [level];
    }

    // Set the logStack meta
    if (addStack) entry.logStack = new Error().stack.replace(/^Error(\n|: )/, '').replace(stripStack, '');

    return entry;
  }

  /**
   * @private
   * @ignore
   * Sends log entries to a Winston logger
   * @param {object} info A value returned by isLevelEnabled()
   * @param {*} [context]
   * @param {*} [message]
   * @param {*} [data]
   * @param {object} [extra]
   * @param {Set<Error>} [errors] Errors already logged, to avoid recursion. Not using WeakSet because .size is needed
   * @param {Number} [depth] Recursion depth (defaults to 0)
   * @param {String} [groupId]
   */
  send(info, context, message, data, extra, errors = new Set(), depth = 0, groupId = undefined) {
    // eslint wants groupId=
    const { category, tags, logger, level } = info;

    if (context instanceof Array) context = this.mergeContext(level, tags, category, ...context);

    const entry = this.logEntry(info, context, message, data, extra, depth);

    // ==========================================================================================================
    // Process the provided data. Call send() recursively when there are properties that contain Error instances.

    if (message instanceof Error) errors.add(message);
    else if (message === undefined && data instanceof Error) errors.add(data);

    /**
     * Objects added to dataMessages are sent to this method
     */
    const dataMessages = [];
    let dataCopied;

    const addData = depth < this.options.errors.depth;

    let { dataData } = entry;

    if (dataData) {
      delete entry.dataData;
      if (!addData) dataData = undefined;
    }

    let firstError;

    const { data: entryData } = entry;

    if (entryData) {
      if (addData) {
        // ======================================================================
        // Add Errors to errors array and remove the object reference from 'data'
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const key in entryData) {
          const value = entryData[key];

          // eslint-disable-next-line no-continue
          if (!(value instanceof Error)) continue;

          // Check for circular references
          if (errors.size < this.options.errors.max && !errors.has(value)) {
            errors.add(value);
            dataMessages.push(value);
          }

          // Remove key from data - otherwise the error will reappear in the next call to send()
          if (data && key in data) {
            if (!dataCopied) {
              data = { ...data };
              dataCopied = true;
            }
            delete data[key];
          }

          if (!firstError || key === 'error') firstError = entryData[key];
          delete entryData[key];
        }
      }

      // =======================================================================
      // Prune data. This unfortunately removes keys that have undefined values.
      const newData = JSON.parse(prune(entryData, this.options.message.depth, this.options.message.arrayLength));

      {
        const { recursiveRedact } = this.props;
        if (recursiveRedact.length) deepCleaner(newData, recursiveRedact);
      }

      if (Loggers.hasProperty(newData)) entry.data = newData;
      else delete entry.data;
    }

    // ====================================================================
    // Remove falsy values from entry that were set to false by logEntry()
    if (!entry.logStack) delete entry.logStack;

    if (!entry.stack) {
      if (entry.logStack) {
        entry.stack = entry.logStack;
        delete entry.logStack;
      } else {
        delete entry.stack;
      }
    }

    const noMessage = !('message' in entry) && !('data' in entry) && !('context' in entry);

    ++depth;

    if (!noMessage || !firstError) {
      // ==========================
      // Set groupId and depth meta
      if (depth > 1) {
        entry.groupId = groupId || entry.id;
        entry.depth = depth;
      } else {
        delete entry.groupId;
        delete entry.depth;
      }

      // ==============
      // Send log event
      try {
        this.emit('log', entry);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`A log event listener failed: ${error}`);
      }

      // =========================================================
      // Only CloudWatch's error logger can be used while stopping
      if (this.props.stopping && category !== reservedCategories.cloudWatch) {
        const stack = new Error().stack.replace(stripStack, '');
        // eslint-disable-next-line no-console
        console.error(`Stopping  [error ${myName}]
${util.inspect(entry)}  [error ${myName}]
${stack}  [error ${myName}]`);
      } else {
        logger.log(level, entry);
      }
    }

    // Log child errors
    if (dataData) this.send(info, context, undefined, dataData, undefined, errors, depth, groupId || entry.id);

    dataMessages.forEach((dataMessage) => 
      this.send(info, context, dataMessage, data, undefined, errors, depth, groupId || entry.id));
  }

  /**
   * @private
   * @ignore
   * Called by methods that are named after levels
   * @param {Loggers|logger} target 
   * @param {string} level
   * @param {*} [message]
   * @param {*} [data]
   * @param {*} [context]
   * @param {string} [category]
   */
  static logLevel(target, level, tags, message, data, context, category) {
    let logArgs;

    if (tags instanceof Array) {
      logArgs = target.transformArgs(tags, message, data, context, category);
    } else if (tags instanceof Object &&
      message === undefined &&
      data === undefined &&
      context === undefined && (
        'tags' in tags ||
        'category' in tags ||
        'context' in tags ||
        'message' in tags ||
        'data' in tags )) {
      logArgs = target.transformArgs(tags);
    } else {
      // tags is really message, and so on
      logArgs = target.transformArgs(undefined, tags, message, data, context);
    }

    logArgs.tags.logLevel = level;
    target.log(logArgs);
  }

  /**
   * Sends a log entry to transports.
   *
   * If tags is an Error object, ['error'] is used as the tags and the error is logged with message and data.
   * If tags is an object with tags, message, data, and/or category properties, those properties are used as follows:
   *
   *   1. tags = this.tags(tags.logLevel, tags.tags)
   *   2. message = tags.message
   *   3. data = tags.data
   *   4. context = tags.context
   *   5. category = tags.category
   * @param {*} [tags] See description
   * @param {*} [message]
   * @param {*} [data]
   * @param {*} [context]
   * @param {string} [category]
   */
  log(...args) {
    const args2 = this.transformArgs(...args);

    // transformArgs can not return the default category because Logger calls it
    args2.category = this.category(args2.category); // Use default category if not provided

    const { tags, context, message, data, extra, category } = args2;
    
    // Add 'error' tag if an error was provided in message or data
    if (!('error' in tags) && // can turn it off with false
      Loggers.hasError(message, data, extra)) tags[addErrorSymbol] = true;

    if (this.props.stopped) {
      // eslint-disable-next-line no-console
      console.error(`Stopped  [error ${myName}]
${util.inspect({
  category,
  tags,
  context,
  message,
  data,
  extra,
})}  [error ${myName}]
${new Error('Stopped').stack}  [error ${myName}]`);
    } else {
      const info = this.isLevelEnabled(args2);
      if (info) this.send(info, context, message, data, extra);
    }
  }
}

/**
 * Default meta properties. Values are either null or a string containing the meta property
 * name. For example, given the tuple a: 'b', property a is copied to meta.b.
 */
Loggers.defaultMetaProperties = { correlationId: undefined, };

/**
 * Where log files are written
 */
Loggers.defaultFileDirectories = ['logs', '/tmp/logs', '.'];

/**
 * 
 * These follow npm levels wich are defined at
 * https://github.com/winstonjs/winston#user-content-logging-levels with the addition of 'fail' which is more severe
 * than 'error' and 'more' which is between 'info' and 'verbose.' A different set of levels can be provided to the
 * Loggers class's constructor; however, the Loggers class assumes there is an 'error' level and the options model (via
 * the defaults) assumes the following levels exist: error, warn, debug.
 */
Loggers.defaultLevels = {
  levels: {
    fail: 10,
    error: 20,
    warn: 30,
    info: 40,
    more: 50,
    verbose: 60,
    db: 70,
    http: 80,
    debug: 90,
    silly: 100,
  },
  colors: {
    fail: 'red',
    more: 'cyan',
    db: 'yellow',
  },
};

/**
 * This class manages a (tags, context, category) tuple. Many of its methods also accept tags and context
 * parameters, which, if provided, are combined with the object's corresponding properties. For example, if the object
 * is created with tags = ['apple'] log('banana') will use the tags 'apple' and 'banana.' This class has almost the same
 * interface as Loggers.
 */
class Logger {
  /**
   * Private Properties
   *  {object} props Has keys: tags, context, category, loggers, parent
   */
  /**
   * @private
   * @ignore
   * @constructor
   * @param {Loggers|object} parent
   * @param {*} [tags]
   * @param {*} [context]
   * @param {string} [category]
   */
  constructor(parent, tags, context, category) {
    let loggers;

    if (parent instanceof Logger) {
      ({ loggers } = parent.props);
    } else {
      if (!(parent instanceof Loggers)) throw new Error('parent must be an instance of Loggers or Logger');
      loggers = parent;
    }

    let extra;
    let message;
    let data; 

    ({ tags, context, data, message, extra, category } = parent.transformArgs(
      tags, undefined, undefined, context, category));

    // transformArgs can not return the default category because Logger calls it
    category = loggers.category(category); // Use default category if not provided

    if (!extra) extra = {};

    extra = {
      data,
      message,
      ...extra
    };

    let more;

    if (context instanceof Array) more = [extra, ...context];
    else more = [extra, context];

    context = loggers.mergeContext(undefined, tags, category, ...more);

    this.props = { loggers, parent, tags, context, category };

    // Dynamic logging-level methods
    this.props.loggers.addLevelMethods(this);
  }

  /**
   * @private
   * @ignore
   */
  transformArgs(...args) {
    const { loggers } = this.props;
    const args2 = loggers.transformArgs(...args);

    // Mix in my tags and context
    args2.tags = this.tags(args2.tags);
    args2.category = this.category(args2.category);

    const { context: myContext } = this.props;

    // myContext is either an object or falsy
    if (myContext) {
      const { context } = args2;
      if (context) context.unshift(myContext);
      else {
        args2.context = [myContext];
      }
    }

    return args2;
  }

  /**
   */
  winstonLogger(category) {
    return this.props.loggers.winstonLogger(this.category(category));
  }

  /**
   */
  get ready() {
    return this.props.loggers.ready;
  }

  /**
   */
  get loggers() {
    return this.props.loggers;
  }

  /**
   */
  get parent() {
    return this.props.parent;
  }

  /**
   */
  setLogger(category, logger) {
    return this.logger(category, logger);
  }

  /**
   */
  logger(category, logger) {
    category = this.category(category);
    if (logger) return this.props.loggers.logger(category, logger);
    return new Logger(this, undefined, undefined, category);
  }

  /**
   */
  child(tags, context, category) {
    return new Logger(this, tags, context, category);
  }

  /**
   */
  stack(name = 'default') {
    return this.props.loggers.stack(name);
  }

  /**
   */
  start() {
    return this.props.loggers.start();
  }

  /**
   */
  stop() {
    return this.props.loggers.stop();
  }

  /**
   */
  restart() {
    return this.props.loggers.restart();
  }

  /**
   */
  flush() {
    return this.props.loggers.flush();
  }

  /**
   */
  flushCloudWatchTransports() {
    return this.props.loggers.flushCloudWatchTransports();
  }

  /**
   */
  isLevelEnabled(tagsOrNamedParameters, category) {
    return this.props.loggers.isLevelEnabled(
      this.transformArgs(tagsOrNamedParameters, undefined, undefined, undefined, category));
  }

  /**
   */
  levelEnabled(...args) {
    return this.isLevelEnabled(...args);
  }

  /**
   */
  tags(...args) {
    const { loggers, tags } = this.props;
    if (tags) args.unshift(tags);
    return loggers.tags(...args);
  }

  /**
   */
  category(category) {
    if (category) return this.props.loggers.category(category);
    return this.props.category;
  }

  /**
   * @private
   * @ignore
   */
  mergeContext(level, tags, category, ...args) {
    const { loggers, context } = this.props;
    if (context) args.unshift(context);
    return loggers.mergeContext(level, this.tags(tags), this.category(category), ...args);
  }

  /**
   * Accessor for context 
   * @returns {object}
   */
  context() {
    return this.props.context;
  }

  /**
   * @param {Array} [args]
   */
  log(...args) {
    this.props.loggers.log(this.transformArgs(...args));
  }
}

module.exports = Loggers;
