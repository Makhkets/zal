# Бэкенд ZAL

Владелец jasperBLCK, ветка backend. Начать с ../../docs/prompts/backend.md и ../../docs/platega.md.

Каркас реализует только GET /api/v1/health. Остальные endpoints — задача разработки по ../../contracts/openapi.json.

~~~sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Создать .env из .env.example, только если .env ещё нет.
.venv/bin/uvicorn app.main:app --reload --env-file .env --port 8000
~~~

Мок для фронта находится в ../../scripts/mock_api.py и не является реализацией бэкенда.
