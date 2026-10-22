import { useEffect, useRef, useState } from 'react';
import type { SeatOccupant, StudySceneHandle } from '../scene';

/** Mounts the code-split three.js scene; the module itself stays imperative. */
export function StudyScene({ seats, labels }: { seats: (SeatOccupant | null)[]; labels: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<StudySceneHandle | null>(null);
  const latest = useRef({ seats, labels });
  latest.current = { seats, labels };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    import('../scene')
      .then((m) => {
        if (disposed || !host.current) return;
        handle.current = m.createStudyScene(host.current);
        handle.current.setSeats(latest.current.seats);
        handle.current.setLabelsVisible(latest.current.labels);
        requestAnimationFrame(() => setReady(true));
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => { handle.current?.setSeats(seats); }, [seats]);
  useEffect(() => { handle.current?.setLabelsVisible(labels); }, [labels]);

  return (
    <div className={`scene-host${ready ? ' ready' : ''}`} ref={host} aria-label="Animated study hall with the people in this room" role="img">
      {failed && <p className="scene-fallback">3D view unavailable on this device. The room still works.</p>}
    </div>
  );
}
