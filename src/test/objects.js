module common from './inc/common'
var expect = common.expect, compile = common.compile

describe('objects', () => {
  it('Object shorthand field notation', () => {
    eval(compile('var f = 16, o = {f}'))
    expect(o.f).to.equal(16)
  })

  it('Object shorthand method notation', () => {
    eval(compile('var o = { m() { return 45 } }'))
    expect(o.m()).to.equal(45)
  })

  it('Simple object expression variable declaration', () => {
    eval(compile('var o = { x: 1, y: 2 };' +
                 'var {x, y} = o, { x: a, y: b } = o;'))

    expect(x).to.equal(1)
    expect(y).to.equal(2)
    expect(a).to.equal(1)
    expect(b).to.equal(2)
  })

  it('Recursive object expression variable declaration', () => {
    eval(compile('var o = { x: 1, y: { a: 2, b: 3 } };' +
                 'var { y: { a, b: c } } = o;'))
    expect(a).to.equal(2)
    expect(c).to.equal(3)
  })

  it('Caches object expression init', () => {
    eval(compile('var __i = 1; var m = () => ({ i: ++__i, j: ++__i });' +
                 'var {i, j} = m(); var {i: x, j: y} = m()'))

    expect(i).to.equal(2)
    expect(j).to.equal(3)
    expect(x).to.equal(4)
    expect(y).to.equal(5)
  })
})
