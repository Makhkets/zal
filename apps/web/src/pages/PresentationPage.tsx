import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import {
  Armchair, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  Check, Code2, Database, Layers3, MapPin, Maximize, Minimize,
  Printer, ScanLine, ShieldCheck, StickyNote, Ticket, View,
} from 'lucide-react';
import '../styles/presentation.css';
import { useFullscreen } from '../hooks/useFullscreen';

const notes = [
  'Открытие, 20 секунд. ZAL помогает выбрать впечатление до покупки: посмотреть на экран с конкретного кресла и послушать трейлер. Два демонстрационных кинотеатра, восемь фильмов, залы по 282 места. Реальные кассы площадок не подключены. Начните с проблемы: одинаковая цена не означает одинаковый ракурс.',
  'Ракурс, 30 секунд. На слайде реальные снимки виртуального зала: один фильм, постоянный FOV и три положения камеры. В приложении покажите ряд 1 / место 3, ряд 6 / место 12 и ряд 10 / диван 7. Камера берёт координаты кресла из общей со схемой геометрии. Перетащите изображение, чтобы оглядеться. В A/B один трейлер выбранного фильма воспроизводится синхронно; переключение точки прослушивания меняет звук по расстоянию до колонок. Это упрощённая акустическая модель. Выключите свет компактным тумблером.',
  'Путь, 25 секунд. Кинотеатр → сеанс → схема → место → 3D → СБП → билет. Схема открывается первой. Цена и доступность приходят с API. Покажите паспорт места и поиск двух соседних кресел: учитываются проходы, ряд, зона и занятость. Каждый билет оформляется отдельно. Есть чат сеанса с реакциями и внешняя афиша iTunes: только каталог, без чужих касс.',
  'Оплата, 30 секунд. Сервер бронирует место и получает точную котировку Platega. Обычные тарифы — 350 / 550 / 900 ₽; демопокупка — от 1 ₽ до комиссии. На сервере есть подтверждённый платёж и действующий билет. Новую оплату подтверждает человек в банковском приложении. Прямой QR СБП показывается, когда его вернула Platega; QR ссылки на платёжную форму обозначается отдельно. Не называйте QR ссылки банковским QR. Сайт опрашивает статус и выдаёт билет после проверки суммы, валюты и заказа. Возврат из банка сам по себе оплату не подтверждает.',
  'Архитектура, 25 секунд. React, SVG и Three.js используют единый Hall.seats. FastAPI отвечает за цены, атомарную бронь и проверку платежа; SQLite хранит заказы и билеты. OpenAPI связывает обе части. Новый зал добавляется через данные. iTunes даёт каталог и видеопревью; кассовых интеграций с реальными площадками нет. Секреты Platega остаются на сервере.',
  'Живой показ, 60–90 секунд. Жюри открывает cinema.makhkets.ru камерой телефона через QR. Покажите контрольные места, полный экран, тумблер света, пару соседних мест, сравнение со звуком и чат. Для новой покупки демотариф — 1 ₽ плюс комиссия, реальную оплату подтверждает человек. Покажите ранее оплаченный билет или дождитесь серверного paid. QR презентации содержит только публичный адрес. 24 + 7 — максимум задания, а не заявленная оценка команды.',
];

const DEMO_URL = 'https://cinema.makhkets.ru';
const siteQr = QRCode.create(DEMO_URL, { errorCorrectionLevel: 'M' });
const siteQrPath = Array.from(siteQr.modules.data).flatMap((filled, index) => filled
  ? [`M${index % siteQr.modules.size + 4},${Math.floor(index / siteQr.modules.size) + 4}h1v1h-1z`] : []).join('');

function SiteQRCode() {
  const extent = siteQr.modules.size + 8;
  return <svg className="deck-site-qr" viewBox={`0 0 ${extent} ${extent}`} role="img" aria-label="QR-код сайта cinema.makhkets.ru" shapeRendering="crispEdges">
    <rect width={extent} height={extent} fill="#ffffff" /><path d={siteQrPath} fill="#10100e" />
  </svg>;
}

const titles = [
  'Билет с видом на экран',
  'У каждого места свой ракурс',
  'От выбора до билета',
  'Билет после подтверждения',
  'Один зал — одна геометрия',
  'Живая демонстрация',
];

function SeatMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M12 34V17a7 7 0 0 1 7-7h10a7 7 0 0 1 7 7v17M7 25h34M11 34h26M15 34v7m18-7v7"
        stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeckBrand() {
  return <span className="deck-brand"><SeatMark />ZAL<span>.</span></span>;
}

function SlideMeta({ number, label }: { number: number; label: string }) {
  return <div className="deck-slide-meta"><DeckBrand /><span>{label}</span><span>{String(number).padStart(2, '0')} / 06</span></div>;
}

function Step({ number, icon, title, children }: { number: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="deck-step">
      <span className="deck-step-number">{number}</span>
      <span className="deck-step-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function PresentationPage() {
  const [current, setCurrent] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(shell);
  const move = useCallback((delta: number) => setCurrent((index) => Math.max(0, Math.min(5, index + delta))), []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return;
      if (event.key === ' ' && target?.closest('button, a, summary, [role="button"]')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); move(1); }
      if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); move(-1); }
      if (event.key === 'Home') { event.preventDefault(); setCurrent(0); }
      if (event.key === 'End') { event.preventDefault(); setCurrent(5); }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [move]);

  useEffect(() => {
    shell.current?.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [current]);

  const slideProps = (index: number) => ({
    'data-active': current === index,
    'aria-hidden': current !== index,
    'aria-label': 'Слайд ' + (index + 1) + '. ' + titles[index],
  });

  return (
    <div className={"presentation-page" + (fullscreen.active ? " is-fullscreen" : "")} ref={shell} data-fullscreen-mode={fullscreen.mode}>
      <header className="deck-toolbar">
        <a href="/" className="deck-home"><ArrowLeft size={17} /> В приложение</a>
        <span className="deck-toolbar-title">ZAL <span>/</span> презентация проекта</span>
        <div className="deck-tools">
          <button type="button" className={showNotes ? 'is-active' : ''} aria-expanded={showNotes}
            aria-controls="deck-notes" onClick={() => setShowNotes((visible) => !visible)} title="Заметки докладчика">
            <StickyNote size={18} /><span>Заметки</span>
          </button>
          <button type="button" onClick={() => window.print()} title="Распечатать все шесть слайдов или сохранить PDF">
            <Printer size={18} /><span>Сохранить PDF</span>
          </button>
          <button type="button" onClick={fullscreen.toggle} disabled={fullscreen.busy} aria-label={fullscreen.active ? 'Выйти из полноэкранного режима' : 'На весь экран'}>
            {fullscreen.active ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      <main className="deck-stage" tabIndex={-1} aria-label="Презентация ZAL">
        <section className="deck-slide deck-cover" {...slideProps(0)}>
          <SlideMeta number={1} label="Билеты в кино · хакатон 2026" />
          <div className="deck-cover-copy">
            <p className="deck-kicker">Ваше место в кино</p>
            <h1>Билет с видом<br /><span>на экран.</span></h1>
            <p className="deck-lead">Посмотрите на экран со своего кресла.<br />И только потом покупайте билет.</p>
          </div>
          <div className="deck-cover-art"><img src="/media/presentation/seat-back.jpg" alt="Вид на экран из виртуального зала ZAL" /></div>
          <div className="deck-cover-bottom">
            <span><View /> Вид с любого места</span>
            <span className="deck-bottom-line" />
            <span>Схема <ArrowRight /> 3D <ArrowRight /> Билет</span>
          </div>
        </section>

        <section className="deck-slide" {...slideProps(1)}>
          <SlideMeta number={2} label="Выбор места" />
          <div className="deck-heading-row">
            <h2>У каждого места<br /><span>свой ракурс.</span></h2>
            <p>Трейлер выбранного фильма.<br />Ваш ракурс. Ваш звук.</p>
          </div>
          <div className="deck-views">
            <article className="deck-view-card">
              <img className="deck-perspective-art" src="/media/presentation/seat-front.jpg" alt="Вид из первого ряда виртуального зала, место 3" />
              <div><span className="deck-view-index">01</span><h3>Первый ряд, сбоку</h3><p>Ряд 1 · место 3</p></div>
            </article>
            <article className="deck-view-card">
              <img className="deck-perspective-art" src="/media/presentation/seat-middle.jpg" alt="Вид из шестого ряда виртуального зала, место 12" />
              <div><span className="deck-view-index">02</span><h3>Середина зала</h3><p>Ряд 6 · место 12</p></div>
            </article>
            <article className="deck-view-card">
              <img className="deck-perspective-art" src="/media/presentation/seat-back.jpg" alt="Вид с дивана 7 в последнем ряду виртуального зала" />
              <div><span className="deck-view-index">03</span><h3>Последний ряд</h3><p>Ряд 10 · диван 7</p></div>
            </article>
          </div>
          <div className="deck-rule-note"><span className="deck-small-dot" /> 282 места · сравнение A/B · звук по расстоянию до колонок · выключение света</div>
        </section>

        <section className="deck-slide" {...slideProps(2)}>
          <SlideMeta number={3} label="Путь покупателя" />
          <h2>От выбора<br /><span>до билета.</span></h2>
          <div className="deck-steps">
            <Step number="01" icon={<MapPin />} title="Кинотеатр">Выбрать площадку</Step>
            <Step number="02" icon={<CalendarDays />} title="Сеанс">Найти своё время</Step>
            <Step number="03" icon={<Armchair />} title="Схема и 3D">Примерить своё кресло</Step>
            <Step number="04" icon={<ScanLine />} title="Оплата">СБП и проверка статуса</Step>
            <Step number="05" icon={<Ticket />} title="Билет">Открыть и сохранить</Step>
          </div>
          <div className="deck-flow-bottom">
            <div><span className="deck-small-dot" /> 8 фильмов · цена и доступность с сервера</div>
            <div>Соседние места · паспорт кресла · чат сеанса</div>
          </div>
        </section>

        <section className="deck-slide deck-payment" {...slideProps(3)}>
          <SlideMeta number={4} label="Подтверждение оплаты" />
          <div className="deck-payment-copy">
            <h2>Сначала оплата.<br /><span>Затем билет.</span></h2>
            <p className="deck-lead">Возврат из банка — ещё не подтверждение.<br />Билет открывается по проверенному<br />статусу заказа на сервере.</p>
            <div className="deck-provider"><ShieldCheck /><div><strong>Platega · СБП</strong><span>Секретный ключ остаётся на сервере</span></div></div>
          </div>
          <div className="deck-payment-chain">
            <div className="deck-payment-node"><span>01</span><div><strong>Место забронировано</strong><small>Заказ ждёт оплаты</small></div><Armchair /></div>
            <div className="deck-chain-line"><span /></div>
            <div className="deck-payment-node"><span>02</span><div><strong>Сервер проверяет платёж</strong><small>Статус, сумма и заказ совпадают</small></div><ShieldCheck /></div>
            <div className="deck-chain-line"><span /></div>
            <div className="deck-payment-node deck-payment-node-final"><span><Check /></span><div><strong>Билет выдан</strong><small>Место занято · билет с QR</small></div><Ticket /></div>
          </div>
          <p className="deck-integration-note">Демопокупка от 1 ₽ + комиссия Platega. Билет — только после подтверждения банка.</p>
        </section>

        <section className="deck-slide" {...slideProps(4)}>
          <SlideMeta number={5} label="Архитектура" />
          <div className="deck-heading-row">
            <h2>Один зал.<br /><span>Одна геометрия.</span></h2>
            <p>Схема и 3D используют<br />координаты одного кресла.</p>
          </div>
          <div className="deck-architecture">
            <div className="deck-architecture-client">
              <span className="deck-architecture-label">Интерфейс</span>
              <div className="deck-arch-node"><Code2 /><strong>React</strong><span>Выбор и покупка</span></div>
              <div className="deck-arch-pair"><div><Armchair /><strong>SVG</strong><span>Схема зала</span></div><div><View /><strong>Three.js</strong><span>Вид с места</span></div></div>
            </div>
            <div className="deck-arch-connection"><span>OpenAPI</span><div /><span>Hall.seats</span></div>
            <div className="deck-architecture-server">
              <span className="deck-architecture-label">Сервер</span>
              <div className="deck-arch-node"><Layers3 /><strong>FastAPI</strong><span>Заказы и подтверждение</span></div>
              <div className="deck-arch-pair"><div><Database /><strong>SQLite</strong><span>Данные и билеты</span></div><div><ScanLine /><strong>Platega</strong><span>Оплата по СБП</span></div></div>
            </div>
          </div>
          <div className="deck-rule-note"><span className="deck-small-dot" /> iTunes — каталог только для чтения. Кассы реальных кинотеатров не подключены.</div>
        </section>

        <section className="deck-slide deck-finale" {...slideProps(5)}>
          <SlideMeta number={6} label="Живая демонстрация" />
          <div className="deck-finale-copy">
            <h2>Выберите место.<br /><span>Посмотрите сами.</span></h2>
            <p className="deck-lead">Подобрать место. Сравнить ракурсы.<br />Послушать трейлер. Получить билет.</p>
            <a className="deck-demo-button" href={DEMO_URL}>cinema.makhkets.ru <ArrowUpRight /></a>
          </div>
          <a className="deck-finale-qr" href={DEMO_URL} aria-label="Открыть ZAL — cinema.makhkets.ru"><div><SiteQRCode /></div><span>Наведите камеру.<br /><strong>Выберите своё место.</strong></span></a>
          <div className="deck-finale-footer">
            <div><strong>Makhkets</strong><span>Фронтенд · дизайн · презентация</span></div>
            <div><strong>jasperBLCK</strong><span>Бэкенд · платежи · хранение</span></div>
            <div className="deck-criteria-total"><strong>24 <span>+ 7</span></strong><span>Максимум баллов по критериям</span></div>
          </div>
        </section>
      </main>

      <footer className="deck-navigation">
        <span className="deck-keyboard-hint">← → для переключения слайдов</span>
        <div className="deck-dots" role="group" aria-label="Выбрать слайд">
          {titles.map((title, index) => <button key={title} type="button" aria-label={'Слайд ' + (index + 1) + ': ' + title}
            aria-current={current === index ? 'step' : undefined} onClick={() => setCurrent(index)} />)}
        </div>
        <div className="deck-nav-buttons">
          <button type="button" onClick={() => move(-1)} disabled={current === 0} aria-label="Предыдущий слайд"><ArrowLeft size={19} /></button>
          <span role="status" aria-live="polite" aria-atomic="true">{String(current + 1).padStart(2, '0')} <span>/ 06</span></span>
          <button type="button" onClick={() => move(1)} disabled={current === 5} aria-label="Следующий слайд"><ArrowRight size={19} /></button>
        </div>
      </footer>
      <aside className="deck-notes" id="deck-notes" hidden={!showNotes}><strong>Заметки к слайду {current + 1}</strong><p>{notes[current]}</p></aside>
    </div>
  );
}
