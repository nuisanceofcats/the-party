// %s/"\([^" ]*\)": /\1: /g

// utility stuff {
function raw(str) { return "'" + str + "'" }

var __uniqueId = 0
/// Make a unique Id
function uniqueId(loc) {
  return {
    type: "Identifier",
    name: "$$$" + (++__uniqueId).toString(36),
    loc
  }
}
// } end utility stuff

// modules {
/// Mutates harmony module alias ast into es5 ast
export function ExportDeclaration(ast, compile) {
  var declaration = ast.declaration
  var loc, ret

  // TODO if (declaration.type === 'ClassDeclaration')

  if (declaration.type === 'FunctionDeclaration') {
    // converts function declaration to equivalent variable declaration of
    // function expression
    var funcExpression = declaration,
        id = funcExpression.id

    funcExpression.id = null
    funcExpression.type = 'FunctionExpression'

    loc = funcExpression.loc
    declaration = {
      type: "VariableDeclaration",
      declarations: [{
        type: "VariableDeclarator", id,
        init: funcExpression,
        loc
      }],
      kind: 'var',
      loc
    }
  }

  // May also act on a converted FunctionDeclaration
  if (declaration.type === 'VariableDeclaration') {
    declaration.declarations.forEach(decl => {
      loc = decl.loc
      var prevInit = decl.init
      decl.init =  {
        type: "AssignmentExpression",
        operator: "=",
        left: {
          type: "MemberExpression",
          computed: false,
          object: { type: "Identifier", name: "exports", loc },
          property: decl.id,
          loc
        },
        right: compile(prevInit),
        loc
      }
    })

    return declaration
  }
  else {
    return ast
  }
}

export function ModuleDeclaration(ast) {
  var loc = ast.loc
  return {
    type: "VariableDeclaration",
    declarations: [{
      type: "VariableDeclarator",
      id: ast.id,
      init: {
        type: "CallExpression",
        callee: { type: "Identifier", name: "require", loc },
        arguments: [ ast.source ],
        loc
      },
      loc
    }],
    kind: "var",
    loc
  }
}

export function ImportDeclaration(ast) {
  var loc = ast.loc

  var requireExpression = {
    type: "CallExpression",
    callee: {
      type: "Identifier",
      name: "require",
      loc
    },
    arguments: [ ast.source ],
    loc
  }

  var moduleSrc, declarations = [ ]
  if (ast.specifiers.length === 1) {
    moduleSrc = requireExpression
  }
  else {
    var id = uniqueId(loc)
    moduleSrc = id
    declarations[0] = {
      type: "VariableDeclarator", init: requireExpression, id, loc
    }
  }

  var ret = {
    type: "VariableDeclaration",
    declarations,
    kind: 'var',
    loc
  }

  ast.specifiers.forEach(specifier => {
    declarations.push({
      type: "VariableDeclarator",
      id: specifier.name || specifier.id,
      init: {
        type: "MemberExpression",
        computed: false,
        object: moduleSrc,
        property: specifier.id,
        loc
      }
    })
  })

  return ret
}
// } end modules

// patterns {
export function VariableDeclaration(ast, compile) {
  var id = ast.id,
      newDecls = [],
      loc

  var walkObjectPattern = (src, props) => {
    props.forEach(prop => {
      var loc = prop.loc, newDecl = {
        type: "VariableDeclarator",
        init: {
          type: "MemberExpression",
          computed: false,
          object: src,
          property: prop.key,
          loc
        }
      }

      var isObjectPattern = prop.value.type === 'ObjectPattern'
      if (isObjectPattern || prop.value.type === 'ArrayPattern') {
        // assign key to temporary id
        newDecl.id = uniqueId(loc)
        newDecls.push(newDecl)

        // then recurse into the pattern, assigning from the temporary id
        if (isObjectPattern)
          walkObjectPattern(newDecl.id, prop.value.properties)
        else
          walkArrayPattern(newDecl.id, prop.value.elements)
      }
      else {
        newDecl.id = prop.value
        newDecls.push(newDecl)
      }
    })
  }

  var walkArrayPattern = (src, elements) => {
    elements.forEach((element, idx) => {
      // skip "[ , ... ], just let idx increment
      if (element === null)
        return

      var loc = element.loc, newDecl = {
        type: "VariableDeclarator",
        init: {
          type: "MemberExpression",
          computed: true,
          object: src,
          property: {
            type: "Literal",
            value: idx,
            raw: idx.toString(),
            loc
          },
          loc
        },
        loc
      }

      var isObjectPattern = element.type === 'ObjectPattern'
      if (isObjectPattern || element.type === 'ArrayPattern') {
        newDecl.id = uniqueId(loc)
        newDecls.push(newDecl)
        // then recurse into the pattern, assigning from the temporary id
        if (isObjectPattern)
          walkObjectPattern(newDecl.id, element.properties)
        else
          walkArrayPattern(newDecl.id, element.elements)
      }
      // TODO: last: {  type: "SpreadElement", argument: { type: "Identifier", name } }
      else {
        newDecl.id = element
        newDecls.push(newDecl)
      }
    })
  }

  ast.declarations.forEach(decl => {
    var isObjectPattern = decl.id.type === 'ObjectPattern'
    if (isObjectPattern || decl.id.type === 'ArrayPattern') {
      var init = decl.init
      if (init.type !== 'Identifier') {
        loc = init.loc
        var id = uniqueId(loc)
        newDecls.push({
          type: "VariableDeclarator", id, init: compile(init), loc
        })

        // then use the alias as the init from here...
        init = id
      }

      if (isObjectPattern)
        walkObjectPattern(init, decl.id.properties)
      else
        walkArrayPattern(init, decl.id.elements)
    }
    else {
      decl.init = compile(decl.init)
      newDecls.push(decl)
    }
  })

  ast.declarations = newDecls

  return ast
}
// } end patterns

// functions {

/// Compile rest params
/// @param ast Ast of function that contains the rest parameter (it's body
///            has to be altered).
var compileRestParams = ast => {
  var rest = ast.rest, nParams = ast.params.length

  var loc = rest.loc
  var sliceArgs = [{ type: "Identifier", name: "arguments", loc }]
  if (nParams > 0) {
    sliceArgs.push({
      type: "Literal",
      value: nParams,
      raw: nParams.toString(),
      loc
    })
  }

  ast.body.body.unshift({
    type: "VariableDeclaration",
    declarations: [
      {
        type: "VariableDeclarator",
        id: { type: "Identifier", name: rest.name, loc },
        init: {
          type: "CallExpression",
          callee: {
            type: "MemberExpression",
            computed: false,
            object: {
              type: "MemberExpression",
              computed: false,
              object: {
                type: "MemberExpression",
                computed: false,
                object: { type: "Identifier", name: "Array", loc },
                property: { type: "Identifier", name: "prototype", loc },
                loc
              },
              property: { type: "Identifier", name: "slice", loc },
              loc
            },
            property: { type: "Identifier", name: "call", loc },
            loc
          },
          arguments: sliceArgs,
          loc
        },
        loc
      }
    ],
    kind: "var",
    loc
  })
}

var functionHelper = (ast, compile) => {
  if (ast.expression) {
    // "function a() b" -> "function a() { return b }"
    var existing = ast.body, loc = existing.loc
    ast.body = {
      type: "BlockStatement",
      body: [{ type: "ReturnStatement", argument: existing, loc }],
      loc
    }
    ast.expression = false
  }
  else {
    ast.body = compile(ast.body)
  }

  if (ast.rest)
    compileRestParams(ast)

  return ast
}

export var FunctionExpression = functionHelper,
           FunctionDeclaration = functionHelper

export function ArrowFunctionExpression(ast, compile) {
  ast.type = 'FunctionExpression'
  var loc = ast.loc

  // bind the function with this from the current scope
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      computed: false,
      object: FunctionExpression(ast, compile),
      property: { type: "Identifier", name: "bind", loc },
      loc
    },
    arguments: [{ type: "ThisExpression", loc }],
    loc
  }
}

// } end functions

// objects {
/// The AST for this is already appropriate
export function Property(ast, compile) {
  ast.shorthand = false // { a } => { a: a }
  ast.method = false // { f() {} } => { f: function() {} }
  ast.value = compile(ast.value)
  return ast
}
// } end objects
