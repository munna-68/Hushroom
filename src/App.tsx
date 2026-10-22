import { useEffect, useState } from 'react';
import { getBackend } from './data';
import { navigate, usePath } from './lib/router';
import { loadProfile, type Profile } from './lib/storage';
import { Entry } from './screens/Entry';
import { Lobby } from './screens/Lobby';
import { Room } from './screens/Room';

export function App() {
  const path = usePath();
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [signedIn, setSignedIn] = useState<boolean | null>(profile ? null : false);
  useEffect(() => {
    if (signedIn !== null) return;
    getBackend().then((b) => setSignedIn(!!b.userId())).catch(() => setSignedIn(false));
  }, [signedIn]);
  const roomMatch = path.match(/^\/room\/([\w-]+)$/);

  const needsEntry = !profile || signedIn === false;
  useEffect(() => {
    if (path !== '/' && needsEntry) {
      sessionStorage.setItem('st.return', path);
    }
  }, [path, needsEntry]);

  if (signedIn === null) return null;
  if (needsEntry || path === '/') {
    return (
      <Entry
        initial={profile}
        onDone={(p) => {
          setProfile(p);
          setSignedIn(true);
          const ret = sessionStorage.getItem('st.return');
          sessionStorage.removeItem('st.return');
          navigate(ret && ret !== '/' ? ret : '/lobby', true);
        }}
      />
    );
  }
  if (roomMatch) return <Room key={roomMatch[1]} roomId={roomMatch[1]} profile={profile!} onProfile={setProfile} />;
  return <Lobby profile={profile!} />;
}
