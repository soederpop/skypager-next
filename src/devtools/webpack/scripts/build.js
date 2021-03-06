// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'production'
process.env.NODE_ENV = 'production'

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err
})

// Ensure environment variables are read.
require('@skypager/webpack/config/env')

const argv = require('minimist')(process.argv.slice(0, 2))
const path = require('path')
const chalk = require('chalk')
const fs = require('fs-extra')
const webpack = require('webpack')
const { execSync } = require('child_process')
const config = require('@skypager/webpack/config/webpack.config.prod')
const paths = require('@skypager/webpack/config/paths')
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages')
const printHostingInstructions = require('react-dev-utils/printHostingInstructions')
const FileSizeReporter = require('react-dev-utils/FileSizeReporter')
const printBuildError = require('react-dev-utils/printBuildError')
const get = require('lodash/get')
const isArray = require('lodash/isArray')
const configMerge = require('webpack-merge')

const manifest = require(paths.appPackageJson)
const measureFileSizesBeforeBuild = FileSizeReporter.measureFileSizesBeforeBuild
const printFileSizesAfterBuild = FileSizeReporter.printFileSizesAfterBuild
const useYarn = fs.existsSync(paths.yarnLockFile)

// These sizes are pretty large. We'll warn for bundles exceeding them.
const WARN_AFTER_BUNDLE_GZIP_SIZE = 512 * 1024
const WARN_AFTER_CHUNK_GZIP_SIZE = 1024 * 1024

let latestHash = (
  execSync(`git log --format='%T' .`, { cwd: path.resolve(paths.appBuild, '..') })
    .toString()
    .trim()
    .split('\n')[0] || ''
).trim()
const projectRoot = path.dirname(paths.appPackageJson)
const modifiedFiles = execSync(`git status . --porcelain`, {
  cwd: projectRoot,
})
  .toString()
  .split('\n')
  .join(' ')

latestHash = `${latestHash}:${modifiedFiles}`

const checkPreviousBuild = async buildRoot => {
  if (fs.existsSync(path.resolve(buildRoot, 'latest-hash.json'))) {
    const previousHash = require(path.resolve(buildRoot, 'latest-hash.json')).git

    if (previousHash === latestHash && !process.argv.find(i => i === '--force')) {
      console.log(`Build output for ${latestHash} already exists. Pass --force to rebuild.`)
      process.exit(0)
    } else {
      console.log(
        `Previous Build Hash ${previousHash} does not match ${latestHash}. Doing a fresh build`
      )
    }
  }

  const result = await measureFileSizesBeforeBuild(buildRoot)

  if (!process.argv.find(i => i === '--no-clean')) {
    fs.emptyDirSync(paths.appBuild)
  }

  return result
}

// First, read the current file sizes in build directory.
// This lets us display how much they changed later.
checkPreviousBuild(paths.appBuild)
  .then(previousFileSizes => {
    // Remove all content but keep the directory so that
    // if you're in it, you don't end up in Trash

    // Merge with the public folder
    if (fs.existsSync(paths.appPublic)) {
      copyPublicFolder()
    }

    // Start the webpack build
    return build(previousFileSizes)
  })
  .then(
    ({ stats, previousFileSizes, warnings }) => {
      if (warnings.length) {
        console.log(chalk.yellow('Compiled with warnings.\n'))
        console.log(warnings.join('\n\n'))
        console.log(
          `\nSearch for the ${chalk.underline(
            chalk.yellow('keywords')
          )} to learn more about each warning.`
        )
        console.log(
          `To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`
        )
      } else {
        console.log(chalk.green('Compiled successfully.\n'))
      }

      console.log('File sizes after gzip:\n')
      printFileSizesAfterBuild(
        stats,
        previousFileSizes,
        paths.appBuild,
        WARN_AFTER_BUNDLE_GZIP_SIZE,
        WARN_AFTER_CHUNK_GZIP_SIZE
      )
      console.log()

      const appPackage = manifest
      const publicUrl = paths.publicUrl
      const publicPath = config.output.publicPath
      const buildFolder = path.relative(process.cwd(), paths.appBuild)

      if (manifest.skypager && manifest.skypager.projectType === 'web-application') {
        printHostingInstructions(appPackage, publicUrl, publicPath, buildFolder, useYarn)
      }

      if (!process.argv.find(i => i === '--no-stats')) {
        fs.writeFileSync(
          path.resolve(paths.appBuild, 'stats.json'),
          JSON.stringify(stats.toJson({ source: true }))
        )
      }

      fs.writeFileSync(
        path.resolve(paths.appBuild, 'latest-hash.json'),
        JSON.stringify({ git: latestHash, build: stats.hash })
      )

      process.exit(0)
    },
    err => {
      console.log(`Build Failed in ${manifest.name}`)
      console.log(chalk.red('Failed to compile.\n'))
      printBuildError(err)
      process.exit(1)
    }
  )

// Create the production build and print the deployment instructions.
async function build(previousFileSizes) {
  console.log(`${manifest.name}: Creating an optimized production build...`)

  // a project can opt to start
  let webpackConfig = get(manifest, 'skypager.webpack.merge') === false ? {} : config

  if (get(manifest, 'skypager.webpack.build')) {
    console.log(`Using custom wepack config`)
    let configToMerge = require(path.resolve(
      path.dirname(paths.appPackageJson),
      get(manifest, 'skypager.webpack.build')
    ))

    if (typeof configToMerge === 'function') {
      configToMerge = await Promise.resolve(configToMerge(argv.env || 'production', argv, config))
    }

    if (!isArray(configToMerge)) {
      // we won't try and merge webpack config if it is an array
      webpackConfig = configMerge(webpackConfig, configToMerge)
    } else {
      console.log('Using multiple webpack configs')
    }
  }

  const compiler = webpack(webpackConfig)

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) {
        return reject(err)
      }

      const messages = formatWebpackMessages(stats.toJson({}, true))
      if (messages.errors.length) {
        // Only keep the first error. Others are often indicative
        // of the same problem, but confuse the reader with noise.
        if (messages.errors.length > 1) {
          messages.errors.length = 1
        }
        console.log(`Build failed in ${manifest.name}`)
        return reject(new Error(messages.errors.join('\n\n')))
      }
      if (
        process.env.CI &&
        (typeof process.env.CI !== 'string' || process.env.CI.toLowerCase() !== 'false') &&
        messages.warnings.length
      ) {
        console.log(
          chalk.yellow(
            '\nTreating warnings as errors because process.env.CI = true.\n' +
              'Most CI servers set it automatically.\n'
          )
        )
        return reject(new Error(messages.warnings.join('\n\n')))
      }
      return resolve({
        stats,
        previousFileSizes,
        warnings: messages.warnings,
      })
    })
  })
}

function copyPublicFolder() {
  fs.copySync(paths.appPublic, paths.appBuild, {
    dereference: true,
    filter: file => file !== paths.appHtml,
  })
}
