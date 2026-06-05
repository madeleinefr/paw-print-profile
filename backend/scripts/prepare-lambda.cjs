/**
 * Prepares the dist/ directory for SAM deployment.
 * Creates a minimal package.json without test scripts so SAM doesn't run tests.
 * Then installs production dependencies.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const srcPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))

// Create a minimal package.json for Lambda — no test scripts, no devDependencies
const lambdaPkg = {
  name: srcPkg.name,
  version: srcPkg.version,
  description: srcPkg.description,
  main: 'index.js',
  // No "type": "module" — Lambda needs CommonJS
  scripts: {
    build: 'echo "already built"',
  },
  dependencies: srcPkg.dependencies,
}

const distDir = path.join(__dirname, '../dist')
fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(lambdaPkg, null, 2))

console.log('Installing production dependencies in dist/...')
execSync('npm install --omit=dev --omit=optional', { cwd: distDir, stdio: 'inherit' })
console.log('Lambda package ready in dist/')
