import {expect, compile} from './inc/common'

describe('objects', () => {
  it('Object shorthand field notation', () => {
    eval(compile('var f = 16, o = {f}'))
    expect(o.f).to.equal(16)
  })

  it('Object shorthand method notation', () => {
    eval(compile('var o = { m() { return 45 } }'))
    expect(o.m()).to.equal(45)
  })
})
