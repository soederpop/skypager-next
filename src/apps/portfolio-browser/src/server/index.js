export function history() {
  const { runtime } = this
  return !runtime.isDevelopment
}

export function serveStatic() {
  const { runtime } = this
  return !runtime.isDevelopment
}

export const cors = true

export async function appDidMount(app) {
  const { runtime } = this

  const portfolio = runtime.spawn({ cwd: runtime.resolve('..', '..', '..') })

  portfolio.use('runtimes/node')

  await portfolio.fileManager.startAsync({ startPackageManager: true })
  await portfolio.moduleManager.startAsync()
  await runtime.fsx.mkdirpAsync(runtime.resolve('node_modules', '.cache'))

  app.use((req, res, next) => {
    const { pathname } = runtime.urlUtils.parseUrl(req.url)
    console.log(`${req.method.toUpperCase()} ${pathname}`)
    next()
  })

  app.get('/package-graph', async (req, res) => {
    const cacheExists = await runtime.fsx.existsAsync(
      runtime.resolve('node_modules', '.cache', 'package-graph.json')
    )

    if (cacheExists) {
      const resp = await runtime.fsx.readJsonAsync(
        runtime.resolve('node_modules', '.cache', 'package-graph.json')
      )
      res.json(resp)
      return
    }

    const graph = await portfolio.packageManager.exportGraph(req.params)

    res.json(graph)

    runtime.fsx.writeJson(
      runtime.resolve('node_modules', '.cache', 'package-graph.json'),
      graph,
      err => {
        if (err) {
          console.error('CACHE WRITE FAILED', err.message)
        }
      }
    )
  })

  app.get('/module-graph', async (req, res) => {
    const cacheExists = await runtime.fsx.existsAsync(
      runtime.resolve('node_modules', '.cache', 'module-graph.json')
    )

    if (cacheExists) {
      const resp = await runtime.fsx.readJsonAsync(
        runtime.resolve('node_modules', '.cache', 'module-graph.json')
      )
      res.json(resp)
      return
    }

    const graph = await portfolio.moduleManager.exportGraph(req.params)

    res.json(graph)

    runtime.fsx.writeJson(
      runtime.resolve('node_modules', '.cache', 'module-graph.json'),
      graph,
      err => {
        if (err) {
          console.error('CACHE WRITE FAILED', err.message)
        }
      }
    )
  })

  if (runtime.isDevelopment) {
    setupDevelopment.call(this, app)
  }

  return app
}

export function setupDevelopment(app) {
  console.log('Setting up development middlewares')
  const webpack = require('webpack')
  const merge = require('webpack-merge')
  const devMiddleware = require('webpack-dev-middleware')
  const hotMiddleware = require('webpack-hot-middleware')
  const config = merge(require('@skypager/webpack/config/webpack.config.dev'), {
    node: {
      process: 'mock',
    },
    externals: [
      {
        react: 'global React',
        'react-dom': 'global ReactDOM',
        'react-router-dom': 'global ReactRouterDOM',
        'semantic-ui-react': 'global semanticUIReact',
        'prop-types': 'global PropTypes',
        '@skypager/web': 'global skypager',
        '@skypagr/runtime': 'global skypager',
      },
    ],
  })

  this.setupDevelopmentMiddlewares({
    webpack,
    config,
    devMiddleware,
    hotMiddleware,
  })

  return app
}

export function appWillMount(app, options = {}, context = {}) {
  return app
}
