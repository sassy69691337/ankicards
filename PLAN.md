# План: веб-приложение (PWA) — аналог AnkiDroid

Цель: пользоваться сразу, с iPhone и с компьютера, без Mac, без Apple Developer и без стора.
Приложение открывается по ссылке, ставится на экран «Домой» как PWA, работает офлайн.
Импорт: CSV, TXT, APKG (без zstd). Без синхронизации между устройствами на первом этапе.

---

## 1. Ключевые решения

| Вопрос | Решение | Почему |
|---|---|---|
| Flutter или обычный веб | **TypeScript + веб-стек** (не Flutter Web) | Flutter Web рисует всё на canvas: HTML-карточки Anki (CSS, cloze, картинки), выделение текста, TTS и файловые API работают хуже. Bundle тяжелее, на iOS Safari медленнее. Для «Anki в браузере» нативный DOM подходит лучше. |
| UI | **React + Vite + TypeScript** | Быстрая разработка, огромная экосистема. |
| Хранилище | **IndexedDB через Dexie** | Локально, офлайн, быстро. |
| Разбор APKG | `fflate` (zip) + `sql.js` (SQLite в WASM) | Читаем `collection.anki2/.anki21` прямо в браузере. |
| CSV/TXT | `papaparse` | Разделители, кавычки, переносы. |
| Планировщик | **SM-2 в стиле Anki v2/v3** (собственный код) | Поля совпадают с APKG, прогресс импортируется. FSRS позже (`ts-fsrs`). |
| Стили и UI | Tailwind, мобильный-first | Основной сценарий: iPhone. |
| PWA | `vite-plugin-pwa` (Workbox) | Установка на экран «Домой», офлайн. |
| Хостинг | **Cloudflare Pages или GitHub Pages** (бесплатно, HTTPS) | Нужен для PWA. Ссылку открываете на iPhone, «Поделиться -> На экран Домой». |
| Тесты | Vitest + Playwright | Планировщик и импорт покрыть юнит-тестами. |

### Важно про хранение данных на iPhone
- Safari может **очищать данные сайта, который не открывали ~7 дней**. Установленная PWA на экране «Домой» под это правило не попадает, но всё равно:
  - запрашиваем `navigator.storage.persist()`;
  - делаем **экспорт/бэкап в один клик** и напоминание о бэкапе раз в неделю;
  - позже: опциональная синхронизация (Этап 8).
- Данные по умолчанию **не покидают устройство**.

### Лицензия
AnkiDroid под GPLv3: код не копировать, писать с нуля по документации и поведению. Название Anki не использовать.

---

## 2. Функции AnkiDroid (что берём)

### Ядро
| Функция | Решение |
|---|---|
| Колоды с иерархией (`A::B`), счётчики New/Learn/Due | Берём |
| Заметки -> карточки по шаблонам | Берём |
| Типы заметок: Basic, Basic (and reversed), Basic (optional reversed), Basic (type in answer), Cloze | Берём |
| Шаблоны: `{{Field}}`, `{{FrontSide}}`, `{{cloze:F}}`, `{{type:F}}`, `{{hint:F}}`, `{{#F}}..{{/F}}`, `{{^F}}..{{/F}}`, `{{Tags}}`, `{{Deck}}` | Берём |
| Экран повторения: Again/Hard/Good/Easy, интервалы на кнопках, счётчики | Берём |
| Планировщик: new, learning, review, relearning, лимиты в день, час смены дня, leech | Берём |
| Undo, Suspend, Bury, Flag (7 цветов), Mark, Edit, Delete | Берём |
| Добавление и редактирование заметок, теги | Берём |
| Браузер карточек и поиск (`deck:`, `tag:`, `is:due`, `flag:`, `field:text`, `-`, `or`, кавычки) | Берём |
| Опции колоды (пресеты) | Берём |
| Медиа: картинки, аудио `[sound:x.mp3]` | Берём (Blob в IndexedDB) |
| TTS | Web Speech API (`speechSynthesis`), работает на iOS |
| Статистика: сегодня, прогноз, история, интервалы, retention | Берём |
| Импорт: CSV, TXT, APKG | Берём |
| Экспорт: TXT/CSV, APKG (legacy), полный бэкап | Берём |
| Тёмная тема, RU/EN | Берём |

### После MVP
Filtered decks, Custom study, поиск дубликатов, Check database, find & replace, FSRS, рисование, синхронизация.

### Не берём
AnkiWeb-синхронизация, аддоны, JS в шаблонах.

---

## 3. Структура проекта

```
/                       # корень репозитория
  index.html
  vite.config.ts
  src/
    main.tsx
    app/                # роутинг, тема, layout
    db/                 # Dexie: схема, миграции, репозитории
    core/
      scheduler/        # очереди, ответы, интервалы, опции
      templates/        # рендер шаблонов, cloze, type-in
      search/           # парсер запросов браузера
    io/
      textImport.ts     # CSV/TXT
      apkgImport.ts
      textExport.ts
      apkgExport.ts
      backup.ts
    features/
      decks/ study/ editor/ browser/ stats/ settings/ import/
    workers/            # импорт/экспорт в Web Worker
  public/                # иконки PWA, manifest
  tests/fixtures/       # тестовые .apkg и .csv
```

---

## 4. Модель данных (Dexie / IndexedDB)

Близка к Anki, чтобы импорт APKG был прямым.

- `decks`: `id, name, optionsId, createdAt`
- `deckOptions`: `id, name, newPerDay, revPerDay, learnSteps[], relearnSteps[], graduatingIvl, easyIvl, startEase, easyBonus, hardMult, intervalMult, maxIvl, lapseNewIvlPct, leechThreshold, newOrder…`
- `noteTypes`: `id, name, kind, css, fields[{name,ord}], templates[{name,ord,qfmt,afmt}]`
- `notes`: `id, guid, noteTypeId, fields[], tags[], sortField, checksum, modifiedAt` (индексы: guid, tags, checksum)
- `cards`: `id, noteId, deckId, ord, type, queue, due, ivl, ease, reps, lapses, left, flags, modifiedAt` (индексы: `[deckId+queue+due]`, noteId)
- `revlog`: `id(ts), cardId, rating, ivlBefore, ivlAfter, easeBefore, easeAfter, timeMs, type`
- `media`: `name, blob, hash`
- `config`: `key, value`

---

## 5. Этапы

### Этап 0. Каркас (день 1) — результат: «Hello» по ссылке на iPhone
1. Vite + React + TS + Tailwind, роутинг, тёмная тема.
2. Dexie-схема и миграции.
3. PWA: manifest, иконки, service worker (офлайн).
4. Деплой на Cloudflare Pages / GitHub Pages (CI из git).
5. Проверить установку на iPhone.

### Этап 1. Колоды, заметки, шаблоны
1. Список колод (иерархия, счётчики).
2. Встроенные 5 типов заметок, генерация карточек.
3. Экран добавления заметки: колода, тип, поля (простой редактор, HTML), теги.
4. Рендер шаблонов + cloze. Рендер карточки в изолированном контейнере (sanitize через DOMPurify, CSS типа заметки в scoped `<style>` / Shadow DOM).
5. Юнит-тесты рендера.

### Этап 2. Планировщик и учёба (самое важное)
1. Очереди дня: learning, review, new (лимиты, час смены дня).
2. Ответы Again/Hard/Good/Easy: шаги, graduate, ease, интервалы, fuzz, lapses, leech.
3. Интервалы на кнопках («10м», «3д»).
4. UI повторения: тап для ответа, кнопки оценки, жесты свайпа, счётчики, undo.
5. Suspend, bury, flag, mark, edit, delete.
6. Аудио (`<audio>`) и TTS (Web Speech), авто-проигрывание.
7. Type-in answer с подсветкой различий.
8. Юнит-тесты планировщика.

**После этого этапа приложением уже можно пользоваться:** добавлять слова руками и учить.

### Этап 3. Импорт
**3.1 CSV/TXT**
- Автоопределение разделителя + заголовки Anki: `#separator`, `#html`, `#tags column`, `#deck column`, `#notetype column`, `#guid column`.
- UTF-8/BOM, кавычки, многострочные поля.
- Экран сопоставления колонок -> поля типа заметки/Tags, выбор колоды, предпросмотр.
- Дубликаты: пропустить / обновить / добавить.
- Отчёт: добавлено/обновлено/пропущено/ошибки со строками.

**3.2 APKG**
- `fflate` распаковывает zip, `sql.js` открывает БД.
- Приоритет `collection.anki21`, иначе `collection.anki2`. Если только `collection.anki21b` -> ошибка «пересохраните колоду с опцией Support older Anki versions».
- Обработать заглушку «please update Anki» в `collection.anki2`.
- Читаем `col` (JSON `models`, `decks`, `dconf`), `notes`, `cards`, `revlog`.
- `flds` делить по `\x1f`; маппинг `mid`, `did`, `type/queue/due/ivl/factor/reps/lapses`.
- `due`: new = порядок, review = день от `col.crt`, learning = timestamp. Пересчёт под нашу схему.
- Медиа: JSON `media` -> файлы `0,1,2…` сохраняем в `media` с исходными именами.
- Опция: импорт с прогрессом или сбросить всё в new.
- Тяжёлая работа в **Web Worker**, прогресс-бар. Ограничение памяти iOS Safari: большие колоды (сотни МБ с медиа) читать потоково/порциями.

### Этап 4. Экспорт и бэкап
1. Экспорт колоды в TXT/CSV (с заголовками Anki).
2. Экспорт APKG (legacy-схема 11) — проверка открытием в Anki.
3. Полный бэкап и восстановление (один файл), скачивание через Share Sheet/Files.
4. Напоминание о бэкапе + `storage.persist()`.

### Этап 5. Браузер карточек и поиск
1. Список заметок/карточек, сортировка, колонки.
2. Парсер поиска (`deck:`, `tag:`, `is:`, `flag:`, `field:text`, `-`, `or`, кавычки).
3. Мультивыбор: переместить, теги, suspend, удалить.
4. Редактор заметки, смена типа, предпросмотр.

### Этап 6. Статистика и настройки
1. Сегодня, прогноз 7/30 дней, история, распределение интервалов, retention.
2. Опции колоды (пресеты).
3. Управление типами заметок: поля, шаблоны, CSS.
4. Размер шрифта, RU/EN, тёмная тема.

### Этап 7. Полировка
Пустые состояния, ошибки, доступность, горячие клавиши (десктоп: пробел, 1–4), уведомления о повторении (ограничены на iOS — только для установленной PWA).

### Этап 8. Синхронизация (по желанию)
Варианты: Supabase/Firebase (аккаунт) или синхронизация файла через iCloud/Dropbox. Отдельное решение позже.

---

## 6. Тестирование
- Vitest: рендер шаблонов, cloze, планировщик, парсеры CSV и APKG.
- Фикстуры: 3–4 реальные `.apkg` (с картинками, cloze, reversed), CSV с разными разделителями.
- Playwright: сценарии «добавить -> учить -> экспорт», в Chromium и WebKit (эмуляция Safari).
- Ручная проверка на iPhone: установка PWA, офлайн, аудио, TTS, файловые диалоги.

## 7. Риски
- **Очистка хранилища iOS** -> бэкапы и `persist()`.
- **Планировщик** -> по документации, с тестами.
- **APKG** -> разные версии схем, нестандартные шаблоны, `due` в разных единицах.
- **Память в Safari** при импорте больших APKG -> Worker и потоковая обработка.
- **Автовоспроизведение аудио на iOS** требует жеста пользователя: запускать по тапу/показу ответа.
- **JS/XSS** в импортируемых колодах -> sanitize HTML, запрет скриптов.

## 8. Ориентир по срокам
| Этап | Время |
|---|---|
| 0. Каркас и деплой | 1 день |
| 1. Колоды и шаблоны | 2–3 дня |
| 2. Планировщик и учёба | 4–5 дней (**уже можно использовать**) |
| 3. Импорт CSV/TXT/APKG | 3–5 дней |
| 4. Экспорт и бэкап | 2–3 дня |
| 5. Браузер и поиск | 3 дня |
| 6. Статистика и настройки | 3–4 дня |
