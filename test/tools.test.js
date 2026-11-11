import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, createTools, inject } from '../index.js'
import { signature } from '../lib/client.js'

function mockConfig(result = { code: 200, success: true, data: { mocked: true } }) {
  const calls = []
  return {
    calls,
    config: {
      baseUrl: 'https://mock.local/open-api', appKey: 'key', appSecret: 'secret',
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    },
  }
}

const tool = (tools, name) => {
  const found = tools.find((item) => item.name === name)
  assert.ok(found, `missing tool ${name}`)
  return found
}

const endpoints = {
  city: '/v1/movie/city',
  films: '/v1/movie/films',
  'wait-list': '/v1/movie/wait-list',
  region: '/v1/movie/region',
  brand: '/v1/movie/brand',
  cinemas: '/v1/movie/cinemas',
  schedule: '/v1/movie/schedule',
  showdate: '/v1/movie/showdate',
  'film-info': '/v1/movie/film-info',
  'cinema-info': '/v1/movie/cinema-info',
  show: '/v1/movie/show',
  seats: '/v1/movie/seats',
}

test('movie plugin exposes exactly three expected tools', () => {
  const { config } = mockConfig()
  const tools = createTools(config)
  assert.deepEqual(tools.map((item) => item.name), [
    'kashijie_movie_query',
    'kashijie_movie_order_query',
    'kashijie_movie_order_create',
  ])
  assert.deepEqual(inject, ['tools'])
})

test('movie query covers all twelve anonymous endpoints', async () => {
  const { config, calls } = mockConfig()
  const query = tool(createTools({ ...config, appKey: '', appSecret: '' }), 'kashijie_movie_query')
  for (const [action, path] of Object.entries(endpoints)) {
    await query.execute({ action, params_json: '{"cityId":"city_mock"}' })
    const call = calls.at(-1)
    assert.equal(call.url.pathname, `/open-api${path}`)
    assert.equal(call.options.method, 'POST')
    assert.deepEqual(JSON.parse(call.options.body), { cityId: 'city_mock' })
    assert.equal('sign' in JSON.parse(call.options.body), false)
  }
  assert.equal(calls.length, 12)
})

test('movie query rejects invalid action and params_json before any request', async () => {
  const { config, calls } = mockConfig()
  const query = tool(createTools(config), 'kashijie_movie_query')
  for (const action of ['unknown', '__proto__', 'toString']) {
    await assert.rejects(async () => query.execute({ action }), /不支持/)
  }
  for (const params_json of ['bad-json', '[]', 'null', '"text"']) {
    await assert.rejects(async () => query.execute({ action: 'city', params_json }), /params_json/)
  }
  assert.equal(calls.length, 0)
})

test('movie order query is signed', async () => {
  const { config, calls } = mockConfig()
  const tools = createTools(config)
  await tool(tools, 'kashijie_movie_order_query').execute({ order_no: 'movie_order_mock' })
  assert.equal(calls[0].url.pathname, '/open-api/v1/movie/order/query')
  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.order_no, 'movie_order_mock')
  assert.equal(body.sign, signature({ order_no: 'movie_order_mock', app_key: 'key', timestamp: body.timestamp }, 'secret'))
})

test('movie order create requires explicit confirmation and sends zero requests otherwise', async () => {
  const { config, calls } = mockConfig()
  const create = tool(createTools(config), 'kashijie_movie_order_create')
  const order = { showId: 'show_mock', buy_seats: '[{"seatId":"seat_mock"}]', phoneNo: '10000000000' }
  for (const confirm of [undefined, false, 'true', 1]) {
    await assert.rejects(async () => create.execute({ ...order, confirm }), /明确确认/)
  }
  assert.equal(calls.length, 0)
})

test('movie buy_seats accepts only a JSON string containing one to five seat objects', async () => {
  const { config, calls } = mockConfig()
  const create = tool(createTools(config), 'kashijie_movie_order_create')
  const order = { showId: 'show_mock', phoneNo: '10000000000', confirm: true }
  const invalid = [
    [{ seatId: 'seat_mock' }],
    'not-json',
    '[]',
    '[{"id":"missing-seatId"}]',
    '[null]',
    JSON.stringify(Array.from({ length: 6 }, (_, index) => ({ seatId: `seat_${index}` }))),
  ]
  for (const buy_seats of invalid) {
    await assert.rejects(async () => create.execute({ ...order, buy_seats }))
  }
  assert.equal(calls.length, 0)

  const buy_seats = '[{"seatId":"seat_mock","row":"1","col":"2"}]'
  await create.execute({ ...order, buy_seats, attach: 'mock attach' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.pathname, '/open-api/v1/movie/order/create')
  const body = JSON.parse(calls[0].options.body)
  assert.equal(body.showId, 'show_mock')
  assert.equal(body.buy_seats, buy_seats)
  assert.equal(typeof body.buy_seats, 'string')
  assert.equal(body.phoneNo, '10000000000')
  assert.equal('confirm' in body, false)
  assert.equal(body.sign, signature({ showId: 'show_mock', buy_seats, phoneNo: '10000000000', attach: 'mock attach', app_key: 'key', timestamp: body.timestamp }, 'secret'))
})

test('movie apply registers valid DSH tool definitions', () => {
  const { config } = mockConfig()
  const registered = []
  apply({ tools: { register: (value) => registered.push(value) } }, config)
  assert.equal(registered.length, 3)
})
