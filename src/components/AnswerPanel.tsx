import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCountdown } from '../hooks/useCountdown';
import ProgressBar from './ProgressBar';

interface Props {
  playerName: string;
  seconds: number;
  remote?: boolean;
  onSubmit: (text: string) => void;
  onTimeout: () => void;
}

export default function AnswerPanel({ playerName, seconds, remote, onSubmit, onTimeout }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const left = useCountdown(seconds, onTimeout);

  useEffect(() => {
    if (!remote) inputRef.current?.focus();
  }, [remote]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(text);
  };

  return (
    <div className="answer glass-inner">
      <div className="answer-top">
        <span>Отвечает <b className="grad">{playerName}</b></span>
        <span className="timer">{Math.ceil(left)}</span>
      </div>
      <ProgressBar fraction={left / seconds} />
      {!remote && (
        <form className="answer-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Название трека..."
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary">Ответить</button>
        </form>
      )}
    </div>
  );
}