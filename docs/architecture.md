# Архитектура и общая геометрия

React + TypeScript + Vite для интерфейса; Three.js для сцены. FastAPI + стандартный sqlite3 для API и хранения; httpx для Platega. Один сервер API, один файл SQLite на постоянном диске, один процесс приложения для первого релиза.

~~~mermaid
flowchart LR
    UI[React и SVG схема] --> API[FastAPI]
    UI --> VIEW[Three.js и Web Audio]
    API --> DB[(SQLite)]
    API --> PAY[Platega SBP]
    PAY --> HOOK[HTTPS callback]
    HOOK --> API
    API --> TICKET[Проверенный электронный билет]
~~~

## Слои

Фронт: api/client → pages → компоненты CinemaPicker, SessionList, SeatMap, SeatPreview, Checkout, Ticket. Доменный выбор в одном месте, не несколько независимых копий selectedSeat.

Бэк: routes → booking/payment service → repository → SQLite; provider adapter отдельно. Один обработчик apply_verified_payment вызывается и callback, и сверкой статуса, чтобы не расходились правила выдачи.

Рекомендованные таблицы: cinemas, halls (geometry_json), movies, sessions, session_seats, orders, payment_attempts, payment_events, tickets. В session_seats ключ (session_id, seat_id), состояния available/held/sold и active_order_id. В tickets UNIQUE(order_id), в payment_attempts UNIQUE(provider_transaction_id).

Бронь создаётся в короткой транзакции BEGIN IMMEDIATE, соединение отдельное на запрос. Вызов Platega выполняется после commit, за пределами блокировки SQLite. Настроить foreign_keys, busy_timeout, WAL. Данные клиента не записывать в общедоступные журналы.

## Система координат

Единица — метр. X вправо для зрителя, Y вверх, Z от экрана к задней стене. Центр экрана находится при Z=0, зрители смотрят в направлении -Z.

Hall.seats[].position — центр основания кресла на уровне его платформы, а не глаза. Камера:

~~~text
eye = (seat.x, seat.y + hall.camera.eye_height, seat.z)
lookAt = hall.screen.center
vertical FOV = hall.camera.fov_degrees
~~~

Размер canvas изменяет aspect и projection matrix, но не FOV. Поворот кресла rotation_y задаётся в радианах; ноль направлен вдоль -Z. Схема SVG проецирует X/Z тех же позиций, ось Z вниз на экране. Дуга рядов, проход и ширина дивана уже содержатся в данных.

Не генерировать вторую независимую сетку рядов в браузере. Геометрию можно хранить JSON в БД; загрузка другого Hall должна менять обе визуализации без правок компонентов.

## Контрольные места

| Место | ID первого зала | Что проверять |
| --- | --- | --- |
| Ряд 1 место 3 | h1-r01-s03 | Близко и сбоку; большой экран, сильный угол, возможное обрезание |
| Ряд 6 место 12 | h1-r06-s12 | Средняя дистанция; заметны головы передних занятых мест |
| Ряд 10 диван 7 | h1-r10-s07 | Экран меньше, вид сбоку, поднятая задняя платформа |

Иллюстрации PDF задают желаемое визуальное поведение. Параметры fixture — стартовая геометрия; фронтендер обязан визуально откалибровать высоту/ступени по этим трём точкам и передать изменение общего JSON бэкендеру.

Головы размещать над sold-местами из текущего сеанса, исключив место камеры; бронь held сама по себе не означает сидящего зрителя. Это иллюстрация возможной видимости, не обещание точного роста людей.

## Звук

Две колонки описаны в Hall.speakers. Для P1 достаточно одного локального короткого сигнала и двух Web Audio веток: расстояние до колонки влияет на gain, положение — на стереобаланс. Звук включается пользователем, ограничен по громкости, выключается при выходе из сцены. Левое/правое место должно менять баланс, заднее — уменьшать громкость.

## Хранение и расширение

Seed загружает общие fixtures в БД только при отсутствии соответствующих сущностей. Сеансы создаются на будущие даты относительно момента инициализации, а не на фиксированную прошедшую дату. Повторный запуск не обнуляет sold, orders, tickets и payment_events.

Новый зал добавляется новой записью с геометрией, тарифами и сеансами. На хостинге SQLite требует постоянного диска; несколько реплик с независимыми файлами недопустимы.

Технические справочники: [Vite](https://vite.dev/guide/), [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/), [SQLite в Python](https://docs.python.org/3/library/sqlite3.html), [Three.js](https://threejs.org/docs/), [Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/StereoPannerNode).
