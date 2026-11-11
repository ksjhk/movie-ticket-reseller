import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  KashijieClient, jsonOutput, supplySuccess, assertConfirmed,
  requiredString, validMobile,
} from './lib/client.js'

export const name = 'kashijie-movie-ticket-reseller'
export const inject = ['tools']

const movieEndpoints = {
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

function businessParams(value) {
  if (!value) return {}
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('params_json 必须是有效的 JSON 对象字符串。')
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('params_json 必须是 JSON 对象，不接受数组或标量。')
  }
  return parsed
}

function validSeats(value) {
  const text = requiredString(value, 'buy_seats')
  let seats
  try {
    seats = JSON.parse(text)
  } catch {
    throw new Error('buy_seats 必须是座位对象 JSON 数组字符串。')
  }
  if (!Array.isArray(seats) || seats.length < 1 || seats.length > 5) {
    throw new Error('buy_seats 必须包含 1～5 个座位。')
  }
  for (const seat of seats) {
    if (!seat || typeof seat !== 'object' || Array.isArray(seat) || !seat.seatId) {
      throw new Error('每个座位都必须是带 seatId 的对象。')
    }
  }
  return text
}

export function createTools(config = {}) {
  const client = new KashijieClient({
    baseUrl: config.baseUrl || process.env.KASHIJIE_MOVIE_API_BASE_URL || 'https://www.kashijie.com/open-api',
    appKey: config.appKey || process.env.KASHIJIE_APP_KEY || '',
    appSecret: config.appSecret || process.env.KASHIJIE_APP_SECRET || '',
    fetchImpl: config.fetchImpl || fetch,
  })
  const call = (options, exec) => client.request({ ...options, success: supplySuccess }, exec)

  return [
    {
      name: 'kashijie_movie_query',
      description: '查询卡世界电影票货源。action 依次用于城市、热映、待映、行政区、品牌、影院、场次、放映日期、影片详情、影院详情、场次详情和座位图。业务 ID 使用上级查询结果，通过 params_json 传入，例如 {"cityId":"123"}。',
      parameters: {
        action: {
          type: 'string', required: true, enum: Object.keys(movieEndpoints),
          description: 'city / films / wait-list / region / brand / cinemas / schedule / showdate / film-info / cinema-info / show / seats',
        },
        params_json: {
          type: 'string',
          description: '可选 JSON 对象字符串，例如 {"cityId":"123","filmId":"456"}；城市查询可省略',
        },
      },
      output: jsonOutput,
      timeoutMs: 30000,
      isConcurrencySafe: () => true,
      execute: (args, exec) => {
        const path = Object.hasOwn(movieEndpoints, args.action) ? movieEndpoints[args.action] : undefined
        if (!path) throw new Error('不支持的电影查询 action。')
        return call({ path, body: businessParams(args.params_json) }, exec)
      },
    },
    {
      name: 'kashijie_movie_order_query',
      description: '使用代理自己的密钥查询电影出票状态、取票码和失败退款结果。锁座或处理中不等于出票成功，网络超时先查单。',
      parameters: { order_no: { type: 'string', required: true, description: '卡世界电影订单号' } },
      output: jsonOutput,
      timeoutMs: 30000,
      execute: (args, exec) => call({
        path: '/v1/movie/order/query', signed: true,
        body: { order_no: requiredString(args.order_no, '订单号') },
      }, exec),
    },
    {
      name: 'kashijie_movie_order_create',
      description: '锁座、扣代理预充值余额并创建真实电影票订单。仅在用户明确同意扣款时调用，confirm 必须为 true；出票失败由平台自动退款。',
      parameters: {
        showId: { type: 'string', required: true, description: '场次查询返回的 showId' },
        buy_seats: { type: 'string', required: true, description: '1～5 个座位对象的 JSON 数组字符串，例如 [{"seatId":"seat_xxx"}]，不要传裸数组' },
        phoneNo: { type: 'string', required: true, description: '订票人 11 位手机号' },
        attach: { type: 'string', description: '代理自定义附加信息' },
        confirm: { type: 'boolean', required: true, description: '用户明确同意真实扣款时才为 true' },
      },
      output: jsonOutput,
      timeoutMs: 45000,
      execute: (args, exec) => {
        assertConfirmed(args.confirm)
        return call({
          path: '/v1/movie/order/create', signed: true,
          body: {
            showId: requiredString(args.showId, 'showId'),
            buy_seats: validSeats(args.buy_seats),
            phoneNo: validMobile(args.phoneNo, '订票手机号'),
            attach: args.attach,
          },
        }, exec)
      },
    },
  ]
}

export function apply(ctx, config = {}) {
  for (const definition of createTools(config)) ctx.tools.register(defineTool(definition))
}
