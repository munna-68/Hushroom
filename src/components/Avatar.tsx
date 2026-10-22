import { avatar } from '../lib/avatars';

export function Avatar({ id, thumbs, size = 36 }: { id: number; thumbs: string[] | null; size?: number }) {
  const v = avatar(id);
  const src = thumbs?.[v.id];
  return (
    <span className="avatar" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 38%, ${v.skin} 0 30%, ${v.topColor} 31%)` }}>
      {src && <img src={src} alt="" width={size} height={size} />}
    </span>
  );
}
