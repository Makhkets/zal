import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Armchair, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  Check, Code2, Database, Layers3, MapPin, Maximize, Minimize,
  Printer, ScanLine, ShieldCheck, StickyNote, Ticket, View,
} from 'lucide-react';
import '../styles/presentation.css';

const notes = [
  'Открытие, 20 секунд. Мы делаем сервис покупки билетов, где перед покупкой можно посмотреть на экран с конкретного кресла. Схема показывает, где находится место, а 3D помогает понять, как с него будет видно. Три главных критерия — покупка, полноценность продукта и 3D — дают до 15 из 24 базовых баллов; начинаем показ с них. Не называйте демонстрационные площадки реальными партнёрами.',
  'Ракурс, 25 секунд. На этом слайде схематично показан принцип перспективы, а не скриншоты приложения. В живом приложении проверьте места из PDF: ряд 1 / место 3 — экран крупный, смотреть вверх и вбок; ряд 6 / место 12 — почти без искажений, головы перекрывают нижний край; ряд 10 / диван 7 — экран меньше, виден под углом, головы его не закрывают. Затем выберите произвольное место: 3D требуется для любого кресла. Камера использует общую со схемой геометрию, FOV остаётся постоянным. Покажите подбор по предпочтениям: погружение, спокойный обзор, баланс звука или цена. Затем сравните две рекомендации: один трейлер играет в двух ракурсах, звук переключается между местами без смены кадра.',
  'Путь, 25 секунд. Пользователь выбирает кинотеатр и сеанс, затем место, открывает 3D и переходит к оплате. Цена и доступность приходят с API. Продемонстрируйте переходы, возврат к выбору и понятные ошибки. Если работает только локальный мок, прямо назовите режим демонстрации.',
  'Оплата, 30 секунд. Фронтенд создаёт заказ, сохраняет доступ к нему и открывает ссылку СБП. Возврат из банковского приложения не означает успех: экран ждёт подтверждённого состояния от сервера. Реальная интеграция Platega, callback и сохранение покупки проверяются вместе с бэкендером. Read-only проверка ключа не является тестом платежа.',
  'Архитектура, 30 секунд. Фронтенд — React и Three.js; единый Hall.seats связывает схему и 3D. Контракт OpenAPI позволяет работать независимо от бэкенда. FastAPI, SQLite и адаптер Platega — согласованная архитектура серверной части. Показывайте как реализованные только проверенные компоненты. Новый зал должен добавляться через данные.',
  'Живой показ, 60–90 секунд. Откройте приложение кнопкой, выберите сеанс и три контрольных места, затем пройдите checkout. Реальную оплату подтверждает человек в банковском приложении. При задержке банка покажите ранее проверенный оплаченный заказ, если он уже есть, и объясните задержку. Оценки 24 + 7 — максимум критериев, а не заявленный результат команды.',
];

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

function SeatIllustration({ angle = 'middle' }: { angle?: 'front' | 'middle' | 'back' }) {
  const screen = angle === 'front'
    ? '-52,8 353,73 337,254 -68,242'
    : angle === 'back'
      ? '111,65 263,48 265,147 111,163'
      : '62,39 298,39 298,180 62,180';
  return (
    <svg viewBox="0 0 360 300" className="deck-perspective-art" role="img"
      aria-label={angle === 'front' ? 'Схема вида: крупный экран под боковым углом в первом ряду' : angle === 'back' ? 'Схема вида: меньший экран под углом из заднего ряда' : 'Схема вида: экран перед зрителем в середине зала'}>
      <rect width="360" height="300" fill="#191a16" />
      <path d="M0 0H360L299 205H61Z" fill="#23241e" />
      <path d="M0 0L61 205V300H0Z" fill="#2c2d25" />
      <path d="M360 0L299 205V300H360Z" fill="#292a23" />
      <path d="M61 205H299L360 300H0Z" fill="#161713" />
      <polygon points={screen} fill="#f6f3e9" />
      <g opacity=".6" stroke="#2a2a24" fill="none" strokeWidth="1">
        <path d={angle === 'front' ? 'M91 29L91 248M-55 135L345 165' : angle === 'back' ? 'M187 57L188 156M111 113L264 96' : 'M180 39V180M62 110H298'} />
      </g>
      <circle cx={angle === 'front' ? 164 : angle === 'back' ? 189 : 180} cy={angle === 'front' ? 138 : angle === 'back' ? 106 : 110}
        r={angle === 'front' ? 62 : angle === 'back' ? 28 : 45} fill="#ff4b2b" />
      <circle cx={angle === 'front' ? 164 : angle === 'back' ? 189 : 180} cy={angle === 'front' ? 138 : angle === 'back' ? 106 : 110}
        r={angle === 'front' ? 73 : angle === 'back' ? 34 : 53} fill="none" stroke="#2c2d27" strokeWidth="1.3" />
      {angle !== 'front' && [0, 1, 2].map((row) => (
        <g key={row} transform={'translate(0 ' + ((angle === 'middle' ? 183 : 211) + row * 23) + ')'}>
          {Array.from({ length: 9 }, (_, index) => {
            const width = 24 + row * 9;
            const x = 180 + (index - 4.5) * (width + 5);
            const height = 25 + row * 10;
            return <g key={index}>
              <rect x={x} y={0} width={width} height={height} rx={5 + row} fill={row === 0 ? '#10110e' : '#20211b'} stroke="#414236" strokeWidth=".8" />
              {(index + row) % 3 === 0 && <ellipse cx={x + width / 2} cy={-3} rx={5 + row * 2} ry={7 + row * 3} fill="#10110e" />}
            </g>;
          })}
        </g>
      ))}
      {angle === 'front' && <path d="M0 275Q40 248 82 275Q119 252 157 275Q202 246 245 275Q294 246 360 277V300H0Z" fill="#11120f" />}
    </svg>
  );
}

function HallGraphic() {
  return (
    <svg viewBox="0 0 660 430" className="deck-hall-graphic" aria-hidden="true">
      <defs>
        <linearGradient id="deck-screen-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f3e9" stopOpacity=".09" />
          <stop offset="1" stopColor="#f6f3e9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M180 44Q330 14 480 44L651 401H9Z" fill="url(#deck-screen-light)" />
      <path d="M180 44Q330 14 480 44" fill="none" stroke="#f6f3e9" strokeWidth="7" strokeLinecap="round" />
      {Array.from({ length: 8 }, (_, row) => (
        <g key={row} transform={'translate(0 ' + (84 + row * 40) + ')'}>
          {Array.from({ length: 12 }, (_, column) => {
            const scale = .63 + row * .065;
            const offset = column < 6 ? -9 : 9;
            const x = 330 + (column - 5.5) * (35 + row * 1.3) + offset;
            const y = Math.abs(column - 5.5) * -1.9;
            const selected = row === 4 && column === 7;
            return (
              <g key={column} transform={'translate(' + x + ' ' + y + ') scale(' + scale + ')'}>
                <rect x="-15" y="-11" width="30" height="29" rx="8" fill={selected ? '#ff4b2b' : '#282a22'} stroke={selected ? '#ff6b4e' : '#5a5b4a'} strokeWidth="1.3" />
                <path d="M-19 3V21H19V3M-12 22v6M12 22v6" fill="none" stroke={selected ? '#ff4b2b' : '#555646'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
        </g>
      ))}
      <path d="M403 238L330 39" stroke="#ff4b2b" strokeWidth="1" strokeDasharray="4 6" opacity=".7" />
      <circle cx="403" cy="238" r="29" fill="none" stroke="#ff4b2b" opacity=".4" />
      <circle cx="403" cy="238" r="38" fill="none" stroke="#ff4b2b" opacity=".15" />
    </svg>
  );
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
  const [fullScreen, setFullScreen] = useState(false);
  const [notice, setNotice] = useState('');
  const shell = useRef<HTMLDivElement>(null);
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
    const handleFullScreen = () => setFullScreen(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', handleKey);
    document.addEventListener('fullscreenchange', handleFullScreen);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('fullscreenchange', handleFullScreen);
    };
  }, [move]);

  const toggleFullScreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.current?.requestFullscreen) await shell.current.requestFullscreen();
      else setNotice('Полноэкранный режим недоступен в этом браузере.');
    } catch {
      setNotice('Браузер не разрешил полноэкранный режим. Презентацию можно смотреть в окне.');
    }
  };

  const slideProps = (index: number) => ({
    'data-active': current === index,
    'aria-hidden': current !== index,
    'aria-label': 'Слайд ' + (index + 1) + '. ' + titles[index],
  });

  return (
    <div className="presentation-page" ref={shell}>
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
          <button type="button" onClick={toggleFullScreen} aria-label={fullScreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}>
            {fullScreen ? <Minimize size={18} /> : <Maximize size={18} />}
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
          <div className="deck-cover-art"><HallGraphic /></div>
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
            <p>Один экран. Разные расстояние,<br />угол и видимость.</p>
          </div>
          <div className="deck-views">
            <article className="deck-view-card">
              <SeatIllustration angle="front" />
              <div><span className="deck-view-index">01</span><h3>Первый ряд, сбоку</h3><p>Ряд 1 · место 3</p></div>
            </article>
            <article className="deck-view-card">
              <SeatIllustration />
              <div><span className="deck-view-index">02</span><h3>Середина зала</h3><p>Ряд 6 · место 12</p></div>
            </article>
            <article className="deck-view-card">
              <SeatIllustration angle="back" />
              <div><span className="deck-view-index">03</span><h3>Последний ряд</h3><p>Ряд 10 · диван 7</p></div>
            </article>
          </div>
          <div className="deck-rule-note"><span className="deck-small-dot" /> 282 места · подбор под ваши предпочтения · сравнение A/B · звук по расстоянию</div>
        </section>

        <section className="deck-slide" {...slideProps(2)}>
          <SlideMeta number={3} label="Путь покупателя" />
          <h2>От выбора<br /><span>до билета.</span></h2>
          <div className="deck-steps">
            <Step number="01" icon={<MapPin />} title="Кинотеатр">Выбрать площадку</Step>
            <Step number="02" icon={<CalendarDays />} title="Сеанс">Найти своё время</Step>
            <Step number="03" icon={<Armchair />} title="Место и 3D">Посмотреть на экран</Step>
            <Step number="04" icon={<ScanLine />} title="Оплата">Перейти к СБП</Step>
            <Step number="05" icon={<Ticket />} title="Билет">Открыть и сохранить</Step>
          </div>
          <div className="deck-flow-bottom">
            <div><span className="deck-small-dot" /> Цена и доступность приходят с сервера.</div>
            <div><ArrowLeft /> Можно вернуться к выбору места.</div>
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
          <p className="deck-integration-note">Подтверждение Platega → одна транзакция: оплата, занятое место и один QR-билет.</p>
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
          <div className="deck-rule-note"><span className="deck-small-dot" /> Общий контракт позволяет разрабатывать фронтенд и бэкенд параллельно.</div>
        </section>

        <section className="deck-slide deck-finale" {...slideProps(5)}>
          <SlideMeta number={6} label="Живая демонстрация" />
          <div className="deck-finale-copy">
            <h2>Выберите место.<br /><span>Посмотрите сами.</span></h2>
            <p className="deck-lead">Подобрать место. Сравнить ракурсы.<br />Послушать трейлер. Получить билет.</p>
            <a className="deck-demo-button" href="https://cinema.makhkets.ru">cinema.makhkets.ru <ArrowUpRight /></a>
          </div>
          <div className="deck-finale-seat"><SeatMark /><span>Ваше место<br />в кино</span></div>
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
      {notice && <p className="deck-notice" role="status">{notice}</p>}
    </div>
  );
}
