function raw(str) {
  return '\'' + str + '\'';
}
var ModuleDeclaration = exports.ModuleDeclaration = function (ast) {
    var loc = ast.loc;
    return {
      type: 'VariableDeclaration',
      declarations: [{
          type: 'VariableDeclarator',
          id: ast.id,
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'require',
              loc: loc
            },
            arguments: [ast.source]
          }
        }],
      kind: 'var',
      loc: loc
    };
  };
var compileRestParams = function (ast) {
    var rest = ast.rest, nParams = ast.params.length;
    var loc = rest.loc;
    var sliceArgs = [{
          type: 'Identifier',
          name: 'arguments',
          loc: loc
        }];
    if (nParams > 0) {
      sliceArgs.push({
        type: 'Literal',
        value: nParams,
        raw: nParams.toString(),
        loc: loc
      });
    }
    ast.body.body.unshift({
      type: 'VariableDeclaration',
      declarations: [{
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: rest.name,
            loc: loc
          },
          init: {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              computed: false,
              object: {
                type: 'MemberExpression',
                computed: false,
                object: {
                  type: 'MemberExpression',
                  computed: false,
                  object: {
                    type: 'Identifier',
                    name: 'Array',
                    loc: loc
                  },
                  property: {
                    type: 'Identifier',
                    name: 'prototype',
                    loc: loc
                  },
                  loc: loc
                },
                property: {
                  type: 'Identifier',
                  name: 'slice',
                  loc: loc
                },
                loc: loc
              },
              property: {
                type: 'Identifier',
                name: 'call',
                loc: loc
              },
              loc: loc
            },
            arguments: sliceArgs,
            loc: loc
          },
          loc: loc
        }],
      kind: 'var',
      loc: loc
    });
  }.bind(this);
var functionHelper = function (ast, compile) {
    if (ast.expression) {
      var existing = ast.body, loc = existing.loc;
      ast.body = {
        type: 'BlockStatement',
        body: [{
            type: 'ReturnStatement',
            argument: existing,
            loc: loc
          }],
        loc: loc
      };
      ast.expression = false;
    } else {
      ast.body = compile(ast.body);
    }
    if (ast.rest)
      compileRestParams(ast);
    return ast;
  }.bind(this);
var FunctionExpression = exports.FunctionExpression = functionHelper, FunctionDeclaration = exports.FunctionDeclaration = functionHelper;
var Property = exports.Property = function (ast, compile) {
    ast.shorthand = false;
    ast.method = false;
    ast.value = compile(ast.value);
    return ast;
  };
var ArrowFunctionExpression = exports.ArrowFunctionExpression = function (ast, compile) {
    ast.type = 'FunctionExpression';
    var loc = ast.loc;
    return {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        computed: false,
        object: exports.FunctionExpression(ast, compile),
        property: {
          type: 'Identifier',
          name: 'bind',
          loc: loc
        },
        loc: loc
      },
      arguments: [{
          type: 'ThisExpression',
          loc: loc
        }],
      loc: loc
    };
  };
var ExportDeclaration = exports.ExportDeclaration = function (ast, compile) {
    var declaration = ast.declaration;
    var loc, ret;
    if (declaration.type === 'FunctionDeclaration') {
      var funcExpression = declaration, id = funcExpression.id;
      funcExpression.id = null;
      funcExpression.type = 'FunctionExpression';
      loc = funcExpression.loc;
      declaration = {
        type: 'VariableDeclaration',
        declarations: [{
            type: 'VariableDeclarator',
            id: id,
            init: funcExpression,
            loc: loc
          }],
        kind: 'var',
        loc: loc
      };
    }
    if (declaration.type === 'VariableDeclaration') {
      declaration.declarations.forEach(function (decl) {
        loc = decl.loc;
        var prevInit = decl.init;
        decl.init = {
          type: 'AssignmentExpression',
          operator: '=',
          left: {
            type: 'MemberExpression',
            computed: false,
            object: {
              type: 'Identifier',
              name: 'exports',
              loc: loc
            },
            property: decl.id,
            loc: loc
          },
          right: compile(prevInit),
          loc: loc
        };
      }.bind(this));
      return declaration;
    } else {
      return ast;
    }
  };