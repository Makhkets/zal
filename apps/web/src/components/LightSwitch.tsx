import { Lightbulb, LightbulbOff } from 'lucide-react';
export default function LightSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const Icon = on ? Lightbulb : LightbulbOff;
  return <button type="button" className="cinema-light-switch" aria-label="Освещение зала" aria-pressed={on} title={on ? 'Выключить свет' : 'Включить свет'} onClick={onToggle}><Icon size={16} aria-hidden="true"/><span>{on ? 'Свет включён' : 'Свет выключен'}</span></button>;
}
