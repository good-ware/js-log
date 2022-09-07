const deepmerge = require('deepmerge');
const dotenv = require('dotenv');

const { env } = process;

// Read .env files into process.env
const { nodeEnv = 'test' } = env;

dotenv.config({ path: '.env' });
dotenv.config({ path: `.env-${nodeEnv}` });

// Default configuration
let config = {
  env: nodeEnv,
  version: env.npm_package_version,
  service: env.npm_package_name,
  logging: {
    cloudWatch: {
      logGroup: `/${nodeEnv}/goodware/log`,
    },
    console: {
      level: 'silly',
      data: true,
    },
    categories: {
      briefConsole: {
        console: {
          level: 'info',
          data: false,
        },
      },
      briefConsoleNoErrors: {
        console: {
          level: 'info',
          data: false,
          childErrors: false,
        },
      },
      dataConsole: {
        console: {
          level: 'info',
          data: true,
        },
      },
    },
    redact: {
      passwordx: undefined,
      password: {
        recursive: false,
      },
    },
  },
};

// Extra configurations are named after NODE_ENV and merged into config
// Providing .env-{NODE_ENV} file is preferable to editing this file
const configs = {};

// Unit testing
configs.test = {
  logging: {
    categories: {
      default: {
        file: 'silly',
        errorFile: 'on',
      },
      dog: {
        file: 'warn',
        console: 'warn',
      },
    },
  },
};

// To test CloudWatch Logs, set AWS_REGION environment variable
if (env.AWS_REGION) {
  configs.test.logging.categories.default.cloudWatch = 'info';
  configs.test.logging.categories.dog.cloudWatch = 'warn';
}

if (nodeEnv in configs) {
  config = deepmerge(config, configs[nodeEnv], { arrayMerge: (destination, source) => [...destination, ...source] });
}

module.exports = config;
