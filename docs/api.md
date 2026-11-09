# 卡世界电影票代理 API

API 根地址：`https://www.kashijie.com/open-api`

电影票只读查询可匿名调用，同 IP 限 60 次/分钟；主动携带 `app_key` 时必须带完整有效的 `timestamp / sign`。下单、订单查询和余额查询需要签名。金额字段单位为分。

## 快速获取密钥

`POST /platform/quick-start`，公开接口。开发者或 AI 在用户同意后提交用户本人未注册手机号，系统自动注册并返回首组 `app_key / app_secret`、7 天 token 和初始余额 0。

```bash
curl -X POST "https://www.kashijie.com/open-api/platform/quick-start" \
  -H "Content-Type: application/json" \
  -d '{"mobile":"用户本人11位手机号"}'
```

同 IP 每小时最多 3 次。已注册手机号需登录控制台管理密钥，公开接口不会读取或追加他人账号密钥。

## 签名算法

所有签名请求必带 `app_key`、秒级 `timestamp`、`sign`。

1. 取全部请求参数（GET query 或 POST body），排除 `sign` 本身；query 与 body 混用时，两处参数必须合并。
2. 跳过空值、数组与对象。
3. 按参数名升序拼接：`k1=v1&k2=v2`。
4. 末尾追加 `&secret=你的app_secret`。
5. 计算小写 32 位 MD5。

query、JSON body、表单三种方式均可；鉴权参数放 query、业务参数放 body 时，业务参数也必须参与签名。`app_secret` 只在服务端本地参与计算，不明文传输。

## 电影查询接口

以下接口均为 POST，公开查询成功时 `code=200`。

| 业务 | 路径 |
|---|---|
| 城市 | `/v1/movie/city` |
| 热映影片 | `/v1/movie/films` |
| 待映影片 | `/v1/movie/wait-list` |
| 行政区 | `/v1/movie/region` |
| 影院品牌 | `/v1/movie/brand` |
| 影院列表 | `/v1/movie/cinemas` |
| 场次 | `/v1/movie/schedule` |
| 放映日期 | `/v1/movie/showdate` |
| 影片详情 | `/v1/movie/film-info` |
| 影院详情 | `/v1/movie/cinema-info` |
| 场次详情 | `/v1/movie/show` |
| 座位图 | `/v1/movie/seats` |

业务参数使用上一级查询返回的 ID，如 `cityId`、`filmId`、`cinemaId`、`showId`。

```bash
curl -X POST "https://www.kashijie.com/open-api/v1/movie/city" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## 创建电影票订单

`POST /v1/movie/order/create`，JSON body，需完整签名参数。

| 参数 | 必填 | 说明 |
|---|---|---|
| `showId` | 是 | 场次 ID |
| `buy_seats` | 是 | 座位对象 JSON 数组字符串，1～5 个座位 |
| `phoneNo` | 是 | 11 位订票手机号 |
| `attach` | 否 | 自定义附加信息 |

`buy_seats` 示例：`[{"seatId":"seat_xxx"}]`。不要直接传数组，数组会按签名规则跳过；JSON 字符串可确保座位数据参与签名。

电影订单先锁座取得实际成本，再扣开放平台余额并出票；出票失败自动退款。未经代理明确授权，不发起真实扣款订单。

## 查询电影票订单

`POST /v1/movie/order/query`，参数为 `order_no` 与鉴权参数。出票成功后，取票序列号和验证码位于 `supplier_data.tickets`。

| status | 说明 |
|---|---|
| `recharging` | 已扣款，电影出票中 |
| `success` | 已出票 |
| `refunded` | 出票失败，余额已退回 |

锁座或处理中不代表出票成功。网络超时先按订单号查询，不直接重复创建订单。
