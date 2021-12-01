/* eslint-disable no-promise-executor-return */
/* eslint-disable no-plusplus */
/* eslint-disable no-multi-assign */
/* eslint-disable no-param-reassign */
/* eslint-disable-next-line max-classes-per-file */
const ansiRegex = require('ansi-regex')(); // version 6 requires Node 12, so 5 is used
const hostId = require('hostid');
const mkdirp = require('mkdirp-sync');
const humanizeDuration = require('humanize-duration');
const Joi = require('joi');
const { nanoid } = require('nanoid');
const prune = require('json-prune');
const util = require('util');
const path = require('path');
// Winston includes
const winston = require('winston');
require('winston-daily-rotate-file'); // This looks weird but it's correct
const { consoleFormat: WinstonConsoleFormat } = require('winston-console-format');
const WinstonCloudWatch = require('winston-cloudwatch');

const Stack = require('./Stack');

const { name: myName, version: myVersion } = require('./package.json'); // Discard the rest

const addErrorSymbol = Symbol.for('error');

// =============================================================================
// Developer Notes
//
// 1. typeof(null) === 'object'. Use instanceof Object instead.
// =============================================================================

const { format } = winston;

const transportNames = ['file', 'errorFile', 'cloudWatch', 'console'];

/**
 * @private
 * @ignore
 * @description Removes internal functions from the stack trace. This only works for code that uses this module. It
 * doesn't work for unit tests.
 */
const stripStack = /\n {4}at [^(]+\(.*[/|\\]@goodware[/|\\]log[/|\\][^)]+\)/g;
// TODO: Use myName ^^

/**
 * @private
 * @ignore
 * @description Used for tag filtering
 */
const transportObj = {};
transportNames.forEach((transport) => {
  transportObj[transport] = true;
});

/**
 * @private
 * @ignore
 * @description Which datatypes are scalars
 */
const scalars = {
  number: true,
  string: true,
  boolean: true,
};

/**
 * @private
 * @ignore
 * @description Category names for internal loggers
 */
const logCategories = {
  unhandled: '@goodware/unhandled',
  cloudWatch: '@goodware/cloudwatch-error',
  log: '@goodware/log', // When the API is misused
};

/**
 * @private
 * @ignore
 * @description Internal class for identifying log entries that are created by Loggers::logEntry
 */
class LogEntry {}

/**
 * @private
 * @ignore
 * @description Internal class for identifying the output of transformArgs()
 */
class LogArgs {}

/**
 * @description Manages logger objects that can send log entries to the console, files, and AWS CloudWatch Logs
 */
class Loggers {
  /**
   * Private Properties
   *  {object} options
   *  {boolean} props.starting
   *  {boolean} props.stopping
   *  {boolean} props.stopped
   *  {number} props.restarting
   *  {string} props.created
   *  {string} props.hostId
   *  {object[]} props.loggers
   *  {string[]} props.metaKeys
   *  {object} props.meta {string} key -> {string} metaKey
   *  {function} props.unhandledPromiseListener
   *  {function[]} props.stopWaiters
   *  {string[]} props.levels {string} with 'default'
   *  {object} props.logStackLevels
   *  {object} props.winstonLoggers {string} category -> Winston logger
   *  {object} props.userMeta {string} metaFieldName -> undefined
   *  {object} unitTest
   *  {string} props.cloudWatchStream
   *  {object[]} props.cloudWatchTransports
   *  {object} props.categoryTags {string} category -> {{string} tag -> {object}}
   *  {object} props.hasCategoryTags {string} category -> {boolean}
   *  {object} props.logLevel {string} level name or 'default' -> {logLevel: {string}}
   *  {object} props.levelSeverity {string} level plus 'on', 'off', and 'default'
   *   -> {Number} {object} winstonLevels Passed to Winston when creating a logger
   *  {object} props.loggerStacks
   *
   * Notes to Maintainers
   *  1. tags, message, and context provided to public methods should never be modified
   *  2. The output of Object.keys and Object.entries should be cached for static objects
   *
   * @todo
   * 1. When console data is requested but colors are disabled, output data without colors using a new formatter
   * 2. Add a new data prop to output to the plain console
   * 3. Document defaultTagAllowLevel
   * 4. Document custom levels and colors
   * 5. Test redaction
   * 6. Document redaction
   * 7. Move Logger to another module - see
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
    /**
     * @private
     * @ignore
     * @description Internal properties
     */
    const props = {
      stopped: true,
      restarting: 0,
      // levels must be set before validating options
      levels: Object.keys(levels.levels),
      created: Loggers.now(),
      hostId: hostId(),
      loggers: {},
      winstonLoggers: {},
      meta: { message: 'message' },
      userMeta: {},
      categoryTags: {},
      hasCategoryTags: {},
      logLevel: {},
    };

    this.props = props;

    // =============================================
    // Copy environment variables to options (begin)

    /**
     * @private
     * @ignore
     * @description Sets options.console.{key} if a CONSOLE_{KEY} environment variable exists
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
    options = this.options = this.validateOptions(options);

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
     * @description Maps level names to integers where lower values have higher severity
     */
    this.winstonLevels = levels.levels;

    // Level severity
    this.props.levelSeverity = { ...levels.levels };
    Object.assign(this.props.levelSeverity, {
      off: -1,
      default: this.props.levelSeverity[options.defaultLevel],
      on: 100000,
    });

    // Process meta keys (begin)
    Object.entries(options.metaKeys).forEach(([key, value]) => {
      props.meta[key] = key;
      if (value) {
        key = value;
        props.meta[key] = key;
      }
      props.userMeta[key] = undefined;
    });

    props.metaKeys = Object.keys(props.meta);
    // Process meta keys (end)

    // Add the default category if it's missing
    {
      const category = options.categories;
      if (!category.default) category.default = {};
    }

    // logLevel is used by level-named methods
    props.levels.forEach((logLevel) => {
      props.logLevel[logLevel] = { logLevel };
    });

    // Process category tag switches
    if (!this.processCategoryTags('default')) {
      props.categoryTags.default = { on: true };
    }

    // Set props.logStackLevels
    {
      const obj = (props.logStackLevels = {});
      options.logStackLevels.forEach((level) => {
        if (level === 'default') level = options.defaultLevel;
        obj[level] = true;
      });
    }

    // For the default category, convert the settings for each transport from string to object and potentially overwrite
    // corresponding transport settings in the top-level keys such as console
    {
      const { default: defaultConfig } = options.categories;

      if (defaultConfig) {
        Object.entries(defaultConfig).forEach(([key, value]) => {
          if (!transportObj[key]) return;
          if (!(value instanceof Object)) value = { level: value };
          Object.assign(options[key], value);
        });
      }
    }

    // Dynamic logging-level methods
    this.addLevelMethods(this);

    this.start();
  }

  /**
   * @private
   * @ignore
   * @description Converts a number to a string with leading zeroes
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
   * @description Returns local time in ISO8601 format with the local timezone offset
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
   * @description Combines two sets of tags into a single object
   * @param {*} [tags]
   * @param {*} [more]
   * @returns {object} An object consisting of tags and more combined, one key per tag name whose truthy value
   * indicates the tag is enabled
   */
  // eslint-disable-next-line class-methods-use-this
  tags(tags, more) {
    let newTags;

    if (tags instanceof Object) {
      if (tags instanceof Array) {
        newTags = {};
        tags.forEach((tag) => {
          if (tag) newTags[tag] = true;
        });
      } else if (!more) {
        return tags;
      } else {
        newTags = { ...tags };
      }
    } else if (tags) {
      newTags = {};
      newTags[tags] = true;
    } else if (!more) return {};

    if (more instanceof Object) {
      if (more instanceof Array) {
        if (!newTags) newTags = {};
        more.forEach((tag) => {
          if (tag) newTags[tag] = true;
        });
      } else if (!newTags) {
        return more;
      } else {
        if (!newTags) newTags = {};
        Object.assign(newTags, more);
      }
    } else if (more) {
      if (!newTags) newTags = {};
      newTags[more] = true;
    }

    return newTags;
  }

  /**
   * @private
   * @ignore
   * @description Converts an context value to an object
   * @param {*} [context]
   * @returns {object|undefined}
   */
  static contextToObject(context) {
    if (context === undefined || context === null) return undefined;
    if (context instanceof Object) {
      if (context instanceof Error) return { error: context };
      if (!(context instanceof Array)) return context;
    }
    return { context };
  }

  /**
   * @description Combines the keys of two context objects and returns a new object
   * @param {*} [context]
   * @param {*} [more]
   * @returns {object} context if context and more are falsey. If context is truthy and more is falsey,
   * returns context or context converted to an object. If more is truthy and context is falsey, returns
   * more or more converted to an object. Otherwise, returns a new object with context and more
   * converted to objects and combined such that more's keys overwite context's keys.
   */
  // eslint-disable-next-line class-methods-use-this
  context(context, more) {
    if (!context && !more) return context;

    context = Loggers.contextToObject(context);
    more = Loggers.contextToObject(more);

    if (context && !more) return context;
    if (more && !context) return more;

    const contexts = { ...context };
    Object.assign(contexts, more);
    return contexts;
  }

  /**
   * @private
   * @ignore
   * @description Determines whether an object has any properties. Faster than Object.keys(object).length.
   * See https://jsperf.com/testing-for-any-keys-in-js
   * @param {object} object An object to test
   * @returns {boolean} true if object has properties (including inherited)
   */
  static hasKeys(object) {
    // See https://stackoverflow.com/questions/679915/how-do-i-test-for-an-empty-javascript-object
    if (object.constructor !== Object) return true;
    // eslint-disable-next-line no-restricted-syntax, guard-for-in, no-unreachable-loop
    for (const prop in object) return true;
    return false;
  }

  /**
   * @private
   * @ignore
   * @description Adds methods named after levels, such as error()
   * @param target The object to modify
   */
  addLevelMethods(target) {
    const { levels, logLevel } = this.props;
    levels.forEach((level) => {
      target[level] = (...args) => Loggers.levelLog(target, logLevel[level], ...args);
    });
  }

  /**
   * @private
   * @ignore
   * @description Processes options
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
    });

    // File settings
    const fileObject = Joi.object({
      level: onOffDefaultLevelEnum,
      directories: Joi.array()
        .items(Joi.string())
        .default(['logs', '/tmp/logs'])
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
      stage: Joi.string(),
      service: Joi.string(),
      version: Joi.string(),

      // Defaults
      defaultCategory: Joi.string().default('general'),
      defaultLevel: levelEnum.default('debug').description('Which level to use when a level is not found in tags'),
      defaultTagAllowLevel: offDefaultLevelEnum.default('warn'),

      // Colors
      levelColors: Joi.object().pattern(levelEnum, Joi.string().required()),

      // Set the 'stack' meta with the current call stack
      logStackLevels: Joi.array().items(defaultLevelEnum).default(['error']),

      // Meta keys
      metaKeys: Joi.object()
        .pattern(Joi.string(), Joi.string())
        .default(Loggers.defaultMetaKeys)
        .description(`Which keys to copy from 'both' to meta with the option to rename the keys`),

      // Redaction
      redact: Joi.object()
        .pattern(
          Joi.string(),
          Joi.object({
            allowLevel: offDefaultLevelEnum,
            tags: Joi.array().items(Joi.string()),
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

    let validation = optionsSchema.validate(options);
    if (validation.error) throw new Error(validation.error.message);
    // Add defaults to default empty objects
    validation = optionsSchema.validate(validation.value);
    options = validation.value;

    return options;
  }

  /**
   * @description Starts the logger after the constructor or stop() is called
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
    const unhandledLoggers = this.logger(logCategories.unhandled);
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
      let { service, stage, version } = options;
      if (service === undefined) service = '';
      if (stage === undefined) stage = '';
      if (version === undefined) version = '';

      this.log(
        undefined,
        `Ready: ${service} v${version} ${stage} [${myName} v${myVersion}]`,
        undefined,
        logCategories.log
      );
    }
  }

  /**
   * @private
   * @ignore
   * @description Internal function called by methods that are named after levels. Allows tags to be provided.
   * @param {Loggers|object} logger
   * @param {object} levelObj From this.props.logLevel. Has property logLevel.
   * @param {*} tagsOrMessage
   * @param {*} messageOrContext
   * @param {*} contextOrCategory
   * @param {*} category
   * @returns {object} Returns 'logger' argument
   */
  static levelLog(logger, levelObj, tagsOrMessage, messageOrContext, contextOrCategory, category) {
    // tagsOrMessage has tags if it's an array
    if (tagsOrMessage instanceof Array) {
      return logger.log(logger.loggers.tags(tagsOrMessage, levelObj), messageOrContext, contextOrCategory, category);
    }
    return logger.log(levelObj, tagsOrMessage, messageOrContext, contextOrCategory, category);
  }

  /**
   * @private
   * @ignore
   * @description Creates a directory for log files
   * @param {object} options
   * @returns {string} A directory path
   */
  // eslint-disable-next-line class-methods-use-this
  createLogsDirectory(options) {
    const { directories } = options;
    let directory;

    if (
      directories.length &&
      !directories.every((dir) => {
        try {
          mkdirp(dir);
          directory = dir;
          return false;
        } catch (error) {
          return true; // Next iteration
        }
      })
    ) {
      // Directory exists
      return directory;
    }

    // Unable to create directories
    // eslint-disable-next-line no-console
    console.warn(`Failed creating logs directory. Directories attempted:
${directories.join('\n')}  [warn ${myName}]`);

    return undefined;
  }

  /**
   * @description Checks a category value
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
      this.log('warn', stack, undefined, logCategories.log);
      // eslint-disable-next-line no-console
      console.warn(`${stack}  [warn ${myName}]`);

      // Throw exception when unit testing
      if (this.options.unitTest) throw error;
    }

    return this.options.defaultCategory;
  }

  /**
   * @private
   * @ignore
   * @description Processes tag switches for one category specified in this.options
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
   * @description Determines whether a log entry can be sent to a transport
   * @param {string} transportName
   * @param {object} info Log entry
   * @returns {object} Either returns logEntry unaltered or a falsey value
   */
  checkTags(transportName, info) {
    if (info.transports && !info.transports.includes(transportName)) return false;
    if (this.unitTest) this.unitTest[transportName].entries.push(info);
    return info;
  }

  /**
   * @private
   * @ignore
   * @description Returns default meta for log entries
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
   * @description Combines a custom Winston formatter with format.ms()
   * @returns {object} A Winston formatter
   */
  formatter() {
    return format.combine(winston.format((info) => this.format(info))(), format.ms());
  }

  /**
   * @private
   * @ignore
   * @description Winston customer formatter
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
        if (info.groupId) this.unitTest.groupIds[info.groupId] = true;
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
   * @description Console formatter for 'no data'
   * @param {object} info A log entry
   * @returns {string}
   */
  static printf(info) {
    const { id, level, ms, message, category, tags } = info;
    let colorBegin;
    let colorEnd;
    {
      const codes = level.match(ansiRegex);
      if (codes) {
        [colorBegin, colorEnd] = codes;
      } else {
        colorBegin = colorEnd = '';
      }
    }
    const spaces = message ? '  ' : '';
    const t2 = tags.slice(1);
    t2.unshift(category);
    return `${colorBegin}${ms} ${message}${spaces}${colorBegin}[${tags[0]} ${t2.join(' ')}  ${
      id}]${colorEnd}`;
  }

  /**
   * @private
   * @ignore
   * @description Creates a console transport
   * @param {string} level
   * @param {boolean} handleExceptions
   * @param {object} settings
   * @returns {object} A new console transport
   */
  createConsoleTransport(level, handleExceptions, settings) {
    if (!settings) settings = this.options.console;
    const { colors, data } = settings;

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
      // ================================
      // Don't log embedded error objects
      // TODO: make this configurable
      if (info.depth) return false;
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
   * @description Sets this.props.cloudWatch*
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

      if (this.options.say.cloudWatch) {
        // eslint-disable-next-line no-console
        console.log(`AWS CloudWatch Logs stream names: ${stream}  [info ${myName}]`);
      }
    }
  }

  /**
   * @private
   * @ignore
   * @description Creates Winston logger for CloudWatch errors that logs to the console and possibly to a file
   * @returns {object} logger
   */
  createCloudWatchErrorLoggers() {
    const transports = [];

    // Console
    transports.push(this.createConsoleTransport('error', false));

    // File
    const fileOptions = this.options.errorFile;
    const logsDirectory = this.createLogsDirectory(fileOptions);

    if (logsDirectory) {
      let filename = path.join(logsDirectory, `${logCategories.cloudWatch}-%DATE%`);
      const dir = path.dirname(filename);

      if (dir !== logsDirectory) {
        try {
          mkdirp(dir);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`Failed creating directory '${dir}'  [warn ${myName}]
${error}`);
          filename = null;
        }

        if (filename) {
          const { maxSize, maxFiles, utc, zippedArchive, datePattern } = fileOptions;

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
              level: 'error',
              handleExceptions: false,
            })
          );
        }
      }
    }

    return winston.createLogger({
      defaultMeta: Loggers.defaultMeta(logCategories.cloudWatch),
      exitOnError: false,
      format: this.formatter(),
      levels: this.props.levelSeverity,
      transports,
    });
  }

  /**
   * @private
   * @ignore
   * @description Handles errors from the CloudWatch transport
   * @param {object} error
   */
  cloudWatchError(error) {
    if (error.code === 'ThrottlingException') return;
    if (error.code === 'DataAlreadyAcceptedException') return;
    // TODO: Submit feature request. See cwTransportShortCircuit
    // InvalidParameterException is thrown when the formatter provided to
    // winston-cloudwatch returns false
    if (error.code === 'InvalidParameterException') return;
    this.log(error, undefined, undefined, logCategories.cloudWatch);
  }

  /**
   * @private
   * @ignore
   * @description Flushes a CloudWatch transport. See https://github.com/lazywithclass/winston-cloudwatch/issues/128.
   * @param {object} transport
   * @param {Number} timeout
   * @returns {Promise}
   */
  flushCloudWatchTransport(transport, timeout) {
    // TODO: Fix this when WinstonCloudWatch makes flush timeout an option
    // https://github.com/lazywithclass/winston-cloudwatch/issues/129
    // This ends up taking way too long if, say, the aws-sdk is not properly configured. Submit issue to
    // winston-cloudwatch.
    transport.flushTimeout = Date.now() + timeout;
    return new Promise((resolve) => {
      transport.kthxbye((error) => {
        if (error) this.cloudWatchError(error);
        resolve();
      });
    });
  }

  /**
   * @description Flushes Cloudwatch transports
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
   * @description Flushes transports that support flushing, which is currently only CloudWatch.
   * @returns {Promise}
   */
  flush() {
    return this.restart();
  }

  /**
   * @private
   * @ignore
   * @description Closes all loggers
   * @returns {Promise}
   * @throws {None}
   */
  async close() {
    if (this.unitTest && !this.unitTest.flush) {
      // Test uncaught exception
      setTimeout(() => {
        throw new Error('Expected error: Uncaught exception while stopping');
      });
      await new Promise((resolve) => setTimeout(resolve, 1));

      // This unhandled Promise rejection is handled after this method finishes by the default handler
      Promise.reject(new Error('Expected error: Rejected promise while stopping'));
    }

    await this.flushCloudWatchTransports();

    // Close loggers in the background except the CloudWatch error logger
    await Promise.all(
      Object.entries(this.props.winstonLoggers).map(([category, logger]) => {
        if (!logger.writable || category === logCategories.cloudWatch) return Promise.resolve();
        return new Promise((resolve, reject) => {
          logger
            .once('error', reject)
            .once('close', resolve)
            .once('finish', () => setImmediate(() => logger.close()))
            .end();
        }).catch((error) =>
          // eslint-disable-next-line no-console
          console.warn(`Failed closing '${category}'  [warn ${myName}]
${error}`)
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
        this.cloudWatchError(new Error('Testing CloudWatch error while stopping'));
        if (count === this.unitTest.entries.length) throw new Error('CloudWatch error handler failed');
      }
    }

    this.props.winstonLoggers = {};

    const errorLogger = this.props.winstonLoggers[logCategories.cloudWatch];

    if (errorLogger && errorLogger.writable) errorLogger.close();

    if (this.unitTest) {
      // Test error handlers after closing loggers
      if (this.unitTest.flush) process.exit();

      setImmediate(() => {
        throw new Error('Expected error: Uncaught exception while stopping 2');
      });

      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    if (this.props.unhandledPromiseListener) {
      process.removeListener('unhandledRejection', this.props.unhandledPromiseListener);
      delete this.props.unhandledPromiseListener;
    }

    this.props.stopping = false;
    this.props.stopped = true;

    if (!this.props.restarting && this.options.say.stopped) {
      let { service, stage, version } = this.options;
      if (service === undefined) service = '';
      if (stage === undefined) stage = '';
      if (version === undefined) version = '';
      // eslint-disable-next-line no-console
      console.log(`Stopped: ${service} v${version} ${stage}  [info ${myName} v${myVersion}]`);
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
      return;
    }

    ++props.restarting;
    try {
      await this.stop();
      this.start();
    } finally {
      --props.restarting;
    }
  }

  /**
   * @description Flushes loggers and stops them
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
      this.log(undefined, `Stopping: ${service} v${version} ${stage}`, undefined, logCategories.log);
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
   * @description Creates a Winston logger for a category
   * @param {string} category
   * @param {object} defaults
   * @returns {object} Winston logger
   */
  createWinstonLoggers(category) {
    if (this.props.stopped) throw new Error('Stopped');

    let logger;

    if (category === logCategories.cloudWatch) {
      logger = this.createCloudWatchErrorLoggers();
    } else {
      if (this.props.stopping) throw new Error('Stopping');

      const { options } = this;
      const settings = options.categories[category] || {};

      const transports = [];
      let level;

      // ==========
      // CloudWatch
      let awsOptions = { ...options.cloudWatch };
      level = settings.cloudWatch;
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
          awsOptions.region = process.env.AWS_CLOUDWATCH_LOGS_REGION;
          if (!awsOptions.region) {
            awsOptions.region = process.env.AWS_CLOUDWATCH_REGION;
            if (!awsOptions.region) awsOptions.region = process.env.AWS_DEFAULT_REGION;
          }
        }

        if (!awsOptions.region) {
          // eslint-disable-next-line no-console
          console.warn(`Region was not specified for AWS CloudWatch Logs for '${category}'  [warn ${myName}]`);
        } else if (!logGroupName) {
          // eslint-disable-next-line no-console
          console.warn(` Log group was not specified for AWS CloudWatch Logs for '${category}'  [warn ${myName}]`);
        } else {
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
          const transport = new WinstonCloudWatch({
            messageFormatter: checkTags,
            logStreamName: this.props.cloudWatchStream,
            createLogGroup: true,
            createLogStream: true,
            logGroupName,
            awsOptions,
            level,
            errorHandler: (error) => this.cloudWatchError(error),
            uploadRate,
            handleExceptions: category === logCategories.unhandled,
          });

          this.props.cloudWatchTransports.push(transport);
          transports.push(transport);
        }
      }

      // ====
      // File
      let fileOptions = { ...options.file };
      level = settings.file;
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
        const logsDirectory = this.createLogsDirectory(fileOptions);

        if (logsDirectory) {
          let filename = path.join(logsDirectory, `${category}-%DATE%`);
          const dir = path.dirname(filename);

          if (dir !== logsDirectory)
            try {
              mkdirp(dir);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.warn(`Failed creating directory '${dir}'  [warn ${myName}]
${error}`);
              filename = null;
            }

          if (filename) {
            const checkTags = winston.format((info) => this.checkTags('file', info))();
            const { maxSize, maxFiles, utc, zippedArchive, datePattern } = fileOptions;
            const transport = new winston.transports.DailyRotateFile({
              filename,
              extension: '.log',
              datePattern,
              utc,
              zippedArchive,
              maxSize,
              maxFiles,
              format: format.combine(checkTags, format.json()),
              level,
              handleExceptions: category === logCategories.unhandled,
            });

            transports.push(transport);
          }
        }
      }

      // ==========
      // Error file
      fileOptions = { ...options.errorFile };
      level = settings.errorFile;
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
        const logsDirectory = this.createLogsDirectory(fileOptions);

        if (logsDirectory) {
          const checkTags = winston.format((info) => this.checkTags('errorFile', info))();
          const { maxSize, maxFiles, utc, zippedArchive, datePattern } = fileOptions;
          const transport = new winston.transports.DailyRotateFile({
            filename: `${logsDirectory}/${category}-error-%DATE%`,
            extension: '.log',
            datePattern,
            zippedArchive,
            utc,
            maxSize,
            maxFiles,
            format: format.combine(checkTags, format.json()),
            level,
            handleExceptions: category === logCategories.unhandled,
          });

          transports.push(transport);
        }
      }

      // ===============================================
      // Console
      // Must be last because it's the default transport
      const consoleOptions = { ...options.console };
      level = settings.console;
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

      // Winston wants at least one transport (error file transport is intentionally ignored because it's only error) so
      // console is always active. This has the added benefit of ensuring that the unhandled exception logger has
      // at least one transport with handleExcetpions: true; otherwise, undhandled exceptions will kill the process.
      if (!transports.length && level === 'off') level = 'error';

      if (level !== 'off') {
        transports.push(this.createConsoleTransport(level, category === logCategories.unhandled, consoleOptions));
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
   * @description Returns a Winston logger associated with a category
   * @param {string} [category]
   * @returns {object} A Winston logger
   */
  winstonLogger(category) {
    if (this.props.stopped) throw new Error('Stopped');

    category = this.category(category);
    let logger = this.props.winstonLoggers[category];
    if (!logger) logger = this.createWinstonLoggers(category);

    return logger;
  }

  /**
   * @private
   * @ignore
   * @description Accessor for the options provided for a category
   * @param {string} [category]
   * @returns {object} An object or undefined
   */
  categoryOptions(category) {
    return this.options.categories[this.category(category)];
  }

  /**
   * @description Returns a logger associated with a category. Optionally assocates a logger with a category.
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
   * @description Creates a child logger
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
    if (!stacks) this.props.stacks = stacks = {};
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
   * @description Indicates whether this object and its child loggers are ready to log messages
   * @returns {boolean} Returns false if messages can not be logged because the logger is stopping or has been stopped
   */
  get ready() {
    const { props } = this;
    return !props.stopped && !props.stopping;
  }

  /**
   * @private
   * @ignore
   * @description Tranforms arugments sent to log methods, child(), and isLoggerEnabled()
   * @param {*} [tags] See description.
   * @param {*} [message]
   * @param {*} [context]
   * @param {string} [category]
   * @returns {object} false or an argument containing new values for tags, message, context, and category
   */
  transformArgs(tags, message, context, category) {
    if (tags instanceof LogArgs) return tags;

    // This method doesn't call this.category(category) so Logger::transformArgs call call this method and override
    // the category

    // First argument is an Error object?
    if (tags instanceof Error) {
      if (!message && typeof(message) !== 'number') {
        message = tags;
      } else {
        context = this.context(context, tags);
      }
      tags = undefined;
    }
    // log() called?
    else if (
      !message &&
      !context &&
      !category &&
      tags instanceof Object &&
      !(tags instanceof Array) &&
      (tags.tags || tags.message || tags.context || tags.category || tags.error instanceof Object)
    ) {
      message = tags;
      let messageCopied;
      if ('tags' in message) {
        if (!messageCopied) {
          message = { ...message };
          messageCopied = true;
        }
        tags = message.tags;
        delete message.tags;
      } else {
        tags = undefined;
      }
      if ('context' in message) {
        if (!messageCopied) {
          message = { ...message };
          messageCopied = true;
        }
        context = message.context;
        delete message.context;
      }
      if ('category' in message) {
        if (!messageCopied) {
          message = { ...message };
          messageCopied = true;
        }
        if (typeof message.category === 'string') category = message.category;
        delete message.category;
      }
    }
    // logLevel() called?
    else if (
      !context &&
      !category &&
      message instanceof Object &&
      !(message instanceof Array) &&
      (message.tags || message.message || message.context || message.error)
    ) {
      let messageCopied;
      if ('tags' in message) {
        if (!messageCopied) {
          message = { ...message };
          messageCopied = true;
        }
        tags = this.tags(tags, message.tags);
        delete message.tags;
      }
      if ('context' in message) {
        if (!messageCopied) {
          message = { ...message };
          messageCopied = true;
        }
        context = message.context;
        delete message.context;
      }
      if ('category' in message) {
        if (!messageCopied) {
          message = { ...message };
          messageCopied = true;
        }
        if (typeof message.category === 'string') category = message.category;
        delete message.category;
      }
    }

    if (message instanceof Object && !Loggers.hasKeys(message)) message = undefined;
    if (context instanceof Object && !Loggers.hasKeys(context)) context = undefined;

    // info(new Error(), 'Message') is the same as info('Message', new Error())
    if (scalars[typeof context] && message instanceof Object) {
      // swap message, context
      const x = context;
      context = message;
      message = x;
    }

    tags = this.tags(tags);

    // Add 'error' tag if an error was provided in message or context
    if (!tags.error) {
      let addError;

      if (message instanceof Object) {
        addError = message instanceof Error || message.error instanceof Error;
        if (!addError) addError = message.message instanceof Error;
        if (!addError && message.message instanceof Object) addError = message.message.error instanceof Error;
      }
      if (!addError && context instanceof Object) addError = context instanceof Error || context.error instanceof Error;
      if (addError) tags[addErrorSymbol] = true;
    }

    return Object.assign(new LogArgs(), {
      tags,
      message,
      context,
      category,
    });
  }

  /**
   * @description Determines whether a log entry will be sent to a logger
   * @param {*} [tags]
   * @param {string} [category]
   * @returns {object} If the message will be logged, returns an object with properties tags, logger, level, transports,
   * and category. Otherwise, returns false.
   */
  isLevelEnabled(tags, category) {
    if (this.props.stopped) {
      const stack = new Error().stack.replace(stripStack, '');
      // eslint-disable-next-line no-console
      console.warn(`Stopped  [warn ${myName}]
${stack}`);
      return false;
    }

    ({ tags, category } = this.transformArgs(tags, undefined, undefined, category));
    category = this.category(category);

    // Mix in category logger's tags
    {
      const cat = this.logger(category);
      if (cat !== this) tags = cat.tags(tags);
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
        if (this.props.logLevel[value]) {
          level = value === 'default' ? this.options.defaultLevel : value;
          tags[level] = true;
        }
      }

      tagNames = Object.keys(tags);

      if (!level) {
        // ====================================================================================
        // Populate level such that, for example, 'error' overrides 'debug' if both are present
        let levelNum = 100000;

        tagNames.forEach((tag) => {
          if (tags[tag] && this.props.logLevel[tag]) {
            const num = this.props.levelSeverity[tag];
            if (num < levelNum) {
              levelNum = num;
              level = tag === 'default' ? this.options.defaultLevel : tag;
            }
          }
        });
      }
    }

    // Add error tag when Error is provided as the message
    if (tags[addErrorSymbol]) {
      delete tags[addErrorSymbol];
      if (!tags.error) {
        tags.error = true;
        tagNames.unshift('error');
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
            if (transports && !transports[transport]) return true;

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

          return !transports || Loggers.hasKeys(transports);
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
   * @description Alias for isLevelEnabled
   */
  levelEnabled(...args) {
    return this.levelEnabled(...args);
  }

  /**
   * @private
   * @ignore
   * @description Converts an object to a string
   * @param {*} value It must be truthy
   * @returns {string} or a falsey value
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
   * @description Does nothing if the provided key is redacted. Helper function to combine 'message' and 'context'.
   * Handles overlapping keys in both. Sets state.currentData to state.data or state.contextData and then sets
   * state.currentData[key] to value.
   * @param {string} level
   * @param {object} tags
   * @param {string} state An object with keys data, contextData, and currentData
   * @param {object} state An object with keys data, contextData, and currentData
   * @param {string} key
   * @param {*} value Value to store in the property named 'key'
   */
  copyData(level, tags, state, key, value) {
    const redact = this.options.redact[key];
    if (redact) {
      let shouldRedact = true;

      const { tags: redactTags } = redact;
      // Redact only if a tag matches
      if (redactTags && redactTags.length) shouldRedact = !redactTags.every((tag) => !tags[tag]);

      if (shouldRedact) {
        // Check the level override
        const { allowLevel } = redact;
        if (!allowLevel) return; // Defaults to always redact
        if (this.props.levelSeverity[allowLevel] > this.props.levelSeverity[level]) return;
      }
    }

    if (!state.currentData) {
      state.currentData = state.data = {};
    } else if (state.currentData === state.data && key in state.data && value !== state.data[key]) {
      // message and context overlap; their values differ
      if (!value) return;
      state.currentData = state.contextData = {};
    }

    state.currentData[key] = value;
  }

  /**
   * @private
   * @ignore
   * @description Creates a log entry
   * @param {object} info A value returned by isLevelEnabled()
   * @param {*} message
   * @param {*} context
   * @param {Number} depth When falsey, create the 'root' log entry. When truthy, create a secondary entry that is in
   * the same group as the root log entry.
   * 1. When the level is in this.props.logStackLevels, the stack is added when falsey
   * 2. The logStack and noLogStack meta tags are applied when falsey
   * @returns {object} A log entry
   */
  logEntry(info, message, context, depth) {
    const entry = new LogEntry();
    const { level } = info;

    // Check for message returned by transformArgs as: { message: 'Foo', error: {} }
    if (message instanceof Object && !(message instanceof Error) && !(message instanceof Array)) {
      const { message: realMessage } = message;
      if (realMessage) {
        const copy = { ...message };
        delete copy.message;
        context = this.context(context, copy);
        message = realMessage;
      }
    }

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
      id: nanoid(),
      groupId: false, // Set and removed by send()
      depth: 0, // Set and removed by send()
      stage: this.options.stage,
      hostId: this.props.hostId,
      service: this.options.service,
      version: this.options.version,
      commitSha: undefined,
      logStack: false, // Set and removed by send()
      stack: false, // Set and removed by send()
      data: undefined,
      transports: info.transports,
    });

    // Points to data first and contextData if there are the same keys in message and context
    const state = {};
    const { tags } = info;

    context = Loggers.contextToObject(context);

    // Mix in category logger's context (isLevelEnabled does this for tags)
    {
      const cat = this.logger(info.category);
      if (cat !== this) context = cat.context(context);
    }

    // Combine message and context
    [message, context].forEach((item) => {
      if (!item) return;

      const type = typeof item;
      if (type === 'function') return;

      if (type === 'object') {
        if (item instanceof Array) {
          this.copyData(level, tags, state, 'message', this.objectToString(item));
        } else {
          // Object.keys is not used in order to get inherited properties
          // eslint-disable-next-line guard-for-in, no-restricted-syntax
          for (const key in item) {
            const value = item[key];
            // Despite being non-enumerable, if these properties are added explicitly, they will be found via 'in'
            if (typeof value !== 'function' && key !== 'stack' && key !== 'message') {
              // stack and message are handled below
              this.copyData(level, tags, state, key, value);
            }
          }

          const { stack } = item;
          if (stack && typeof stack === 'string') this.copyData(level, tags, state, 'stack', stack);

          // If the object has a conversion to string, use it. Otherwise, use its message property if it's a scalar
          const msg = this.objectToString(item);

          if (msg) this.copyData(level, tags, state, 'message', msg);
        }
      } else {
        // It's truthy and it's not an object
        this.copyData(level, tags, state, 'message', item.toString());
      }
    });

    // Copy keys in 'data' to meta
    const { data } = state;
    if (data) {
      this.props.metaKeys.forEach((key) => {
        const value = data[key];

        if (value !== null && value !== undefined) {
          const type = typeof value;
          key = this.props.meta[key]; // Rename object key to meta key
          if (type === 'string') {
            if (value.length) {
              entry[key] = value;
              delete data[key];
            }
          } else if (scalars[type]) {
            entry[key] = value;
            delete data[key];
          }
        }
      });

      entry.data = data;
    }

    // Remove meta keys that have undefined values
    // eslint-disable-next-line no-restricted-syntax, guard-for-in
    for (const key in entry) {
      const value = entry[key];
      if (value === undefined) delete entry[key];
    }

    if (state.contextData) entry.contextData = state.contextData;

    // Add stack trace?
    let addStack = !depth && this.props.logStackLevels[info.level];

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
    if (addStack) {
      let msg;
      if (entry.message) {
        msg = entry.message.replace(/^Error(\n|: )/, '');
      }
      entry.logStack = new Error(msg).stack.replace(/^Error(\n|: )/, '').replace(stripStack, '');
    }

    return entry;
  }

  /**
   * @private
   * @ignore
   * @description Sends log entries to a Winston logger
   * @param {object} info A value returned by isLevelEnabled()
   * @param {*} [message]
   * @param {*} [context]
   * @param {Error[]} [errors] Errors already logged, to avoid recursion
   * @param {Number} [depth] Recursion depth (defaults to 0)
   * @param {String} [groupId]
   */
  send(info, message, context, errors = [], depth = 0, groupId = undefined) {
    const { category, logger, level } = info;
    const entry = this.logEntry(info, message, context, depth);

    // =============================================================================================================
    // Process the provided context. Call send() recursively when there are properties that contain Error instances.

    // If message is an Error, don't log it again
    if (message instanceof Error && !errors.includes(message)) errors.push(message);

    /**
     * Objects added to contextMesages are sent to this method
     */
    const contextMessages = [];
    let contextCopied;

    const addContext = depth < this.options.errors.depth;

    let { contextData } = entry;
    if (contextData) {
      delete entry.contextData;
      if (!addContext) {
        contextData = undefined; // Avoid infinite recursion
      } else {
        // contextData might have errors from context - remove them so overlap doesn't happen again
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const key in contextData) {
          const value = contextData[key];
          if (value instanceof Error && !errors.includes(value)) errors.push(value);
        }
      }
    }

    let firstError = '';

    const { data } = entry;
    if (data) {
      if (addContext) {
        // ======================================================================
        // Add Errors to errors array and remove the object reference from 'data'
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const key in data) {
          const value = data[key];

          // eslint-disable-next-line no-continue
          if (!(value instanceof Error)) continue;

          // Check for circular references
          if (errors.length < this.options.errors.max && !errors.includes(value)) {
            errors.push(value);
            contextMessages.push(value);
          }

          // Remove the key from the context data. Otherwise the error will reappear in the next call to send()
          if (context && key in context) {
            if (!contextCopied) {
              context = { ...context };
              contextCopied = true;
            }
            delete context[key];
          }

          delete data[key];

          // Prefer 'error'
          if (!firstError || key === 'error') firstError = data[key];
        }
      }

      // =================================================================
      // Convert data to JSON. It removes keys that have undefined values.
      const newData = JSON.parse(prune(data, this.options.message.depth, this.options.message.arrayLength));
      if (Loggers.hasKeys(newData)) {
        entry.data = newData;
      } else {
        delete entry.data;
      }
    }

    // ====================================================================
    // Remove falsey values from entry that were set to false by logEntry()
    if (!entry.logStack) delete entry.logStack;
    if (!entry.stack) {
      if (entry.logStack) {
        entry.stack = entry.logStack;
        delete entry.logStack;
      } else {
        delete entry.stack;
      }
    }

    // ==========================================================================
    // If there is nothing interesting to log besides errors, only log the errors
    const skip = !entry.message && contextMessages.length && !contextData && !(data && Loggers.hasKeys(data));
    ++depth;

    if (!skip) {
      // ========================================================================================
      // If the entry's message is empty, use data.error or the message of another provided error
      if (!entry.message) entry.message = firstError;

      // ==========================
      // Set groupId and depth meta
      const more = groupId || contextData || contextMessages.length;
      if (more) {
        entry.groupId = groupId || entry.id;
        entry.depth = depth;
      } else {
        delete entry.groupId;
        delete entry.depth;
      }

      // =========================================================
      // Only CloudWatch's error logger can be used while stopping
      if (this.props.stopping && category !== logCategories.cloudWatch) {
        const stack = new Error().stack.replace(stripStack, '');
        // eslint-disable-next-line no-console
        console.warn(`Stopping  [warn ${myName}]
${util.inspect(entry)}
${stack}`);
      } else {
        logger.log(level, entry);
      }
    }

    if (contextData) this.send(info, contextData, undefined, errors, depth, groupId || entry.id);

    contextMessages.forEach((contextMessage) => {
      this.send(info, contextMessage, context, errors, depth, groupId || entry.id);
    });
  }

  /**
   * @description Sends a log entry using the default level
   * @returns {Loggers} this
   */
  default(...args) {
    return Loggers.levelLog(this, this.props.logLevel.default, ...args);
  }

  /**
   * @description Sends a log entry to transports.
   *
   * If tags is an Error object, ['error'] is used as the tags and the error is logged with message and context.
   *
   * If tags is an object with tags, message, context, and/or category properties, those properties are used as follows:
   *
   *   1. tags = this.tags(tags.logLevel, tags.tags)
   *   2. message = tags.message
   *   3. context = tags.context
   *   4. category = tags.category
   * @param {*} [tags] See description
   * @param {*} [message]
   * @param {*} [context]
   * @param {string} [category]
   * @returns {object} this
   */
  log(tags, message, context, category) {
    ({ tags, message, context, category } = this.transformArgs(tags, message, context, category));
    category = this.category(category);

    if (this.props.stopped) {
      // eslint-disable-next-line no-console
      console.warn(`Stopped  [warn ${myName}]
${util.inspect({
  category,
  tags,
  message,
  context,
})}
${new Error('Stopped').stack}`);
    } else {
      const info = this.isLevelEnabled(tags, category);
      if (info) this.send(info, message, context);
    }

    return this;
  }
}

/**
 * @description Default meta keys. Values are either undefined or a string containing the actual meta key name. For
 *  example, given the tuple a: 'b', both.a is copied to meta.b. The 'both' object is not altered; its keys are also
 *  copied to data. For convenience, the existence of the tuple a: 'b' implies the existence of the tuple b: 'b'.
 */
Loggers.defaultMetaKeys = { stack: undefined };

/**
 * @description These follow npm levels wich are defined at
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
 * @description This class manages a (tags, context) tuple. Many of its methods also accept tags and context parameters,
 * which, if provided, are combined with the object's corresponding properties. For example, if the object is created
 * with tags = ['apple'] log('banana') will use the tags 'apple' and 'banana.' This class has almoast the same interface
 * such as error().
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

    ({ tags, context, category } = parent.transformArgs(tags, undefined, context, category));
    category = parent.category(category);

    this.props = { loggers, parent, tags, context, category };

    // Dynamic logging-level methods
    this.props.loggers.addLevelMethods(this);
  }

  /**
   * @private
   * @ignore
   * @description Tranforms arguments sent to log methods, child(), and isLoggerEnabled(). Mixes in the tags, context,
   * and category properties.
   */
  transformArgs(tags, message, context, category) {
    if (tags instanceof LogArgs) return tags;
    const ret = this.props.loggers.transformArgs(tags, message, context, category);

    // Overlay my tags and context
    ret.tags = this.tags(ret.tags);
    ret.context = this.context(ret.context);
    ret.category = this.category(ret.category);

    return ret;
  }

  /**
   * @description Returns a Winston logger associated with a category
   * @param {string} [category]
   * @returns {object} A Winston logger
   */
  winstonLogger(category) {
    return this.props.loggers.winstonLogger(this.category(category));
  }

  /**
   * @returns {boolean}
   */
  get ready() {
    return this.props.loggers.ready;
  }

  /**
   * @returns {Loggers}
   */
  get loggers() {
    return this.props.loggers;
  }

  /**
   * @returns {Loggers|object}
   */
  get parent() {
    return this.props.parent;
  }

  /**
   * @returns {object}
   */
  logger(category, logger) {
    category = this.category(category);
    if (logger) return this.props.loggers.logger(category, logger);
    return new Logger(this, undefined, undefined, category);
  }

  /**
   * @param {*} [tags]
   * @param {*} [context]
   * @param {string} [category]
   * @returns {object}
   */
  child(tags, context, category) {
    return new Logger(this, tags, context, category);
  }

  /**
   * @param {string} name
   * @returns {Stack}
   */
  stack(name = 'default') {
    return this.props.loggers.stack(name);
  }

  /**
   * @returns {Promise}
   */
  start() {
    return this.props.loggers.start();
  }

  /**
   * @returns {Promise}
   */
  stop() {
    return this.props.loggers.stop();
  }

  /**
   * @returns {Promise}
   */
  restart() {
    return this.props.loggers.restart();
  }

  /**
   * @returns {Promise}
   */
  flush() {
    return this.props.loggers.flush();
  }

  /**
   * @returns {Promise}
   */
  flushCloudWatchTransports() {
    return this.props.loggers.flushCloudWatchTransports();
  }

  /**
   * @param {*} [tags]
   * @param {string} [category]
   * @returns {boolean}
   */
  isLevelEnabled(tags, category) {
    return this.props.loggers.isLevelEnabled(this.transformArgs(tags, undefined, undefined, category));
  }

  /**
   * @description Alias for isLevelEnabled
   */
  levelEnabled(...args) {
    return this.isLevelEnabled(...args);
  }

  /**
   * @returns {object}
   */
  tags(tags, more) {
    const { loggers, tags: myTags } = this.props;
    if (more) tags = loggers.tags(tags, more);
    return loggers.tags(myTags, tags);
  }

  /**
   * @returns {object}
   */
  context(context, more) {
    const { loggers, context: myContext } = this.props;
    if (more) context = loggers.context(context, more);
    return loggers.context(myContext, context);
  }

  /**
   * @returns {string}
   */
  category(category) {
    if (category) return this.props.loggers.category(category);
    return this.props.category;
  }

  /**
   * @param {*} [tags]
   * @param {*} [message]
   * @param {*} [context]
   * @param {string} [category]
   * @returns {object}
   */
  log(tags, message, context, category) {
    return this.props.loggers.log(this.transformArgs(tags, message, context, category));
  }
}

module.exports = Loggers;
