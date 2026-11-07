# Контракт API между фронтендом и бэкендом

Версия 1.0.0. Машиночитаемое описание: [contracts/openapi.json](../contracts/openapi.json). Базовый путь /api/v1. JSON в snake_case; единственное исключение — входящий callback Platega, где используются поля провайдера в camelCase.

## Общие правила

- Деньги внутри приложения — целые копейки: 35000 = 350 ₽; валюта RUB. Клиент форматирует Intl.NumberFormat, сервер считает цену.
- ID — непрозрачные строки. Ряд и номер начинаются с 1.
- Даты — ISO 8601 UTC с Z; показывать в Cinema.timezone, например Europe/Moscow.
- Списки возвращаются как { "items": [...] }. Ошибки — единый Error, включая validation errors FastAPI.
- В браузере VITE_API_BASE_URL=/api/v1 через proxy, локально мок/API на порту 8000. Фронт на 5173.
- Ключи Platega доступны только серверу. Любые клиентские price/status/paid считаются недоверенными.

## Endpoints

| Метод и путь | Вход | Ответ | Что делает фронт |
| --- | --- | --- | --- |
| GET /health | — | Health | Определяет режим mock/live, техническая проверка |
| GET /cinemas | — | items: Cinema[] | Выбор кинотеатра |
| GET /sessions?cinema_id=cinema_aurora | cinema_id обязателен | items: Session[] | Показывает будущие сеансы |
| GET /sessions/{session_id} | ID | Session | Открытие страницы по прямой ссылке |
| GET /halls/{hall_id} | ID | Hall | Геометрия для SVG, 3D и звука |
| GET /sessions/{session_id}/seats | ID | Availability | Статусы и цены по seat_id |
| POST /orders | CreateOrder + Idempotency-Key | 201/202 CreateOrderResponse; повтор 200 | Бронь и создание оплаты |
| GET /orders/{order_id} | Bearer access_token | Order | Состояние оплаты и восстановление страницы |
| GET /orders/{order_id}/ticket | Bearer access_token | Ticket или 409 TICKET_NOT_READY | Получение билета после paid |
| GET /tickets/{token} | Непредсказуемый token из QR | Ticket | Проверка существования и статуса билета |
| POST /payments/platega/callback | Заголовки и JSON провайдера | 200 после сохранения события | Вызывает только Platega, не браузер |

## Последовательность для фронтенда

1. Получить cinemas, затем sessions выбранного кинотеатра.
2. Для сеанса параллельно получить Hall и Availability. Объединять места по seat_id, не по индексу массива.
3. При выборе места взять цену из Availability, положение — из Hall. Выбор в UI ещё не создаёт бронь.
4. При покупке запросить email и создать один Idempotency-Key через crypto.randomUUID(). Сохранить его и тело запроса до отправки.
5. POST /orders. Сохранить order.id и access_token в sessionStorage до перехода на внешнюю оплату. Тот же ключ повторять при сетевой неопределённости; новый ключ только для нового намерения покупки.
6. Если payment_url пока null и статус creating_payment — ждать GET /orders/{id}. Если есть ссылка — показать «Перейти к оплате СБП». Нельзя отправлять второй POST из useEffect.
7. После возврата /payment/return?order=... опрашивать GET /orders/{id} раз в 3 секунды, с backoff до 10 секунд при ошибках. Остановить при терминальном состоянии/уходе со страницы. Секрет заказа берётся из sessionStorage.
8. Только status=paid открывает билет. Обновить доступность мест. При payment_review — сообщить «Оплата проверяется» и не предлагать повторно платить.
9. Если ссылки открыты на другом устройстве без access_token, не показывать приватный заказ; QR уже выпущенного билета открывает публичную проверку без email.

Пример запроса:

~~~http
POST /api/v1/orders
Content-Type: application/json
Idempotency-Key: 56197a84-44c7-47e0-94f1-5c4e680bb0ac

{
  "session_id": "session_aurora_1",
  "seat_id": "h1-r06-s12",
  "customer_email": "buyer@example.org"
}
~~~

В реальной оплате email должен принадлежать покупателю; адрес выше — только пример формата.

## Статусы

| Объект | Состояния | Правило |
| --- | --- | --- |
| Место | available, held, sold | held создаёт только сервер, sold только после verified payment |
| Заказ | creating_payment, pending_payment, paid, canceled, expired, payment_review, refunded | paid не выводится из URL возврата |
| Билет | valid, suspended, revoked | Показывать текущий статус при каждом открытии QR |
| Provider payment | CREATING, PENDING, CONFIRMED, CANCELED, EXPIRED, FAILED, DISPUTED, CHARGEBACKED, PARTIALLY_REFUNDED, UNKNOWN | Сохранять исходное состояние; неизвестное не считать успехом |

expires_at — срок провайдера или null, пока неизвестен. Локальный таймер не разрешает продавать место повторно. Сначала сервер сверяет терминальное состояние платежа. При неясном результате место остаётся held до сверки.

На момент подтверждения в одной транзакции: проверить владельца брони → paid → sold → один ticket. При конфликте поздней оплаты поставить payment_review и не выдавать второй билет на то же место.

## Ошибки и поведение

~~~json
{"error":{"code":"SEAT_UNAVAILABLE","message":"Это место уже заняли. Выберите другое.","retryable":false}}
~~~

| HTTP | code | Действие клиента |
| --- | --- | --- |
| 401 | UNAUTHORIZED | Показать отсутствие доступа к заказу |
| 404 | NOT_FOUND | Вернуться к каталогу/показать неверный билет |
| 409 | SEAT_UNAVAILABLE | Обновить схему, предложить другое место |
| 409 | IDEMPOTENCY_CONFLICT | Не повторять с изменённым телом под старым ключом |
| 409 | TICKET_NOT_READY | Продолжить проверку заказа |
| 409 | SESSION_STARTED | Сбросить checkout, выбрать другой сеанс |
| 422 | VALIDATION_ERROR | Подсветить поле, сохранить введённое |
| 429 | RATE_LIMITED | Подождать и повторить с тем же ключом |
| 502/503 | PAYMENT_UNAVAILABLE | Показать сбой; сохранить order/key, не создавать дубликат |

Если Platega могла принять POST, но ответ потерян, API возвращает созданный локальный заказ со статусом creating_payment/payment_review, а не теряет его за общей ошибкой. Идемпотентность на нашей стороне не означает, что Platega автоматически дедуплицирует запрос.

## Мок

~~~sh
python3 scripts/mock_api.py
~~~

Мок читает общие fixtures, хранит заказы в памяти, привязывается только к 127.0.0.1 и не читает .env. Для имитации завершения есть POST /__mock/orders/{id}/confirm с Bearer токеном заказа. Только локальная разработка. В настоящем API такого endpoint быть не должно.

Мок покрывает happy path, повтор запроса, конфликт места и отсутствие билета до оплаты. Он не моделирует все задержки банка, возвраты, рестарты и гонки webhook — для них бэкендер пишет отдельные проверки.
