# ZAL — билет с видом на экран

Хакатон для двух разработчиков: выбрать кинотеатр, сеанс и место, посмотреть на экран из этого места в 3D, оплатить билет через Platega по СБП и получить электронный билет.

**В ветке frontend реализованы интерфейс, интерактивный 3D-зал, звук, сравнение мест, платёжный путь на моке и презентация. Настоящий API, Platega и хостинг реализуются отдельно в backend.** [Запуск и подключение фронтенда](apps/web/README.md). [Презентация PDF](docs/artifacts/zal-presentation.pdf). Цель — закрыть 24 базовых и до 7 дополнительных баллов из [задания](docs/source/hackathon-brief.pdf). Оценку выставляет жюри; наличие задачи в плане не означает полученные баллы.

## Кто что делает

| Участник | Ветка | Ответственность | Первый файл |
| --- | --- | --- | --- |
| Makhkets | frontend | Интерфейс, дизайн, 3D, звук, презентация | [Промпт фронтенда](docs/prompts/frontend.md) |
| jasperBLCK | backend | API, БД, бронь, Platega, билеты, хостинг | [Промпт бэкенда](docs/prompts/backend.md) |
| Оба | main через PR | Интеграция, критерии, финальное демо | [План на 5 часов](docs/plan.md) |

## Начало работы

Друг сначала принимает приглашение в приватный репозиторий в GitHub.

Фронтендер:

~~~sh
git clone --branch frontend https://github.com/Makhkets/zal.git
cd zal
python3 scripts/mock_api.py
~~~

В другом терминале:

~~~sh
cd apps/web
npm ci
npm run dev
~~~

Открыть **http://localhost:5173**. Мок доступен по http://127.0.0.1:8000/api/v1, внешние пакеты для него не нужны. Для дальнейшей работы — docs/prompts/frontend.md.

Бэкендер:

~~~sh
git clone --branch backend https://github.com/Makhkets/zal.git
cd zal
cp apps/api/.env.example apps/api/.env
~~~

Прочитать docs/prompts/backend.md. Секреты Platega получить у Makhkets отдельно и записать только в apps/api/.env. Локальный файл владельца уже заполнен; при клонировании он не передаётся. Не заменять существующий заполненный .env шаблоном.

## Что читать

1. [План и контрольные точки](docs/plan.md).
2. [Матрица всех 31 балла](docs/criteria.md).
3. [Контракт API для фронта и бэка](docs/api.md) и [OpenAPI](contracts/openapi.json).
4. [Геометрия и архитектура](docs/architecture.md).
5. [Дизайн из PDF](docs/design.md).
6. [Platega и выдача билета](docs/platega.md).
7. [Работа с ветками и слияниями](docs/workflow.md).
8. [Проверки перед сдачей](docs/acceptance.md).
9. [Сценарий презентации](docs/presentation.md).
10. [Развёртывание](docs/deployment.md).

## Структура

~~~text
apps/web/             фронтенд, владелец Makhkets
apps/api/             бэкенд, владелец jasperBLCK
contracts/            общий API и JSON с геометрией зала
scripts/              мок API и проверки стартового комплекта
docs/                 план, роли, критерии, дизайн, платежи
docs/source/          исходный PDF и извлечённый текст
.github/              CI и шаблон PR
~~~

## Проверка стартового комплекта

~~~sh
python3 scripts/check_contract.py
python3 scripts/smoke_mock.py
~~~

Мок работает в памяти, имеет явный режим mock и не принимает реальные платежи. Он нужен для независимой разработки UI. Готовый сервер должен хранить данные в SQLite и выдавать билет только после подтверждения Platega.
