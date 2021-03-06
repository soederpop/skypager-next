if (typeof global === 'undefined' && typeof window !== 'undefined') {
  window.global = window
}

if (typeof process === 'undefined') {
  global.process = { env: {} }
} else {
  global.process = process
}

const { createSingleton } = require('./runtime')

/**
 * The runtime singleton
 */
module.exports = createSingleton()
