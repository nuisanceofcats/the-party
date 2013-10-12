import parse from 'esprima-the-party'
module fs from 'fs'
module path from 'path'
module ast from './ast'
import generate from 'escodegen'

var CODEGEN_FORMAT = { indent: { style: '  ' } }

var readdirFiles = dir =>
  fs.readdirSync(dir)
    .map(f => path.join(dir, f))
    .filter(f => ! fs.statSync(f).isDirectory())

function recursiveReaddir(dir) {
  var files = []
  fs.readdirSync(dir).forEach(child => {
    child = path.join(dir, child)
    if (fs.statSync(child).isDirectory())
      files = files.concat(recursiveReaddir(child))
    else
      files.push(child)
  })
  return files
}

function parseSourceFiles(sourcePaths, opts) {
  var noLocs = (opts.dump || opts.dumpSources) && ! opts.dumpLocs

  // map of script file name against ast
  var sources = {}

  var parseSourceFile = (sourcePath, dir) => {
    var contents = fs.readFileSync(sourcePath).toString()
    var ast = parse(contents, {
      loc: ! noLocs,
      source: sourcePath
    })

    sources[sourcePath] = { ast, dir }
  }

  // regexp when scanning directories
  var sourceRe = opts.compile ? /\.es6$/ : /\.(es6|js)$/

  sourcePaths.forEach(sourcePath => {
    if (fs.statSync(sourcePath).isDirectory()) {
      var dirFiles = opts.dontRecurse ?
        readdirFiles(sourcePath) :
        recursiveReaddir(sourcePath)

      dirFiles.forEach(file => {
        if (sourceRe.test(file))
          parseSourceFile(file, sourcePath)
      })
    }
    else {
      parseSourceFile(sourcePath, null)
    }
  })

  return sources
}

function mkpath(dir) {
  var mk = '' // path component so far (starting from head)
  dir.split(path.sep).forEach(component => {
    mk = path.join(mk, component)
    if (! fs.existsSync(mk) || ! fs.statSync(mk).isDirectory()) {
      if (fs.mkdirSync(mk)) {
        console.error("Could not make path component:", mk)
        process.exit(1)
      }
    }
  })
}

/// Output many code files to the given output directory.
/// @param objects Object of form { sourcePath: { code, map } }
/// @param targetDir Directory that will hold output files.
function outputCode(objects, targetDir) {
  Object.keys(objects).forEach(objectModule => {
    var object = objects[objectModule]

    var destPath = path.join(targetDir, objectModule + ".js")

    if (destPath === object.sourcePath) {
      console.error('Source file equals output file for', destPath, 'skipping.')
    }
    else {
      mkpath(path.dirname(destPath))

      if (object.map)
        fs.writeFileSync(destPath + '.map', object.map)
      fs.writeFileSync(destPath, object.code)
    }
  })
}

/// Compiles scripts (or script data)
/// @param scripts This can be an array of form { path: ast } or a string containing ES6 code.
/// @param opts An object containing the following options:
//      dump: If set then the return object will contain AST dumps of the compled code as the values instead of the code as string
//      dumpSources: Like dump but the values will be ASTs of the source objects.
//      dumpLocs: When dump or dumpSources is set then location data is removed from the AST unless this parameter is used.
///
/// @retval Data of the form { sourcePath: code } where code can be an AST (if dumpSources or dump was set) or an object of the form { map, code }
export function compile(scripts, opts) {
  // output overrides compile
  if (opts && opts.compile) {
    if (opts.output) {
      console.error("--compile option used with --output, ignoring --compile")
      delete opts.compile
    }
    else {
      opts.output = '.'
    }
  }

  if (typeof scripts === 'string') {
    // scripts = code to be compiled
    var compiledAst = ast.compileObjectNode(parse(scripts))
    return generate(compiledAst, { format: CODEGEN_FORMAT })
  }

  var sources = parseSourceFiles(scripts, opts)

  if (opts.dumpSources)
    return sources

  var objects = compileAsts(sources, opts)

  if (opts.dump)
    return objects

  var code = {}
  Object.keys(objects).forEach(objectModule => {
    var output, object = objects[objectModule], ast = object.ast

    var codeEntry = {}
    if (opts.sourceMaps) {
      var tmp = generate(ast, {
        sourceMapWithCode: true,
        sourceMap: true, // from loc.source
        format: CODEGEN_FORMAT
      })
      codeEntry.map = tmp.map
      codeEntry.code = tmp.code
    }
    else {
      codeEntry.code = generate(ast)
    }
    codeEntry.sourceDir = object.sourceDir
    code[objectModule] = codeEntry
  })

  if (opts.output)
    outputCode(code, opts.output)

  return code
}

/// Compile asts
/// @param sources { file: {ast, dir} }*
/// @param objects Optional existing objects hash in which to store
///                objects created from sources
/// @retval { sourcePath: { ast, sourceDir, requires: [require]*, deps: [dep]* } }*
/// @todo Load extra modules as they are imported
function compileAsts(sources, opts, objects) {
  if (! objects)
    objects = {}

  Object.keys(sources).forEach(sourcePath => {
    var source = sources[sourcePath]
    var objectModule = sourcePath.replace(/\.(js|es6)/, '')

    var sourceDir = source.dir
    if (sourceDir && ! opts.compile)
      // remove passed directory component from output path
      objectModule = objectModule.substr(sourceDir.length + 1)

    var object = objects[objectModule] = { sourceDir, sourcePath, requires: [] }

    // store this property for translators to set dependencies
    object.ast = ast.compileObject(object, source.ast)
    object.deps = object.requires.map(req => resolveModule(objectModule, req))
  })

  Object.keys(objects).forEach(objectModule => {
    objects[objectModule].deps.forEach(dep => {
      // TODO: if dep isn't in objects than add source file
    })
  })

  return objects
}

function baseModule(mod) {
  if (mod === '')
    return '..'

  var lastSlash = mod.lastIndexOf('/')
  return lastSlash === -1 ?  '' : mod.substr(0, lastSlash)
}

function resolveModule(current, mod) {
  var ret = baseModule(current)

  mod.split('/').forEach(function (component) {
    if (component == '..') {
      ret = baseModule(ret)
    }
    else if (component !== '.') {
      if (ret.length)
        ret += '/'
      ret += component
    }
  })
  return ret
}
